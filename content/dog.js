/* Dog Buddy: the dog that lives on every page.
   Runs as a content script. Draws the pixel-art dog (shared/sprites.js) inside a
   closed shadow root so the page's styles can't touch it, and handles dragging,
   petting, idle fidgets, tricks, naps, and the "no-scroll patrol" that walks over
   to a close button and boops short-form video tabs shut. */
(() => {
  const S = globalThis.DogSettings;
  const DS = globalThis.DogSprites;
  if (!S || !DS || window.top !== window) return;
  if (!(document.documentElement instanceof HTMLElement)) return;

  // A newer copy (e.g. after the extension reloads) replaces any older one.
  document.dispatchEvent(new CustomEvent('dogbuddy:takeover'));
  let alive = true;
  document.addEventListener('dogbuddy:takeover', () => shutdown(), { once: true });

  // Sprite sheets come from the background worker, so a site's security policy never blocks them.
  DS.setLoader(async (id) => {
    const res = await chrome.runtime.sendMessage({ type: 'dog:sprite', id });
    if (!res?.ok) throw new Error(res?.error || 'could not load sprites');
    const bin = atob(res.data);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: 'image/png' });
  });

  const SCALE = 3;
  const META = DS.META;

  // ---- Lines -------------------------------------------------------------------
  const CHEERS = [
    "You've got this!",
    '{name} believes in you!',
    "You're doing great. Proud of you!",
    'One step at a time 🐾',
    'Tiny progress is still progress!',
    'Time for a sip of water?',
    "Deep breath. You're doing amazing.",
    'Woof! Keep going!',
    "Don't forget to stretch!",
    "I'm right here with you.",
  ];
  const PET_LINES = ['Hehe!', 'Woof!', '♥', 'More pets please!', '*happy wiggle*'];
  const BARKS = ['Woof!', 'Arf!', 'Bork!', 'Woof woof!'];
  const PATROL_LINES = [
    'Hey! No more scrolling 🐾',
    "That's enough for today!",
    'Nope! Boop incoming…',
    '*wobble wobble* closing this one!',
  ];
  const WAKE_LINES = ["You're back! I missed you 🐾", "Yay, you're back!", '*big stretch* Welcome back!'];
  const OFFER_LINES = ['Shake? 🐾', 'Paw? 🐾', 'Wanna shake paws?'];
  const SHAKE_LINES = ['Nice to meet you! 🐾', 'Paw-some!', '*shake shake*', 'Best friends! 🐾'];

  const PAGE_CSS = `
:host { all: initial; }
.stage {
  position: fixed; inset: 0; pointer-events: none; color: #3b2a1a;
  font: 600 13px/1.35 ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif;
}
.dog { position: absolute; left: 0; top: 0; pointer-events: none; touch-action: none; }
.dog canvas { display: block; image-rendering: pixelated; }
.hit { position: absolute; pointer-events: auto; cursor: grab; touch-action: none; }
.dog.dragging .hit { cursor: grabbing; }
.dog.busy .hit { pointer-events: none; }
.dog.entering { animation: dog-enter .35s steps(4) both; }
@keyframes dog-enter { from { opacity: 0; translate: 0 -12px; } to { opacity: 1; translate: 0 0; } }
.fx { position: absolute; left: 0; top: 0; pointer-events: none; image-rendering: pixelated; }
.bubble {
  position: absolute; left: 0; top: 0; max-width: 220px; padding: 6px 11px;
  background: #fffaf2; border: 2px solid #3b2a1a; border-radius: 6px;
  box-shadow: 3px 3px 0 rgba(59,42,26,.22); opacity: 0; scale: .85;
  transition: opacity .15s steps(3), scale .15s steps(3); transform-origin: var(--tail-x, 50%) 100%;
}
.bubble.below { transform-origin: var(--tail-x, 50%) 0; }
.bubble.show { opacity: 1; scale: 1; }
.bubble::after {
  content: ""; position: absolute; left: var(--tail-x, 50%); width: 8px; height: 8px;
  background: #fffaf2; border: 2px solid #3b2a1a; transform: translateX(-50%) rotate(45deg);
}
.bubble.above::after { bottom: -6px; border-top: 0; border-left: 0; }
.bubble.below::after { top: -6px; border-bottom: 0; border-right: 0; }
.timer {
  position: absolute; left: 0; top: 0; padding: 2px 8px; border-radius: 4px;
  background: #3b2a1a; color: #fff6e6; font-size: 11px; font-variant-numeric: tabular-nums;
  opacity: 0; transition: opacity .2s;
}
.timer.show { opacity: .92; }
.redbtn {
  position: absolute; left: 0; top: 0; image-rendering: pixelated;
  scale: 0; transform-origin: 50% 80%; transition: scale .24s steps(4);
}
.redbtn.show { scale: 1; }
.redbtn.gone { scale: 0; transition: scale .2s steps(3); }
.pop {
  position: absolute; font-weight: 800; font-size: 16px; color: #e8556f; white-space: nowrap;
  text-shadow: 0 2px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff;
  animation: dog-pop .7s steps(7) forwards;
}
@keyframes dog-pop {
  0% { transform: translate(-50%, 0) scale(.5); opacity: 0; }
  30% { transform: translate(-50%, -10px) scale(1.15); opacity: 1; }
  100% { transform: translate(-50%, -26px) scale(1); opacity: 0; }
}
`;

  // ---- State ------------------------------------------------------------------------
  let settings = S.merge({});
  let position = S.DEFAULT_POSITION;
  let away = false;
  let scrollMs = 0;
  let scrollDay = S.todayKey();
  let scrollDirty = 0;
  let ui = null;          // { host, stage, wrap, bubble, timer }
  let dog = null;         // sprite player
  let pos = { x: 0, y: 0 };
  let rest = 'sit';       // 'sit' | 'sleep'
  let busy = false;
  let booping = false;
  let dragging = false;
  let boopCooldownUntil = 0;
  let patrolVisit = null;
  let lastTick = performance.now();
  let bubbleTimer = null;
  const timeouts = new Set();
  const intervals = new Set();

  // ---- Helpers ----------------------------------------------------------------------
  const later = (fn, ms) => {
    const t = setTimeout(() => { timeouts.delete(t); if (alive) fn(); }, ms);
    timeouts.add(t);
    return t;
  };
  const wait = (ms) => new Promise((resolve) => later(resolve, ms));
  const every = (fn, ms) => { const t = setInterval(fn, ms); intervals.add(t); return t; };
  const stopEvery = (t) => { clearInterval(t); intervals.delete(t); };
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), Math.max(lo, hi));
  const fill = (s) => s.replaceAll('{name}', settings.name || 'Your dog');
  const visibleNow = () => document.visibilityState === 'visible';
  const div = (cls) => { const d = document.createElement('div'); d.className = cls; return d; };
  const extAlive = () => { try { return !!chrome.runtime?.id; } catch { return false; } };
  const snap = (v) => { const r = globalThis.devicePixelRatio || 1; return Math.round(v * r) / r; };
  const restAnim = () => (rest === 'sleep' ? 'sleep' : 'sit');
  const feetY = () => META.ground * dog.scale;

  // ---- Building the dog ------------------------------------------------------------
  function buildUI() {
    if (ui || !alive) return;
    const host = document.createElement('dog-buddy');
    for (const [k, v] of Object.entries({
      position: 'fixed', inset: '0', 'z-index': '2147483646', 'pointer-events': 'none',
      display: 'block', margin: '0', padding: '0', border: '0', background: 'none',
    })) host.style.setProperty(k, v, 'important');
    let shadow;
    try { shadow = host.attachShadow({ mode: 'closed' }); } catch { return; }
    try {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync(PAGE_CSS);
      shadow.adoptedStyleSheets = [sheet];
    } catch {
      const st = document.createElement('style');
      st.textContent = PAGE_CSS;
      shadow.append(st);
    }
    const stage = div('stage');
    const wrap = div('dog');
    const timer = div('timer');
    const bubble = div('bubble');
    stage.append(wrap, timer, bubble);
    shadow.append(stage);
    document.documentElement.append(host);
    // The dog's clickable area: sized to the visible pixels, so the canvas margins never block the page.
    const hit = div('hit');
    hit.addEventListener('pointerdown', onPointerDown);
    hit.addEventListener('click', (e) => e.stopPropagation());
    hit.addEventListener('contextmenu', onRightClick);
    hit.addEventListener('pointerenter', onHoverEnter);
    hit.addEventListener('pointermove', onHoverMove);
    hit.addEventListener('pointerleave', onHoverLeave);
    ui = { host, stage, wrap, bubble, timer, hit };
    mountDog();
    wrap.classList.add('entering');
    later(() => ui?.wrap.classList.remove('entering'), 400);
  }

  function mountDog() {
    dog?.destroy();
    dog = DS.create(settings.breed, settings.labCoat, { scale: SCALE });
    ui.wrap.replaceChildren(dog.el, ui.hit);
    dog.onChange = layoutHit;
    busy = false;
    rest = desiredRest();
    dog.loop(restAnim());
    placeFromFraction();
    dog.ready.catch(() => {}); // a failed load just leaves the canvas empty
  }

  function teardownUI() {
    if (!ui) return;
    dog?.destroy();
    dog = null;
    ui.host.remove();
    ui = null;
    busy = false;
    booping = false;
    dragging = false;
  }

  function shutdown() {
    if (!alive) return;
    alive = false;
    timeouts.forEach(clearTimeout);
    intervals.forEach(clearInterval);
    try { chrome.storage.onChanged.removeListener(onStorage); } catch { /* extension reloaded */ }
    removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibility);
    teardownUI();
  }

  // ---- Position ----------------------------------------------------------------------
  // The canvas has empty margins around the dog; keep the dog itself on screen.
  function bounds() {
    const { w } = dog.size();
    const head = dog.headTop()?.y ?? 0;
    return { minX: -w * 0.18, maxX: innerWidth - w * 0.82, minY: 6 - head, maxY: innerHeight - feetY() - 4 };
  }

  function placeFromFraction() {
    if (!ui || !dog) return;
    const b = bounds();
    moveTo(b.minX + position.x * (b.maxX - b.minX), b.minY + position.y * (b.maxY - b.minY));
  }

  function moveTo(x, y) {
    pos = { x: snap(x), y: snap(y) };
    ui.wrap.style.transform = `translate(${pos.x}px, ${pos.y}px)`;
    layoutTimer();
    layoutBubble();
  }

  function savePosition() {
    const b = bounds();
    position = {
      x: b.maxX > b.minX ? clamp((pos.x - b.minX) / (b.maxX - b.minX), 0, 1) : 0,
      y: b.maxY > b.minY ? clamp((pos.y - b.minY) / (b.maxY - b.minY), 0, 1) : 0,
    };
    chrome.storage.local.set({ position }).catch(() => {});
  }

  function layoutHit() {
    if (!ui || !dog) return;
    const b = dog.box();
    const s = ui.hit.style;
    s.left = `${b.x}px`;
    s.top = `${b.y}px`;
    s.width = `${b.w}px`;
    s.height = `${b.h}px`;
  }

  function onResize() {
    if (!ui || !dog) return;
    dog.rescale();
    layoutHit();
    if (!booping && !dragging) placeFromFraction();
  }

  // ---- Speech bubble, timer pill, effects ---------------------------------------------
  function say(text, ms = 3600) {
    if (!ui) return;
    const b = ui.bubble;
    b.textContent = fill(text);
    b.classList.add('show');
    layoutBubble();
    clearTimeout(bubbleTimer);
    bubbleTimer = later(() => ui?.bubble.classList.remove('show'), ms);
  }

  function hush() {
    clearTimeout(bubbleTimer);
    ui?.bubble.classList.remove('show');
  }

  function headPoint() {
    const p = dog.headTop() || { x: dog.size().w / 2, y: dog.size().h * 0.3 };
    return { x: pos.x + p.x, y: pos.y + p.y };
  }

  function layoutBubble() {
    if (!ui || !dog || !ui.bubble.classList.contains('show')) return;
    const b = ui.bubble;
    const head = headPoint();
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const above = head.y - bh - 14 > 4;
    const x = clamp(head.x - bw / 2, 8, innerWidth - bw - 8);
    let y = above ? head.y - bh - 14 : pos.y + feetY() + 10;
    if (!above && ui.timer.classList.contains('show')) y += 24;
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.setProperty('--tail-x', `${clamp(head.x - x, 14, bw - 14)}px`);
    b.classList.toggle('above', above);
    b.classList.toggle('below', !above);
  }

  function showTimer(text) {
    if (!ui) return;
    const wasHidden = !ui.timer.classList.contains('show');
    ui.timer.textContent = text;
    ui.timer.classList.add('show');
    layoutTimer();
    if (wasHidden) layoutBubble();
  }

  function hideTimer() { ui?.timer.classList.remove('show'); }

  function layoutTimer() {
    if (!ui || !dog || !ui.timer.classList.contains('show')) return;
    const { w } = dog.size();
    const tw = ui.timer.offsetWidth;
    let y = pos.y + feetY() + 4;
    if (y + 22 > innerHeight) y = headPoint().y - 26;
    ui.timer.style.left = `${clamp(pos.x + w / 2 - tw / 2, 4, innerWidth - tw - 4)}px`;
    ui.timer.style.top = `${y}px`;
  }

  function pop(text, x, y) {
    if (!ui) return;
    const p = div('pop');
    p.textContent = text;
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    ui.stage.append(p);
    later(() => p.remove(), 800);
  }

  // Little pixel effects (hearts, z's, dust, sparkles) that drift and fade.
  function spawnFx(name, x, y, { frame = 0, dx = 0, dy = -26, ms = 900, scale = 2, delay = 0 } = {}) {
    if (!ui) return;
    const c = DS.fx(name, frame, scale);
    c.className = 'fx';
    ui.stage.append(c);
    const at = (fx, fy) => `translate(${snap(x + fx) - c.width / (2 * (globalThis.devicePixelRatio || 1))}px, ${snap(y + fy)}px)`;
    const a = c.animate([
      { transform: at(0, 0), opacity: 0 },
      { transform: at(dx * 0.35, dy * 0.35), opacity: 1, offset: 0.3 },
      { transform: at(dx, dy), opacity: 0 },
    ], { duration: ms, delay, easing: 'steps(8)', fill: 'both' });
    a.onfinish = () => c.remove();
  }

  function hearts() {
    const h = headPoint();
    [-14, 0, 14].forEach((dx, i) => spawnFx('heart', h.x + dx * 0.3, h.y - 4, { dx, dy: -30, delay: i * 110, ms: 1000 }));
  }

  function dust() {
    const { w } = dog.size();
    const y = pos.y + feetY() - 8;
    spawnFx('dust', pos.x + w / 2 - 22, y, { dx: -10, dy: -4, ms: 450 });
    spawnFx('dust', pos.x + w / 2 + 22, y, { dx: 10, dy: -4, ms: 450 });
  }

  // ---- Resting state -------------------------------------------------------------------
  function desiredRest() {
    return away || settings.activity === 'nap' ? 'sleep' : 'sit';
  }

  function settle() {
    if (!dog || busy || dragging || booping) return;
    dog.loop(restAnim());
    layoutBubble();
  }

  // Run one animation sequence at a time.
  async function perform(seq) {
    if (!dog || busy || booping || dragging) return false;
    busy = true;
    try { await seq(dog); } catch { /* the page went away mid-trick */ }
    busy = false;
    settle();
    if (pendingShake) { pendingShake = false; handshake(); } // a right-click that came in mid-trick
    return true;
  }

  // Loop an animation for a while (e.g. happy panting), then carry on.
  async function loopFor(d, name, ms) {
    d.loop(name);
    await wait(ms);
  }

  function updateRest({ greet = false } = {}) {
    const next = desiredRest();
    if (next === rest) { settle(); return; }
    const prev = rest;
    rest = next;
    if (next === 'sleep') {
      hush();
      perform(async (d) => { await d.play('lie_down'); });
      settle();
      return;
    }
    perform(async (d) => {
      if (prev === 'sleep') {
        await d.play('wake');
        await d.play('stand_front'); // turns round to face you before sitting
      }
      if (greet) say(pick(WAKE_LINES));
      hearts();
      await loopFor(d, 'sit_happy', 1200);
    });
  }

  // ---- Shaking paws ---------------------------------------------------------------------
  let offer = null;          // while he's holding his paw out: { resolve }
  let pendingShake = false;

  async function shakePaw(d, { pawUp = false } = {}) {
    if (!pawUp) await d.play('paw_offer');
    await d.play('shake');
    hearts();
    say(pick(SHAKE_LINES), 2200);
    await loopFor(d, 'sit_happy', 1100);
  }

  // Trick: he holds out his paw. Click him within a few seconds to shake it.
  async function offerPaw(d) {
    await d.play('paw_offer');
    d.loop('paw_wait');
    say(pick(OFFER_LINES), 4000);
    const shaken = await new Promise((resolve) => {
      offer = { resolve };
      later(() => resolve(false), 4200);
    });
    offer = null;
    if (shaken) {
      hush();
      await shakePaw(d, { pawUp: true });
    } else {
      await d.play('paw_down');
    }
  }

  // Right-click: he offers his paw and you shake (waking up for it if he's napping).
  function handshake() {
    if (!dog || booping || dragging) return;
    if (offer) { offer.resolve(true); return; }
    if (busy) { pendingShake = true; return; }
    perform(async (d) => {
      const napping = rest === 'sleep';
      if (napping) {
        await d.play('wake');
        await d.play('stand_front');
      }
      await shakePaw(d);
      if (napping) await d.play('lie_down');
    });
  }

  // ---- Big tricks ---------------------------------------------------------------------------
  // Every dog: rolls over (flopping onto his back) and a lazy belly-up. The Lab alone also does
  // his not-so-scary "grr", then a grin and a head tilt.
  async function rollTrick(d) {
    // roll to the right, unless he's too close to the right edge
    const room = innerWidth - (pos.x + dog.size().w * 0.85);
    d.facing(room > (META.anims.roll.shift || 0) * dog.scale + 20 ? 'right' : 'left');
    say(pick(['Wheee!', 'Watch this!', '*roll roll*']), 1600);
    await d.play('roll', { onFrame: (i) => { if (i === META.anims.roll.hits[0]) { dust(); say('Oof! 😵', 1400); } } });
    await d.play('stand_front');
    await loopFor(d, 'sit_pant', 1000);
  }

  async function bellyTrick(d) {
    say(pick(['Belly rubs? 🐾', '*flop*', 'So comfy…']), 2400);
    await d.play('belly_up');
    await d.play('wake'); // big stretch on the way back up
    await d.play('stand_front');
  }

  async function grinTrick(d) {
    say('Grr…', 1300);
    await d.play('grin', { onFrame: (i) => { if (i === META.anims.grin.hits[0]) say('Just kidding! 😄', 1800); } });
    hearts();
  }

  async function doTrick(d, t) {
    if (t === 'paw') {
      await offerPaw(d);
    } else if (t === 'roll') {
      await rollTrick(d);
    } else if (t === 'belly') {
      await bellyTrick(d);
    } else if (t === 'grin') {
      await grinTrick(d);
    } else if (t === 'spin') {
      await d.play('spin');
      const h = headPoint();
      spawnFx('sparkle', h.x - 20, h.y, { dy: -18, ms: 600 });
      spawnFx('sparkle', h.x + 20, h.y + 6, { dy: -18, ms: 600, delay: 120 });
      await loopFor(d, 'sit_pant', 1100); // a little out of breath after spinning
    } else if (t === 'hop') {
      await d.play('hop', { onFrame: (i) => { if (i === 5) dust(); } });
      await d.play('hop', { onFrame: (i) => { if (i === 5) dust(); } });
      await d.play('stand_front');
      await loopFor(d, 'sit_pant', 1100);
    } else if (t === 'bow') {
      await d.play('bow');
    } else if (t === 'happy') {
      hearts();
      await loopFor(d, 'sit_happy', 1800);
    } else if (t === 'bark') {
      say(pick(BARKS), 1500);
      await d.play('bark');
    } else {
      await d.play('tilt');
    }
  }

  // Every trick is equally likely. Golden and Bernese know 9, the Lab 10 (his grin). The gap
  // between cheers is worked out from that so each trick averages about once every 4 minutes.
  const COMMON_TRICKS = ['spin', 'hop', 'bow', 'happy', 'bark', 'tilt', 'paw', 'roll', 'belly'];
  const tricksFor = (breed) => (breed === 'lab' ? [...COMMON_TRICKS, 'grin'] : COMMON_TRICKS);
  const TALKATIVE = new Set(['paw', 'roll', 'belly', 'grin']); // these bring their own speech bubble
  const EACH_TRICK_EVERY_MS = 4 * 60 * 1000;
  const AVG_TRICK_MS = 3000; // a trick itself takes about this long on average

  function cheer() {
    return perform(async (d) => {
      const t = pick(tricksFor(d.breed));
      if (!TALKATIVE.has(t) && Math.random() < 0.65) say(pick(CHEERS), 4200);
      await doTrick(d, t);
      await wait(300);
    });
  }

  function scheduleCheer(first = false) {
    // 9 tricks: a cheer every ~26.7 s (gap ~23.7 s + the trick); the Lab's 10: every ~24 s
    const gap = EACH_TRICK_EVERY_MS / tricksFor(settings.breed).length - AVG_TRICK_MS;
    later(async () => {
      if (ui && visibleNow() && rest === 'sit' && settings.activity === 'cheer') await cheer();
      scheduleCheer();
    }, first ? rand(12000, 25000) : rand(gap * 0.75, gap * 1.25));
  }

  // Small, frequent signs of life.
  function scheduleBlink() {
    later(() => {
      if (dog && dog.anim === 'sit') {
        dog.flash('sit_blink', 130);
        if (Math.random() < 0.2) later(() => dog?.anim === 'sit' && dog.flash('sit_blink', 120), 260);
      }
      scheduleBlink();
    }, rand(2200, 6000));
  }

  function scheduleZ() {
    later(() => {
      if (dog && dog.anim === 'sleep' && visibleNow()) {
        const h = headPoint();
        spawnFx('z', h.x + 10, h.y + 4, { frame: Math.random() < 0.5 ? 0 : 1, dx: 16, dy: -30, ms: 1800 });
      }
      scheduleZ();
    }, rand(1300, 1900));
  }

  function scheduleFidget() {
    later(async () => {
      if (dog && visibleNow()) {
        const r = Math.random();
        if (rest === 'sit') {
          if (r < 0.28) await perform((d) => d.play('ear_twitch'));
          else if (r < 0.46) await perform((d) => d.play('tilt'));
          else if (r < 0.58) {
            await perform(async (d) => { d.facing(Math.random() < 0.5 ? 'left' : 'right'); await d.play('scratch'); });
          } else if (r < 0.7) {
            await perform(async (d) => { d.facing(Math.random() < 0.5 ? 'left' : 'right'); await loopFor(d, 'sit_side', rand(1500, 3200)); });
          } else if (r < 0.78) await perform((d) => d.play('yawn'));
          else if (r < 0.86) {
            await perform(async (d) => { d.facing(Math.random() < 0.5 ? 'left' : 'right'); await d.play('sniff'); });
          }
        } else if (rest === 'sleep' && r < 0.3) {
          await perform((d) => d.play('sleep_twitch'));
        }
      }
      scheduleFidget();
    }, rand(6000, 14000));
  }

  // ---- Petting + dragging ----------------------------------------------------------------
  // A click pets him, or takes his paw if he's holding it out. Shaking paws on purpose:
  // right-click him, or rest the mouse on him for a moment and he offers his paw.
  function onClick() {
    if (offer) { offer.resolve(true); return; }
    pet();
  }

  function onRightClick(e) {
    e.preventDefault(); // no browser menu over the dog
    e.stopPropagation();
    handshake();
  }

  // Rest the mouse still on him (awake) and he holds out his paw; clicking takes it.
  // Every click or movement restarts the wait, so petting him never sets it off.
  const HOVER_MS = 1500;
  let hoverTimer = null;
  let hoverAt = null;
  let hoverUsed = false; // one offer per visit of the mouse

  function armHover(x, y) {
    hoverAt = { x, y };
    clearTimeout(hoverTimer);
    hoverTimer = hoverUsed ? null : setTimeout(onHoverHold, HOVER_MS);
  }

  function onHoverHold() {
    hoverTimer = null;
    if (!ui || !dog || dragging || booping || offer || rest !== 'sit' || !hoverAt) return;
    if (busy) { armHover(hoverAt.x, hoverAt.y); return; } // wait for the current trick to finish
    hoverUsed = true;
    perform((d) => offerPaw(d));
  }

  function onHoverEnter(e) {
    hoverUsed = false;
    armHover(e.clientX, e.clientY);
  }

  function onHoverMove(e) {
    if (dragging) return;
    if (!hoverAt || Math.hypot(e.clientX - hoverAt.x, e.clientY - hoverAt.y) > 6) armHover(e.clientX, e.clientY);
  }

  function onHoverLeave() {
    clearTimeout(hoverTimer);
    hoverTimer = null;
    hoverAt = null;
  }

  function pet() {
    if (!dog || booping) return;
    hearts();
    if (busy) return;
    perform(async (d) => {
      if (rest === 'sleep') { await d.play('sleep_twitch'); return; }
      if (Math.random() < 0.4) say(pick(PET_LINES), 1800);
      await loopFor(d, 'sit_happy', 1300);
    });
  }

  // Click: pet. Drag: he walks along in whichever direction you move him.
  // Press and hold still: you pick him up (legs dangling), and he lands when you let go.
  function onPointerDown(e) {
    if (e.button !== 0 || booping || !ui) return;
    e.preventDefault();
    e.stopPropagation();
    clearTimeout(hoverTimer); // a click restarts the "resting mouse" wait (re-armed on release)
    hoverTimer = null;
    const target = ui.hit;
    // keep getting moves even when the pointer crosses an iframe
    try { target.setPointerCapture(e.pointerId); } catch { /* not supported */ }
    const start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    let moved = false;
    let picked = false;
    let dir = null;        // 'left' | 'right' | 'down' | 'up'
    let walking = false;
    let vx = 0;
    let vy = 0;
    let last = { x: e.clientX, y: e.clientY, t: performance.now() };
    let stillTimer = null;

    const grab = () => {
      dragging = true;
      hush();
      ui.wrap.classList.add('dragging');
    };
    const pickTimer = setTimeout(() => {
      if (moved || !ui || !dog) return;
      picked = true;
      grab();
      dog.hold('held');
    }, 420);

    const walkAnim = () => {
      if (dir === 'left' || dir === 'right') {
        dog.facing(dir);
        dog.hold('walk');
      } else {
        dog.hold(dir === 'down' ? 'walk_front' : 'walk_back'); // towards you / away from you
      }
    };
    const standStill = () => {
      if (!ui || !dog || !dragging) return;
      walking = false;
      dog.hold(dir === 'left' || dir === 'right' ? 'stand' : 'stand_front');
    };

    const move = (ev) => {
      if (!ui || !dog) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        moved = true;
        clearTimeout(pickTimer);
        if (!dragging) grab();
      }
      // smoothed drag velocity decides which way he's walking
      const now = performance.now();
      const dt = Math.max(8, now - last.t);
      vx = vx * 0.55 + ((ev.clientX - last.x) / dt) * 0.45;
      vy = vy * 0.55 + ((ev.clientY - last.y) / dt) * 0.45;
      last = { x: ev.clientX, y: ev.clientY, t: now };
      if (Math.hypot(vx, vy) > 0.04) {
        // a little stickiness so diagonal drags don't flicker between directions
        const vertical = dir === 'up' || dir === 'down';
        const side = Math.abs(vx) >= Math.abs(vy) * (vertical ? 1.3 : 0.75);
        const next = side ? (vx < 0 ? 'left' : 'right') : vy > 0 ? 'down' : 'up';
        if (next !== dir || !walking) {
          dir = next;
          walking = true;
          walkAnim();
        }
      }
      clearTimeout(stillTimer);
      stillTimer = setTimeout(standStill, 170); // stop walking when you stop moving
      const b = bounds();
      moveTo(clamp(start.px + dx, b.minX, b.maxX), clamp(start.py + dy, b.minY, b.maxY));
    };

    const up = (ev) => {
      target.removeEventListener('pointermove', move);
      target.removeEventListener('pointerup', up);
      target.removeEventListener('pointercancel', up);
      clearTimeout(pickTimer);
      clearTimeout(stillTimer);
      if (!ui || !dog) return;
      if (ev?.type === 'pointerup') armHover(ev.clientX, ev.clientY); // start the "resting mouse" wait again
      if (!moved && !picked) { onClick(); return; }
      dragging = false;
      ui.wrap.classList.remove('dragging');
      savePosition();
      dog.release();
      perform(async (d) => {
        if (moved) {
          // walked somewhere new: turn to face you and catch his breath
          await d.play('stand_front');
          await loopFor(d, 'sit_pant', 1200);
        } else {
          dust();
          await d.play('land'); // set back down after being picked up
        }
        if (rest === 'sleep') await d.play('lie_down');
      });
    };

    target.addEventListener('pointermove', move);
    target.addEventListener('pointerup', up);
    target.addEventListener('pointercancel', up);
  }

  // ---- Walking -------------------------------------------------------------------------
  function walkTo(tx, ty, { speed = 115 } = {}) {
    return new Promise((resolve) => {
      if (!ui || !dog) { resolve(); return; }
      const d = dog;
      const b = bounds();
      tx = clamp(tx, b.minX, b.maxX);
      ty = clamp(ty, b.minY, b.maxY);
      const sx = pos.x;
      const sy = pos.y;
      const dist = Math.hypot(tx - sx, ty - sy);
      if (dist < 2) { resolve(); return; }
      if (Math.abs(tx - sx) >= Math.abs(ty - sy) * 0.7) {
        d.facing(tx < sx ? 'left' : 'right');
        d.loop('walk');
      } else {
        d.loop(ty > sy ? 'walk_front' : 'walk_back');
      }
      const dur = Math.max(450, (dist / speed) * 1000);
      const t0 = performance.now();
      const step = (now) => {
        if (!alive || !ui || dog !== d) { resolve(); return; }
        const k = Math.min(1, (now - t0) / dur);
        const e = k < 0.15 ? (k / 0.15) ** 2 * 0.15 : k; // ease in, then a steady walk
        moveTo(sx + (tx - sx) * e, sy + (ty - sy) * e);
        if (k < 1) requestAnimationFrame(step);
        else resolve();
      };
      requestAnimationFrame(step);
    });
  }

  function walkHome() {
    if (!ui || !dog) return Promise.resolve();
    const b = bounds();
    return walkTo(b.minX + position.x * (b.maxX - b.minX), b.minY + position.y * (b.maxY - b.minY));
  }

  // ---- No-scroll patrol -------------------------------------------------------------------
  const onShortForm = () => (settings.enabled && settings.patrol ? S.shortFormSite(location.href, settings) : null);

  function note(key, fn) {
    if (patrolVisit.notes.has(key)) return;
    patrolVisit.notes.add(key);
    fn();
  }

  function tickPatrol(dt) {
    const site = onShortForm();
    if (!site) {
      if (patrolVisit) { patrolVisit = null; hideTimer(); flushScroll(); }
      return;
    }
    if (!patrolVisit || patrolVisit.site !== site) patrolVisit = { site, notes: new Set() };
    if (!ui || booping || dragging || !visibleNow() || Date.now() < boopCooldownUntil) return;

    let left = settings.graceMinutes * 60000 - scrollMs;
    if (left > 0) {
      scrollMs += dt;
      scrollDirty += dt;
      left -= dt;
      if (scrollDirty >= 5000) flushScroll();
      showTimer(`⏳ ${S.fmtTime(left)}`);
      if (left <= 10000) note('10s', () => say('Almost time… 🐾', 3000));
      else if (left <= 60000) note('1min', () => say("One more minute, then I'm closing this!", 4000));
      else note('start', () => say(`${S.fmtTime(left)} of scrolling left today`, 3200));
      return;
    }
    hideTimer();
    flushScroll();
    if (!busy) boop(site); // let a trick in progress finish first
  }

  function flushScroll() {
    if (!scrollDirty) return;
    scrollDirty = 0;
    try {
      chrome.storage.local.set({ scrollTime: { day: scrollDay, ms: Math.round(scrollMs) } }).catch(() => {});
    } catch { /* extension reloaded */ }
  }

  function stopMedia() {
    document.querySelectorAll('video, audio').forEach((m) => { try { m.pause(); } catch { /* ignore */ } });
  }

  // The big red "close this tab" button the dog presses (pixel art, from sprites/fx.png).
  // Frames: 0 up, 1 pressed, 2 pressed and lit.
  function makeButton() {
    const spr = DS.fxSprite('button', SCALE);
    const size = META.fx.cell * spr.scale;
    const left = snap(innerWidth - 24 - size);
    const top = snap(60);
    spr.el.className = 'redbtn';
    spr.el.style.left = `${left}px`;
    spr.el.style.top = `${top}px`;
    ui.stage.insertBefore(spr.el, ui.wrap); // behind the dog, so the paw / nose is on top of it
    requestAnimationFrame(() => spr.el.classList.add('show'));
    const at = ([x, y]) => ({ x: left + (x + 0.5) * spr.scale, y: top + (y + 0.5) * spr.scale });
    return {
      el: spr.el,
      set: spr.set,
      press: at(META.fx.button.press), // top of the dome: where a paw pushes down
      side: at(META.fx.button.side),   // side of the dome: where a nose boops
    };
  }

  async function boop(site) {
    if (!ui || !dog || booping) return;
    booping = true;
    busy = true;
    hush();
    ui.wrap.classList.add('busy');
    const d = dog;
    stopMedia();
    const mediaGuard = every(stopMedia, 400);
    let xb = null;
    let closing = false;
    const stillOn = () => alive && ui && dog === d && onShortForm() === site;
    try {
      if (d.anim === 'sleep' || d.anim === 'lie_down') await d.play('wake');
      say(pick(PATROL_LINES), 2600);
      await d.play('bark');
      if (!stillOn()) return;

      xb = makeButton();
      const how = Math.random() < 0.5 ? 'paw' : 'nose';
      d.facing('right');
      // line the paw tip up with the top of the dome, or the nose with its side
      const tip = how === 'paw' ? d.pawTip() : d.noseTip();
      const spot = how === 'paw' ? xb.press : xb.side;
      await wait(250);
      await walkTo(spot.x - tip.x, spot.y - tip.y);
      if (!stillOn()) return;

      d.facing('right');
      d.loop(how === 'paw' ? 'sit_side' : 'stand');
      await wait(300);
      const name = how === 'paw' ? 'boop_paw' : 'boop_nose';
      const hits = META.anims[name].hits;
      const lastHit = hits[hits.length - 1];
      await d.play(name, {
        onFrame: (i) => {
          if (!hits.includes(i) || !xb) return;
          const final = i === lastHit;
          xb.set(final ? 2 : 1); // press it down (and light it up on the last press)
          pop('boop!', xb.press.x, xb.press.y - 30);
          spawnFx('star', xb.press.x, xb.press.y - 8, { frame: 1, dy: -8, ms: 300, scale: 2 });
          if (!final) later(() => xb?.set(0), 140);
        },
      });
      await wait(250);
      xb.el.classList.add('gone');
      hearts();
      await wait(450);
      if (!stillOn()) return;

      let res = null;
      try { res = await chrome.runtime.sendMessage({ type: 'dog:boop-close' }); } catch { /* extension reloaded */ }
      if (res?.ok) { closing = true; return; } // the tab is on its way out
      say("I couldn't close this one. Could you? 🐾", 5000);
      boopCooldownUntil = Date.now() + 60000;
    } finally {
      if (!closing) {
        stopEvery(mediaGuard);
        if (alive && ui && dog === d) {
          const leftOnTheirOwn = S.shortFormSite(location.href, settings) !== site;
          xb?.el.remove();
          xb = null;
          if (leftOnTheirOwn) say('Good choice! 🐾', 2600);
          await walkHome();
          // back home: turn to face you and catch his breath
          await d.play('stand_front');
          d.loop('sit_pant');
          await wait(1500);
          if (rest === 'sleep') await d.play('lie_down');
          busy = false;
          booping = false;
          ui?.wrap.classList.remove('busy');
          settle();
        } else {
          busy = false;
          booping = false;
        }
      }
    }
  }

  // ---- Main loop --------------------------------------------------------------------------
  function rollDay() {
    const today = S.todayKey();
    if (today !== scrollDay) {
      scrollDay = today;
      scrollMs = 0;
      scrollDirty = 0;
    }
  }

  function tick() {
    if (!alive) return;
    if (!extAlive()) { shutdown(); return; }
    const now = performance.now();
    const dt = Math.min(2000, now - lastTick);
    lastTick = now;
    if (!settings.enabled) return;
    if (ui && !ui.host.isConnected) document.documentElement.append(ui.host);
    rollDay();
    tickPatrol(dt);
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') flushScroll();
    else { lastTick = performance.now(); if (ui && !booping && !dragging) placeFromFraction(); }
  }

  function applySettings(next, prev) {
    settings = next;
    if (!next.enabled) { teardownUI(); return; }
    if (!ui) { buildUI(); return; }
    if (!booping && (next.breed !== prev.breed || next.labCoat !== prev.labCoat)) {
      mountDog();
      dog.ready.then(() => { hearts(); perform((d) => d.play('hop')); });
      return;
    }
    updateRest();
  }

  function onStorage(changes, area) {
    if (area !== 'local' || !alive) return;
    if (changes.settings) applySettings(S.merge(changes.settings.newValue), settings);
    if (changes.position && !dragging && !booping) {
      position = changes.position.newValue || S.DEFAULT_POSITION;
      placeFromFraction();
    }
    if (changes.away) {
      const was = away;
      away = !!changes.away.newValue;
      if (ui) updateRest({ greet: was && !away });
    }
    if (changes.scrollTime) {
      const rec = changes.scrollTime.newValue;
      if (rec && rec.day === scrollDay) scrollMs = Math.max(scrollMs, Number(rec.ms) || 0);
      else if (!rec) scrollMs = 0;
    }
  }

  (async () => {
    try {
      const st = await S.load();
      settings = st.settings;
      position = st.position;
      away = st.away;
      scrollMs = st.scrollMs;
    } catch { return; }
    if (!alive) return;
    chrome.storage.onChanged.addListener(onStorage);
    addEventListener('resize', onResize);
    document.addEventListener('visibilitychange', onVisibility);
    if (settings.enabled) buildUI();
    // Dev playground only: lets dev/playground.html trigger tricks on demand. In the real
    // extension this script runs in an isolated world, so pages can't reach it.
    if (globalThis.__dogDev) {
      globalThis.__dogDev.api = { trick: (t) => perform((d) => doTrick(d, t)), handshake, anim: () => dog?.anim, busy: () => busy };
    }
    every(tick, 1000);
    scheduleCheer(true);
    scheduleFidget();
    scheduleBlink();
    scheduleZ();
  })();
})();
