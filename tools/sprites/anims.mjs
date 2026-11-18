// Animation list. Every breed gets the same rows, so the runtime can treat them alike.
// A frame is { view: 'side'|'front'|'back', flip?: true, pose: {...}, ms }.
// `hits` marks frames where a boop lands; `loop` animations repeat.

const TAU = Math.PI * 2;
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

// Ears lag one frame behind the body (secondary motion).
const lag = (bobs) => bobs.map((b, i) => {
  const prev = bobs[(i - 1 + bobs.length) % bobs.length];
  return b - prev; // +1 when the body just rose (ears still low), -1 when it just dropped
});

function frontSit({ bob = 0, ear = 0, earR, side = 1, eyes = 'open', open = false, teeth = false, dx = 0, dy = 0, pawUp = 0, pawDy = 0, hand } = {}) {
  return {
    view: 'front',
    pose: { body: 'sit', bob, pawUp, pawDy, hand, ear: { dy: ear, dyR: earR ?? ear }, tail: { side }, head: { eyes, open, teeth, dx, dy } },
  };
}
// On his back, legs in the air (kick wiggles them).
function sideBack({ kick = 0, lift = 0, eyes = 'closed', open = true, sway = 0 } = {}) {
  return { view: 'side', pose: { body: 'back', kick, lift, tail: { sway }, head: { eyes, open } } };
}
// Curled into a ball for rolling; `rot` quarter turns, `shift` px to the right.
function ball(rot, shift) {
  return { view: 'side', pose: { body: 'ball', head: { eyes: 'closed' } }, rot, shift };
}
function sideStand({ bob = 0, ear = 0, a = 15, sway = 0, legs, eyes = 'open', open = false, dx = 0, dy = 0, pitch = 0, body = 'stand', lift = 0 } = {}) {
  return { view: 'side', pose: { body, bob, lift, pitch, ear: { dy: ear }, tail: { a, sway }, legs, head: { eyes, open, dx, dy } } };
}
function sideSit({ bob = 0, ear = 0, sway = 0, eyes = 'open', open = false, dx = 0, dy = 0, raise = 0, scratch = 0 } = {}) {
  return { view: 'side', pose: { body: 'sit', bob, ear: { dy: ear }, tail: { sway }, raise, scratch, head: { eyes, open, dx, dy } } };
}
function sideLie({ breath = 0, eyes = 'closed', ear = 0, sway = 0, dy = 0 } = {}) {
  return { view: 'side', pose: { body: 'lie', breath, ear: { dy: ear }, tail: { sway }, head: { eyes, dy } } };
}
const with_ = (fr, ms, extra = {}) => ({ ...fr, ms, ...extra });

// ---- Idle: sitting, facing you -------------------------------------------------------
const BREATH = [0, 0, 0, 1, 1, 1, 0, 0];
const BREATH_EAR = lag(BREATH);
const sitIdle = (eyes) => BREATH.map((b, i) => with_(frontSit({ bob: b, ear: BREATH_EAR[i], side: i >= 3 && i <= 5 ? 0.85 : 1, eyes }), 210));

const WAG = [1, 0.45, -0.45, -1, -1, -0.45, 0.45, 1];
const PANT = [0, 1, 0, 1, 0, 1, 0, 1];
const PANT_EAR = lag(PANT);

// ---- Walking cycle (side) ------------------------------------------------------------
function walkFrame(i, n, { speed = 1, open = true } = {}) {
  const th = (i / n) * TAU;
  const A = 24;
  const leg = (ph) => ({ a: A * Math.sin(th + ph), lift: Math.max(0, Math.cos(th + ph)) * 1.4 });
  const bob = Math.abs(Math.sin(th)) < 0.5 ? 1 : 0;
  return sideStand({
    bob,
    ear: Math.abs(Math.sin(th - 0.9)) < 0.5 ? -1 : 0,
    a: 22 + Math.sin(th) * 10,
    sway: Math.sin(th * 2) * 0.6,
    legs: { nf: leg(0), fh: leg(0), ff: leg(Math.PI), nh: leg(Math.PI) },
    open: open && speed > 0,
  });
}

// Facing views used while turning. dir: 'R' | 'F' | 'L' | 'B'
function facing(dir, step, extra = {}) {
  if (dir === 'F') return { view: 'front', pose: { body: 'stand', step, tail: { side: step || 0.6 }, head: { open: true, eyes: 'happy' }, ...extra } };
  if (dir === 'B') return { view: 'back', pose: { body: 'stand', step, tail: { side: -step || -0.6 }, ...extra } };
  const legs = step
    ? { nf: { a: 18 * step, lift: step > 0 ? 1.2 : 0 }, fh: { a: 18 * step }, ff: { a: -18 * step }, nh: { a: -18 * step, lift: step < 0 ? 1.2 : 0 } }
    : undefined;
  const fr = sideStand({ legs, a: 45, open: true, eyes: 'happy', ...extra.side });
  if (extra.lift) fr.pose.lift = extra.lift;
  return dir === 'L' ? { ...fr, flip: true } : fr;
}

export const ANIMS = [
  // ---- front, sitting --------------------------------------------------------------
  { name: 'sit', loop: true, frames: sitIdle('open') },
  { name: 'sit_blink', loop: true, frames: sitIdle('closed') },
  {
    name: 'sit_happy', loop: true,
    frames: WAG.map((side, i) => with_(frontSit({ side, bob: PANT[i], ear: PANT_EAR[i], eyes: 'happy', open: true }), 105)),
  },
  {
    name: 'sit_pant', loop: true,
    frames: WAG.map((side, i) => with_(frontSit({ side: side * 0.7 + 0.3, bob: PANT[i], ear: PANT_EAR[i], open: true }), 130)),
  },
  {
    name: 'tilt',
    frames: [
      with_(frontSit({ dx: 0, ear: 0 }), 110),
      with_(frontSit({ dx: 1, ear: 1, earR: -1 }), 110),
      with_(frontSit({ dx: 1, ear: 1, earR: -2, dy: 0 }), 650),
      with_(frontSit({ dx: 1, ear: 1, earR: -2, eyes: 'closed' }), 90),
      with_(frontSit({ dx: 1, ear: 1, earR: -2 }), 450),
      with_(frontSit({ dx: 0, ear: 0, earR: -1 }), 110),
      with_(frontSit({ dx: 0 }), 150),
    ],
  },
  {
    name: 'bark',
    frames: [
      with_(frontSit({ bob: 0 }), 90),
      with_(frontSit({ bob: 1, ear: -1, open: true }), 110),
      with_(frontSit({ bob: 0, ear: 1 }), 120),
      with_(frontSit({ bob: 1, ear: -1, open: true }), 110),
      with_(frontSit({ bob: 0, ear: 1 }), 120),
      with_(frontSit({ bob: 0 }), 200),
    ],
  },
  {
    name: 'yawn',
    frames: [
      with_(frontSit({ eyes: 'closed', dy: -1, bob: 1 }), 180),
      with_(frontSit({ eyes: 'closed', dy: -1, bob: 1, open: true, ear: 1 }), 260),
      with_(frontSit({ eyes: 'closed', dy: -1, bob: 1, open: true }), 520),
      with_(frontSit({ eyes: 'closed', dy: 0, bob: 0, ear: -1 }), 160),
      with_(frontSit({ eyes: 'closed' }), 220),
      with_(frontSit({ eyes: 'open' }), 200),
    ],
  },
  {
    name: 'ear_twitch',
    frames: [
      with_(frontSit({ ear: 0, earR: -1 }), 70),
      with_(frontSit({ ear: 0, earR: -2 }), 70),
      with_(frontSit({ ear: 0, earR: 0 }), 90),
      with_(frontSit({ ear: 0, earR: -1 }), 70),
      with_(frontSit({}), 160),
    ],
  },

  // ---- handshake (front, sitting) ---------------------------------------------------------
  {
    name: 'paw_offer',
    frames: [
      with_(frontSit({ pawUp: 0.35, ear: 1 }), 90),
      with_(frontSit({ pawUp: 0.75, earR: -1 }), 90),
      with_(frontSit({ pawUp: 1, ear: -1, open: true }), 120),
      with_(frontSit({ pawUp: 1, open: true }), 140),
    ],
  },
  {
    // holding the paw out, waiting for you to take it
    name: 'paw_wait', loop: true,
    frames: [1, 0.5, -0.5, -1, -1, -0.5, 0.5, 1].map((side, i) => with_(frontSit({
      pawUp: 1, pawDy: i % 4 < 2 ? 0 : -1, side, open: true, bob: i % 4 < 2 ? 0 : 1, ear: i % 4 === 2 ? 1 : 0,
    }), 150)),
  },
  {
    name: 'shake',
    frames: [
      // your hand slides in from the side (outside the dog)…
      with_(frontSit({ pawUp: 1, open: true, hand: { dx: 8, dy: 1 } }), 80),
      with_(frontSit({ pawUp: 1, open: true, hand: { dx: 5, dy: 0 } }), 70),
      with_(frontSit({ pawUp: 1, open: true, hand: { dx: 2, dy: 0 } }), 70),
      with_(frontSit({ pawUp: 1, eyes: 'happy', hand: { dx: 0, dy: 0 } }), 140), // …and takes his paw
      ...[0, 1, 2].flatMap(() => [
        with_(frontSit({ pawUp: 1, pawDy: -1, bob: 1, eyes: 'happy', open: true, side: 0.6, ear: -1, hand: { dx: 0, dy: -1 } }), 110),
        with_(frontSit({ pawUp: 1, pawDy: 1, bob: 0, eyes: 'happy', open: true, side: -0.6, ear: 1, hand: { dx: 0, dy: 1 } }), 110),
      ]),
      with_(frontSit({ pawUp: 1, eyes: 'happy', open: true, hand: { dx: 0, dy: 0 } }), 160),
      with_(frontSit({ pawUp: 1, open: true, hand: { dx: 3, dy: 0 } }), 70),  // lets go, and the hand slides away
      with_(frontSit({ pawUp: 0.8, open: true, hand: { dx: 7, dy: 1 } }), 70),
      with_(frontSit({ pawUp: 0.4, open: true }), 90),
      with_(frontSit({ eyes: 'happy', open: true }), 200),
    ],
  },
  {
    // nobody took it: paw goes back down, a little head tilt
    name: 'paw_down',
    frames: [
      with_(frontSit({ pawUp: 1, dx: 1, ear: 1, earR: -1 }), 260),
      with_(frontSit({ pawUp: 0.6, dx: 1 }), 90),
      with_(frontSit({ pawUp: 0.25 }), 90),
      with_(frontSit({}), 180),
    ],
  },

  // ---- breed tricks ------------------------------------------------------------------------
  {
    // Golden: rolls over to the right, flops on his back, then trots back to his spot.
    name: 'roll', hits: [7], shift: 9,
    frames: [
      with_(sideStand({ a: 30 }), 100),
      with_(sideStand({ bob: -1, a: 25, ear: 1 }), 80),
      with_(sideLie({ eyes: 'open', dy: -1 }), 90),
      with_(ball(0, 2), 70),
      with_(ball(1, 4), 70),
      with_(ball(2, 6), 70),
      with_(ball(3, 8), 70),
      with_(sideBack({ lift: 0, kick: -1 }), 110, { shift: 9 }), // flop! (dust + "Oof!")
      with_(sideBack({ lift: 2, kick: 1 }), 80, { shift: 9 }),   // little bounce
      with_(sideBack({ kick: -1, sway: 1 }), 100, { shift: 9 }),
      with_(sideBack({ kick: 1, sway: -1 }), 100, { shift: 9 }),
      with_(sideBack({ kick: -1, sway: 1 }), 100, { shift: 9 }),
      with_(sideBack({ kick: 0 }), 380, { shift: 9 }),           // dazed, tongue out
      with_(sideLie({ eyes: 'open', dy: -1 }), 110, { shift: 9 }),
      with_(sideStand({ a: 40, ear: -1 }), 130, { shift: 9 }),
      ...[0, 1, 2, 3].map((i) => ({ ...walkFrame(i + 1, 6), flip: true, shift: 7 - i * 2, ms: 85 })),
      with_(sideStand({ a: 35 }), 120),
    ],
  },
  {
    // Lab: alert little "grr" showing his teeth, then a big grin and a head tilt.
    name: 'grin', hits: [7],
    frames: [
      with_(frontSit({ ear: -1 }), 140),
      with_(frontSit({ teeth: true, ear: -1 }), 200),
      with_(frontSit({ teeth: true, ear: -1, dx: 1 }), 80),
      with_(frontSit({ teeth: true, ear: -1 }), 80),
      with_(frontSit({ teeth: true, ear: -1, dx: 1 }), 80),
      with_(frontSit({ teeth: true, ear: -1 }), 320),
      with_(frontSit({}), 120),
      with_(frontSit({ eyes: 'happy', open: true }), 260), // "Just kidding!"
      with_(frontSit({ eyes: 'happy', open: true, dx: 1, ear: 1, earR: -2 }), 650),
      with_(frontSit({ eyes: 'happy', open: true }), 200),
      with_(frontSit({}), 160),
    ],
  },
  {
    // Bernese: flops onto his back, belly up, and lazily paddles his paws.
    name: 'belly_up',
    frames: [
      with_(sideLie({ eyes: 'open' }), 160),
      with_(sideBack({ lift: 1, eyes: 'open' }), 90),
      with_(sideBack({ kick: 0 }), 220),
      ...[1, 0, -1, 0, 1, 0, -1, 0].map((k, i) => with_(sideBack({ kick: k, sway: i % 2 ? 0.6 : -0.6 }), 260)),
      with_(sideBack({ kick: 2 }), 320), // big lazy stretch
      with_(sideBack({ kick: 0 }), 200),
      with_(sideLie({ eyes: 'open' }), 160),
    ],
  },

  // ---- side, sitting / standing --------------------------------------------------------
  { name: 'sit_side', loop: true, frames: BREATH.map((b, i) => with_(sideSit({ bob: b, ear: BREATH_EAR[i], sway: i >= 3 && i <= 5 ? 0.5 : 0 }), 210)) },
  {
    name: 'stand', loop: true, // tail carried up in a plume
    frames: rep(8, (i) => with_(sideStand({ bob: BREATH[i], ear: BREATH_EAR[i], a: 26 + Math.sin((i / 8) * TAU) * 14, sway: Math.sin((i / 8) * TAU) * 0.5 }), 170)),
  },
  { name: 'walk', loop: true, frames: rep(6, (i) => with_(walkFrame(i, 6), 95)) },
  {
    name: 'walk_front', loop: true,
    frames: [1, 0, -1, 0].map((s, i) => with_({ view: 'front', pose: { body: 'stand', step: s, bob: s === 0 ? 1 : 0, ear: { dy: s === 0 ? -1 : 0 }, tail: { side: [0.8, 0.2, -0.8, -0.2][i] }, head: { open: true } } }, 120)),
  },
  {
    name: 'walk_back', loop: true,
    frames: [1, 0, -1, 0].map((s, i) => with_({ view: 'back', pose: { body: 'stand', step: s, bob: s === 0 ? 1 : 0, ear: { dy: s === 0 ? -1 : 0 }, tail: { side: [0.8, 0.2, -0.8, -0.2][i] } } }, 120)),
  },
  {
    name: 'boop_paw', hits: [3, 5],
    frames: [
      with_(sideSit({}), 120),
      with_(sideSit({ raise: 0.45, ear: 1 }), 80),
      with_(sideSit({ raise: 1, ear: 0, dy: -1 }), 150),
      with_(sideSit({ raise: 0.62, eyes: 'closed', dx: 1 }), 110),
      with_(sideSit({ raise: 1, dy: -1 }), 140),
      with_(sideSit({ raise: 0.62, eyes: 'closed', dx: 1 }), 110),
      with_(sideSit({ raise: 1, eyes: 'happy', open: true }), 200),
      with_(sideSit({ raise: 0.3, eyes: 'happy', open: true }), 90),
      with_(sideSit({ eyes: 'happy', open: true }), 160),
    ],
  },
  {
    name: 'boop_nose', hits: [3, 6],
    frames: [
      with_(sideStand({}), 110),
      with_(sideStand({ dx: 1, a: 30 }), 80),
      with_(sideStand({ dx: 2, dy: 1, a: 40, pitch: 4 }), 90),
      with_(sideStand({ dx: 3, dy: 1, a: 45, pitch: 6, eyes: 'closed' }), 150),
      with_(sideStand({ dx: 1, a: 30 }), 90),
      with_(sideStand({ dx: 2, dy: 1, a: 40, pitch: 4 }), 80),
      with_(sideStand({ dx: 3, dy: 1, a: 45, pitch: 6, eyes: 'closed' }), 150),
      with_(sideStand({ dx: 0, a: 50, eyes: 'happy', open: true }), 240),
    ],
  },
  {
    name: 'bow',
    frames: [
      with_(sideStand({ a: 30 }), 110),
      with_(sideStand({ body: 'bow', pitch: 8, a: 45, legs: { nf: { a: 25 }, ff: { a: 25 } }, ear: 1 }), 100),
      ...rep(6, (i) => with_(sideStand({ body: 'bow', pitch: 16, a: 50 + (i % 2) * 15, sway: i % 2 ? 0.8 : -0.8, legs: { nf: { a: 50 }, ff: { a: 50 } }, open: true, eyes: i === 3 ? 'happy' : 'open', bob: i % 2 }), 120)),
      with_(sideStand({ body: 'bow', pitch: 8, a: 45, legs: { nf: { a: 25 }, ff: { a: 25 } } }), 100),
      with_(sideStand({ a: 35, ear: -1 }), 160),
    ],
  },
  {
    name: 'hop',
    frames: [
      with_(sideStand({ bob: -1, a: 30, ear: 1 }), 120),
      with_(sideStand({ lift: 3, a: 40, legs: { nf: { a: 30, tuck: 0.4 }, ff: { a: 25, tuck: 0.5 }, nh: { a: -35, tuck: 0.1 }, fh: { a: -30, tuck: 0.2 } }, ear: 2, open: true }), 70),
      with_(sideStand({ body: 'air', lift: 7, a: 45, legs: { nf: { a: 55, tuck: 0.8 }, ff: { a: 45, tuck: 0.9 }, nh: { a: -40, tuck: 0.35 }, fh: { a: -30, tuck: 0.45 } }, ear: 1, open: true, eyes: 'happy' }), 110),
      with_(sideStand({ body: 'air', lift: 7, a: 40, legs: { nf: { a: 45, tuck: 0.7 }, ff: { a: 35, tuck: 0.8 }, nh: { a: -30, tuck: 0.4 }, fh: { a: -20, tuck: 0.5 } }, ear: -1, open: true, eyes: 'happy' }), 110),
      with_(sideStand({ lift: 3, a: 30, legs: { nf: { a: 15, tuck: 0.2 }, ff: { a: 10, tuck: 0.3 }, nh: { a: -15, tuck: 0.3 }, fh: { a: -10, tuck: 0.4 } }, ear: -2, open: true }), 70),
      with_(sideStand({ bob: -1, a: 25, ear: 1 }), 100),
      with_(sideStand({ a: 30 }), 120),
    ],
  },
  {
    name: 'spin',
    // Turns on the spot through every direction, stepping its feet (two full turns).
    frames: ['R', 'F', 'F', 'L', 'L', 'B', 'B', 'R', 'R', 'F', 'F', 'L', 'L', 'B', 'B', 'R'].map((d, i) => {
      const fr = facing(d, i % 2 ? 1 : -1, { lift: i % 4 === 1 ? 1 : 0 });
      return { ...fr, ms: i === 15 ? 140 : 70 };
    }),
  },
  {
    name: 'sniff',
    frames: [
      with_(sideStand({ dx: 1, dy: 2, a: 20, pitch: 4 }), 160),
      ...rep(6, (i) => with_(sideStand({ dx: 2 + (i % 2), dy: 4, a: 25 + (i % 3) * 8, pitch: 8, ear: i % 2 }), 130)),
      with_(sideStand({ dx: 1, dy: 2, a: 30, pitch: 4 }), 140),
      with_(sideStand({ a: 35 }), 160),
    ],
  },
  {
    name: 'scratch',
    frames: [
      with_(sideSit({}), 120),
      with_(sideSit({ scratch: 1, dy: 1, eyes: 'closed' }), 90),
      ...rep(8, (i) => with_(sideSit({ scratch: 2 + (i % 2), dy: 1, eyes: 'closed', open: i > 3, ear: i % 2 }), 65)),
      with_(sideSit({ scratch: 1, dy: 1, eyes: 'closed' }), 90),
      with_(sideSit({ eyes: 'happy' }), 200),
    ],
  },

  // ---- lying / sleeping ---------------------------------------------------------------
  {
    name: 'lie_down',
    frames: [
      with_(sideSit({ bob: -1 }), 140),
      with_(sideLie({ eyes: 'open', dy: -2 }), 160),
      with_(sideLie({ eyes: 'open', dy: -1 }), 220),
      with_(sideLie({ eyes: 'closed', dy: 0 }), 200),
    ],
  },
  {
    name: 'sleep', loop: true,
    frames: [0, 0.5, 1, 1, 0.5, 0].map((b) => with_(sideLie({ breath: b }), 420)),
  },
  {
    name: 'sleep_twitch',
    frames: [
      with_(sideLie({ ear: -1 }), 90),
      with_(sideLie({ ear: 0 }), 120),
      with_(sideLie({ ear: -1, sway: 1 }), 90),
      with_(sideLie({ sway: 1 }), 160),
      with_(sideLie({}), 200),
    ],
  },
  {
    name: 'wake',
    frames: [
      with_(sideLie({ eyes: 'open' }), 260),
      with_(sideLie({ eyes: 'open', dy: -2, ear: 1 }), 220),
      with_(sideStand({ body: 'bow', pitch: 14, a: 20, legs: { nf: { a: 50 }, ff: { a: 50 } }, eyes: 'closed', open: true }), 520),
      with_(sideStand({ body: 'bow', pitch: 8, a: 30, legs: { nf: { a: 25 }, ff: { a: 25 } }, eyes: 'closed' }), 140),
      with_(sideStand({ a: 40, ear: -1 }), 160),
      with_(sideStand({ a: 30 }), 160),
    ],
  },

  // ---- being carried / dropped ----------------------------------------------------------
  {
    name: 'held', loop: true,
    frames: [0, 1, 0, -1].map((k, i) => with_({ view: 'front', pose: { body: 'held', kick: k, ear: { dy: -1, dyR: i % 2 ? -2 : -1 }, tail: { side: [0.5, 0, -0.5, 0][i] }, head: { open: true } } }, 140)),
  },
  {
    name: 'land',
    frames: [
      with_({ view: 'front', pose: { body: 'stand', bob: -1, ear: { dy: 1 }, tail: { side: 0.6 }, head: { open: true } } }, 90),
      with_({ view: 'front', pose: { body: 'stand', bob: 0, ear: { dy: -1 }, tail: { side: -0.6 }, head: { open: true, eyes: 'happy' } } }, 120),
      with_({ view: 'front', pose: { body: 'stand', bob: 0, tail: { side: 0.6 }, head: { eyes: 'happy' } } }, 140),
    ],
  },
  { name: 'stand_front', frames: [with_({ view: 'front', pose: { body: 'stand', tail: { side: 0.6 } } }, 160)] },
];
