import fs from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';

process.chdir(path.resolve(import.meta.dirname, '..'));
const report = JSON.parse(await fs.readFile('outputs/verification-report.json', 'utf8'));
const names = [...new Set([
  'tabler-outline-home', 'tabler-outline-world', 'tabler-outline-settings',
  'tabler-outline-brand-parsinta', 'tabler-outline-circle-dotted', 'tabler-outline-brand-github',
  'tabler-filled-circle-letter-a', 'tabler-filled-heart', 'tabler-filled-settings',
  'tabler-filled-brand-github', 'tabler-filled-chart-donut', 'tabler-filled-circle-number-8',
  ...report.worst.filter(r => r.alphaDifference > 0.06).slice(0, 6).map(r => r.id),
])];
const width = 1200; const columns = 3; const rowHeight = 220;
const height = 90 + Math.ceil(names.length / columns) * rowHeight;
const layers = [];
const label = (text, x, y, size = 16) => `<text x="${x}" y="${y}" font-family="Arial" font-size="${size}" fill="#18232e">${text}</text>`;
let background = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="100%" height="100%" fill="#e8eef5"/>${label('Tabler Icons → Excalidraw', 24, 35, 26)}${label('Each pair: original SVG on the left, Excalidraw export on the right.', 24, 64)}`;
for (let i = 0; i < names.length; i++) {
  const id = names[i]; const x = (i % columns) * 400; const y = 90 + Math.floor(i / columns) * rowHeight;
  background += label(id.replace('tabler-', ''), x + 18, y + 20, 14);
  for (const [j, suffix] of ['source', 'converted'].entries()) {
    const input = await fs.readFile(`work/verification/${id}-${suffix}.svg`);
    const image = await sharp(input).resize(156, 156).png().toBuffer();
    layers.push({ input: image, left: x + 20 + j * 190, top: y + 40 });
  }
}
background += '</svg>';
await sharp(Buffer.from(background)).composite(layers).png().toFile('outputs/preview-comparison.png');
console.log('Saved outputs/preview-comparison.png.');
