/* Dog Buddy: the dog that lives on every page.
   Runs as a content script. Draws the dog inside a closed shadow root so the
   page's styles can't break it, handles dragging / petting / tricks, and does
   the "no-scroll patrol": walks over to a close button and boops short-form
   video tabs shut once your grace time is used up. */
(() => {
  const S = globalThis.DogSettings;
  const Art = globalThis.DogArt;
  if (!S || !Art || window.top !== window) return;
  if (!(document.documentElement instanceof HTMLElement)) return;

  // A newer copy (e.g. after the extension reloads) replaces any older one.
  document.dispatchEvent(new CustomEvent('dogbuddy:takeover'));
  let alive = true;
  document.addEventListener('dogbuddy:takeover', () => shutdown(), { once: true });

  // ---- Lines -----------------------------------------------------------------
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
  const PATROL_LINES = [
    'Hey! No more scrolling 🐾',
    "That's enough for today!",
    'Nope! Boop incoming…',
    '*wobble wobble* closing this one!',
  ];
  const WAKE_LINES = ["You're back! I missed you 🐾", "Yay, you're back!", '*big stretch* Welcome back!'];
  const TRICKS = ['twirl', 'hop', 'bow', 'smile', 'tilt'];

  const PAGE_CSS = `
:host { all: initial; }
.stage {
  position: fixed; inset: 0; pointer-events: none; color: #3b2a1a;
  font: 600 13px/1.35 ui-rounded, "SF Pro Rounded", "Nunito", "Segoe UI", system-ui, sans-serif;
}
.dog { position: absolute; left: 0; top: 0; pointer-events: none; touch-action: none; transform-origin: 50% 25%; }
.dog .dog-svg { width: 100%; height: auto; }
.dog .whole { pointer-events: visiblePainted; cursor: grab; }
.dog.dragging .whole { cursor: grabbing; }
.dog.entering { animation: dog-enter .45s cubic-bezier(.3,1.5,.5,1); }
@keyframes dog-enter { from { opacity: 0; scale: .6; } to { opacity: 1; scale: 1; } }
.bubble {
  position: absolute; left: 0; top: 0; max-width: 220px; padding: 7px 12px;
  background: #fffaf2; border: 2px solid #3b2a1a; border-radius: 14px;
  box-shadow: 0 3px 0 rgba(59,42,26,.18); opacity: 0; scale: .85;
  transition: opacity .18s, scale .18s; transform-origin: var(--tail-x, 50%) 100%;
}
.bubble.below { transform-origin: var(--tail-x, 50%) 0; }
.bubble.show { opacity: 1; scale: 1; }
.bubble::after {
  content: ""; position: absolute; left: var(--tail-x, 50%); width: 9px; height: 9px;
  background: #fffaf2; border: 2px solid #3b2a1a; transform: translateX(-50%) rotate(45deg);
}
.bubble.above::after { bottom: -7px; border-top: 0; border-left: 0; }
.bubble.below::after { top: -7px; border-bottom: 0; border-right: 0; }
.timer {
  position: absolute; left: 0; top: 0; padding: 2px 9px; border-radius: 999px;
  background: #3b2a1a; color: #fff6e6; font-size: 11px; font-variant-numeric: tabular-nums;
  opacity: 0; transition: opacity .2s;
}
.timer.show { opacity: .92; }
.xbtn {
  position: absolute; width: 40px; height: 40px; border-radius: 50%; box-sizing: border-box;
  background: #fff; border: 2.5px solid #3b2a1a; box-shadow: 0 3px 0 rgba(59,42,26,.25);
  display: grid; place-items: center; scale: 0; transition: scale .3s cubic-bezier(.3,1.6,.5,1);
}
.xbtn.show { scale: 1; }
.xbtn.squish { scale: .78; transition-duration: .08s; }
.xbtn.gone { scale: 0; transition-duration: .2s; }
.xbtn svg { width: 16px; height: 16px; }
.pop {
  position: absolute; font-weight: 800; font-size: 16px; color: #e8556f; white-space: nowrap;
  text-shadow: 0 2px 0 #fff, 0 -1px 0 #fff, 1px 0 0 #fff, -1px 0 0 #fff;
  animation: dog-pop .7s ease-out forwards;
}
@keyframes dog-pop {
  0% { transform: translate(-50%, 0) scale(.5); opacity: 0; }
  30% { transform: translate(-50%, -10px) scale(1.15); opacity: 1; }
  100% { transform: translate(-50%, -26px) scale(1); opacity: 0; }
}
`;

  // ---- State -------------------------------------------------------------------
  let settings = S.merge({});
  let position = S.DEFAULT_POSITION;
  let away = false;
  let scrollMs = 0;
  let scrollDay = S.todayKey();
  let scrollDirty = 0;
  let ui = null;          // { host, stage, wrap, bubble, timer, dog }
  let pos = { x: 0, y: 0 };
  let rest = null;        // 'sit' | 'sleep': what the dog does when nothing else is going on
  let busy = false;       // in the middle of a trick
  let booping = false;    // on a patrol mission
  let dragging = false;
  let boopCooldownUntil = 0;
  let patrolVisit = null; // { site, notes }
  let lastTick = performance.now();
  let bubbleTimer = null;
  const timeouts = new Set();
  const intervals = new Set();

  // ---- Helpers -----------------------------------------------------------------
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
  const box = () => { const w = ui.dog.size; return { w, h: w * 0.75 }; };

  // ---- Building the dog ----------------------------------------------------------
  function buildUI() {
    if (ui || !alive) return;
    const host = document.createElement('dog-buddy');
    for (const [k, v] of Object.entries({
      position: 'fixed', inset: '0', 'z-index': '2147483646', 'pointer-events': 'none',
      display: 'block', margin: '0', padding: '0', border: '0', background: 'none',
    })) host.style.setProperty(k, v, 'important');
    let shadow;
    try { shadow = host.attachShadow({ mode: 'closed' }); } catch { return; }
    Art.adoptCss(shadow, PAGE_CSS);
    const stage = div('stage');
    const wrap = div('dog');
    const timer = div('timer');
    const bubble = div('bubble');
    stage.append(wrap, timer, bubble);
    shadow.append(stage);
    document.documentElement.append(host);
    wrap.addEventListener('pointerdown', onPointerDown);
    wrap.addEventListener('click', (e) => e.stopPropagation());
    ui = { host, stage, wrap, bubble, timer, dog: null };
    mountDog();
    wrap.classList.add('entering');
    later(() => ui?.wrap.classList.remove('entering'), 500);
  }

  function mountDog() {
    const dog = Art.create(settings.breed, settings.labCoat);
    ui.wrap.replaceChildren(dog.el);
    ui.wrap.style.width = `${dog.size}px`;
    ui.dog = dog;
    busy = false;
    rest = desiredRest();
    settle();
    placeFromFraction();
  }

  function teardownUI() {
    if (!ui) return;
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

  // ---- Position ----------------------------------------------------------------
  function placeFromFraction() {
    if (!ui) return;
    const { w, h } = box();
    moveTo(position.x * Math.max(0, innerWidth - w), position.y * Math.max(0, innerHeight - h));
  }

  function moveTo(x, y, tilt = 0) {
    pos = { x, y };
    ui.wrap.style.transform = `translate(${x}px, ${y}px)${tilt ? ` rotate(${tilt}deg)` : ''}`;
    layoutTimer();
    layoutBubble();
  }

  function savePosition() {
    const { w, h } = box();
    position = {
      x: innerWidth > w ? clamp(pos.x / (innerWidth - w), 0, 1) : 0,
      y: innerHeight > h ? clamp(pos.y / (innerHeight - h), 0, 1) : 0,
    };
    chrome.storage.local.set({ position }).catch(() => {});
  }

  function onResize() {
    if (ui && !booping && !dragging) placeFromFraction();
  }

  // ---- Speech bubble + timer pill -------------------------------------------------
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

  function layoutBubble() {
    if (!ui || !ui.bubble.classList.contains('show')) return;
    const b = ui.bubble;
    const { w, h } = box();
    const lying = ui.dog.el.dataset.pose === 'lie';
    const headX = pos.x + w * ((ui.dog.isFacingLeft() ? 50 : 110) / 160);
    const headTop = pos.y + h * ((lying ? 58 : 20) / 120);
    const bw = b.offsetWidth;
    const bh = b.offsetHeight;
    const above = headTop - bh - 12 > 4;
    const x = clamp(headX - bw / 2, 8, innerWidth - bw - 8);
    let y = above ? headTop - bh - 12 : pos.y + h * 0.96 + 10;
    if (!above && ui.timer.classList.contains('show')) y += 24;
    b.style.left = `${x}px`;
    b.style.top = `${y}px`;
    b.style.setProperty('--tail-x', `${clamp(headX - x, 14, bw - 14)}px`);
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

  function hideTimer() {
    ui?.timer.classList.remove('show');
  }

  function layoutTimer() {
    if (!ui || !ui.timer.classList.contains('show')) return;
    const { w, h } = box();
    const tw = ui.timer.offsetWidth;
    let y = pos.y + h * 0.96 + 2;
    if (y + 22 > innerHeight) y = pos.y - 20;
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

  // ---- Resting state -------------------------------------------------------------
  function desiredRest() {
    return away || settings.activity === 'nap' ? 'sleep' : 'sit';
  }

  // Put the dog back into its resting look.
  function settle() {
    if (!ui?.dog || busy || dragging || booping) return;
    const d = ui.dog;
    d.walking(false);
    if (rest === 'sleep') {
      d.facing('right');
      d.pose('lie');
      d.face('sleep');
      d.wag('none');
    } else {
      d.pose('sit');
      d.face('normal');
      d.wag('normal');
    }
    layoutBubble();
  }

  function updateRest({ greet = false } = {}) {
    const next = desiredRest();
    if (next === rest) { settle(); return; }
    const prev = rest;
    rest = next;
    if (next === 'sleep') { hush(); settle(); return; }
    settle();
    if (prev === 'sleep') {
      perform(async (d) => {
        d.face('happy');
        d.wag('fast');
        if (greet) say(pick(WAKE_LINES));
        await d.trick('hop');
        await wait(700);
      });
    }
  }

  // Run one animation sequence at a time.
  async function perform(seq) {
    if (!ui || busy || booping || dragging) return false;
    busy = true;
    try { await seq(ui.dog); } catch { /* page went away mid-trick */ }
    busy = false;
    settle();
    return true;
  }

  async function doTrick(d, t) {
    if (t === 'smile') {
      d.face('happy'); d.wag('fast'); d.hearts();
      await d.trick('tilt');
    } else if (t === 'bow') {
      d.pose('stand'); d.face('pant'); d.wag('fast');
      await wait(250);
      await d.trick('bow');
    } else if (t === 'twirl') {
      d.pose('stand'); d.face('happy'); d.wag('fast');
      await d.trick('twirl');
    } else if (t === 'hop') {
      d.face('happy'); d.wag('fast');
      await d.trick('hop');
      await d.trick('hop');
    } else {
      await d.trick('tilt');
    }
  }

  function cheer() {
    return perform(async (d) => {
      if (Math.random() < 0.65) say(pick(CHEERS), 4200);
      await doTrick(d, pick(TRICKS));
      await wait(400);
    });
  }

  function scheduleCheer(first = false) {
    later(async () => {
      if (ui && visibleNow() && rest === 'sit' && settings.activity === 'cheer') await cheer();
      scheduleCheer();
    }, first ? rand(20000, 45000) : rand(45000, 90000));
  }

  function scheduleFidget() {
    later(async () => {
      if (ui && visibleNow()) {
        const r = Math.random();
        if (rest === 'sit') {
          if (r < 0.3) await perform((d) => d.trick('tilt'));
          else if (r < 0.55) {
            await perform(async (d) => {
              d.facing(d.isFacingLeft() ? 'right' : 'left'); // look around
              await wait(rand(1200, 2600));
            });
          }
        } else if (rest === 'sleep' && r < 0.35) {
          await perform(async (d) => { d.wag('slow'); await wait(2400); }); // dreaming
        }
      }
      scheduleFidget();
    }, rand(7000, 15000));
  }

  // ---- Petting + dragging ---------------------------------------------------------
  function pet() {
    if (!ui || booping) return;
    if (busy) { ui.dog.hearts(); return; }
    perform(async (d) => {
      d.hearts();
      if (rest === 'sleep') {
        d.face('happy'); d.wag('slow');
        await wait(1600);
        return;
      }
      d.face('happy'); d.wag('fast');
      if (Math.random() < 0.4) say(pick(PET_LINES), 1800);
      await d.trick(Math.random() < 0.5 ? 'hop' : 'tilt');
      await wait(300);
    });
  }

  function onPointerDown(e) {
    if (e.button !== 0 || booping || !ui) return;
    e.preventDefault();
    e.stopPropagation();
    const start = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
    let moved = false;
    let lastX = e.clientX;
    let tilt = 0;

    const move = (ev) => {
      if (!ui) return;
      const dx = ev.clientX - start.x;
      const dy = ev.clientY - start.y;
      if (!moved && Math.hypot(dx, dy) < 5) return;
      if (!moved) {
        moved = true;
        dragging = true;
        hush();
        ui.wrap.classList.add('dragging');
        ui.dog.walking(false);
        ui.dog.pose('stand');
        ui.dog.face('pant');
        ui.dog.wag('fast');
      }
      const { w, h } = box();
      tilt = clamp(tilt * 0.6 + (ev.clientX - lastX) * 1.2, -20, 20);
      lastX = ev.clientX;
      moveTo(clamp(start.px + dx, 0, innerWidth - w), clamp(start.py + dy, 0, innerHeight - h), tilt);
    };

    const up = () => {
      removeEventListener('pointermove', move, true);
      removeEventListener('pointerup', up, true);
      removeEventListener('pointercancel', up, true);
      if (!ui) return;
      if (!moved) { pet(); return; }
      dragging = false;
      ui.wrap.classList.remove('dragging');
      moveTo(pos.x, pos.y);
      savePosition();
      settle();
      perform((d) => d.trick('wiggle'));
    };

    addEventListener('pointermove', move, true);
    addEventListener('pointerup', up, true);
    addEventListener('pointercancel', up, true);
  }

  // ---- Walking ------------------------------------------------------------------
  function walkTo(tx, ty) {
    return new Promise((resolve) => {
      if (!ui) { resolve(); return; }
      const d = ui.dog;
      const { w, h } = box();
      tx = clamp(tx, -w * 0.1, innerWidth - w * 0.9);
      ty = clamp(ty, 0, innerHeight - h);
      const sx = pos.x;
      const sy = pos.y;
      const dist = Math.hypot(tx - sx, ty - sy);
      if (dist < 2) { resolve(); return; }
      d.pose('stand');
      d.face('pant');
      d.wag('fast');
      d.walking(true);
      d.facing(tx < sx ? 'left' : 'right');
      const dur = Math.max(500, (dist / 150) * 1000);
      const t0 = performance.now();
      const step = (now) => {
        if (!alive || !ui) { resolve(); return; }
        const k = Math.min(1, (now - t0) / dur);
        const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
        moveTo(sx + (tx - sx) * e, sy + (ty - sy) * e);
        if (k < 1) requestAnimationFrame(step);
        else { d.walking(false); resolve(); }
      };
      requestAnimationFrame(step);
    });
  }

  function walkHome() {
    if (!ui) return Promise.resolve();
    const { w, h } = box();
    return walkTo(position.x * Math.max(0, innerWidth - w), position.y * Math.max(0, innerHeight - h));
  }

  // ---- No-scroll patrol -----------------------------------------------------------
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
    if (!ui || booping || !visibleNow() || Date.now() < boopCooldownUntil) return;

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
    boop(site);
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

  function makeXButton() {
    const NS = 'http://www.w3.org/2000/svg';
    const x = div('xbtn');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 16 16');
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', 'M3 3 L13 13 M13 3 L3 13');
    path.setAttribute('stroke', '#e8556f');
    path.setAttribute('stroke-width', '3');
    path.setAttribute('stroke-linecap', 'round');
    svg.append(path);
    x.append(svg);
    const size = 40;
    const cx = innerWidth - 28 - size / 2;
    const cy = 72 + size / 2;
    x.style.left = `${cx - size / 2}px`;
    x.style.top = `${cy - size / 2}px`;
    ui.stage.append(x);
    requestAnimationFrame(() => x.classList.add('show'));
    return { el: x, cx, cy };
  }

  async function boop(site) {
    if (!ui || booping) return;
    booping = true;
    busy = true;
    hush();
    const d = ui.dog;
    d.stopTricks();
    stopMedia();
    const mediaGuard = every(stopMedia, 400);
    let xb = null;
    let closing = false;
    const stillOn = () => alive && ui && onShortForm() === site;
    try {
      if (rest === 'sleep') {
        d.pose('sit'); d.face('happy'); d.wag('fast');
        await d.trick('wiggle'); // wakes up for duty
      }
      d.pose('stand'); d.face('normal'); d.wag('fast');
      say(pick(PATROL_LINES), 2600);
      await wait(1100);
      if (!stillOn()) return;

      xb = makeXButton();
      const how = Math.random() < 0.5 ? 'paw' : 'nose';
      const { w } = box();
      const s = w / 160;
      const [ax, ay] = how === 'paw' ? Art.ANCHORS.pawTip : Art.ANCHORS.noseTip;
      await wait(300);
      await walkTo(xb.cx - (how === 'paw' ? 4 : 15) - ax * s, xb.cy - ay * s);
      if (!stillOn()) return;

      d.facing('right');
      d.pose('sit');
      d.face('normal');
      await wait(350);
      const trick = how === 'paw' ? 'boopPaw' : 'boopNose';
      for (const ms of Art.TRICK_HITS[trick]) {
        later(() => {
          if (!xb) return;
          xb.el.classList.add('squish');
          pop('boop!', xb.cx, xb.cy - 34);
          later(() => xb?.el.classList.remove('squish'), 110);
        }, ms);
      }
      await d.trick(trick);
      xb.el.classList.add('gone');
      d.face('happy');
      d.hearts();
      await wait(650);
      if (!stillOn()) return;

      let res = null;
      try { res = await chrome.runtime.sendMessage({ type: 'dog:boop-close' }); } catch { /* extension reloaded */ }
      if (res?.ok) { closing = true; return; } // the tab is on its way out
      say("I couldn't close this one. Could you? 🐾", 5000);
      boopCooldownUntil = Date.now() + 60000;
    } finally {
      if (!closing) {
        stopEvery(mediaGuard);
        if (alive && ui) {
          const leftOnTheirOwn = S.shortFormSite(location.href, settings) !== site;
          xb?.el.remove();
          xb = null;
          busy = false;
          booping = false;
          if (leftOnTheirOwn) say('Good choice! 🐾', 2600);
          await walkHome();
          settle();
        }
      }
    }
  }

  // ---- Main loop -------------------------------------------------------------------
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
      perform((d) => { d.hearts(); return d.trick('hop'); });
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
    every(tick, 1000);
    scheduleCheer(true);
    scheduleFidget();
  })();
})();
