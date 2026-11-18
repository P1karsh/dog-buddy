// Dog models in the Goldie pixel style: palettes, hand-pixeled heads/ears,
// and builders that turn a pose into parts on a Frame (side / front / back views).
import { Frame, GROUND, CX, circle, ellipse, capsule, chain, union, rect, hex } from './raster.mjs';

// ---- Palettes ---------------------------------------------------------------------
// Tokens: o outline, l inner line, k soft line, a base, b shade, c dark shade,
// w white/cream, x white shade, r rust, s rust shade, e eye, g eye glint,
// n nose, N nose highlight, t tongue, m mouth, S shadow.
// h / H: the handshake glove (white + shade), the same for every dog.
const COMMON = { S: [40, 26, 12, 46], t: hex('#c4766a'), m: hex('#6b2f2a'), g: hex('#f4efe6'), h: hex('#fbf8f3'), H: hex('#d8d0c4') };

export const PALETTES = {
  golden: {
    ...COMMON,
    o: hex('#1f1207'), l: hex('#736243'), k: hex('#be9548'),
    a: hex('#e3be7a'), b: hex('#d5af68'), c: hex('#ad8a49'), d: hex('#be9548'),
    w: hex('#ecd197'), x: hex('#e3be7a'), r: hex('#d5af68'), s: hex('#be9548'),
    e: hex('#3d2a10'), n: hex('#402f11'), N: hex('#765721'), t: hex('#b36d5c'),
  },
  bernese: {
    ...COMMON,
    o: hex('#110c0b'), l: hex('#58504c'), k: hex('#433c39'),
    a: hex('#2d2725'), b: hex('#231e1d'), c: hex('#1a1615'), d: hex('#231e1d'),
    w: hex('#f2ebdf'), x: hex('#d9cebf'), r: hex('#b0612b'), s: hex('#8b4a20'),
    // Dark coat: eyes are drawn as a soft catch-light so they don't vanish into the fur.
    e: hex('#e6d8c4'), n: hex('#0e0a09'), N: hex('#4a403c'),
  },
  'lab-yellow': {
    ...COMMON,
    o: hex('#2a1c10'), l: hex('#8d7550'), k: hex('#cfb27d'),
    a: hex('#eed6a2'), b: hex('#e0c58f'), c: hex('#c8a970'), d: hex('#cfb27d'),
    w: hex('#f6e6c4'), x: hex('#e0c58f'), r: hex('#e0c58f'), s: hex('#cfb27d'),
    e: hex('#3a2716'), n: hex('#4a3426'), N: hex('#7a5d45'),
  },
  'lab-black': {
    ...COMMON,
    o: hex('#0c0a0a'), l: hex('#5a5352'), k: hex('#433d3c'),
    a: hex('#33302f'), b: hex('#292626'), c: hex('#1f1c1c'), d: hex('#292626'),
    w: hex('#45403f'), x: hex('#33302f'), r: hex('#292626'), s: hex('#1f1c1c'),
    e: hex('#d9b98c'), n: hex('#121010'), N: hex('#4f4949'),
  },
  'lab-chocolate': {
    ...COMMON,
    o: hex('#1d0f08'), l: hex('#4b2a18'), k: hex('#663b23'),
    a: hex('#7d4b2f'), b: hex('#6d4027'), c: hex('#5a341f'), d: hex('#663b23'),
    w: hex('#8f5a3a'), x: hex('#7d4b2f'), r: hex('#6d4027'), s: hex('#5a341f'),
    e: hex('#1e100a'), n: hex('#3d2216'), N: hex('#7a5038'),
  },
};

// ---- Breeds -----------------------------------------------------------------------
// Heads are hand-pixeled (that's where the character lives); bodies are built
// from a simple skeleton so every pose and gait stays consistent.
const GOLDEN = {
  id: 'golden',
  dark: false,
  geom: { L: 16, R: 4.3, legH: 4, legR: 1.35, tail: 'plume', tailLen: 11, tailW: 2.7, fluff: 1, neck: 2 },
  head: {
    // Facing right. Neck anchor (where the head joins the body) is listed in `anchor`.
    side: [
      '...aaaa.....',
      '..aaaaaa....',
      '.aaaaaaaa...',
      '.aaaaaaea...',
      'aaaaaaaaaaan',
      'aaaaaaaaaaaa',
      'aaaaaaaoaaa.',
      '.aaaaaaaoot.',
      '..aaaaaaa...',
      '....aaa.....',
    ],
    sideOpen: [
      '...aaaa.....',
      '..aaaaaa....',
      '.aaaaaaaa...',
      '.aaaaaaea...',
      'aaaaaaaaaaan',
      'aaaaaaaaaaaa',
      'aaaaaaammm..',
      '.aaaaaamtt..',
      '..aaaaaatt..',
      '....aaa.....',
    ],
    sideAnchor: [4, 8],
    front: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaeaaaeaaa',
      'aaaaaaaaaaa',
      'aaaaNnnaaaa',
      '.aaaanaaaa.',
      '..aaoaoaa..',
      '...aataa...',
    ],
    frontOpen: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaeaaaeaaa',
      'aaaaaaaaaaa',
      'aaaaNnnaaaa',
      '.aaaanaaaa.',
      '..aamammaa.',
      '...amtta...',
      '....att....',
    ],
    frontAnchor: [5, 8],
    back: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaaaaaaaaa',
      'aaaaaaaaaaa',
      'aaaaaaaaaaa',
      '.aaaaaaaaa.',
      '..aaaaaaa..',
      '...aaaaa...',
    ],
    backAnchor: [5, 8],
  },
  ear: {
    side: ['.aa.', 'aaaa', 'aaaa', 'aaab', 'abab', '.b.b'],
    sidePos: [1, 1],
    front: ['.aa', 'aaa', 'aaa', 'aaa', 'aab', 'abb', 'b.b'],
    frontPos: [-1, 1], // left ear; right ear is mirrored
    back: ['.aa', 'aaa', 'aaa', 'aaa', 'aab', 'abb', '.b.'],
    backPos: [-1, 1],
  },
};

const BERNESE = {
  id: 'bernese',
  dark: true,
  geom: { L: 20, R: 5.3, legH: 5, legR: 1.75, tail: 'bushy', tailLen: 13, tailW: 2.5, fluff: 2, neck: 2, travel: 0.5 },
  marks: { tailTip: 2.6 },
  head: {
    side: [
      '....aaaaa.....',
      '..aaaaaaaaa...',
      '.aaaaaaaaaaw..',
      '.aaaaaaaarww..',
      'aaaaaaaaeawwww',
      'aaaaaaarrwwwwn',
      'aaaaaaarwwwwww',
      'aaaaaaarwwowww',
      '.aaaaaaawwwwt.',
      '..aaaaaawww...',
      '....aaaa......',
    ],
    sideOpen: [
      '....aaaaa.....',
      '..aaaaaaaaa...',
      '.aaaaaaaaaaw..',
      '.aaaaaaaarww..',
      'aaaaaaaaeawwww',
      'aaaaaaarrwwwwn',
      'aaaaaaarwwwwww',
      'aaaaaaarwwmmm.',
      '.aaaaaaawwmtt.',
      '..aaaaaawwwtt.',
      '....aaaa......',
    ],
    sideAnchor: [5, 9],
    front: [
      '....aaaaa....',
      '..aaaaaaaaa..',
      '.aaaaawaaaaa.',
      'aaaarawaraaaa',
      'aaaaeawaeaaaa',
      'aaarrwwwrraaa',
      'aarwwnnnwwraa',
      '.arwwwnwwwra.',
      '..awwwowwwa..',
      '...awotowa...',
      '....awwwa....',
    ],
    frontOpen: [
      '....aaaaa....',
      '..aaaaaaaaa..',
      '.aaaaawaaaaa.',
      'aaaarawaraaaa',
      'aaaaeawaeaaaa',
      'aaarrwwwrraaa',
      'aarwwnnnwwraa',
      '.arwwwnwwwra.',
      '..awwmmmwwa..',
      '...awmtmwa...',
      '....awtwa....',
    ],
    frontAnchor: [6, 10],
    back: [
      '....aaaaa....',
      '..aaaaaaaaa..',
      '.aaaaaaaaaaa.',
      'aaaaaaaaaaaaa',
      'aaaaaaaaaaaaa',
      'aaaaaaaaaaaaa',
      'aaaaaaaaaaaaa',
      '.aaaaaaaaaaa.',
      '..aaaaaaaaa..',
      '...aaaaaaa...',
      '....aaaaa....',
    ],
    backAnchor: [6, 10],
  },
  ear: {
    side: ['.aaa.', 'aaaaa', 'aaaaa', 'aaaa.', '.aa..'],
    sidePos: [1, 1],
    front: ['aa', 'aaa', 'aaa', 'aaa', 'aa.', 'a..'],
    frontPos: [-1, 1],
    back: ['aa', 'aaa', 'aaa', 'aaa', 'aa.', 'a..'],
    backPos: [-1, 1],
  },
};

const LAB = {
  id: 'lab',
  dark: false,
  geom: { L: 16, R: 4.2, legH: 5, legR: 1.35, tail: 'otter', tailLen: 10, tailW: 1.9, fluff: 0, neck: 2 },
  head: {
    side: [
      '...aaaa.....',
      '..aaaaaa....',
      '.aaaaaaaa...',
      '.aaaaaaea...',
      'aaaaaaaaaaan',
      'aaaaaaaaaaaa',
      'aaaaaaaoaaaa',
      '.aaaaaaaooo.',
      '..aaaaaaa...',
      '....aaa.....',
    ],
    sideOpen: [
      '...aaaa.....',
      '..aaaaaa....',
      '.aaaaaaaa...',
      '.aaaaaaea...',
      'aaaaaaaaaaan',
      'aaaaaaaaaaaa',
      'aaaaaaammmm.',
      '.aaaaaamttt.',
      '..aaaaaatt..',
      '....aaa.....',
    ],
    sideAnchor: [4, 8],
    front: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaeaaaeaaa',
      'aaaaaaaaaaa',
      'aaaaNnnaaaa',
      '.aaaanaaaa.',
      '.aaaoaoaaa.',
      '..aaaaaaa..',
    ],
    frontOpen: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaeaaaeaaa',
      'aaaaaaaaaaa',
      'aaaaNnnaaaa',
      '.aaaanaaaa.',
      '.aaamammaa.',
      '..aamttaa..',
      '....att....',
    ],
    // "grr": lips pulled back over clenched teeth (alert, not angry)
    frontTeeth: [
      '...aaaaa...',
      '.aaaaaaaaa.',
      'aaaaaaaaaaa',
      'aaaeaaaeaaa',
      'aaaaaaaaaaa',
      'aaaaNnnaaaa',
      '.aaoonooaa.',
      '.aogggggoa.',
      '..aommmoa..',
    ],
    frontAnchor: [5, 8],
    back: GOLDEN.head.back,
    backAnchor: [5, 8],
  },
  ear: {
    side: ['.aa', 'aaa', 'aab', '.b.'],
    sidePos: [2, 1],
    front: ['.a', 'aa', 'aa', 'ab', 'b.'],
    frontPos: [-1, 1],
    back: ['.a', 'aa', 'aa', 'ab', 'b.'],
    backPos: [-1, 1],
  },
};

export const BREEDS = { golden: GOLDEN, bernese: BERNESE, lab: LAB };

export function breedFor(id) {
  return BREEDS[id];
}

// ---- Helpers -----------------------------------------------------------------------
const rot = (x, y, cx, cy, a) => {
  const r = (a * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return [cx + (x - cx) * c - (y - cy) * s, cy + (x - cx) * s + (y - cy) * c];
};

// Small hash for stable "fur" texture.
const hash = (x, y) => {
  let h = (x * 374761393 + y * 668265263) ^ 0x5bd1e995;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};

// Eye / mouth variants painted onto a placed head.
function paintEyes(f, headId, eyes) {
  if (eyes === 'open') return;
  const pts = [];
  for (let i = 0; i < f.tok.length; i++) {
    if (f.pid[i] === headId && f.tok[i] === 'e') pts.push([i % f.w, Math.floor(i / f.w)]);
  }
  for (const [x, y] of pts) {
    if (eyes === 'closed') {
      f.tok[f.idx(x, y)] = 'l';
      f.paint([[x - 1, y]], 'l');
    } else if (eyes === 'happy') {
      f.tok[f.idx(x, y)] = 'a';
      f.paint([[x - 1, y], [x + 1, y]], 'e');
      f.paint([[x, y - 1]], 'e');
    }
  }
}

// ---- Side view (facing right) --------------------------------------------------------
// Pose fields (all optional):
//   body: 'stand' | 'sit' | 'lie' | 'bow' | 'air'
//   x, lift            shift / raise the whole dog
//   bob                raise upper body by n px (breathing, walking)
//   pitch              tilt torso (deg, + = front down)
//   legs: { nf, ff, nh, fh } -> { a: swing deg (+ forward), lift: px, tuck: 0..1 }
//   head: { dx, dy, open, eyes: 'open'|'closed'|'happy' }
//   ear: { dy }
//   tail: { a: angle deg (0 = straight back, + = up), sway }
export function drawSide(f, B, P = {}) {
  const g = B.geom;
  const X = CX + (P.x || 0);
  const lift = P.lift || 0;
  const G = GROUND - lift;
  const bob = P.bob || 0;
  const body = P.body || 'stand';
  const head = P.head || {};
  const legs = P.legs || {};
  const tailP = P.tail || {};

  // Torso placement per body type.
  let tcx = X - 1;
  let tcy = G - g.legH - g.R + 0.5 - bob;
  let pitch = P.pitch || 0;
  let L = g.L;
  if (body === 'sit') { pitch = -38; tcx = X - 2; tcy = G - g.R - 3.6 - bob; L = g.L - 3; }
  if (body === 'lie') { tcy = G - g.R + 1 - bob; L = g.L + 1; }
  if (body === 'bow') { pitch = 16; tcy -= 0.5; }
  const half = L / 2 - g.R;
  const [rx, ry] = rot(tcx - half, tcy, tcx, tcy, pitch); // rump
  const [cx2, cy2] = rot(tcx + half, tcy, tcx, tcy, pitch); // chest

  const torsoShapes = [
    capsule(rx, ry, cx2, cy2, g.R),
    circle(cx2 + 0.6, cy2 + 0.6, g.R + 0.2), // deep chest
  ];
  // Fluffy belly / chest (golden & bernese feathering).
  const fluffBumps = [];
  if (g.fluff && body !== 'lie') {
    for (let i = 0; i < 3 + g.fluff; i++) {
      const t = 0.25 + i * (0.55 / (2 + g.fluff));
      const bx = rx + (cx2 - rx) * t;
      const by = ry + (cy2 - ry) * t + g.R - 0.3;
      fluffBumps.push(circle(bx, by + 0.6, 0.9));
    }
    fluffBumps.push(circle(cx2 + 2.4, cy2 + g.R - 0.8, 1.1));
  }

  const legT = (far) => legTok(B, far);
  const inEllipse = (cx, cy, rx, ry) => (px, py) => ((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1;
  // Bernese white bib on the chest, with a rust edge.
  const bibSide = (px, py) => {
    if (inEllipse(cx2 + 2.2, cy2 + 2.2, 3.6, 4.4)(px, py)) return 'w';
    if (inEllipse(cx2 - 0.6, cy2 + 3.4, 2.4, 2.2)(px, py)) return 'r';
    return null;
  };

  // Legs. Near legs only draw a soft line where they cross the far leg.
  const drawLeg = (name, ax, ay, opts = {}, far = false, hind = false, extraLines = {}) => {
    const a = opts.a || 0;
    const up = opts.lift || 0;
    const tuck = opts.tuck || 0;
    const groundY = G - up;
    let px = ax + Math.tan((a * Math.PI) / 180) * (groundY - ay);
    let py = groundY - 0.4;
    if (tuck) {
      // in the air: fold the leg and point it by angle instead of planting it
      const len = (groundY - ay) * (1 - 0.42 * tuck);
      px = ax + Math.sin((a * Math.PI) / 180) * len;
      py = ay + Math.cos((a * Math.PI) / 180) * len;
    }
    const pts = hind
      ? [[ax, ay, g.legR + 0.6], [ax + 0.6, ay + (py - ay) * 0.45, g.legR + 0.2], [px - 0.3, py - 1.2, g.legR], [px, py, g.legR]]
      : [[ax, ay, g.legR + 0.3], [px, py - 1, g.legR], [px, py, g.legR]];
    const shapes = [chain(pts), ellipse(px + 0.8, py - 0.2, g.legR + 0.75, 1.05)];
    const lineRule = far ? {} : { ff: 'k', fh: 'k', ...extraLines };
    f.shape(name, union(shapes), { token: legT(far), lines: lineRule });
    if (name === 'nf') f.marks.pawTip = [Math.round(px + 1.5), Math.round(py)];
  };

  // Legs attach under the chest / rump.
  const [sfx, sfy] = rot(cx2 - 0.5, cy2 + 1, tcx, tcy, 0);
  const [shx, shy] = rot(rx + 0.8, ry + 1, tcx, tcy, 0);

  // Tail (behind everything else on the body)
  const tailBase = rot(rx - g.R + 1.6, ry - g.R + 2.2, rx, ry, 0);
  const drawTail = () => {
    const ang = tailP.a ?? 20;
    drawTailSide(f, B, tailBase[0], tailBase[1], ang, tailP.sway || 0, body);
  };

  if (body === 'stand' || body === 'bow' || body === 'air') {
    drawTail();
    drawLeg('fh', shx + 1.6, shy, legs.fh, true, true);
    drawLeg('ff', sfx + 1.4, sfy, legs.ff, true, false);
    drawLeg('nh', shx, shy, legs.nh, false, true);
    drawLeg('nf', sfx, sfy, legs.nf, false, false);
    f.shape('torso', union([...torsoShapes, ...fluffBumps]), { token: torsoTok(B, false, bibSide), lines: { tail: 'k' } });
    // thigh: a soft arc on the front/top edge only
    f.shape('haunch', circle(rx + 0.8, ry + 0.6, g.R - 0.5), {
      token: torsoTok(B, false),
      lines: { torso: (x, y, dx, dy) => (dx > 0 || dy < 0 ? 'k' : null) },
    });
  } else if (body === 'sit') {
    drawTailSit(f, B, rx - 1, G, tailP.sway || 0);
    // far front leg
    drawLeg('ff', cx2 + 1.2, cy2 + 1, { a: 0 }, true, false);
    const bibSit = (px, py) => (inEllipse(cx2 + 1.6, cy2 + 1.2, 3.2, 5)(px, py) ? 'w' : null);
    f.shape('torso', union(torsoShapes), { token: torsoTok(B, false, bibSit), lines: {} });
    // folded hind leg: big haunch + paw forward
    f.shape('haunch', ellipse(rx + 1.6, G - g.R + 0.4, g.R + 0.6, g.R - 0.2), { token: torsoTok(B, false), lines: { torso: 'k' } });
    if (!P.scratch) f.shape('hpaw', ellipse(rx + g.R + 3, G - 0.6, 2.2, 1.1), { token: legT(false), lines: { haunch: 'l' } });
    if (P.raise) {
      // boop paw: near front leg lifted forward
      const ra = P.raise; // 0..1
      const ax = cx2 - 0.2;
      const ay = cy2 + 0.5;
      const ang = -10 + ra * 80; // degrees forward from straight down
      const len = (G - ay) * 0.95;
      const px = ax + Math.sin((ang * Math.PI) / 180) * len;
      const py = ay + Math.cos((ang * Math.PI) / 180) * len;
      f.shape('nf', union([chain([[ax, ay, g.legR + 0.3], [px, py, g.legR]]), circle(px + 0.4, py, g.legR + 0.5)]), {
        token: (x, y, e) => {
          // the paw end of a raised leg is its tip, not its bottom
          if (B.id !== 'bernese') return e.down(x, y) <= 0 ? 'b' : 'a';
          const dd = Math.hypot(x + 0.5 - px, y + 0.5 - py);
          return dd < g.legR + 0.6 ? 'w' : dd < g.legR + 3 ? 'r' : 'a';
        },
        lines: { torso: (x, y) => (y > cy2 + 2 ? 'k' : null), haunch: 'k', hpaw: 'k', ff: 'k' },
      });
      f.marks.pawTip = [Math.round(px + 1.6), Math.round(py)];
    } else {
      drawLeg('nf', cx2 - 0.2, cy2 + 0.5, { a: 0 }, false, false, { hpaw: 'k', haunch: 'k' });
    }
  } else if (body === 'lie') {
    // Curled up asleep: a rounded mound, chin on the front paws, tail wrapped round the front.
    const breath = P.breath || 0; // 0..1 inhale
    const mx = X - 3;
    const s = g.L / 17; // scale with breed size
    const pawT = (far) => (x, y) => {
      if (B.id !== 'bernese') return far ? 'b' : 'a';
      const tipX = mx + (far ? 13 : 12) * s;
      return x + 0.5 > tipX - 2 ? (far ? 'x' : 'w') : far ? 's' : 'r';
    };
    f.shape('ff', capsule(mx + 6 * s, G - 1.6, mx + 13 * s, G - 1.5, g.legR), { token: pawT(true) });
    f.shape('torso', union([
      ellipse(mx, G - 4.6 * s - breath * 0.5, 9.2 * s, 5.2 * s + breath * 0.5),
      circle(mx - 5.5 * s, G - 4.4 * s - breath * 0.4, 4.6 * s + breath * 0.3),
    ]), { token: torsoTok(B, false), lines: { ff: 'k' } });
    f.shape('haunch', ellipse(mx - 4.5 * s, G - 3.4 * s, 4.4 * s, 3.4 * s), {
      token: torsoTok(B, false),
      lines: { torso: (x, y, dx, dy) => (dx > 0 || dy < 0 ? 'k' : null) },
    });
    f.shape('nf', capsule(mx + 4 * s, G - 0.7, mx + 12 * s, G - 0.6, g.legR + 0.1), { token: pawT(false), lines: { torso: 'k', ff: 'k', haunch: 'k' } });
    drawTailLie(f, B, mx - 9.5 * s, G - 2.6, tailP.sway || 0, mx + 3 * s);
  } else if (body === 'ball') {
    // Curled up tight for a roll: a round body, tail wrapped round the back, paws tucked in.
    const r = g.R + 2.3;
    const bx = X - 1;
    const by = G - r + 0.4;
    const tailPts = [];
    for (let i = 0; i <= 8; i++) {
      const t = i / 8;
      const a = Math.PI * (0.55 + 0.8 * t);
      tailPts.push([bx + Math.cos(a) * (r - 0.8), by + Math.sin(a) * (r - 0.8), tailRadius(g, t) * 0.72]);
    }
    f.shape('torso', circle(bx, by, r), { token: torsoTok(B, false) });
    f.shape('tail', union(tailShapes(B, tailPts)), { token: tailToken(B, tailPts[tailPts.length - 1]), lines: { torso: 'k' } });
    f.shape('nf', ellipse(bx + r * 0.45, G - 1.3, 2.4, 1.3), { token: B.id === 'bernese' ? 'w' : 'a', lines: { torso: 'k', tail: 'k' } });
  } else if (body === 'back') {
    // On his back, belly up, legs in the air. `kick` wiggles the legs.
    const kick = P.kick || 0;
    const rxB = g.L / 2 + 0.5;
    const ryB = g.R - 0.2;
    const cxB = X - 1;
    const cyB = G - ryB + 0.6;
    const topY = cyB - ryB + 1;
    const belly = (px, py) => {
      if (py > cyB - 0.5) return null;
      if (B.id === 'bernese') return px > cxB - 1 ? 'w' : null; // white chest, black belly
      return 'w';
    };
    const upLeg = (name, rootX, tipX, tipY, far, bent) => {
      const pts = bent
        ? [[rootX, topY + 1, g.legR + 0.3], [tipX, tipY, g.legR], [tipX + 1.4, tipY + 1.3, g.legR]] // front paws fold over
        : [[rootX, topY + 1, g.legR + 0.5], [tipX, tipY, g.legR]];
      const end = pts[pts.length - 1];
      f.shape(name, union([chain(pts), circle(end[0], end[1], g.legR + 0.45)]), {
        token: (x, y) => {
          const tip = Math.hypot(x + 0.5 - end[0], y + 0.5 - end[1]) < g.legR + 1;
          if (B.id === 'bernese') return tip ? (far ? 'x' : 'w') : far ? 's' : 'r';
          return far ? 'b' : 'a';
        },
        lines: far ? {} : { torso: 'k', fh: 'k', ff: 'k' },
      });
    };
    const hindX = cxB - rxB + 3.5;
    const frontX = cxB + rxB - 4.5;
    drawTailSit(f, B, cxB - rxB + 2, G, tailP.sway || 0);
    upLeg('fh', hindX + 1.6, hindX - 0.5 + kick, topY - 4.6 - kick * 0.5, true, false);
    upLeg('ff', frontX + 1.6, frontX + 1.4 - kick, topY - 4.2 + kick * 0.5, true, true);
    f.shape('torso', ellipse(cxB, cyB, rxB, ryB), { token: torsoTok(B, false, belly), lines: { tail: 'k' } });
    upLeg('nh', hindX, hindX - 2.2 - kick, topY - 4 + kick * 0.5, false, false);
    upLeg('nf', frontX, frontX + 0.4 + kick, topY - 4.8 - kick * 0.5, false, true);
  }

  // Head
  const upsideDown = body === 'back';
  const stampRows = head.open ? B.head.sideOpen : B.head.side;
  const [ax, ay] = B.head.sideAnchor;
  // The head sits up on a neck (like Goldie), not flat on the back.
  const neckUp = g.neck ?? 2;
  let hx = Math.round(cx2 + 1.6 - ax + (head.dx || 0));
  let hy = Math.round(cy2 - g.R - ay + 2 - neckUp + (head.dy || 0));
  if (body === 'sit') { hx = Math.round(cx2 + 0.5 - ax + (head.dx || 0)); hy = Math.round(cy2 - g.R - ay + 1 - neckUp * 0.5 + (head.dy || 0)); }
  if (body === 'lie') {
    const s = g.L / 17;
    hx = Math.round(X - 3 + 4 * (s - 1) + (head.dx || 0));
    hy = Math.round(G - stampRows.length - 0.6 + (head.dy || 0) - (P.breath || 0) * 0.4);
  } else if (body === 'ball') {
    // head tucked in at the top-front of the ball, nose poking out
    const r = g.R + 2.3;
    hx = Math.round(X - 1 + r - stampRows[0].length + 4 + (head.dx || 0));
    hy = Math.round(G - 2 * r + 0.6 + (head.dy || 0));
  } else if (upsideDown) {
    // head thrown back, upside down, resting on the floor at the front
    hx = Math.round(X - 1 + g.L / 2 - 4 + (head.dx || 0));
    hy = Math.round(G - stampRows.length + 1 + (head.dy || 0));
  } else {
    // neck: joins the chest to the back of the jaw
    const throat = (px) => (px > cx2 + 0.6 ? 'w' : null);
    f.shape('neck', capsule(cx2 - 0.2, cy2 - g.R + 3, hx + ax + 1.2, hy + ay, g.R * 0.56), {
      token: torsoTok(B, false, throat),
      lines: {},
    });
  }
  const headId = f.stamp('head', stampRows, hx, hy, { lines: { torso: upsideDown ? 'k' : null }, flipY: upsideDown });
  const earRows = B.ear.side;
  const [ex, ey] = B.ear.sidePos;
  const earY = upsideDown ? hy + stampRows.length - (ey + earRows.length) : hy + ey + ((P.ear && P.ear.dy) || 0);
  f.stamp('ear', earRows, hx + ex, earY, { lines: { head: 'l', torso: 'l', neck: 'l' }, flipY: upsideDown });
  paintEyes(f, headId, head.eyes || 'open');
  const noseRow = stampRows.findIndex((r) => r.includes('n'));
  f.marks.nose = [hx + stampRows[noseRow].indexOf('n') + 1, upsideDown ? hy + stampRows.length - 1 - noseRow : hy + noseRow];
  f.marks.headTop = [hx + Math.floor(stampRows[0].length / 2), hy];

  // Scratching behind the ear with a hind leg (sitting).
  if (body === 'sit' && P.scratch) {
    const hipX = rx + 1.8;
    const hipY = G - g.R - 0.5;
    const footX = hx + ex + 1.5;
    const footY = P.scratch === 1 ? hipY - 3 : hy + ey + 5 + (P.scratch === 3 ? 1 : 0);
    const kneeX = Math.max(hipX, footX) + 1.5;
    const kneeY = (hipY + footY) / 2 + 1;
    f.shape('scratch', union([
      chain([[hipX, hipY, g.legR + 0.5], [kneeX, kneeY, g.legR + 0.2], [footX, footY, g.legR]]),
      circle(footX, footY, g.legR + 0.5),
    ]), {
      token: (x, y) => (B.id === 'bernese' && Math.hypot(x + 0.5 - footX, y + 0.5 - footY) < g.legR + 0.7 ? 'w' : 'a'),
      lines: { '*': 'l' },
    });
  }

  f.lines();
  f.outline();
  const shadowRx = body === 'lie' || body === 'back' ? g.L / 2 + 3 : body === 'ball' ? g.R + 3 : g.L / 2 + 1;
  f.shadow(X - 1 + (body === 'sit' ? 1 : 0), GROUND + 1.6, shadowRx - lift * 0.6, 1.5);
  return f;
}

// Leg colouring. The Bernese gets rust socks and white toes.
function legTok(B, far) {
  return (x, y, e) => {
    const d = e.down(x, y);
    if (B.id === 'bernese') {
      if (d <= 0) return far ? 'x' : 'w';
      if (d <= 3) return far ? 's' : 'r';
      return far ? 'b' : 'a';
    }
    if (far) return d <= 0 ? 'c' : 'b';
    return d <= 0 ? 'b' : 'a';
  };
}

// Body colouring. `mark(px, py)` can return a marking token (Bernese bib / rust).
function torsoTok(B, far, mark) {
  return (x, y, e) => {
    const d = e.down(x, y);
    const m = mark && B.id === 'bernese' ? mark(x + 0.5, y + 0.5) : null;
    if (m === 'w') return d <= 0 ? 'x' : 'w';
    if (m === 'r') return d <= 0 ? 's' : 'r';
    if (d <= 0) return far ? 'c' : 'b';
    if (d === 1 && hash(x, y) > 0.35) return 'b';
    // sparse fur strokes
    if (e.up(x, y) > 1 && d > 1 && hash(x * 3, y * 7) > 0.9) return 'b';
    return far ? 'b' : 'a';
  };
}

// Tail as a curve of circles. ang: degrees above "straight back" (+ up, - down).
// The plume droops towards its tip; `sway` bends it for wagging.
function tailCurve(B, bx, by, ang, sway, dir = -1) {
  const g = B.geom;
  const N = 8;
  const step = g.tailLen / N;
  const pts = [[bx, by, tailRadius(g, 0)]];
  let x = bx;
  let y = by;
  for (let i = 1; i <= N; i++) {
    const t = i / N;
    const droop = (g.tail === 'otter' ? 12 : 34) * t * t;
    const a = ((ang - droop + sway * 14 * t) * Math.PI) / 180;
    x += dir * Math.cos(a) * step;
    y -= Math.sin(a) * step;
    pts.push([x, y, tailRadius(g, t)]);
  }
  return pts;
}

function tailRadius(g, t) {
  if (g.tail === 'otter') return Math.max(0.8, g.tailW * (1 - 0.62 * t));
  const peak = g.tail === 'bushy' ? 1.25 : 1.0;
  return Math.max(1.0, g.tailW * peak * (0.42 + 0.62 * Math.sin(Math.PI * Math.min(0.92, t ** 0.85))));
}

function tailShapes(B, pts) {
  const shapes = [chain(pts)];
  if (B.geom.tail !== 'otter') {
    // feathering: little tufts on the underside of the plume
    for (let i = 3; i < pts.length; i += 2) {
      const [x, y, r] = pts[i];
      const [px, py] = pts[i - 1];
      const dx = x - px;
      const dy = y - py;
      const len = Math.hypot(dx, dy) || 1;
      let nx = -dy / len;
      let ny = dx / len;
      if (ny < 0) { nx = -nx; ny = -ny; } // underside = towards the ground
      shapes.push(circle(x + nx * r * 0.8, y + ny * r * 0.8, 1.0));
    }
  }
  return shapes;
}

function tailToken(B, tip) {
  return (x, y, e) => {
    if (B.marks?.tailTip && Math.hypot(x + 0.5 - tip[0], y + 0.5 - tip[1]) < B.marks.tailTip) return e.down(x, y) <= 0 ? 'x' : 'w';
    if (e.down(x, y) <= 0) return 'b';
    if (e.down(x, y) === 1 && hash(x, y) > 0.5) return 'b';
    return hash(x * 5, y * 3) > 0.86 ? 'b' : 'a';
  };
}

function drawTailSide(f, B, bx, by, ang, sway) {
  const pts = tailCurve(B, bx, by, ang, sway);
  const tip = pts[pts.length - 1];
  f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, tip), lines: {} });
}

// Front / back views: tail rising up, bending to one side (side: -1..1).
function tailUpCurve(B, bx, by, side, lenK = 0.95) {
  const g = B.geom;
  const N = 8;
  const len = g.tailLen * lenK;
  const pts = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const x = bx + side * 4.2 * t ** 1.4;
    const y = by - len * t + (g.tail === 'otter' ? 0 : 2.2 * t * t);
    pts.push([x, y, tailRadius(g, t)]);
  }
  return pts;
}

// Sitting: the tail lies on the floor behind and sweeps when wagging.
function drawTailSit(f, B, bx, G, sway) {
  const g = B.geom;
  const r0 = tailRadius(g, 0.5);
  const pts = tailCurve(B, bx, G - r0 - 0.2, -4 + sway * 9, 0);
  // keep it on the floor
  for (const p of pts) p[1] = Math.min(p[1], G - p[2] + 0.4);
  const tip = pts[pts.length - 1];
  f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, tip), lines: {} });
}

// Lying curled up: the tail comes round the back and lies along the floor in front.
function drawTailLie(f, B, bx, by, sway, endX) {
  const g = B.geom;
  const pts = [];
  const N = 10;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    // a hook: out the back, down to the floor, then forward
    const x = t < 0.3 ? bx - Math.sin((t / 0.3) * Math.PI * 0.5) * 2 : bx - 2 + (endX - bx + 2) * ((t - 0.3) / 0.7);
    const y = t < 0.3 ? by + (t / 0.3) * 1.6 : by + 1.6 - sway * 0.6 * Math.sin(((t - 0.3) / 0.7) * Math.PI);
    pts.push([x, y, Math.max(0.9, tailRadius(g, t) * 0.78)]);
  }
  const G = by + 2.6;
  for (const p of pts) p[1] = Math.min(p[1], G - p[2] + 0.4);
  const tip = pts[pts.length - 1];
  f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, tip), lines: { torso: 'k', haunch: 'k' } });
}

// ---- Front view ----------------------------------------------------------------------
// Pose: { body: 'sit' | 'stand' | 'held', bob, step (-1|0|1 walk), head: {...}, ear: {dy}, tail: {side: -1..1, up} }
export function drawFront(f, B, P = {}) {
  const g = B.geom;
  const X = CX + (P.x || 0);
  const lift = P.lift || 0;
  const G = GROUND - lift;
  const bob = P.bob || 0;
  const body = P.body || 'sit';
  const head = P.head || {};
  const tailP = P.tail || {};
  const s = g.R / 4.4; // breed scale (golden = 1)
  const w = g.R + 1.2; // half body width
  const legX = 1.7 * s;
  let headY;

  const pawTok = legTok(B, false);
  const farTok = legTok(B, true);
  const bib = (cx, cy, rx, ry) => (px, py) => (((px - cx) / rx) ** 2 + ((py - cy) / ry) ** 2 <= 1 ? 'w' : null);

  if (body === 'sit') {
    // Tail sweeping on the floor, peeking out to one side.
    const side = tailP.side ?? 1;
    if (side !== 0) {
      const pts = tailCurve(B, X + side * 2 * s, G - 1.6, -6, 0, side);
      for (const p of pts) p[1] = Math.min(p[1], G - p[2] + 0.4);
      f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, pts[pts.length - 1]) });
    }
    // haunches (folded hind legs) tucked in at the sides: an upright, compact sit
    const hr = [3.0 * s, 3.6 * s];
    f.shape('haunchL', ellipse(X - w + 1.3, G - 3.3 * s, hr[0], hr[1]), { token: torsoTok(B, false), lines: { tail: 'k' } });
    f.shape('haunchR', ellipse(X + w - 1.3, G - 3.3 * s, hr[0], hr[1]), { token: torsoTok(B, false), lines: { tail: 'k' } });
    f.shape('hpawL', ellipse(X - w - 0.1 * s, G - 0.6, 2.0 * s, 1.15), { token: pawTok, lines: { haunchL: 'l' } });
    f.shape('hpawR', ellipse(X + w + 0.1 * s, G - 0.6, 2.0 * s, 1.15), { token: pawTok, lines: { haunchR: 'l' } });
    // chest
    const top = G - 13.5 * s - bob;
    const fluff = g.fluff ? [circle(X - 2 * s, top + 12.6 * s, 1.1), circle(X + 2 * s, top + 12.6 * s, 1.1), circle(X, top + 13.2 * s, 1.1)] : [];
    f.shape('torso', union([ellipse(X, top + 7 * s, w - 0.5, 7.3 * s), ...fluff]), {
      token: torsoTok(B, false, bib(X, top + 7.5 * s, 3.2 * s, 6.4 * s)),
      lines: { haunchL: (x, y, dx) => (dx < 0 ? 'k' : null), haunchR: (x, y, dx) => (dx > 0 ? 'k' : null) },
    });
    // front legs: a line against the haunch and down the middle, nothing on top
    for (const [name, lx, other] of [['legL', X - legX, 'haunchL'], ['legR', X + legX, 'haunchR']]) {
      const up = name === 'legR' ? P.pawUp || 0 : 0;
      if (up > 0) {
        // offering a paw: the leg swings up towards you, paw pad showing
        const sy0 = top + 9.5 * s;
        const upX = lx + 5.8 * s; // reaching out past the chest, so the shake happens beside him
        const upY = top + 4.2 * s + (P.pawDy || 0);
        const px = lx + (upX - lx) * up;
        const py = G - 0.6 + (upY - (G - 0.6)) * up;
        const padR = g.legR + 1;
        f.shape(name, union([capsule(lx, sy0, px, py, g.legR), ellipse(px, py, g.legR + 0.9, g.legR + 0.5)]), {
          token: (x, y, e) => {
            const near = Math.hypot(x + 0.5 - px, y + 0.5 - py) < padR;
            if (B.id === 'bernese') return near ? 'w' : 'r';
            return near && e.down(x, y) <= 0 ? 'b' : 'a';
          },
          lines: { torso: 'l', [other]: 'l', legL: 'l', hpawR: 'l' },
        });
        if (up >= 0.99) {
          const fx0 = Math.floor(px);
          const fy0 = Math.floor(py);
          f.paint([[fx0, fy0], [fx0 - 1, fy0], [fx0 - 1, fy0 - 1 - 1], [fx0 + 1, fy0 - 1 - 1]], 't'); // pad + toe beans
          f.marks.paw = [px, py];
        }
      } else {
        f.shape(name, union([capsule(lx, top + 10 * s, lx, G - 0.8, g.legR), ellipse(lx, G - 0.6, g.legR + 0.6, 1.1)]), {
          token: pawTok,
          lines: { [other]: 'l', legL: 'l', hpawL: 'l', hpawR: 'l' },
        });
      }
    }
    headY = top - 6;
  } else {
    // standing / held: legs straight, body oval
    const held = body === 'held';
    const top = G - g.legH - 8 * s - bob;
    const step = P.step || 0;
    const kick = P.kick || 0;
    // tail rising behind the back, peeking out above the head
    const pts = tailUpCurve(B, X + (tailP.side ?? 0.6) * 1.5, top + 2, tailP.side ?? 0.6, 1.45);
    f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, pts[pts.length - 1]) });
    // hind legs (behind, darker)
    for (const [name, lx, sd] of [['hindL', X - 2.8 * s, -1], ['hindR', X + 2.8 * s, 1]]) {
      const up = held ? 0 : Math.max(0, sd * step) * 1.5;
      const bottom = held ? G + 1.5 - sd * kick : G - up;
      f.shape(name, union([capsule(lx, top + 6 * s, lx, bottom - 0.8, g.legR), ellipse(lx, bottom - 0.6, g.legR + 0.5, 1)]), { token: farTok });
    }
    f.shape('torso', union([ellipse(X, top + 5 * s, w, 5.2 * s), ...(g.fluff ? [circle(X, top + 9.8 * s, 1.2)] : [])]), {
      token: torsoTok(B, false, bib(X, top + 5.5 * s, 3 * s, 4.6 * s)),
    });
    for (const [name, lx, sd] of [['legL', X - legX, 1], ['legR', X + legX, -1]]) {
      const up = held ? 0 : Math.max(0, sd * step) * 1.5;
      const bottom = held ? G + 0.5 + sd * kick : G - up;
      f.shape(name, union([capsule(lx, top + 7 * s, lx, bottom - 0.8, g.legR), ellipse(lx, bottom - 0.6, g.legR + 0.5, 1.05)]), {
        token: pawTok,
        lines: { legL: 'l', hindL: 'k', hindR: 'k' },
      });
    }
    headY = top - 6;
  }

  const rows = head.teeth ? B.head.frontTeeth || B.head.frontOpen : head.open ? B.head.frontOpen : B.head.front;
  const hw = rows[0].length;
  const hx = Math.round(X - hw / 2 + (head.dx || 0));
  const hy = Math.round(headY + 6 - (rows.length - 3) + (head.dy || 0));
  const headId = f.stamp('head', rows, hx, hy, { lines: { torso: 'o' } });
  const [ex, ey] = B.ear.frontPos;
  const edy = (P.ear && P.ear.dy) || 0;
  const edyR = (P.ear && P.ear.dyR !== undefined) ? P.ear.dyR : edy;
  f.stamp('earL', B.ear.front, hx + ex, hy + ey + edy, { lines: { head: 'l', torso: 'l' } });
  f.stamp('earR', B.ear.front, hx + hw - 1 - ex - (B.ear.front[0].length - 1), hy + ey + edyR, { flip: true, lines: { head: 'l', torso: 'l' } });
  paintEyes(f, headId, head.eyes || 'open');
  f.marks.headTop = [hx + Math.floor(hw / 2), hy];

  // Handshake: a little cartoon glove (yours) clasping the offered paw.
  if (P.hand && f.marks.paw) {
    const [px, py] = f.marks.paw;
    f.stamp('glove', GLOVE, Math.round(px + 0.5 + (P.hand.dx || 0)), Math.round(py - 3 + (P.hand.dy || 0)), { lines: { '*': 'o' } });
  }

  f.lines();
  f.outline();
  f.shadow(X, GROUND + 1.6, 7 - lift * 0.6, 1.5);
  return f;
}

// White cartoon glove: thumb on top, fingers curled left round the paw (creases), cuff on the right.
const GLOVE = [
  '.hh......',
  'hhhh.....',
  'hhhhhhoHH',
  'ohhhhhoHH',
  'hohhhhoHH',
  'hhohhhoHH',
  '.hhhhhoHH',
  '..hhhh...',
];

// ---- Back view -------------------------------------------------------------------------
export function drawBack(f, B, P = {}) {
  const g = B.geom;
  const X = CX + (P.x || 0);
  const lift = P.lift || 0;
  const G = GROUND - lift;
  const bob = P.bob || 0;
  const step = P.step || 0;
  const tailP = P.tail || {};
  const s = g.R / 4.4;
  const w = g.R + 1.2;
  const top = G - g.legH - 9 * s - bob;

  // front legs (behind body from this side)
  for (const [name, lx, sd] of [['frontL', X - 1.6 * s, -1], ['frontR', X + 1.6 * s, 1]]) {
    const up = Math.max(0, sd * step) * 1.2;
    f.shape(name, union([capsule(lx, top + 6 * s, lx, G - up - 0.8, g.legR), ellipse(lx, G - up - 0.6, g.legR + 0.5, 1)]), {
      token: legTok(B, true),
    });
  }
  const rows = B.head.back;
  const hw = rows[0].length;
  const hx = Math.round(X - hw / 2);
  const hy = Math.round(top - (rows.length - 3));
  f.stamp('head', rows, hx, hy, {});
  const [ex, ey] = B.ear.backPos;
  const edy = (P.ear && P.ear.dy) || 0;
  f.stamp('earL', B.ear.back, hx + ex, hy + ey + edy, { lines: { head: 'l' } });
  f.stamp('earR', B.ear.back, hx + hw - 1 - ex - (B.ear.back[0].length - 1), hy + ey + edy, { flip: true, lines: { head: 'l' } });
  f.shape('torso', union([ellipse(X, top + 5 * s, w - 0.2, 5.4 * s), circle(X - 2.6 * s, top + 8.2 * s, 3.5 * s), circle(X + 2.6 * s, top + 8.2 * s, 3.5 * s)]), {
    token: torsoTok(B, false),
    lines: { head: 'o' },
  });
  for (const [name, lx, sd] of [['hindL', X - 2.6 * s, 1], ['hindR', X + 2.6 * s, -1]]) {
    const up = Math.max(0, sd * step) * 1.5;
    f.shape(name, union([capsule(lx, top + 9 * s, lx, G - up - 0.8, g.legR + 0.2), ellipse(lx, G - up - 0.6, g.legR + 0.6, 1.05)]), {
      token: legTok(B, false),
      lines: { hindL: 'l', frontL: 'k', frontR: 'k' },
    });
  }
  // tail up the middle, wagging
  const pts = tailUpCurve(B, X, top + 6 * s, tailP.side ?? 0);
  f.shape('tail', union(tailShapes(B, pts)), { token: tailToken(B, pts[pts.length - 1]), lines: { torso: 'k', head: 'k' } });

  f.lines();
  f.outline();
  f.shadow(X, GROUND + 1.6, 7 - lift * 0.6, 1.5);
  return f;
}

export function render(view, B, P) {
  const f = new Frame();
  if (view === 'side') drawSide(f, B, P);
  else if (view === 'front') drawFront(f, B, P);
  else drawBack(f, B, P);
  return f;
}
