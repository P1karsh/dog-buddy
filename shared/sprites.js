/* Dog Buddy: pixel sprite player.
   Plays rows of the generated sprite sheets (sprites/*.png, see tools/sprites/)
   on a <canvas>. Pixels stay crisp: every sprite pixel maps to a whole number of
   device pixels. The sheet image is handed over by a loader function so this
   works both in extension pages and in content scripts (no page CSP involved). */
globalThis.DogSprites = (() => {
  const META = globalThis.DogSpriteMeta;
  const CELL = META.cell;
  const sheets = new Map();
  let loader = null;

  const sheetId = (breed, coat) => (breed === 'lab' ? `lab-${coat || 'yellow'}` : breed);

  // fn(id) -> Promise<Blob | ImageBitmap | HTMLImageElement>
  function setLoader(fn) { loader = fn; }

  function load(id) {
    if (!sheets.has(id)) {
      sheets.set(id, Promise.resolve(loader(id)).then((src) => (src instanceof Blob ? createImageBitmap(src) : src)));
    }
    return sheets.get(id);
  }

  // Device-pixel-exact scale: each sprite pixel becomes k device pixels.
  function pixelScale(scale) {
    const dpr = globalThis.devicePixelRatio || 1;
    const k = Math.max(1, Math.round(scale * dpr));
    return { k, css: k / dpr };
  }

  function create(breed, coat, { scale = 3 } = {}) {
    const id = sheetId(breed, coat);
    const marks = META.breeds[breed === 'lab' ? 'lab' : breed] || META.breeds.golden;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    let ps = pixelScale(scale);
    let img = null;
    let anim = null;      // current animation name
    let frame = 0;
    let timer = null;
    let left = false;
    let overlay = null;   // { name, until } a look-alike row shown for a moment (blinks)
    let done = null;      // resolver for one-shot play()
    let onFrame = null;
    let base = 'sit';     // loop to return to after one-shots
    let holding = null;   // hold(): an animation that overrides everything (e.g. being carried)

    function size() {
      canvas.width = CELL.w * ps.k;
      canvas.height = CELL.h * ps.k;
      canvas.style.width = `${CELL.w * ps.css}px`;
      canvas.style.height = `${CELL.h * ps.css}px`;
      ctx.imageSmoothingEnabled = false;
    }
    size();

    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!img || !anim) return;
      const showName = overlay && performance.now() < overlay.until ? overlay.name : anim;
      const meta = META.anims[showName] || META.anims[anim];
      const f = Math.min(frame, meta.ms.length - 1);
      ctx.drawImage(img, f * CELL.w, meta.row * CELL.h, CELL.w, CELL.h, 0, 0, CELL.w * ps.k, CELL.h * ps.k);
    }

    function tick() {
      const meta = META.anims[anim];
      if (!meta) return;
      onFrame?.(frame);
      draw();
      timer = setTimeout(() => {
        frame += 1;
        if (frame >= meta.ms.length) {
          if (meta.loop) frame = 0;
          else {
            const finish = done;
            done = null;
            onFrame = null;
            start(base);
            finish?.();
            return;
          }
        }
        tick();
      }, meta.ms[frame]);
    }

    function start(name) {
      clearTimeout(timer);
      const changed = anim !== name;
      anim = META.anims[name] ? name : 'sit';
      frame = 0;
      tick();
      if (changed) api.onChange?.();
    }

    const api = {
      el: canvas,
      breed,
      coat,
      ready: load(id).then((bitmap) => { img = bitmap; draw(); }),
      get anim() { return anim; },
      get scale() { return ps.css; },
      size: () => ({ w: CELL.w * ps.css, h: CELL.h * ps.css }),
      // Loop an animation (and come back to it after one-shots).
      loop(name) {
        base = name;
        if (done || holding) return; // we'll return to the new base afterwards
        if (anim !== name) start(name);
      },
      // Play once; resolves when finished (or interrupted).
      play(name, { onFrame: cb } = {}) {
        if (!META.anims[name] || holding) return Promise.resolve();
        if (META.anims[name].loop) { api.loop(name); return Promise.resolve(); }
        done?.();
        return new Promise((resolve) => {
          done = resolve;
          onFrame = cb || null;
          start(name);
        });
      },
      // Briefly swap in a look-alike row (e.g. sit -> sit_blink) without losing the frame.
      flash(name, ms) {
        if (!META.anims[name]) return;
        overlay = { name, until: performance.now() + ms };
        draw();
        setTimeout(draw, ms + 5);
      },
      // Override everything with one looping animation until release().
      // Any one-shot in progress ends immediately so whatever awaited it can move on.
      hold(name) {
        holding = name;
        const finish = done;
        done = null;
        onFrame = null;
        start(name);
        finish?.();
      },
      release() {
        if (!holding) return;
        holding = null;
        start(base);
      },
      stop() { done?.(); done = null; clearTimeout(timer); },
      facing(dir) {
        const was = left;
        left = dir === 'left';
        canvas.style.transform = left ? 'scaleX(-1)' : '';
        if (was !== left) api.onChange?.();
      },
      // The visible area of the current animation, in CSS px inside the element.
      box() {
        const b = marks.box?.[anim] || [0, 0, CELL.w - 1, CELL.h - 1];
        const x0 = left ? CELL.w - 1 - b[2] : b[0];
        return { x: x0 * ps.css, y: b[1] * ps.css, w: (b[2] - b[0] + 1) * ps.css, h: (b[3] - b[1] + 1) * ps.css };
      },
      onChange: null,
      isLeft: () => left,
      // Anchor points in CSS px inside the element (mirrors when facing left).
      point(xy) {
        if (!xy) return null;
        const x = left ? CELL.w - 1 - xy[0] : xy[0];
        return { x: (x + 0.5) * ps.css, y: (xy[1] + 0.5) * ps.css };
      },
      headTop() { return api.point(marks.headTop[anim] || marks.headTop.sit); },
      pawTip() { return api.point(marks.pawTip); },
      noseTip() { return api.point(marks.noseTip); },
      // Is there a visible pixel under this point (CSS px relative to the element)?
      hit(x, y) {
        if (!img) return false;
        const px = Math.floor((x / ps.css) * ps.k);
        const py = Math.floor((y / ps.css) * ps.k);
        if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) return false;
        const sx = left ? canvas.width - 1 - px : px;
        try { return ctx.getImageData(sx, py, 1, 1).data[3] > 80; } catch { return true; }
      },
      rescale() { ps = pixelScale(scale); size(); draw(); },
      destroy() { api.stop(); canvas.remove(); },
    };
    return api;
  }

  // A single pixel effect frame (heart, z, dust, sparkle, star) on its own canvas.
  function fx(name, frame = 0, scale = 3) {
    const c = document.createElement('canvas');
    const ps = pixelScale(scale);
    const n = META.fx.cell;
    c.width = n * ps.k;
    c.height = n * ps.k;
    c.style.width = `${n * ps.css}px`;
    c.style.height = `${n * ps.css}px`;
    const row = META.fx.names.indexOf(name);
    load('fx').then((img) => {
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, frame * n, row * n, n, n, 0, 0, n * ps.k, n * ps.k);
    }).catch(() => {}); // no effects is fine
    return c;
  }

  // An effect whose frame you can switch (e.g. the red button going down when pressed).
  function fxSprite(name, scale = 3) {
    const c = document.createElement('canvas');
    const ps = pixelScale(scale);
    const n = META.fx.cell;
    c.width = n * ps.k;
    c.height = n * ps.k;
    c.style.width = `${n * ps.css}px`;
    c.style.height = `${n * ps.css}px`;
    const row = META.fx.names.indexOf(name);
    const g = c.getContext('2d');
    let img = null;
    let want = 0;
    const draw = () => {
      if (!img) return;
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, c.width, c.height);
      g.drawImage(img, want * n, row * n, n, n, 0, 0, n * ps.k, n * ps.k);
    };
    load('fx').then((bitmap) => { img = bitmap; draw(); }).catch(() => {});
    return { el: c, scale: ps.css, set(frame) { want = frame; draw(); } };
  }

  return { META, setLoader, load, create, fx, fxSprite, sheetId };
})();
