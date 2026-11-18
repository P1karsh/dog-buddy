// Dev only: a tiny stand-in for the chrome.* APIs so the content script and the
// side panel can run in a normal browser tab. Frames on the same page share one mock.
(() => {
  const shared = window.parent !== window && window.parent.__dogMockChrome;
  if (shared) {
    Object.defineProperty(window, 'chrome', { value: shared, configurable: true, writable: true });
    return;
  }
  const store = {};
  const listeners = new Set();
  const clone = (v) => (v === undefined ? undefined : structuredClone(v));
  const today = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };

  const local = {
    async get(keys) {
      const list = keys == null ? Object.keys(store) : Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (k in store) out[k] = clone(store[k]);
      return out;
    },
    async set(obj) {
      const changes = {};
      for (const [k, v] of Object.entries(obj)) {
        changes[k] = { oldValue: clone(store[k]), newValue: clone(v) };
        store[k] = clone(v);
      }
      setTimeout(() => listeners.forEach((fn) => { try { fn(changes, 'local'); } catch (e) { console.error(e); } }), 0);
    },
  };

  const mock = {
    __mock: true,
    __store: store,
    storage: {
      local,
      onChanged: { addListener: (fn) => listeners.add(fn), removeListener: (fn) => listeners.delete(fn) },
    },
    runtime: {
      id: 'dev-playground',
      async sendMessage(msg) {
        if (msg?.type === 'dog:sprite') {
          const buf = new Uint8Array(await (await fetch(`/sprites/${msg.id}.png`)).arrayBuffer());
          let bin = '';
          for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
          return { ok: true, data: btoa(bin) };
        }
        if (msg?.type === 'dog:boop-close') {
          const count = (store.boops?.day === today() ? store.boops.count : 0) + 1;
          await local.set({ boops: { day: today(), count } });
          window.dispatchEvent(new CustomEvent('mock:tab-closed'));
          return { ok: true };
        }
        return undefined;
      },
    },
  };
  window.__dogMockChrome = mock;
  Object.defineProperty(window, 'chrome', { value: mock, configurable: true, writable: true });
})();
