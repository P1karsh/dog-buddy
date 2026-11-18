/* Dog Buddy: background service worker.
   - Opens the side panel when you click the toolbar icon.
   - Hands sprite sheets to pages (so the dog never depends on a site's security rules).
   - Closes a short-form tab after the dog boops it, and counts boops per day.
   - Auto-sleep: tells every tab you're away when Chrome reports you idle. */
importScripts('shared/settings.js');
const S = globalThis.DogSettings;
const CONTENT_FILES = ['shared/settings.js', 'shared/sprite-meta.js', 'shared/sprites.js', 'content/dog.js'];
const SPRITE_IDS = new Set(['golden', 'bernese', 'lab-yellow', 'lab-black', 'lab-chocolate', 'fx']);

// ---- Toolbar icon opens the side panel (or a popup where side panels don't exist)
async function setupActionClick() {
  try {
    if (chrome.sidePanel?.setPanelBehavior) {
      await chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });
    } else {
      await chrome.action.setPopup({ popup: 'panel/panel.html' });
    }
  } catch (e) {
    console.warn('Dog Buddy: could not set up the side panel', e);
  }
}
setupActionClick();

// ---- Auto-sleep -----------------------------------------------------------------
async function getSettings() {
  const { settings } = await chrome.storage.local.get('settings');
  return S.merge(settings);
}

async function applyIdleSettings() {
  const s = await getSettings();
  chrome.idle.setDetectionInterval(Math.max(15, Math.round(s.sleepAfterMin * 60)));
  if (!s.autoSleep) await chrome.storage.local.set({ away: false });
}
applyIdleSettings();

chrome.idle.onStateChanged.addListener(async (state) => {
  const s = await getSettings();
  await chrome.storage.local.set({ away: s.autoSleep && state !== 'active' });
});

chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes.settings) return;
  const before = S.merge(changes.settings.oldValue);
  const after = S.merge(changes.settings.newValue);
  if (before.sleepAfterMin !== after.sleepAfterMin || before.autoSleep !== after.autoSleep) applyIdleSettings();
});

// ---- Booping ----------------------------------------------------------------------
let statsQueue = Promise.resolve();
function countBoop() {
  statsQueue = statsQueue.then(async () => {
    const { boops } = await chrome.storage.local.get('boops');
    const count = S.todayValue(boops, 'count') + 1;
    await chrome.storage.local.set({ boops: { day: S.todayKey(), count } });
  }).catch(() => {});
  return statsQueue;
}

async function closeBoopedTab(tab) {
  await countBoop();
  // Closing the last tab would close the whole window, so open a fresh tab first.
  const siblings = await chrome.tabs.query({ windowId: tab.windowId });
  if (siblings.length <= 1) await chrome.tabs.create({ windowId: tab.windowId });
  await chrome.tabs.remove(tab.id);
}

// ---- Sprite sheets ------------------------------------------------------------------
const spriteCache = new Map();
async function spriteBase64(id) {
  if (!spriteCache.has(id)) {
    spriteCache.set(id, (async () => {
      const buf = new Uint8Array(await (await fetch(chrome.runtime.getURL(`sprites/${id}.png`))).arrayBuffer());
      let bin = '';
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return btoa(bin);
    })());
  }
  return spriteCache.get(id);
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === 'dog:sprite' && SPRITE_IDS.has(msg.id)) {
    spriteBase64(msg.id).then(
      (data) => sendResponse({ ok: true, data }),
      (e) => { spriteCache.delete(msg.id); sendResponse({ ok: false, error: String(e) }); },
    );
    return true;
  }
  if (msg?.type === 'dog:boop-close' && sender.tab?.id != null) {
    closeBoopedTab(sender.tab).then(
      () => sendResponse({ ok: true }),
      (e) => sendResponse({ ok: false, error: String(e) }),
    );
    return true; // we answer asynchronously
  }
  return false;
});

// ---- Install / update ----------------------------------------------------------------
chrome.runtime.onInstalled.addListener(async () => {
  const { settings } = await chrome.storage.local.get('settings');
  await chrome.storage.local.set({ settings: S.merge(settings), away: false });
  await applyIdleSettings();
  await setupActionClick();
  // Put the dog on tabs that were already open (they'd otherwise need a refresh).
  const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
  for (const t of tabs) {
    if (t.discarded || t.id == null) continue;
    chrome.scripting.executeScript({ target: { tabId: t.id }, files: CONTENT_FILES }).catch(() => {});
  }
});
