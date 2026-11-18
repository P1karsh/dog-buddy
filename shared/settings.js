/* Dog Buddy: shared settings + helpers.
   Loaded by the background worker, the content script and the side panel. */
globalThis.DogSettings = (() => {
  const DEFAULTS = {
    enabled: true,
    breed: 'golden',          // golden | bernese | lab
    labCoat: 'yellow',        // yellow | black | chocolate (lab only)
    name: 'Biscuit',
    activity: 'cheer',        // cheer | nap
    patrol: true,             // close short-form video tabs
    sites: { youtube: true, instagram: true, tiktok: true },
    customSites: [],          // your own extra sites, e.g. "reddit.com" or "facebook.com/reel"
    graceMinutes: 0,          // free short-form minutes per day before the boop
    autoSleep: true,          // nap when you step away from the computer
    sleepAfterMin: 5,
  };

  // Where the dog sits, as a fraction of the free space (0..1) so it fits any window size.
  const DEFAULT_POSITION = { x: 0.8, y: 0 };
  const GRACE_OPTIONS = [0, 1, 2, 5, 10, 15, 30];
  const SLEEP_OPTIONS = [1, 2, 5, 10, 15];

  const SITES = {
    youtube: {
      label: 'YouTube Shorts',
      match: (u) => /(^|\.)youtube\.com$/.test(u.hostname) && /^\/shorts(\/|$)/.test(u.pathname),
    },
    instagram: {
      label: 'Instagram Reels',
      match: (u) => /(^|\.)instagram\.com$/.test(u.hostname) && /^\/reels?(\/|$)/.test(u.pathname),
    },
    tiktok: {
      label: 'TikTok',
      match: (u) => /(^|\.)tiktok\.com$/.test(u.hostname),
    },
  };

  // Easter egg: a yellow Lab is called Bruno by default; every other dog is Biscuit.
  const DEFAULT_NAMES = ['Biscuit', 'Bruno'];
  function defaultName(breed, coat) {
    return breed === 'lab' && (coat || 'yellow') === 'yellow' ? 'Bruno' : 'Biscuit';
  }
  // True while the name is still one we picked (so it follows the breed), not one you typed.
  function isDefaultName(name) {
    const n = String(name || '').trim().toLowerCase();
    return !n || DEFAULT_NAMES.some((d) => d.toLowerCase() === n);
  }

  const pad = (n) => String(n).padStart(2, '0');

  function todayKey(d = new Date()) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const MAX_CUSTOM_SITES = 50;

  function merge(saved) {
    const s = saved && typeof saved === 'object' ? saved : {};
    const custom = Array.isArray(s.customSites) ? s.customSites.filter((x) => typeof x === 'string') : [];
    return {
      ...DEFAULTS,
      ...s,
      sites: { ...DEFAULTS.sites, ...(s.sites || {}) },
      customSites: custom.slice(0, MAX_CUSTOM_SITES),
    };
  }

  // Turn whatever the user typed ("https://www.Reddit.com/r/all/") into "reddit.com/r/all".
  // Returns null if it doesn't look like a website.
  function normalizeSite(input) {
    let text = String(input || '').trim().toLowerCase();
    if (!text) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//.test(text)) text = `https://${text}`;
    let u;
    try { u = new URL(text); } catch { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    const host = u.hostname.replace(/^www\./, '').replace(/\.$/, '');
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host)) return null;
    const path = u.pathname.replace(/\/+$/, '');
    return path && path !== '/' ? host + path : host;
  }

  function matchesCustom(u, entry) {
    const slash = entry.indexOf('/');
    const host = slash === -1 ? entry : entry.slice(0, slash);
    const path = slash === -1 ? '' : entry.slice(slash);
    const h = u.hostname.toLowerCase();
    if (h !== host && !h.endsWith(`.${host}`)) return false;
    // A path is a prefix: "facebook.com/reel" covers /reel/123 and /reels.
    return !path || u.pathname.toLowerCase().startsWith(path);
  }

  // Daily counters are stored as { day, value }. Anything from an earlier day counts as 0.
  function todayValue(rec, field) {
    return rec && rec.day === todayKey() ? Number(rec[field]) || 0 : 0;
  }

  function shortFormSite(href, settings) {
    let u;
    try { u = new URL(href); } catch { return null; }
    for (const [key, site] of Object.entries(SITES)) {
      if (settings.sites[key] && site.match(u)) return key;
    }
    for (const entry of settings.customSites || []) {
      if (matchesCustom(u, entry)) return `custom:${entry}`;
    }
    return null;
  }

  async function load() {
    const r = await chrome.storage.local.get(['settings', 'position', 'away', 'scrollTime', 'boops']);
    return {
      settings: merge(r.settings),
      position: r.position || DEFAULT_POSITION,
      away: !!r.away,
      scrollMs: todayValue(r.scrollTime, 'ms'),
      boops: todayValue(r.boops, 'count'),
    };
  }

  async function save(patch) {
    const { settings } = await chrome.storage.local.get('settings');
    const next = merge({ ...merge(settings), ...patch });
    await chrome.storage.local.set({ settings: next });
    return next;
  }

  function fmtTime(ms) {
    const t = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(t / 60)}:${pad(t % 60)}`;
  }

  return {
    DEFAULTS, DEFAULT_POSITION, GRACE_OPTIONS, SLEEP_OPTIONS, SITES, MAX_CUSTOM_SITES,
    todayKey, merge, todayValue, normalizeSite, shortFormSite, load, save, fmtTime,
    defaultName, isDefaultName,
  };
})();
