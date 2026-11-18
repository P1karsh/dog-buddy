/* Dog Buddy: side panel (settings + today's stats). */
(() => {
  const S = globalThis.DogSettings;
  const DS = globalThis.DogSprites;
  DS.setLoader((id) => fetch(`../sprites/${id}.png`).then((r) => r.blob()));

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const COAT_COLORS = { yellow: '#F0D196', black: '#302B2C', chocolate: '#7E4C2E' };
  const BREEDS = {
    golden: { label: 'Golden Retriever', short: 'Golden' },
    bernese: { label: 'Bernese Mountain Dog', short: 'Bernese' },
    lab: { label: 'Labrador', short: 'Lab' },
  };
  const LAB_COATS = { yellow: 'Yellow', black: 'Black', chocolate: 'Chocolate' };

  let settings = S.merge({});
  const stats = { boops: 0, scrollMs: 0 };
  let hero = null;
  let heroKey = '';
  let heroBusy = false;
  let nameTimer = null;

  function save(patch) {
    settings = S.merge({ ...settings, ...patch });
    render();
    return S.save(patch);
  }

  // Picking a dog also picks its default name (Bruno for a yellow Lab, Biscuit otherwise),
  // unless you've given them a name of your own.
  function renameFor(breed, coat) {
    return S.isDefaultName(settings.name) ? { name: S.defaultName(breed, coat) } : {};
  }

  // ---- Build controls once ----------------------------------------------------------
  function buildBreeds() {
    for (const [id, b] of Object.entries(BREEDS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'breed';
      btn.dataset.breed = id;
      btn.title = b.label;
      const mini = document.createElement('span');
      mini.className = 'mini';
      const label = document.createElement('span');
      label.className = 'breed-name';
      label.textContent = b.short;
      btn.append(mini, label);
      btn.addEventListener('click', () => { if (settings.breed !== id) save({ breed: id, ...renameFor(id, settings.labCoat) }); });
      $('breeds').append(btn);
    }
  }

  function buildCoats() {
    for (const [id, label] of Object.entries(LAB_COATS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'coat';
      btn.dataset.coat = id;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = COAT_COLORS[id];
      btn.append(sw, document.createTextNode(label));
      btn.addEventListener('click', () => save({ labCoat: id, ...renameFor(settings.breed, id) }));
      $('coats').append(btn);
    }
  }

  function buildSites() {
    for (const [key, site] of Object.entries(S.SITES)) {
      const chip = document.createElement('label');
      chip.className = 'chip';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = key;
      input.addEventListener('change', () => save({ sites: { ...settings.sites, [key]: input.checked } }));
      const text = document.createElement('span');
      text.textContent = site.label;
      chip.append(input, text);
      $('sites').append(chip);
    }
  }

  function buildSelects() {
    for (const m of S.GRACE_OPTIONS) {
      $('grace').append(new Option(m === 0 ? 'None: boop right away' : `${m} min a day`, String(m)));
    }
    for (const m of S.SLEEP_OPTIONS) {
      $('sleepAfter').append(new Option(`${m} min away`, String(m)));
    }
  }

  // ---- Render --------------------------------------------------------------------------
  function statusText() {
    if (!settings.enabled) return 'Off duty: hidden on all pages';
    const parts = [settings.activity === 'nap' ? 'Napping on your pages' : 'Cheering you on'];
    if (settings.patrol) parts.push('on Shorts patrol');
    return parts.join(' · ');
  }

  function render() {
    const s = settings;
    const name = s.name.trim() || 'Your dog';
    document.querySelectorAll('.dogname').forEach((n) => { n.textContent = name; });
    $('heroName').textContent = name;
    $('heroStatus').textContent = statusText();
    $('enabled').checked = s.enabled;
    document.body.classList.toggle('off', !s.enabled);

    document.querySelectorAll('.breed').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.breed === s.breed)));
    $('coats').hidden = s.breed !== 'lab';
    document.querySelectorAll('.coat').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.coat === s.labCoat)));
    if (document.activeElement !== $('name')) $('name').value = s.name;
    $('name').placeholder = S.defaultName(s.breed, s.labCoat);

    document.querySelectorAll('.choice').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.activity === s.activity)));

    $('patrol').checked = s.patrol;
    $('patrolBody').classList.toggle('dim', !s.patrol);
    document.querySelectorAll('#sites input').forEach((i) => { i.checked = !!s.sites[i.value]; });
    renderCustom();
    $('grace').value = String(s.graceMinutes);

    $('autoSleep').checked = s.autoSleep;
    $('sleepBody').classList.toggle('dim', !s.autoSleep);
    $('sleepAfter').value = String(s.sleepAfterMin);

    renderMinis();
    renderHero();
    renderStats();
  }

  function renderCustom() {
    const list = $('customList');
    const items = settings.customSites.map((site) => {
      const li = document.createElement('li');
      li.className = 'site';
      const name = document.createElement('span');
      name.className = 'site-name';
      name.textContent = site;
      name.title = site;
      const rm = document.createElement('button');
      rm.type = 'button';
      rm.textContent = '×';
      rm.title = `Remove ${site}`;
      rm.setAttribute('aria-label', `Remove ${site}`);
      rm.addEventListener('click', () => {
        showSiteError('');
        save({ customSites: settings.customSites.filter((x) => x !== site) });
      });
      li.append(name, rm);
      return li;
    });
    if (!items.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'None yet. Add any site you lose time on.';
      items.push(li);
    }
    list.replaceChildren(...items);
  }

  function showSiteError(text) {
    const e = $('siteError');
    e.textContent = text || '';
    e.hidden = !text;
  }

  function addSite(raw) {
    const site = S.normalizeSite(raw);
    if (!site) return showSiteError("That doesn't look like a website. Try something like reddit.com");
    if (settings.customSites.includes(site)) return showSiteError(`${site} is already on the list.`);
    const builtIn = Object.entries(S.SITES).find(([, s]) => s.match(new URL(`https://${site}`)));
    if (builtIn) {
      save({ sites: { ...settings.sites, [builtIn[0]]: true } });
      $('newSite').value = '';
      return showSiteError(`${S.SITES[builtIn[0]].label} is built in, so I switched it on.`);
    }
    if (settings.customSites.length >= S.MAX_CUSTOM_SITES) return showSiteError(`That's the limit of ${S.MAX_CUSTOM_SITES} sites.`);
    showSiteError('');
    $('newSite').value = '';
    return save({ customSites: [...settings.customSites, site] });
  }

  const minis = new Map();
  function renderMinis() {
    document.querySelectorAll('.breed').forEach((btn) => {
      const id = btn.dataset.breed;
      const coat = id === 'lab' ? settings.labCoat : '';
      const key = `${id}/${coat}`;
      if (btn.dataset.key === key) return;
      btn.dataset.key = key;
      minis.get(id)?.destroy();
      // Same pixel scale for every breed, so the Bernese really does look bigger.
      const d = DS.create(id, coat, { scale: 2 });
      d.loop('sit');
      minis.set(id, d);
      btn.querySelector('.mini').replaceChildren(d.el);
    });
  }

  function heroRest() {
    if (!hero || heroBusy) return;
    hero.loop(!settings.enabled || settings.activity === 'nap' ? 'sleep' : 'sit');
  }

  function renderHero() {
    const key = `${settings.breed}/${settings.breed === 'lab' ? settings.labCoat : ''}`;
    if (key === heroKey) { heroRest(); return; }
    const first = !heroKey;
    heroKey = key;
    hero?.destroy();
    hero = DS.create(settings.breed, settings.labCoat, { scale: 3 });
    $('heroDog').replaceChildren(hero.el);
    heroBusy = false;
    heroRest();
    if (!first && settings.enabled) hero.ready.then(() => petHero());
  }

  // Signs of life in the preview: blinks and the odd fidget.
  function heroLife() {
    setTimeout(async () => {
      if (hero && !heroBusy && hero.anim === 'sit' && !document.hidden) {
        if (Math.random() < 0.75) hero.flash('sit_blink', 130);
        else {
          heroBusy = true;
          const d = hero;
          await d.play(pick(['ear_twitch', 'tilt', 'yawn']));
          if (d === hero) { heroBusy = false; heroRest(); }
        }
      }
      heroLife();
    }, 2200 + Math.random() * 3500);
  }

  function heroHearts() {
    const box = $('heroDog');
    const p = hero.headTop() || { x: 84, y: 40 };
    [-12, 0, 12].forEach((dx, i) => {
      const c = DS.fx('heart', 0, 2);
      c.className = 'fx';
      c.style.left = `${p.x + dx - 12}px`;
      c.style.top = `${p.y - 10}px`;
      box.append(c);
      const a = c.animate(
        [{ transform: 'translateY(0)', opacity: 0 }, { transform: 'translateY(-8px)', opacity: 1, offset: 0.3 }, { transform: `translate(${dx}px, -30px)`, opacity: 0 }],
        { duration: 1000, delay: i * 110, easing: 'steps(8)', fill: 'both' },
      );
      a.onfinish = () => c.remove();
    });
  }

  function renderStats() {
    $('boopCount').textContent = String(stats.boops);
    $('boopLbl').textContent = stats.boops === 1 ? 'tab booped today' : 'tabs booped today';
    const graceMs = settings.graceMinutes * 60000;
    const meter = $('scrollMeter');
    if (!settings.patrol) {
      $('scrollUsed').textContent = 'Off';
      $('scrollLbl').textContent = 'patrol is off';
      meter.hidden = true;
    } else if (!graceMs) {
      $('scrollUsed').textContent = '0 min';
      $('scrollLbl').textContent = 'grace time, so it\'s an instant boop';
      meter.hidden = true;
    } else {
      const used = Math.min(stats.scrollMs, graceMs);
      $('scrollUsed').textContent = S.fmtTime(used);
      $('scrollLbl').textContent = `of ${settings.graceMinutes} min grace used today`;
      meter.hidden = false;
      $('scrollBar').style.width = `${(used / graceMs) * 100}%`;
    }
  }

  // ---- Petting the preview ------------------------------------------------------------
  async function petHero() {
    if (!hero) return;
    heroHearts();
    if (heroBusy) return;
    heroBusy = true;
    const d = hero;
    if (!settings.enabled || settings.activity === 'nap') {
      await d.play('sleep_twitch');
    } else {
      const tricks = ['spin', 'hop', 'bow', 'happy', 'bark', 'shake', 'roll', 'belly'];
      if (d.breed === 'lab') tricks.push('grin'); // the grin is the Lab's alone
      const t = pick(tricks);
      if (t === 'happy') {
        d.loop('sit_happy');
        await wait(1500);
      } else if (t === 'shake') {
        await d.play('paw_offer');
        await d.play('shake');
      } else if (t === 'belly') {
        await d.play('belly_up');
        await d.play('wake');
      } else {
        await d.play(t);
      }
    }
    if (d === hero) { heroBusy = false; heroRest(); }
  }

  // ---- Events ----------------------------------------------------------------------------
  function bind() {
    $('heroDog').addEventListener('click', petHero);
    // right-click the preview to shake paws, same as on a page
    $('heroDog').addEventListener('contextmenu', async (e) => {
      e.preventDefault();
      if (!hero || heroBusy || !settings.enabled || settings.activity === 'nap') return;
      heroBusy = true;
      const d = hero;
      await d.play('paw_offer');
      await d.play('shake');
      heroHearts();
      if (d === hero) { heroBusy = false; heroRest(); }
    });
    $('enabled').addEventListener('change', (e) => save({ enabled: e.target.checked }));
    $('name').addEventListener('input', (e) => {
      settings = S.merge({ ...settings, name: e.target.value });
      const name = settings.name.trim() || 'Your dog';
      document.querySelectorAll('.dogname').forEach((n) => { n.textContent = name; });
      $('heroName').textContent = name;
      clearTimeout(nameTimer);
      nameTimer = setTimeout(() => S.save({ name: settings.name.trim() }), 350);
    });
    $('name').addEventListener('blur', () => {
      if (!settings.name.trim()) save({ name: S.defaultName(settings.breed, settings.labCoat) });
    });
    document.querySelectorAll('.choice').forEach((c) => {
      c.addEventListener('click', () => save({ activity: c.dataset.activity }));
    });
    $('patrol').addEventListener('change', (e) => save({ patrol: e.target.checked }));
    $('addSite').addEventListener('submit', (e) => {
      e.preventDefault();
      addSite($('newSite').value);
    });
    $('newSite').addEventListener('input', () => showSiteError(''));
    $('grace').addEventListener('change', (e) => save({ graceMinutes: Number(e.target.value) }));
    $('autoSleep').addEventListener('change', (e) => save({ autoSleep: e.target.checked }));
    $('sleepAfter').addEventListener('change', (e) => save({ sleepAfterMin: Number(e.target.value) }));
    $('resetPos').addEventListener('click', async () => {
      await chrome.storage.local.set({ position: S.DEFAULT_POSITION });
      const b = $('resetPos');
      b.textContent = 'Done!';
      setTimeout(() => { b.textContent = 'Reset position'; }, 1200);
    });

    chrome.storage.onChanged.addListener((ch, area) => {
      if (area !== 'local') return;
      if (ch.settings) {
        const typing = document.activeElement === $('name');
        const next = S.merge(ch.settings.newValue);
        settings = typing ? { ...next, name: settings.name } : next;
        render();
      }
      if (ch.boops) {
        const before = stats.boops;
        stats.boops = S.todayValue(ch.boops.newValue, 'count');
        renderStats();
        if (stats.boops > before) {
          const n = $('boopCount');
          n.classList.remove('bump');
          void n.offsetWidth;
          n.classList.add('bump');
        }
      }
      if (ch.scrollTime) {
        stats.scrollMs = S.todayValue(ch.scrollTime.newValue, 'ms');
        renderStats();
      }
    });
  }

  async function refreshStats() {
    const st = await S.load();
    stats.boops = st.boops;
    stats.scrollMs = st.scrollMs;
    renderStats();
  }

  async function init() {
    buildBreeds();
    buildCoats();
    buildSites();
    buildSelects();
    const st = await S.load();
    settings = st.settings;
    stats.boops = st.boops;
    stats.scrollMs = st.scrollMs;
    render();
    bind();
    heroLife();
    setInterval(refreshStats, 60000); // picks up the midnight reset
  }

  init();
})();
