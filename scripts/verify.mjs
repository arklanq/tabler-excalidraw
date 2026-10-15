import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { build } from 'esbuild';
import { chromium } from 'playwright';
import sharp from 'sharp';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
const numbers = new Intl.NumberFormat('en-US');
const percent = value => `${(value * 100).toFixed(3)}%`;
console.log('Verifying Tabler Icons for Excalidraw.');
console.log('[1/3] Checking library structure and source coverage.');
await fs.mkdir('work/verification', { recursive: true });
await build({ entryPoints: ['scripts/verify-browser.js'], outfile: 'work/verify-browser.js', bundle: true, format: 'iife', platform: 'browser', define: { 'process.env.NODE_ENV': '"production"' }, loader: { '.woff2': 'dataurl', '.woff': 'dataurl' }, logLevel: 'error' });
const manifest = JSON.parse(await fs.readFile('outputs/conversion-report.json', 'utf8'));
assert.equal(manifest.failures.length, 0);
const complete = JSON.parse(await fs.readFile('outputs/tabler-icons.excalidrawlib', 'utf8'));
const ids = new Set();
for (const item of complete.libraryItems) {
  assert.ok(!ids.has(item.id)); ids.add(item.id);
  for (const el of item.elements) {
    assert.ok(!ids.has(el.id)); ids.add(el.id);
    assert.equal(el.type, 'line');
    assert.deepEqual(el.groupIds, [item.id]);
    assert.ok(el.points.every(p => p.every(Number.isFinite)));
  }
}
for (const variant of ['outline', 'filled']) {
  const names = (await fs.readdir(`sources/tabler-icons/icons/${variant}`)).filter(name => name.endsWith('.svg'));
  const subset = JSON.parse(await fs.readFile(`outputs/tabler-icons-${variant}.excalidrawlib`, 'utf8'));
  assert.equal(subset.libraryItems.length, names.length);
  assert.deepEqual(subset.libraryItems, complete.libraryItems.filter(item => item.id.startsWith(`tabler-${variant}-`)));
}
console.log(`      Library structure OK: ${numbers.format(complete.libraryItems.length)} icons.`);
console.log('[2/3] Checking import in Excalidraw.');
const server = http.createServer(async (req, res) => {
  try {
    if (req.url === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>Library verification</title><script src="/work/verify-browser.js"></script>'); return; }
    const filename = path.resolve(root, `.${decodeURIComponent(req.url)}`);
    if (!filename.startsWith(root + path.sep)) { res.writeHead(403); res.end(); return; }
    res.setHeader('Content-Type', filename.endsWith('.js') ? 'text/javascript' : 'application/json');
    res.end(await fs.readFile(filename));
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const results = [];
const samples = new Set(['tabler-outline-home', 'tabler-outline-brand-parsinta', 'tabler-outline-circle-dotted', 'tabler-outline-world', 'tabler-outline-settings', 'tabler-outline-brand-github', 'tabler-filled-circle-letter-a', 'tabler-filled-heart', 'tabler-filled-brand-github', 'tabler-filled-settings', 'tabler-filled-chart-donut', 'tabler-filled-circle-number-8']);
try {
  const page = await browser.newPage();
  page.on('pageerror', err => console.error(`Browser error: ${err.message}`));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const imported = await page.evaluate(() => checkLibrary());
  console.log(`      Imported ${numbers.format(imported.imported)} icons and ${numbers.format(imported.elements)} elements.`);
  console.log('[3/3] Comparing rendered icons with the original SVGs.');
  for (let start = 0; start < manifest.total; start += 100) {
    const rendered = await page.evaluate(([start, count]) => renderIcons(start, count), [start, 100]);
    for (let i = 0; i < rendered.length; i++) {
      const { id, svg } = rendered[i];
      const entry = manifest.icons[start + i];
      assert.equal(id, entry.id);
      const source = await fs.readFile(entry.source, 'utf8');
      const reference = source.replace('width="24"', 'width="192"').replace('height="24"', 'height="192"').replaceAll('currentColor', '#1e1e1e');
      const [a, b] = await Promise.all([reference, svg].map(text => sharp(Buffer.from(text)).ensureAlpha().raw().toBuffer({ resolveWithObject: true })));
      assert.equal(a.info.width, b.info.width); assert.equal(a.info.height, b.info.height);
      let difference = 0; let area = 0;
      for (let p = 3; p < a.data.length; p += 4) { difference += Math.abs(a.data[p] - b.data[p]); area += a.data[p]; }
      const error = difference / Math.max(1, area);
      results.push({ id, alphaDifference: error });
      if (samples.has(id) || error > 0.01) {
        await fs.writeFile(`work/verification/${id}-source.svg`, reference);
        await fs.writeFile(`work/verification/${id}-converted.svg`, svg);
      }
    }
    const compared = results.length;
    if (compared % 500 === 0 || compared === manifest.total) {
      console.log(`      Compared ${numbers.format(compared)} / ${numbers.format(manifest.total)} icons (${Math.round(compared / manifest.total * 100)}%).`);
    }
  }
  results.sort((a, b) => b.alphaDifference - a.alphaDifference);
  const sha256 = {};
  for (const file of ['tabler-icons.excalidrawlib', 'tabler-icons-outline.excalidrawlib', 'tabler-icons-filled.excalidrawlib']) sha256[file] = createHash('sha256').update(await fs.readFile(`outputs/${file}`)).digest('hex');
  const report = { excalidrawVersion: '0.18.1', ...imported, compared: results.length, metric: 'Sum of absolute alpha differences at 192x192, divided by source alpha coverage.', meanAlphaDifference: results.reduce((sum, r) => sum + r.alphaDifference, 0) / results.length, aboveOnePercent: results.filter(r => r.alphaDifference > 0.01).length, sha256, worst: results.slice(0, 30), results };
  await fs.writeFile('outputs/verification-report.json', JSON.stringify(report, null, 2) + '\n');
  console.log('');
  console.log(report.aboveOnePercent === 0 ? 'Verification passed.' : 'Verification failed.');
  console.log(`  Icons checked:          ${numbers.format(report.compared)}`);
  console.log(`  Elements imported:      ${numbers.format(report.elements)}`);
  console.log(`  Mean alpha difference:  ${percent(report.meanAlphaDifference)}`);
  console.log(`  Largest difference:     ${percent(report.worst[0].alphaDifference)} (${report.worst[0].id})`);
  console.log(`  Icons above 1% limit:    ${numbers.format(report.aboveOnePercent)}`);
  console.log('  Full report:            outputs/verification-report.json');
  if (report.aboveOnePercent > 0) {
    console.error('Visual comparison exceeded the 1% per-icon difference limit. See the report for affected icons.');
    process.exitCode = 1;
  }
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
