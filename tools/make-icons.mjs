// Draws the toolbar icon (a golden pup face) and writes icons/icon{16,32,48,128}.png.
// No dependencies: shapes are rasterised with supersampling and encoded with zlib.
// Run from the project folder:  node tools/make-icons.mjs
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const hex = (h, a = 1) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];

// Ellipses on a 128x128 canvas, painted in order: [cx, cy, rx, ry, rotationDeg, rgba]
const LINE = hex('#7B4A1C');
const shapes = [
  // ears (outline, then fill)
  [27, 66, 19, 33, 18, LINE], [101, 66, 19, 33, -18, LINE],
  [27, 66, 15.5, 29.5, 18, hex('#D98F3D')], [101, 66, 15.5, 29.5, -18, hex('#D98F3D')],
  // head
  [64, 62, 46.5, 42.5, 0, LINE],
  [64, 62, 43, 39, 0, hex('#EDAA52')],
  // muzzle
  [64, 84, 23, 17, 0, hex('#F8DDAA')],
  // blush
  [32, 78, 8, 4.5, 0, hex('#FF8FA3', 0.7)], [96, 78, 8, 4.5, 0, hex('#FF8FA3', 0.7)],
  // eyes + sparkle
  [44, 58, 7.5, 7.5, 0, hex('#2B190E')], [84, 58, 7.5, 7.5, 0, hex('#2B190E')],
  [41.5, 55, 2.8, 2.8, 0, hex('#FFFFFF')], [81.5, 55, 2.8, 2.8, 0, hex('#FFFFFF')],
  // tongue, then nose
  [64, 97, 6.5, 6, 0, hex('#F27E92')],
  [64, 76, 10, 7, 0, hex('#3A2416')],
  [61, 74, 3, 1.5, 0, hex('#FFFFFF', 0.45)],
];

function inside(px, py, [cx, cy, rx, ry, rot]) {
  const a = (-rot * Math.PI) / 180;
  const dx = px - cx;
  const dy = py - cy;
  const x = dx * Math.cos(a) - dy * Math.sin(a);
  const y = dx * Math.sin(a) + dy * Math.cos(a);
  return (x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1;
}

function render(size) {
  const ss = size <= 32 ? 8 : 4; // samples per axis
  const scale = 128 / size;
  const px = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let sy = 0; sy < ss; sy++) {
        for (let sx = 0; sx < ss; sx++) {
          const u = (x + (sx + 0.5) / ss) * scale;
          const v = (y + (sy + 0.5) / ss) * scale;
          // composite shapes back-to-front ("over"), premultiplied
          let cr = 0, cg = 0, cb = 0, ca = 0;
          for (const s of shapes) {
            if (!inside(u, v, s)) continue;
            const [sr, sg, sb, sa] = s[5];
            cr = sr * sa + cr * (1 - sa);
            cg = sg * sa + cg * (1 - sa);
            cb = sb * sa + cb * (1 - sa);
            ca = sa + ca * (1 - sa);
          }
          r += cr; g += cg; b += cb; a += ca;
        }
      }
      const n = ss * ss;
      const i = (y * size + x) * 4;
      const alpha = a / n;
      px[i] = alpha ? Math.round(r / n / alpha) : 0;
      px[i + 1] = alpha ? Math.round(g / n / alpha) : 0;
      px[i + 2] = alpha ? Math.round(b / n / alpha) : 0;
      px[i + 3] = Math.round(alpha * 255);
    }
  }
  return px;
}

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const byte of buf) c = CRC[(c ^ byte) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}
function png(size, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync(join(root, 'icons'), { recursive: true });
for (const size of [16, 32, 48, 128]) {
  writeFileSync(join(root, 'icons', `icon${size}.png`), png(size, render(size)));
  console.log(`icons/icon${size}.png`);
}
