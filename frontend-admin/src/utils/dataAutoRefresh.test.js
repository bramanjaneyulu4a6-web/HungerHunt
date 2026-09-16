import test from 'node:test';
import assert from 'node:assert/strict';

/* Node has no window or document. These stand in the parts the util touches:
   focus and visibility listeners, an interval that the tests never let fire,
   a location whose reload must stay uncalled, and an event target to catch
   the change signal on. */
const installFakeBrowser = (t, { visibilityState = 'visible' } = {}) => {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const on = (map) => (type, fn) => map.set(type, [...(map.get(type) || []), fn]);
  const off = (map) => (type, fn) => map.set(type, (map.get(type) || []).filter((f) => f !== fn));
  const fire = (map) => (type, event = { type }) => (map.get(type) || []).forEach((fn) => fn(event));

  const intervals = new Set();
  const browser = { reloads: 0 };

  globalThis.window = {
    addEventListener: on(windowListeners),
    removeEventListener: off(windowListeners),
    dispatchEvent: (event) => { fire(windowListeners)(event.type, event); return true; },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); intervals.add(id); return id; },
    clearInterval: (id) => { clearInterval(id); intervals.delete(id); },
    location: { reload: () => { browser.reloads += 1; } },
    listenerCount: (type) => (windowListeners.get(type) || []).length,
  };
  globalThis.document = {
    visibilityState,
    addEventListener: on(documentListeners),
    removeEventListener: off(documentListeners),
    fire: fire(documentListeners),
    listenerCount: (type) => (documentListeners.get(type) || []).length,
  };
  if (typeof globalThis.CustomEvent !== 'function') {
    globalThis.CustomEvent = class {
      constructor(type, init) { this.type = type; this.detail = init?.detail; }
    };
  }

  t.after(() => {
    intervals.forEach((id) => clearInterval(id));
    delete globalThis.window;
    delete globalThis.document;
  });

  return browser;
};

/* observedRevision is module state, and each test wants a module that has
   seen nothing yet — the same clean slate a page load gives it. */
const freshModule = () => import(`./dataAutoRefresh.js?fresh=${Math.random()}`);

/* Answers each poll with the next revision in the list, then keeps answering
   with the last one. */
const fakeApi = (revisions) => {
  const calls = [];
  return {
    calls,
    get: async (path, options) => {
      calls.push({ path, options });
      const revision = revisions.length > 1 ? revisions.shift() : revisions[0];
      return { data: { revision } };
    },
  };
};

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const focus = async () => { window.dispatchEvent({ type: 'focus' }); await settle(); };

const watch = (mod) => {
  const seen = [];
  window.addEventListener(mod.DATA_CHANGED_EVENT, (event) => seen.push(event));
  return seen;
};

const NEVER = 60_000;

test('the first poll has nothing to compare against and announces nothing', async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const seen = watch(mod);
  const stop = mod.startDataAutoRefresh(fakeApi([1]), { intervalMs: NEVER });
  await settle();

  assert.equal(seen.length, 0);
  stop();
});

test('a revision that moved is announced once, and the page is not reloaded', async (t) => {
  const browser = installFakeBrowser(t);
  const mod = await freshModule();
  const seen = watch(mod);
  const stop = mod.startDataAutoRefresh(fakeApi([1, 2]), { intervalMs: NEVER });
  await settle();
  await focus();

  assert.equal(seen.length, 1);
  assert.equal(seen[0].type, 'hungerhunt:data-changed');
  assert.equal(browser.reloads, 0);
  stop();
});

test('an unchanged revision announces nothing', async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const seen = watch(mod);
  const stop = mod.startDataAutoRefresh(fakeApi([7]), { intervalMs: NEVER });
  await settle();
  await focus();
  await focus();

  assert.equal(seen.length, 0);
  stop();
});

test('a hidden tab does not poll, and catches up with one announcement when shown', async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const seen = watch(mod);
  const api = fakeApi([1, 5]);
  const stop = mod.startDataAutoRefresh(api, { intervalMs: NEVER });
  await settle();
  assert.equal(api.calls.length, 1);

  document.visibilityState = 'hidden';
  await focus();
  await focus();
  assert.equal(api.calls.length, 1, 'polled while hidden');
  assert.equal(seen.length, 0);

  document.visibilityState = 'visible';
  document.fire('visibilitychange');
  await settle();
  assert.equal(api.calls.length, 2);
  assert.equal(seen.length, 1);
  stop();
});

test('nothing is polled while disabled', async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const api = fakeApi([1, 2]);
  const stop = mod.startDataAutoRefresh(api, { enabled: () => false, intervalMs: NEVER });
  await settle();
  await focus();

  assert.equal(api.calls.length, 0);
  stop();
});

test("a tab's own write is not announced back to it", async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const seen = watch(mod);
  const stop = mod.startDataAutoRefresh(fakeApi([1, 3]), { intervalMs: NEVER });
  await settle();

  mod.observeMutationRevision({ config: { method: 'post' }, headers: { 'x-data-revision': '3' } });
  await focus();

  assert.equal(seen.length, 0);
  stop();
});

test('stopping removes the listeners and the interval', async (t) => {
  installFakeBrowser(t);
  const mod = await freshModule();
  const api = fakeApi([1, 2]);
  const stop = mod.startDataAutoRefresh(api, { intervalMs: NEVER });
  await settle();

  stop();
  assert.equal(window.listenerCount('focus'), 0);
  assert.equal(document.listenerCount('visibilitychange'), 0);

  await focus();
  assert.equal(api.calls.length, 1, 'polled after stop');
});
