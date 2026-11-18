/* Dog Buddy: dog art.
   Each breed is built as a small SVG "rig": separate parts for the legs, tail,
   body, head and face, so we can pose and animate it without drawing every
   frame by hand. The Bernese uses its own fluffier, bulkier shapes and is drawn
   bigger. Everything is built with createElementNS (never innerHTML), so it
   also works on sites with strict security rules, like YouTube. */
globalThis.DogArt = (() => {
  const NS = 'http://www.w3.org/2000/svg';
  const r1 = (n) => Math.round(n * 10) / 10;

  const BREEDS = {
    golden: { label: 'Golden Retriever', short: 'Golden', size: 104 },
    bernese: { label: 'Bernese Mountain Dog', short: 'Bernese', size: 138 },
    lab: { label: 'Labrador', short: 'Lab', size: 104 },
  };
  const LAB_COATS = { yellow: 'Yellow', black: 'Black', chocolate: 'Chocolate' };

  const PAL = {
    golden: {
      coat: '#EDAA52', shade: '#C88736', light: '#F8DDAA', ear: '#D98F3D', line: '#7B4A1C',
      nose: '#3A2416', eye: '#2B190E', eyeLine: '#5A3416', mouthLine: '#6A3A1A',
    },
    bernese: {
      coat: '#2A2525', shade: '#1A1616', light: '#FBF6EE', lightShade: '#DCD4C8',
      rust: '#BC6A2E', rustShade: '#93511F', ear: '#121010', line: '#0C0A0A',
      nose: '#161212', eye: '#6B4224', eyeLine: '#8C7F76', mouthLine: '#3A2E2A',
    },
    'lab-yellow': {
      coat: '#F0D196', shade: '#D5B274', light: '#FAE8C6', ear: '#E1BC7C', line: '#8C6936',
      nose: '#4B3022', eye: '#2B190E', eyeLine: '#5A3E22', mouthLine: '#6A4A2A',
    },
    'lab-black': {
      coat: '#302B2C', shade: '#1D1A1B', light: '#4A4344', ear: '#272223', line: '#0D0B0B',
      nose: '#0E0B0B', eye: '#6E4728', eyeLine: '#8E8480', mouthLine: '#141011',
    },
    'lab-chocolate': {
      coat: '#7E4C2E', shade: '#5C3520', light: '#9A6745', ear: '#6B3F25', line: '#3A1F10',
      nose: '#3E2215', eye: '#26150B', eyeLine: '#2E1A0E', mouthLine: '#3A2014',
    },
  };

  // Ear outlines (left ear; the right one is mirrored around the head's centre).
  const EARS = {
    golden: 'M97 25 C90 23 83 28 81 36 C79 44 80 52 83 58 Q85 56 86.5 59 Q88.5 56 90.5 58.5 Q91.5 55 93.5 54.5 C95 46 96.5 36 100 30 Z',
    lab: 'M97 25 C90 23 84 28 83 35 C82 42 84 48 88 50 C92 51 94 46 95 40 C96 35 98 31 101 29 Z',
    bernese: 'M98 25 C92 23 86 26 84 31 C82 37 84 44 89 49 C92 44 96 36 101 29 Z',
  };

  const HEART = 'M0 -1.5 C0 -5 -5.5 -5.5 -5.5 -1.5 C-5.5 1.5 -2 3.5 0 5.5 C2 3.5 5.5 1.5 5.5 -1.5 C5.5 -5.5 0 -5 0 -1.5Z';

  // Where things are on the sitting dog (facing right), in viewBox units.
  const ANCHORS = { pawTip: [127, 81], noseTip: [121, 48] };
  // When the X gets hit during each boop animation (ms from start).
  const TRICK_HITS = { boopPaw: [360, 720], boopNose: [300, 750] };

  function el(tag, attrs = {}, kids = []) {
    const node = document.createElementNS(NS, tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v !== undefined && v !== null) node.setAttribute(k, String(v));
    }
    for (const kid of kids) if (kid) node.appendChild(kid);
    return node;
  }

  // A scalloped "cloud" ellipse, used for fluffy fur.
  function fluffyPath(cx, cy, rx, ry, n, amp) {
    const pt = (a, ex) => [r1(cx + (rx + ex) * Math.cos(a)), r1(cy + (ry + ex) * Math.sin(a))];
    let d = '';
    for (let i = 0; i <= n; i++) {
      const p = pt((i / n) * Math.PI * 2, 0);
      if (i === 0) { d += `M${p[0]} ${p[1]}`; continue; }
      const c = pt(((i - 0.5) / n) * Math.PI * 2, amp * 2);
      d += `Q${c[0]} ${c[1]} ${p[0]} ${p[1]}`;
    }
    return `${d}Z`;
  }

  function build(breedId, coat) {
    const style = BREEDS[breedId] ? breedId : 'golden';
    const P = PAL[style === 'lab' ? `lab-${LAB_COATS[coat] ? coat : 'yellow'}` : style];
    const berner = style === 'bernese';
    const golden = style === 'golden';
    const O = { stroke: P.line, 'stroke-width': 1.4, 'stroke-linejoin': 'round' };
    const lw = berner ? 13 : 11; // leg width

    const blob = (cx, cy, rx, ry, fill, { fluff = 0, n = 12, outline = true, rot = 0, cls } = {}) => {
      const a = { fill, class: cls };
      if (outline) Object.assign(a, O);
      if (rot) a.transform = `rotate(${rot} ${cx} ${cy})`;
      if (fluff) return el('path', { d: fluffyPath(cx, cy, rx, ry, n, fluff), ...a });
      return el('ellipse', { cx, cy, rx, ry, ...a });
    };
    const bodyFluff = berner ? 1.7 : golden ? 0.7 : 0;

    function leg(cls, cx, top, bottom, far) {
      const w = lw;
      const fill = far ? P.shade : P.coat;
      const g = el('g', { class: `leg ${cls}` }, [
        el('rect', { x: r1(cx - w / 2), y: top, width: w, height: bottom - top, rx: w / 2, fill, ...O }),
      ]);
      if (berner) {
        g.append(
          el('rect', { x: r1(cx - w / 2 + 0.8), y: bottom - 14, width: w - 1.6, height: 12, fill: far ? P.rustShade : P.rust }),
          el('ellipse', { cx: cx + 1.5, cy: bottom - 1.8, rx: w / 2 + 1.6, ry: 3.8, fill: far ? P.lightShade : P.light, ...O }),
        );
      } else {
        g.append(el('ellipse', { cx: cx + 1.5, cy: bottom - 1.8, rx: w / 2 + 1.4, ry: 3.6, fill, ...O }));
      }
      return g;
    }

    function hindPaw(cx, cy) {
      if (berner) {
        return el('g', {}, [
          blob(cx - 5, cy - 1.5, 6.5, 4.5, P.rust),
          blob(cx + 2, cy, 8, 3.8, P.light),
        ]);
      }
      return blob(cx, cy, 8.5, 3.8, P.coat);
    }

    function frontPaw(cx, cy, far) {
      if (berner) {
        return el('g', {}, [
          blob(cx - 4, cy - 0.5, 8.5, 4.6, far ? P.rustShade : P.rust),
          blob(cx + 4, cy, 6.5, 4.1, far ? P.lightShade : P.light),
        ]);
      }
      return blob(cx, cy, 10, 4.2, far ? P.shade : P.coat);
    }

    function chest(cx, cy) {
      if (golden) return blob(cx, cy, 10, 13, P.light, { fluff: 1.2, n: 9, outline: false });
      if (berner) {
        return el('g', {}, [
          blob(cx - 7, cy + 9, 7, 6, P.rust, { outline: false }),
          blob(cx, cy, 11, 14, P.light, { fluff: 1.4, n: 10, outline: false }),
        ]);
      }
      return blob(cx, cy, 9, 12, P.light, { outline: false });
    }

    // Tail running from `base` (inside the body) to `tip`, thickness t.
    function tail(cls, base, tip, t) {
      const [bx, by] = base;
      const [tx, ty] = tip;
      const len = r1(Math.hypot(bx - tx, by - ty));
      const ang = r1((Math.atan2(by - ty, bx - tx) * 180) / Math.PI);
      const g = el('g', { transform: `translate(${tx} ${ty}) rotate(${ang})` });
      const taper = (T) =>
        `M${len} ${r1(-T / 2)} C${r1(len * 0.55)} ${r1(-T * 0.5)} ${r1(len * 0.22)} ${r1(-T * 0.34)} ${r1(T * 0.22)} ${r1(-T * 0.2)}` +
        ` Q${r1(-T * 0.18)} 0 ${r1(T * 0.22)} ${r1(T * 0.2)}` +
        ` C${r1(len * 0.22)} ${r1(T * 0.34)} ${r1(len * 0.55)} ${r1(T * 0.5)} ${len} ${r1(T / 2)}Z`;
      if (style === 'lab') {
        // Thick "otter" tail.
        g.append(el('path', { d: taper(t), fill: P.coat, ...O }));
      } else if (golden) {
        // Feathered plume: fringe underneath, tail on top.
        g.append(blob(r1(len * 0.52), r1(t * 0.38), r1(len * 0.44), r1(t * 0.62), P.coat, { fluff: 1.3, n: 10 }));
        g.append(el('path', { d: taper(t * 0.8), fill: P.coat, ...O }));
      } else {
        // Big bushy tail with a white tip.
        g.append(blob(r1(len * 0.52), 0, r1(len * 0.5), r1(t * 0.5), P.coat, { fluff: 1.6, n: 12 }));
        g.append(blob(r1(len * 0.13), 0, r1(len * 0.14), r1(t * 0.36), P.light, { fluff: 1.1, n: 7, outline: false }));
      }
      return el('g', { class: `tail ${cls}` }, [g]);
    }

    // ---- Poses -------------------------------------------------------------
    const stand = el('g', { class: 'pose p-stand' }, [
      tail('tail-stand', [47, 66], [14, 38], berner ? 13 : 9),
      leg('leg-fb', 58, 82, 110, true),
      leg('leg-ff', 99, 82, 110, true),
      leg('leg-nb', 46, 84, 110),
      leg('leg-nf', 88, 82, 110),
      golden ? blob(70, 86, 25, 6.5, P.coat, { fluff: 1.2, n: 12 }) : null, // belly feathering
      blob(72, 73, berner ? 35 : 33, berner ? 21 : 19, P.coat, { fluff: bodyFluff, n: berner ? 16 : 18, cls: 'torso' }),
      berner ? blob(92, 86, 7, 6, P.rust, { outline: false }) : null,
      blob(50, 80, berner ? 16 : 14, berner ? 15 : 14, P.coat, { fluff: berner ? 1.4 : 0, n: 10 }), // haunch
      chest(100, 76),
    ]);

    const sit = el('g', { class: 'pose p-sit' }, [
      tail('tail-sit', [78, 103], [40, 107], berner ? 12 : 8.5),
      leg('leg-sff', 109, 82, 110, true),
      blob(91, 82, berner ? 21 : 19, berner ? 26 : 24, P.coat, { fluff: bodyFluff, n: 16, rot: -16, cls: 'torso' }),
      blob(79, 96, berner ? 17 : 15, berner ? 14.5 : 13, P.coat, { fluff: berner ? 1.4 : 0, n: 10, rot: -8 }), // haunch
      hindPaw(85, 109.5),
      chest(103, 76),
      el('g', { class: 'paw' }, [leg('leg-snf', 100, 80, 110)]),
    ]);

    const lie = el('g', { class: 'pose p-lie' }, [
      tail('tail-lie', [46, 101], [10, 105], berner ? 12 : 8.5),
      blob(80, 98, berner ? 38 : 36, berner ? 14.5 : 13, P.coat, { fluff: bodyFluff, n: 18, cls: 'torso' }),
      blob(55, 96, berner ? 17 : 15, berner ? 14.5 : 13, P.coat, { fluff: berner ? 1.4 : 0, n: 10 }), // haunch
      hindPaw(70, 109.5),
    ]);
    // Front paws while lying go in front of the head (chin resting on them).
    const lieFront = el('g', { class: 'pose p-lie-front' }, [frontPaw(125, 108.5, true), frontPaw(116, 110.2, false)]);

    // ---- Head --------------------------------------------------------------
    const H = [];
    if (berner) H.push(blob(112, 46, 29, 25, P.coat, { fluff: 1.6, n: 18 })); // fluffy ruff
    H.push(blob(112, 44, style === 'lab' ? 26 : 25, style === 'lab' ? 21.5 : 22, P.coat));
    if (berner) {
      H.push(
        blob(98.5, 54, 6, 5.5, P.rust, { outline: false }),
        blob(125.5, 54, 6, 5.5, P.rust, { outline: false }),
        el('path', { d: 'M110 23.4 Q112 22.2 114 23.4 C114.6 30 116.6 38 117.6 47 L106.4 47 C107.4 38 109.4 30 110 23.4Z', fill: P.light }),
        blob(101.5, 34.2, 3.3, 2.3, P.rust, { outline: false }),
        blob(122.5, 34.2, 3.3, 2.3, P.rust, { outline: false }),
      );
    }
    H.push(blob(112, 54, style === 'lab' ? 13.5 : 12.5, style === 'lab' ? 9.6 : 9.2, P.light, { outline: false })); // muzzle
    const earD = EARS[style];
    H.push(el('path', { d: earD, fill: P.ear, ...O, class: 'ear ear-l' }));
    H.push(el('g', { transform: 'translate(224 0) scale(-1 1)' }, [el('path', { d: earD, fill: P.ear, ...O, class: 'ear ear-r' })]));

    const eye = (cx) => [
      el('circle', { cx, cy: 41, r: 4.1, fill: P.eye }),
      el('circle', { cx: cx - 1.4, cy: 39.4, r: 1.45, fill: '#fff' }),
      el('circle', { cx: cx + 1.5, cy: 42.6, r: 0.65, fill: '#fff' }),
    ];
    const lid = (d) => el('path', { d, fill: 'none', stroke: P.eyeLine, 'stroke-width': 1.7, 'stroke-linecap': 'round' });
    H.push(
      el('g', { class: 'eyes-open' }, [...eye(102), ...eye(122)]),
      el('g', { class: 'eyes-closed' }, [lid('M97.6 41.5 Q102 45.4 106.4 41.5'), lid('M117.6 41.5 Q122 45.4 126.4 41.5')]),
      el('g', { class: 'eyes-happy' }, [lid('M97.6 43 Q102 37.6 106.4 43'), lid('M117.6 43 Q122 37.6 126.4 43')]),
      el('g', { class: 'blush' }, [
        blob(95.5, 51, 4.3, 2.4, '#FF8FA3', { outline: false }),
        blob(128.5, 51, 4.3, 2.4, '#FF8FA3', { outline: false }),
      ]),
      el('path', { d: 'M106.4 48 Q112 44.6 117.6 48 Q117 52.6 112 53.1 Q107 52.6 106.4 48Z', fill: P.nose }),
      el('ellipse', { cx: 110.2, cy: 47.4, rx: 1.8, ry: 0.85, fill: '#fff', opacity: 0.45 }),
    );
    const ml = { fill: 'none', stroke: P.mouthLine, 'stroke-width': 1.4, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' };
    H.push(
      el('path', { class: 'mouth-normal', d: 'M112 53.1 V55.6 M107 55.4 Q109.5 58.6 112 55.6 Q114.5 58.6 117 55.4', ...ml }),
      el('g', { class: 'mouth-open' }, [
        el('path', { d: 'M106.6 55.4 Q112 68 117.4 55.4 Q112 57.8 106.6 55.4Z', fill: '#6E2A2E' }),
        el('ellipse', { cx: 112, cy: 60.6, rx: 3.3, ry: 2.3, fill: '#F27E92' }),
        el('path', { d: 'M112 53.1 V55.8', ...ml }),
      ]),
    );
    const head = el('g', { class: 'head' }, [el('g', { class: 'head-anim' }, H)]);

    // ---- Effects (outside the flip so text never mirrors) -------------------
    const zzz = el('g', { class: 'zzz' }, [1, 2, 3].map((i) =>
      el('text', {
        class: `z z${i}`, x: 136, y: 74, 'font-size': 8 + i * 2, 'font-weight': 800,
        'font-family': 'ui-rounded, system-ui, sans-serif', fill: '#7D93D6',
        stroke: '#fff', 'stroke-width': 2.2, 'paint-order': 'stroke',
      }, [document.createTextNode('z')])));

    const shadow = el('ellipse', { class: 'shadow', cx: 80, cy: 112, rx: 44, ry: 4.2, fill: '#000', opacity: 0.13 });
    const whole = el('g', { class: 'whole' }, [stand, sit, lie, head, lieFront]);
    return el('svg', {
      viewBox: '0 0 160 120', class: `dog-svg breed-${style}`, overflow: 'visible',
      'data-pose': 'sit', 'data-face': 'normal', 'data-wag': 'normal',
    }, [el('g', { class: 'flip' }, [shadow, whole]), el('g', { class: 'fx' }, [zzz])]);
  }

  const CSS = `
.dog-svg { overflow: visible; display: block; }
.dog-svg .pose { display: none; }
.dog-svg[data-pose="stand"] .p-stand,
.dog-svg[data-pose="sit"] .p-sit,
.dog-svg[data-pose="lie"] .p-lie,
.dog-svg[data-pose="lie"] .p-lie-front { display: inline; }

.dog-svg .flip { transform-origin: 80px 0; transition: transform .25s ease; }
.dog-svg.face-left .flip { transform: scaleX(-1); }
.dog-svg .whole { transform-origin: 80px 112px; }
.dog-svg .shadow { transform-origin: 80px 112px; transition: transform .35s ease; }
.dog-svg[data-pose="lie"] .shadow { transform: scaleX(1.18); }

.dog-svg .head { transform-origin: 110px 62px; transition: transform .35s cubic-bezier(.3,1.4,.5,1); }
.dog-svg[data-pose="sit"] .head { transform: translate(-3px, -1px); }
.dog-svg[data-pose="lie"] .head { transform: translate(6px, 38px) rotate(-5deg); }
.dog-svg .head-anim { transform-origin: 110px 62px; }

.dog-svg .eyes-closed, .dog-svg .eyes-happy, .dog-svg .mouth-open { display: none; }
.dog-svg[data-face="happy"] .eyes-open, .dog-svg[data-face="sleep"] .eyes-open { display: none; }
.dog-svg[data-face="happy"] .eyes-happy, .dog-svg[data-face="sleep"] .eyes-closed { display: inline; }
.dog-svg[data-face="happy"] .mouth-open, .dog-svg[data-face="pant"] .mouth-open { display: inline; }
.dog-svg[data-face="happy"] .mouth-normal, .dog-svg[data-face="pant"] .mouth-normal { display: none; }
.dog-svg .blush { opacity: .5; transition: opacity .3s; }
.dog-svg[data-face="happy"] .blush { opacity: .95; }

.dog-svg .eyes-open { transform-origin: 112px 41px; animation: dog-blink 5s infinite; }
@keyframes dog-blink { 0%, 93%, 100% { transform: scaleY(1); } 95% { transform: scaleY(.1); } }

.dog-svg .tail { animation: dog-wag .55s ease-in-out infinite alternate; }
.dog-svg .tail-stand { transform-origin: 47px 66px; }
.dog-svg .tail-sit { transform-origin: 78px 104px; }
.dog-svg .tail-lie { transform-origin: 46px 102px; }
.dog-svg[data-wag="fast"] .tail { animation-duration: .16s; }
.dog-svg[data-wag="slow"] .tail { animation-duration: 1.2s; }
.dog-svg[data-wag="none"] .tail { animation: none; }
@keyframes dog-wag { from { transform: rotate(-9deg); } to { transform: rotate(11deg); } }

.dog-svg .leg-nb { transform-origin: 46px 86px; }
.dog-svg .leg-fb { transform-origin: 58px 86px; }
.dog-svg .leg-nf { transform-origin: 88px 84px; }
.dog-svg .leg-ff { transform-origin: 99px 84px; }
.dog-svg.walking .leg-nf, .dog-svg.walking .leg-fb { animation: dog-step .34s ease-in-out infinite alternate; }
.dog-svg.walking .leg-nb, .dog-svg.walking .leg-ff { animation: dog-step .34s ease-in-out infinite alternate-reverse; }
@keyframes dog-step { from { transform: rotate(-22deg); } to { transform: rotate(22deg); } }
.dog-svg.walking .whole { animation: dog-waddle .34s ease-in-out infinite alternate; }
@keyframes dog-waddle {
  0% { transform: translateY(0) rotate(-2.5deg); }
  50% { transform: translateY(-2.5px) rotate(0deg); }
  100% { transform: translateY(0) rotate(2.5deg); }
}
.dog-svg.walking .head-anim { animation: dog-headbob .34s ease-in-out infinite alternate; }
@keyframes dog-headbob { from { transform: translateY(0) rotate(-2deg); } to { transform: translateY(1.5px) rotate(2deg); } }

.dog-svg .paw { transform-origin: 100px 84px; }

.dog-svg[data-pose="lie"] .p-lie .torso { transform-origin: 80px 111px; animation: dog-breathe 3.2s ease-in-out infinite; }
@keyframes dog-breathe { 50% { transform: scaleY(1.06); } }
.dog-svg[data-face="sleep"] .head-anim { animation: dog-snooze 3.2s ease-in-out infinite; }
@keyframes dog-snooze { 50% { transform: translateY(1px) rotate(-1deg); } }
.dog-svg .zzz { display: none; }
.dog-svg[data-face="sleep"][data-pose="lie"] .zzz { display: inline; }
.dog-svg .z { opacity: 0; animation: dog-z 3.6s linear infinite; }
.dog-svg .z2 { animation-delay: 1.2s; }
.dog-svg .z3 { animation-delay: 2.4s; }
@keyframes dog-z {
  0% { transform: translate(0, 0); opacity: 0; }
  15% { opacity: 1; }
  80% { opacity: .9; }
  100% { transform: translate(14px, -26px); opacity: 0; }
}
@media (prefers-reduced-motion: reduce) {
  .dog-svg .tail, .dog-svg .z { animation-duration: 2.4s !important; }
}
`;

  function adoptCss(root, extra = '') {
    const text = CSS + extra;
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(text);
      root.adoptedStyleSheets = [...root.adoptedStyleSheets, sheet];
    } catch {
      const st = document.createElement('style');
      st.textContent = text;
      (root.head || root).appendChild(st);
    }
  }

  // Keyframes that all share one transform-origin.
  const kf = (origin, frames) => frames.map((f) => ({ ...f, transformOrigin: origin }));
  const W = '80px 112px';
  const NECK = '110px 62px';

  function create(breed, coat) {
    const id = BREEDS[breed] ? breed : 'golden';
    const svg = build(id, coat);
    const $ = (s) => svg.querySelector(s);
    const whole = $('.whole');
    const headAnim = $('.head-anim');
    const paw = $('.paw');
    const fx = $('.fx');
    const live = new Set();

    const run = (target, frames, opts) => {
      const a = target.animate(frames, { easing: 'ease-in-out', ...opts });
      live.add(a);
      a.onfinish = a.oncancel = () => live.delete(a);
      return a;
    };

    const TRICKS = {
      hop: () => run(whole, kf(W, [
        { transform: 'translateY(0) scale(1, 1)' },
        { transform: 'translateY(1px) scale(1.06, .92)', offset: 0.18 },
        { transform: 'translateY(-18px) scale(.96, 1.05)', offset: 0.5 },
        { transform: 'translateY(1px) scale(1.06, .93)', offset: 0.82 },
        { transform: 'translateY(0) scale(1, 1)' },
      ]), { duration: 700 }),
      twirl: () => run(whole, kf('84px 112px', [
        { transform: 'translateY(0) scaleX(1)' },
        { transform: 'translateY(-12px) scaleX(-1)', offset: 0.25 },
        { transform: 'translateY(0) scaleX(1)', offset: 0.5 },
        { transform: 'translateY(-12px) scaleX(-1)', offset: 0.75 },
        { transform: 'translateY(0) scaleX(1)' },
      ]), { duration: 1200 }),
      bow: () => run(whole, kf('104px 110px', [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(13deg)', offset: 0.25 },
        { transform: 'rotate(10deg)', offset: 0.45 },
        { transform: 'rotate(13deg)', offset: 0.65 },
        { transform: 'rotate(0deg)' },
      ]), { duration: 1500 }),
      wiggle: () => run(whole, kf(W, [
        { transform: 'rotate(0deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(4deg)' },
        { transform: 'rotate(-3deg)' }, { transform: 'rotate(3deg)' }, { transform: 'rotate(0deg)' },
      ]), { duration: 600 }),
      tilt: () => run(headAnim, kf(NECK, [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-11deg)', offset: 0.25 },
        { transform: 'rotate(-11deg)', offset: 0.75 },
        { transform: 'rotate(0deg)' },
      ]), { duration: 1400 }),
      boopNose: () => run(headAnim, kf(NECK, [
        { transform: 'translate(0, 0) rotate(0deg)' },
        { transform: 'translate(7px, -1px) rotate(8deg)', offset: 0.3 },
        { transform: 'translate(0, 0) rotate(0deg)', offset: 0.5 },
        { transform: 'translate(7px, -1px) rotate(8deg)', offset: 0.75 },
        { transform: 'translate(0, 0) rotate(0deg)' },
      ]), { duration: 1000 }),
      boopPaw: () => run(paw, kf('100px 84px', [
        { transform: 'rotate(0deg)' },
        { transform: 'rotate(-98deg)', offset: 0.3 },
        { transform: 'rotate(-80deg)', offset: 0.45 },
        { transform: 'rotate(-98deg)', offset: 0.6 },
        { transform: 'rotate(-80deg)', offset: 0.75 },
        { transform: 'rotate(0deg)' },
      ]), { duration: 1200 }),
    };

    function hearts() {
      const left = svg.classList.contains('face-left');
      const lying = svg.dataset.pose === 'lie';
      const hx = lying ? (left ? 42 : 118) : (left ? 50 : 110);
      const hy = lying ? 60 : 20;
      for (let i = 0; i < 3; i++) {
        const g = el('g', {}, [el('path', { d: HEART, fill: '#FF6B8A', stroke: '#fff', 'stroke-width': 1.2 })]);
        fx.appendChild(g);
        const dx = (i - 1) * 12 + (Math.random() * 4 - 2);
        const rot = (i - 1) * 14;
        const a = g.animate([
          { transform: `translate(${hx}px, ${hy}px) scale(.3)`, opacity: 0 },
          { transform: `translate(${hx + dx * 0.6}px, ${hy - 8}px) scale(1) rotate(${rot}deg)`, opacity: 1, offset: 0.3 },
          { transform: `translate(${hx + dx}px, ${hy - 26}px) scale(.9) rotate(${rot}deg)`, opacity: 0 },
        ], { duration: 1100, delay: i * 120, easing: 'ease-out', fill: 'both' });
        a.onfinish = a.oncancel = () => g.remove();
      }
    }

    const set = (k, v) => { svg.dataset[k] = v; };
    return {
      el: svg,
      breed: id,
      size: BREEDS[id].size,
      pose: (p) => set('pose', p),
      face: (f) => set('face', f),
      wag: (w) => set('wag', w),
      facing: (dir) => svg.classList.toggle('face-left', dir === 'left'),
      isFacingLeft: () => svg.classList.contains('face-left'),
      walking: (on) => svg.classList.toggle('walking', !!on),
      trick: (name) => {
        const fn = TRICKS[name];
        if (!fn) return Promise.resolve();
        return fn().finished.then(() => {}, () => {});
      },
      stopTricks: () => { for (const a of [...live]) a.cancel(); },
      hearts,
    };
  }

  return { BREEDS, LAB_COATS, ANCHORS, TRICK_HITS, CSS, adoptCss, create };
})();
