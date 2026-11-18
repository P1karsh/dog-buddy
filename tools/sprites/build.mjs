// Builds the dog sprite sheets used by the extension.
//   node tools/sprites/build.mjs            -> sprites/*.png, shared/sprite-meta.js,
//                                              icons/*.png and dev/sprites.html
//   node tools/sprites/build.mjs --preview <dir>   also writes upscaled contact sheets
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { render, breedFor, PALETTES } from './dogs.mjs';
import { ANIMS } from './anims.mjs';
import { Frame, CELL_W, CELL_H, GROUND } from './raster.mjs';
import { blank, blit, upscale, encodePNG } from './png.mjs';
import { FX, FX_CELL, FX_PALETTE, BUTTON_POINTS } from './fx.mjs';
import { previewPage } from './preview-page.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const args = process.argv.slice(2);
const previewDir = args.includes('--preview') ? args[args.indexOf('--preview') + 1] : null;

const SHEETS = [
  { id: 'golden', breed: 'golden', palette: 'golden' },
  { id: 'bernese', breed: 'bernese', palette: 'bernese' },
  { id: 'lab-yellow', breed: 'lab', palette: 'lab-yellow' },
  { id: 'lab-black', breed: 'lab', palette: 'lab-black' },
  { id: 'lab-chocolate', breed: 'lab', palette: 'lab-chocolate' },
];

const cols = Math.max(...ANIMS.map((a) => a.frames.length));

function mirror(f) {
  const out = new Frame(f.w, f.h);
  for (let y = 0; y < f.h; y++) {
    for (let x = 0; x < f.w; x++) out.tok[y * f.w + (f.w - 1 - x)] = f.tok[y * f.w + x];
  }
  out.marks = Object.fromEntries(Object.entries(f.marks).map(([k, [x, y]]) => [k, [f.w - 1 - x, y]]));
  return out;
}

function buildSheet({ breed, palette }) {
  const B = breedFor(breed);
  const pal = PALETTES[palette];
  const sheet = blank(cols * CELL_W, ANIMS.length * CELL_H);
  const marks = {};
  const boxes = {};
  ANIMS.forEach((anim, row) => {
    const box = [CELL_W, CELL_H, -1, -1];
    marks[anim.name] = anim.frames.map((fr, col) => {
      let f = render(fr.view, B, fr.pose);
      if (fr.flip) f = mirror(f);
      if (fr.rot) f.rotate(fr.rot, GROUND + 1).shadowUnder(GROUND + 1); // rolling: quarter turns, back on the ground
      if (fr.shift) f.translate(Math.round(fr.shift * (B.geom.travel ?? 1)), 0); // big dogs roll a shorter way
      blit(sheet, f.toImage(pal), col * CELL_W, row * CELL_H);
      // visible bounds (shadow excluded) across all frames: the dog's clickable area
      f.tok.forEach((t, i) => {
        if (t === null || t === 'S') return;
        const x = i % f.w;
        const y = Math.floor(i / f.w);
        box[0] = Math.min(box[0], x); box[1] = Math.min(box[1], y);
        box[2] = Math.max(box[2], x); box[3] = Math.max(box[3], y);
      });
      return f.marks;
    });
    boxes[anim.name] = box;
  });
  return { sheet, marks, boxes };
}

const meta = {
  cell: { w: CELL_W, h: CELL_H },
  ground: GROUND + 1,
  anims: {},
  breeds: {},
  fx: { cell: FX_CELL, names: Object.keys(FX) },
};
ANIMS.forEach((a, row) => {
  meta.anims[a.name] = { row, ms: a.frames.map((f) => f.ms), loop: !!a.loop, hits: a.hits || [], shift: a.shift || 0 };
});

mkdirSync(join(root, 'sprites'), { recursive: true });
const builtBreeds = new Set();
const sheetData = {}; // base64 PNGs for the self-contained preview page
for (const s of SHEETS) {
  const { sheet, marks, boxes } = buildSheet(s);
  const png = encodePNG(sheet);
  writeFileSync(join(root, 'sprites', `${s.id}.png`), png);
  sheetData[s.id] = png.toString('base64');
  console.log(`sprites/${s.id}.png  ${sheet.w}x${sheet.h}`);
  if (!builtBreeds.has(s.breed)) {
    builtBreeds.add(s.breed);
    // Anchors the runtime needs: where the head is (speech bubble) and where a boop lands.
    const first = (name, key) => marks[name][0][key];
    const hit = (name, key) => marks[name][meta.anims[name].hits[0]][key];
    meta.breeds[s.breed] = {
      headTop: Object.fromEntries(ANIMS.map((a) => [a.name, first(a.name, 'headTop') || null])),
      pawTip: hit('boop_paw', 'pawTip'),
      noseTip: hit('boop_nose', 'nose'),
      box: boxes,
    };
  }
  if (previewDir) {
    // checkerboard-ish background so transparent pixels are obvious
    const bg = blank(sheet.w, sheet.h, [236, 232, 224, 255]);
    blit(bg, sheet, 0, 0);
    mkdirSync(previewDir, { recursive: true });
    writeFileSync(join(previewDir, `${s.id}.png`), encodePNG(upscale(bg, 3)));
  }
}

// FX sheet: one row per effect.
const fxCols = Math.max(...Object.values(FX).map((frames) => frames.length));
const fxSheet = blank(fxCols * FX_CELL, Object.keys(FX).length * FX_CELL);
Object.values(FX).forEach((frames, row) => {
  frames.forEach((rows, col) => {
    const f = new Frame(FX_CELL, FX_CELL);
    if (typeof rows === 'function') {
      rows(f); // drawn with shapes (the red button)
    } else {
      const h = rows.length;
      const w = Math.max(...rows.map((r) => r.length));
      f.stamp('fx', rows, Math.floor((FX_CELL - w) / 2), Math.floor((FX_CELL - h) / 2));
      if (!rows.some((r) => r.includes('o'))) f.outline();
    }
    blit(fxSheet, f.toImage(FX_PALETTE), col * FX_CELL, row * FX_CELL);
  });
});
const fxPng = encodePNG(fxSheet);
writeFileSync(join(root, 'sprites', 'fx.png'), fxPng);
sheetData.fx = fxPng.toString('base64');
meta.fx.frames = Object.fromEntries(Object.entries(FX).map(([k, v]) => [k, v.length]));
meta.fx.button = BUTTON_POINTS;
console.log(`sprites/fx.png  ${fxSheet.w}x${fxSheet.h}`);

// Toolbar icons: the golden's own pixel head (happy, tongue out), scaled by whole pixels.
{
  const B = breedFor('golden');
  const f = new Frame(16, 16);
  const rows = B.head.frontOpen;
  const hx = Math.floor((16 - rows[0].length) / 2);
  const hy = 3;
  f.stamp('head', rows, hx, hy, {});
  f.stamp('earL', B.ear.front, hx + B.ear.frontPos[0], hy + B.ear.frontPos[1], { lines: { head: 'l' } });
  f.stamp('earR', B.ear.front, hx + rows[0].length - 1 - B.ear.frontPos[0] - (B.ear.front[0].length - 1), hy + B.ear.frontPos[1], { flip: true, lines: { head: 'l' } });
  f.lines();
  f.outline();
  const icon = f.toImage(PALETTES.golden);
  mkdirSync(join(root, 'icons'), { recursive: true });
  for (const size of [16, 32, 48, 128]) {
    const k = Math.floor(size / 16);
    const scaled = upscale(icon, k);
    const out = blank(size, size);
    blit(out, scaled, Math.floor((size - scaled.w) / 2), Math.floor((size - scaled.h) / 2));
    writeFileSync(join(root, 'icons', `icon${size}.png`), encodePNG(out));
  }
  console.log('icons/icon{16,32,48,128}.png');
}

writeFileSync(
  join(root, 'shared', 'sprite-meta.js'),
  `/* Generated by tools/sprites/build.mjs. Do not edit by hand. */\nglobalThis.DogSpriteMeta = ${JSON.stringify(meta)};\n`,
);
console.log('shared/sprite-meta.js');

// Self-contained preview page: open it straight from disk, no server needed.
writeFileSync(
  join(root, 'dev', 'sprites.html'),
  previewPage({ meta, player: readFileSync(join(root, 'shared', 'sprites.js'), 'utf8'), sheets: sheetData }),
);
console.log('dev/sprites.html');
