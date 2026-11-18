// Dev helper: render a few poses side by side, upscaled, to a PNG for inspection.
//   node tools/sprites/preview.mjs <out.png> [breed] [scale]
import { writeFileSync } from 'node:fs';
import { render, breedFor, PALETTES } from './dogs.mjs';
import { CELL_W, CELL_H } from './raster.mjs';
import { blank, blit, upscale, encodePNG } from './png.mjs';

const [out = 'preview.png', breedId = 'golden', scaleArg = '6', paletteArg, only] = process.argv.slice(2);
const B = breedFor(breedId);
const palette = PALETTES[paletteArg || breedId];
const k = Number(scaleArg);

const poses = [
  ['side', { body: 'stand', tail: { a: 25 } }],
  ['side', { body: 'stand', bob: 1, tail: { a: 45 }, legs: { nf: { a: 20 }, fh: { a: 20 }, ff: { a: -20 }, nh: { a: -20 } } }],
  ['side', { body: 'sit', tail: {} }],
  ['side', { body: 'sit', raise: 1, head: { eyes: 'happy', open: true } }],
  ['side', { body: 'lie', head: { eyes: 'closed' } }],
  ['front', { body: 'sit', tail: { side: 1 } }],
  ['front', { body: 'sit', head: { eyes: 'happy', open: true }, tail: { side: -1 } }],
  ['front', { body: 'stand', tail: { side: 1 } }],
  ['back', { body: 'stand', tail: { side: -1 } }],
  ['side', { body: 'bow', tail: { a: 55 }, head: { open: true }, legs: { nf: { a: 50 }, ff: { a: 50 } } }],
  ['side', { body: 'air', lift: 6, tail: { a: 40 }, legs: { nf: { a: 55, tuck: 0.7 }, ff: { a: 40, tuck: 0.8 }, nh: { a: -45, tuck: 0.3 }, fh: { a: -35, tuck: 0.4 } } }],
  ['front', { body: 'held', tail: { side: 0 }, ear: { dy: -1 }, head: { open: true } }],
  ['side', { body: 'lie', breath: 1, head: { eyes: 'closed' } }],
  ['front', { body: 'stand', step: 1, tail: { side: -1 } }],
];

const picked = only ? only.split(',').map(Number).map((i) => poses[i]) : poses;
const cols = Math.min(5, picked.length);
const rows = Math.ceil(picked.length / cols);
const sheet = blank(cols * CELL_W, rows * CELL_H, [236, 232, 224, 255]);
picked.forEach(([view, P], i) => {
  const img = render(view, B, P).toImage(palette);
  blit(sheet, img, (i % cols) * CELL_W, Math.floor(i / cols) * CELL_H);
});
writeFileSync(out, encodePNG(upscale(sheet, k)));
console.log('wrote', out);
