import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const root = path.resolve(import.meta.dirname, '..');
process.chdir(root);
await fs.mkdir('work', { recursive: true });
await fs.mkdir('outputs', { recursive: true });

// Keep upstream sources intact; increase curve precision in the local build.
await build({
  entryPoints: ['sources/svg-to-excalidraw/src/index.ts'],
  outfile: 'work/converter.cjs', bundle: true, platform: 'node', format: 'cjs',
  plugins: [{ name: 'curve-precision', setup(builder) {
    builder.onLoad({ filter: /\/walker\.ts$/ }, async ({ path: filename }) => ({
      contents: (await fs.readFile(filename, 'utf8')).replace(
        'pointsOnPath(get(el, "d"))', 'pointsOnPath(get(el, "d"), 0.001)',
      ), loader: 'ts',
    }));
  } }],
});
const dom = new JSDOM();
for (const key of ['document', 'DOMParser', 'NodeFilter']) globalThis[key] = dom.window[key];
const converter = (await import('../work/converter.cjs')).default.default;
const parser = new DOMParser();
const scale = 4;
const color = '#1e1e1e';
const sha = (value) => createHash('sha256').update(value).digest('hex');
const revision = (repo) => execFileSync('git', ['-C', `sources/${repo}`, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const timestamp = Number(execFileSync('git', ['-C', 'sources/tabler-icons', 'show', '-s', '--format=%ct'], { encoding: 'utf8' }).trim()) * 1000;
const report = {
  tabler: { version: JSON.parse(await fs.readFile('sources/tabler-icons/package.json', 'utf8')).version, commit: revision('tabler-icons') },
  converter: { commit: revision('svg-to-excalidraw'), curveTolerance: 0.001 },
  scale, color, icons: [], failures: [],
};
const all = [];
const round = (n) => Math.round(n * 1e5) / 1e5;
function element(points, style, id, group) {
  const [x, y] = points[0];
  const relative = points.map(([px, py]) => [round((px - x) * scale), round((py - y) * scale)]);
  if (relative.length === 1) relative.push([0.0001, 0]);
  const xs = relative.map(p => p[0]); const ys = relative.map(p => p[1]);
  return {
    id, type: 'line', x: round(x * scale), y: round(y * scale),
    width: round(Math.max(...xs) - Math.min(...xs)), height: round(Math.max(...ys) - Math.min(...ys)),
    angle: 0, strokeColor: style.stroke, backgroundColor: style.fill, fillStyle: 'solid',
    strokeWidth: style.stroke === 'transparent' ? 1 : style.strokeWidth * scale,
    strokeStyle: 'solid', roughness: 0, opacity: style.opacity,
    groupIds: [group], frameId: null, roundness: null,
    seed: parseInt(sha(id).slice(0, 7), 16), version: 1, versionNonce: 0,
    isDeleted: false, boundElements: null, updated: timestamp, link: null, locked: false,
    points: relative, lastCommittedPoint: null, startBinding: null, endBinding: null,
    startArrowhead: null, endArrowhead: null,
  };
}
function bridge(contours) {
  const combined = [];
  const anchor = contours[0][0];
  for (const contour of contours) {
    if (combined.length) combined.push(contour[0]);
    combined.push(...contour, contour[0], anchor);
  }
  return combined;
}
for (const variant of ['outline', 'filled']) {
  const items = [];
  const names = (await fs.readdir(`sources/tabler-icons/icons/${variant}`)).filter(f => f.endsWith('.svg')).sort();
  for (const filename of names) {
    const source = `sources/tabler-icons/icons/${variant}/${filename}`;
    try {
      const svg = await fs.readFile(source, 'utf8');
      const doc = parser.parseFromString(svg, 'image/svg+xml');
      if (doc.querySelector('parsererror')) throw new Error('Invalid SVG.');
      const svgRoot = doc.documentElement;
      if ([...svgRoot.children].some(el => el.tagName !== 'path')) throw new Error('Unsupported SVG element.');
      const name = filename.slice(0, -4);
      const id = `tabler-${variant}-${name}`;
      const elements = [];
      let pathIndex = 0;
      for (const svgPath of svgRoot.children) {
        const inherited = (key, fallback) => svgPath.getAttribute(key) ?? svgRoot.getAttribute(key) ?? fallback;
        const resolveColor = (value) => value === 'currentColor' ? color : value === 'none' ? 'transparent' : value;
        const style = {
          fill: resolveColor(inherited('fill', '#000000')),
          stroke: resolveColor(inherited('stroke', 'none')),
          strokeWidth: Number(inherited('stroke-width', '1')),
          opacity: Number(svgRoot.getAttribute('opacity') ?? 1) * Number(svgPath.getAttribute('opacity') ?? 1) * 100,
        };
        if (style.fill === 'transparent' && style.stroke === 'transparent') { pathIndex++; continue; }
        // Convert each source path separately so its compound contours stay identifiable.
        const result = converter.convert(`<svg xmlns="http://www.w3.org/2000/svg">${svgPath.outerHTML}</svg>`);
        if (result.hasErrors || !result.content) throw new Error(`Conversion failed at path ${pathIndex}.`);
        const contours = result.content.elements.map(el => el.points.map(([x, y]) => [x + el.x, y + el.y]));
        if (!contours.length || contours.some(c => !c.length || c.some(p => p.some(n => !Number.isFinite(n))))) {
          throw new Error(`Invalid geometry at path ${pathIndex}.`);
        }
        if (style.fill !== 'transparent') {
          // A closed, doubled bridge preserves transparent holes without white overlays.
          elements.push(element(bridge(contours), { ...style, stroke: 'transparent' }, `${id}-p${pathIndex}-fill`, id));
        }
        if (style.stroke !== 'transparent') {
          contours.forEach((points, i) => elements.push(element(points, { ...style, fill: 'transparent' }, `${id}-p${pathIndex}-s${i}`, id)));
        }
        pathIndex++;
      }
      if (!elements.length) throw new Error('Empty icon.');
      const item = { id, status: 'unpublished', created: timestamp, name: `Tabler ${variant}: ${name}`, elements };
      items.push(item);
      report.icons.push({ id, source, sha256: sha(svg), elements: elements.length });
    } catch (error) {
      report.failures.push({ source, error: error.message });
    }
    if ((all.length + items.length) % 500 === 0) console.log(`Converted ${all.length + items.length} icons.`);
  }
  all.push(...items);
  await fs.writeFile(`outputs/tabler-icons-${variant}.excalidrawlib`, JSON.stringify({ type: 'excalidrawlib', version: 2, source: 'https://excalidraw.com', libraryItems: items }));
}
await fs.writeFile('outputs/tabler-icons.excalidrawlib', JSON.stringify({ type: 'excalidrawlib', version: 2, source: 'https://excalidraw.com', libraryItems: all }));
report.total = all.length;
report.totalElements = all.reduce((sum, item) => sum + item.elements.length, 0);
await fs.writeFile('outputs/conversion-report.json', JSON.stringify(report, null, 2) + '\n');
await fs.copyFile('sources/tabler-icons/LICENSE', 'outputs/LICENSE-Tabler.txt');
await fs.copyFile('sources/svg-to-excalidraw/LICENSE', 'outputs/LICENSE-svg-to-excalidraw.txt');
console.log(JSON.stringify({ icons: report.total, elements: report.totalElements, failures: report.failures }, null, 2));
if (report.failures.length) process.exitCode = 1;
dom.window.close();
