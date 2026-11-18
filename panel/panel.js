/* Dog Buddy: side panel (settings + today's stats). */
(() => {
  const S = globalThis.DogSettings;
  const Art = globalThis.DogArt;
  Art.adoptCss(document);

  const $ = (id) => document.getElementById(id);
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const COAT_COLORS = { yellow: '#F0D196', black: '#302B2C', chocolate: '#7E4C2E' };

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

  // ---- Build controls once ----------------------------------------------------------
  function buildBreeds() {
    for (const [id, b] of Object.entries(Art.BREEDS)) {
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
      btn.addEventListener('click', () => { if (settings.breed !== id) save({ breed: id }); });
      $('breeds').append(btn);
    }
  }

  function buildCoats() {
    for (const [id, label] of Object.entries(Art.LAB_COATS)) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'coat';
      btn.dataset.coat = id;
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.background = COAT_COLORS[id];
      btn.append(sw, document.createTextNode(label));
      btn.addEventListener('click', () => save({ labCoat: id }));
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

  function renderMinis() {
    document.querySelectorAll('.breed').forEach((btn) => {
      const id = btn.dataset.breed;
      const coat = id === 'lab' ? settings.labCoat : '';
      const key = `${id}/${coat}`;
      if (btn.dataset.key === key) return;
      btn.dataset.key = key;
      const d = Art.create(id, coat);
      d.wag('slow');
      // Draw the minis to scale, so the Bernese looks bigger here too.
      d.el.style.width = `${Math.round((Art.BREEDS[id].size / Art.BREEDS.bernese.size) * 125)}%`;
      btn.querySelector('.mini').replaceChildren(d.el);
    });
  }

  function heroRest() {
    if (!hero || heroBusy) return;
    if (!settings.enabled || settings.activity === 'nap') {
      hero.facing('right');
      hero.pose('lie');
      hero.face('sleep');
      hero.wag('none');
    } else {
      hero.pose('sit');
      hero.face('normal');
      hero.wag('normal');
    }
  }

  function renderHero() {
    const key = `${settings.breed}/${settings.breed === 'lab' ? settings.labCoat : ''}`;
    if (key === heroKey) { heroRest(); return; }
    const first = !heroKey;
    heroKey = key;
    hero = Art.create(settings.breed, settings.labCoat);
    hero.el.style.width = `${Math.round(hero.size * 1.08)}px`;
    $('heroDog').replaceChildren(hero.el);
    heroBusy = false;
    heroRest();
    if (!first && settings.enabled) petHero();
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
    hero.hearts();
    if (heroBusy) return;
    heroBusy = true;
    const d = hero;
    if (!settings.enabled || settings.activity === 'nap') {
      d.face('happy');
      d.wag('slow');
      await wait(1400);
    } else {
      d.face('happy');
      d.wag('fast');
      const t = pick(['hop', 'twirl', 'tilt', 'bow']);
      if (t === 'twirl' || t === 'bow') d.pose('stand');
      await d.trick(t);
      await wait(250);
    }
    if (d === hero) { heroBusy = false; heroRest(); }
  }

  // ---- Events ----------------------------------------------------------------------------
  function bind() {
    $('heroDog').addEventListener('click', petHero);
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
      if (!settings.name.trim()) save({ name: S.DEFAULTS.name });
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
    setInterval(refreshStats, 60000); // picks up the midnight reset
  }

  init();
})();
