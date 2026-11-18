// Pixel rasteriser for the dog sprites.
// A frame is built from "parts" (body, legs, head, ears, tail...). Each part is a
// hard-edged pixel mask (no anti-aliasing) filled with palette *tokens*. After
// all parts are placed we add Goldie-style details:
//   - soft inner lines where one part overlaps another (ear on head, leg on body)
//   - a 1px dark outline around the whole silhouette (4-neighbour, so corners stay thin)
//   - a small translucent ground shadow
// Tokens are turned into colours by a breed palette at the very end.

export const CELL_W = 56;
export const CX = CELL_W / 2; // dogs are drawn centred here so mirrored frames line up
export const CELL_H = 44;
export const GROUND = 39; // last row a paw can occupy; the outline sits on row 40

// ---- Shapes: hit-test at pixel centres -------------------------------------------
const deg = (a) => (a * Math.PI) / 180;

export function circle(cx, cy, r) {
  return { bb: [cx - r, cy - r, cx + r, cy + r], hit: (x, y) => (x - cx) ** 2 + (y - cy) ** 2 <= r * r };
}

export function ellipse(cx, cy, rx, ry, rot = 0) {
  const c = Math.cos(deg(rot));
  const s = Math.sin(deg(rot));
  const R = Math.max(rx, ry);
  return {
    bb: [cx - R, cy - R, cx + R, cy + R],
    hit: (x, y) => {
      const dx = x - cx;
      const dy = y - cy;
      const u = dx * c + dy * s;
      const v = -dx * s + dy * c;
      return (u / rx) ** 2 + (v / ry) ** 2 <= 1;
    },
  };
}

// A line segment with (optionally tapering) thickness.
export function capsule(x1, y1, x2, y2, r1, r2 = r1) {
  const R = Math.max(r1, r2);
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L2 = dx * dx + dy * dy;
  return {
    bb: [Math.min(x1, x2) - R, Math.min(y1, y2) - R, Math.max(x1, x2) + R, Math.max(y1, y2) + R],
    hit: (x, y) => {
      let t = L2 ? ((x - x1) * dx + (y - y1) * dy) / L2 : 0;
      t = Math.max(0, Math.min(1, t));
      const r = r1 + (r2 - r1) * t;
      return (x - (x1 + dx * t)) ** 2 + (y - (y1 + dy * t)) ** 2 <= r * r;
    },
  };
}

// Joined capsules through a list of points: [[x, y, r], ...]
export function chain(points) {
  const segs = [];
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1, r1] = points[i];
    const [x2, y2, r2] = points[i + 1];
    segs.push(capsule(x1, y1, x2, y2, r1, r2));
  }
  return union(segs);
}

export function poly(pts) {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  return {
    bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)],
    hit: (x, y) => {
      let inside = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i];
        const [xj, yj] = pts[j];
        if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
      }
      return inside;
    },
  };
}

export function rect(x0, y0, x1, y1) {
  return { bb: [x0, y0, x1, y1], hit: (x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 };
}

export function union(shapes) {
  const list = shapes.filter(Boolean);
  return {
    bb: [
      Math.min(...list.map((s) => s.bb[0])), Math.min(...list.map((s) => s.bb[1])),
      Math.max(...list.map((s) => s.bb[2])), Math.max(...list.map((s) => s.bb[3])),
    ],
    hit: (x, y) => list.some((s) => s.hit(x, y)),
  };
}

// ---- Frame -----------------------------------------------------------------------
const LINEABLE = new Set(['a', 'b', 'c', 'd', 'w', 'x', 'r', 's', 'g', 'h', 'H']);

export class Frame {
  constructor(w = CELL_W, h = CELL_H) {
    this.w = w;
    this.h = h;
    this.tok = new Array(w * h).fill(null);
    this.pid = new Int16Array(w * h).fill(-1);
    this.parts = [];
    this.marks = {}; // named points (e.g. paw tip) for the runtime
  }

  idx(x, y) { return y * this.w + x; }
  inBounds(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }

  // Rasterise shapes into a mask (array of booleans).
  maskOf(add, sub = []) {
    const m = new Uint8Array(this.w * this.h);
    const shapes = (Array.isArray(add) ? add : [add]).filter(Boolean);
    const cuts = (Array.isArray(sub) ? sub : [sub]).filter(Boolean);
    for (const s of shapes) {
      const x0 = Math.max(0, Math.floor(s.bb[0]) - 1);
      const y0 = Math.max(0, Math.floor(s.bb[1]) - 1);
      const x1 = Math.min(this.w - 1, Math.ceil(s.bb[2]) + 1);
      const y1 = Math.min(this.h - 1, Math.ceil(s.bb[3]) + 1);
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (s.hit(x + 0.5, y + 0.5) && !cuts.some((c) => c.hit(x + 0.5, y + 0.5))) m[this.idx(x, y)] = 1;
        }
      }
    }
    return m;
  }

  // Edge helpers for shading: how many mask pixels continue in a direction.
  runs(m) {
    const { w, h } = this;
    const down = new Int16Array(w * h);
    const up = new Int16Array(w * h);
    const left = new Int16Array(w * h);
    const right = new Int16Array(w * h);
    for (let x = 0; x < w; x++) {
      for (let y = h - 1, n = 0; y >= 0; y--) { const i = y * w + x; n = m[i] ? n + 1 : 0; down[i] = n - 1; }
      for (let y = 0, n = 0; y < h; y++) { const i = y * w + x; n = m[i] ? n + 1 : 0; up[i] = n - 1; }
    }
    for (let y = 0; y < h; y++) {
      for (let x = 0, n = 0; x < w; x++) { const i = y * w + x; n = m[i] ? n + 1 : 0; left[i] = n - 1; }
      for (let x = w - 1, n = 0; x >= 0; x--) { const i = y * w + x; n = m[i] ? n + 1 : 0; right[i] = n - 1; }
    }
    const at = (arr) => (x, y) => (this.inBounds(x, y) ? arr[y * w + x] : -1);
    return { down: at(down), up: at(up), left: at(left), right: at(right) };
  }

  // Add a part from shapes. token: string or (x, y, edges) => token.
  shape(name, add, { sub, token = 'a', lines = {} } = {}) {
    const m = this.maskOf(add, sub);
    const e = this.runs(m);
    const id = this.parts.length;
    this.parts.push({ name, lines });
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const i = this.idx(x, y);
        if (!m[i]) continue;
        const t = typeof token === 'function' ? token(x, y, e) : token;
        if (t === null || t === undefined) continue;
        this.tok[i] = t;
        this.pid[i] = id;
      }
    }
    return id;
  }

  // Add a part from an ASCII stamp. '.' or ' ' = empty. flip mirrors horizontally, flipY vertically.
  stamp(name, rows, x0, y0, { flip = false, flipY = false, lines = {}, map = {} } = {}) {
    const id = this.parts.length;
    this.parts.push({ name, lines });
    const width = Math.max(...rows.map((r) => r.length));
    rows.forEach((row, ry) => {
      for (let rx = 0; rx < row.length; rx++) {
        let ch = row[rx];
        if (ch === '.' || ch === ' ') continue;
        ch = map[ch] ?? ch;
        const x = x0 + (flip ? width - 1 - rx : rx);
        const y = y0 + (flipY ? rows.length - 1 - ry : ry);
        if (!this.inBounds(x, y)) continue;
        this.tok[this.idx(x, y)] = ch;
        this.pid[this.idx(x, y)] = id;
      }
    });
    return id;
  }

  // Paint tokens onto existing pixels only (markings, faces) without changing parts.
  paint(points, token) {
    for (const [x, y] of points) {
      if (this.inBounds(x, y) && this.tok[this.idx(x, y)] !== null) this.tok[this.idx(x, y)] = token;
    }
  }

  // Inner lines: a front part draws a line on its pixels that touch a part behind it.
  lines() {
    const { w, h } = this;
    const out = this.tok.slice();
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        const a = this.pid[i];
        if (a < 0 || !LINEABLE.has(this.tok[i])) continue;
        const rules = this.parts[a].lines;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!this.inBounds(nx, ny)) continue;
          const b = this.pid[ny * w + nx];
          if (b < 0 || b >= a) continue; // only against parts behind us
          const rule = rules[this.parts[b].name] ?? rules['*'];
          if (!rule) continue;
          const t = typeof rule === 'function' ? rule(x, y, dx, dy) : rule;
          if (t) { out[i] = t; break; }
        }
      }
    }
    this.tok = out;
  }

  outline() {
    const { w, h } = this;
    const add = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = y * w + x;
        if (this.tok[i] !== null) continue;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx;
          const ny = y + dy;
          if (this.inBounds(nx, ny) && this.tok[ny * w + nx] !== null && this.tok[ny * w + nx] !== 'S') { add.push(i); break; }
        }
      }
    }
    for (const i of add) this.tok[i] = 'o';
  }

  shadow(cx, cy, rx, ry) {
    if (rx <= 0) return;
    const s = ellipse(cx, cy, rx, ry);
    for (let y = Math.floor(cy - ry - 1); y <= cy + ry + 1; y++) {
      for (let x = Math.floor(cx - rx - 1); x <= cx + rx + 1; x++) {
        if (!this.inBounds(x, y) || this.tok[this.idx(x, y)] !== null) continue;
        if (s.hit(x + 0.5, y + 0.5)) this.tok[this.idx(x, y)] = 'S';
      }
    }
  }

  // Rotate the finished drawing by k quarter turns clockwise (lossless for pixel art),
  // then stand it back on the ground. Shadows are dropped; add one with shadowUnder().
  rotate(k, groundRow) {
    k = ((k % 4) + 4) % 4;
    if (!k) return this;
    const pts = [];
    this.tok.forEach((t, i) => { if (t !== null && t !== 'S') pts.push([i % this.w, Math.floor(i / this.w), t, this.pid[i]]); });
    if (!pts.length) return this;
    const xs = pts.map((p) => p[0]);
    const ys = pts.map((p) => p[1]);
    const cx = Math.round((Math.min(...xs) + Math.max(...xs)) / 2);
    const cy = Math.round((Math.min(...ys) + Math.max(...ys)) / 2);
    const turned = pts.map(([x, y, t, p]) => {
      let dx = x - cx;
      let dy = y - cy;
      for (let j = 0; j < k; j++) [dx, dy] = [-dy, dx];
      return [cx + dx, cy + dy, t, p];
    });
    const drop = groundRow - Math.max(...turned.map((p) => p[1]));
    this.tok = new Array(this.w * this.h).fill(null);
    this.pid = new Int16Array(this.w * this.h).fill(-1);
    for (const [x, y, t, p] of turned) {
      if (this.inBounds(x, y + drop)) { this.tok[this.idx(x, y + drop)] = t; this.pid[this.idx(x, y + drop)] = p; }
    }
    return this;
  }

  // Shift the whole drawing (used for moving across the cell, e.g. rolling).
  translate(dx, dy = 0) {
    if (!dx && !dy) return this;
    const tok = new Array(this.w * this.h).fill(null);
    const pid = new Int16Array(this.w * this.h).fill(-1);
    this.tok.forEach((t, i) => {
      if (t === null) return;
      const x = (i % this.w) + dx;
      const y = Math.floor(i / this.w) + dy;
      if (this.inBounds(x, y)) { tok[this.idx(x, y)] = t; pid[this.idx(x, y)] = this.pid[i]; }
    });
    this.tok = tok;
    this.pid = pid;
    for (const [k, v] of Object.entries(this.marks)) this.marks[k] = [v[0] + dx, v[1] + dy];
    return this;
  }

  // A ground shadow under whatever is drawn.
  shadowUnder(groundRow) {
    let x0 = this.w;
    let x1 = -1;
    this.tok.forEach((t, i) => {
      if (t === null || t === 'S') return;
      x0 = Math.min(x0, i % this.w);
      x1 = Math.max(x1, i % this.w);
    });
    if (x1 < 0) return this;
    this.shadow((x0 + x1 + 1) / 2, groundRow + 0.6, (x1 - x0) / 2, 1.5);
    return this;
  }

  toImage(palette) {
    const data = new Uint8Array(this.w * this.h * 4);
    this.tok.forEach((t, i) => {
      if (t === null) return;
      const c = palette[t];
      if (!c) throw new Error(`No colour for token "${t}"`);
      data.set(c, i * 4);
    });
    return { w: this.w, h: this.h, data };
  }
}

export function hex(h, a = 255) {
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16), a];
}
