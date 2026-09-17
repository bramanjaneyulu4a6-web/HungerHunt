import test from 'node:test';
import assert from 'node:assert/strict';

/* Node has no window or document. These stand in the parts the watcher
   touches: focus and visibility listeners, intervals the tests clear, a fetch
   that answers from a queue, a sessionStorage, the focused element and any
   open overlay, and a location whose reloads are counted. */
const installFakeBrowser = (t, { visibilityState = 'visible', native = false, storage = true } = {}) => {
  const windowListeners = new Map();
  const documentListeners = new Map();
  const on = (map) => (type, fn) => map.set(type, [...(map.get(type) || []), fn]);
  const off = (map) => (type, fn) => map.set(type, (map.get(type) || []).filter((f) => f !== fn));
  const fire = (map) => (type, event = { type }) => (map.get(type) || []).forEach((fn) => fn(event));

  const intervals = new Set();
  const browser = {
    reloads: 0,
    fetches: [],
    responses: [],
    activeTag: 'BODY',
    contentEditable: false,
    overlay: false,
    stored: new Map(),
    intervals,
  };

  globalThis.window = {
    addEventListener: on(windowListeners),
    removeEventListener: off(windowListeners),
    dispatchEvent: (event) => { fire(windowListeners)(event.type, event); return true; },
    setInterval: (fn, ms) => { const id = setInterval(fn, ms); intervals.add(id); return id; },
    clearInterval: (id) => { clearInterval(id); intervals.delete(id); },
    location: { reload: () => { browser.reloads += 1; } },
    fetch: async (url, init) => {
      browser.fetches.push({ url, init });
      const next = browser.responses.length > 1 ? browser.responses.shift() : browser.responses[0];
      if (next instanceof Error) throw next;
      return next;
    },
    listenerCount: (type) => (windowListeners.get(type) || []).length,
  };
  if (native) window.Capacitor = { isNativePlatform: () => true };
  if (storage) {
    window.sessionStorage = {
      getItem: (key) => (browser.stored.has(key) ? browser.stored.get(key) : null),
      setItem: (key, value) => { browser.stored.set(key, String(value)); },
    };
  } else {
    Object.defineProperty(window, 'sessionStorage', {
      get: () => { throw new Error('SecurityError: storage is disabled'); },
    });
  }

  globalThis.document = {
    visibilityState,
    get activeElement() {
      return { tagName: browser.activeTag, isContentEditable: browser.contentEditable };
    },
    querySelector: () => (browser.overlay ? {} : null),
    addEventListener: on(documentListeners),
    removeEventListener: off(documentListeners),
    fire: fire(documentListeners),
    listenerCount: (type) => (documentListeners.get(type) || []).length,
  };

  t.after(() => {
    intervals.forEach((id) => clearInterval(id));
    delete globalThis.window;
    delete globalThis.document;
  });

  return browser;
};

/* Pending state is module state, and each test wants a module that has seen
   nothing yet — the same clean slate a page load gives it. */
const freshModule = () => import(`./deployWatch.js?fresh=${Math.random()}`);

const served = (commit, builtAt) => ({
  ok: true,
  json: async () => ({ app: 'x', commit, builtAt, ref: 'main', env: 'production' }),
});

const BAKED = 'abc1234@2026-09-17T10:00:00.000Z';
const SAME = served('abc1234', '2026-09-17T10:00:00.000Z');
const NEWER = served('def5678', '2026-09-17T11:00:00.000Z');
const NEWER_STAMP = 'def5678@2026-09-17T11:00:00.000Z';

const NEVER = 60_000;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const focus = async () => { window.dispatchEvent({ type: 'focus' }); await settle(); };

test('stampOf joins commit and build time, and refuses a partial stamp', async (t) => {
  installFakeBrowser(t);
  const { stampOf } = await freshModule();
  assert.equal(stampOf({ commit: 'abc1234', builtAt: '2026-09-17T10:00:00.000Z' }), BAKED);
  assert.equal(stampOf({ commit: 'abc1234' }), null);
  assert.equal(stampOf({ builtAt: '2026-09-17T10:00:00.000Z' }), null);
  assert.equal(stampOf({ commit: '', builtAt: 'x' }), null);
  assert.equal(stampOf(null), null);
  assert.equal(stampOf(undefined), null);
});

// A page that has just loaded is the current build by definition.
test('asks nothing at start-up', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await settle();
  assert.equal(browser.fetches.length, 0);
  assert.equal(browser.reloads, 0);
  stop();
});

test('the same build deployed leaves the page alone', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [SAME];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.reloads, 0);
  stop();
});

test('checks with a cache-busting request', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [SAME];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.match(browser.fetches[0].url, /^\/version\.json\?_=\d+$/);
  assert.equal(browser.fetches[0].init.cache, 'no-store');
  stop();
});

test('a newer build reloads the page and remembers which build it reloaded for', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.equal(browser.reloads, 1);
  assert.equal(browser.stored.get(mod.DEPLOY_RELOAD_KEY), NEWER_STAMP);
  assert.equal(mod.DEPLOY_RELOAD_KEY, 'hungerhunt:deploy-reload');
  stop();
});

test('the periodic check runs on its own clock', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: 5, retryMs: NEVER });
  await wait(40);
  assert.ok(browser.fetches.length >= 1);
  assert.equal(browser.reloads, 1);
  stop();
});

for (const tag of ['INPUT', 'TEXTAREA', 'SELECT']) {
  test(`a focused ${tag} defers the reload until it is left`, async (t) => {
    const browser = installFakeBrowser(t);
    browser.responses = [NEWER];
    browser.activeTag = tag;
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
    await focus();
    await wait(20);
    assert.equal(browser.reloads, 0);

    browser.activeTag = 'BODY';
    await wait(40);
    assert.equal(browser.reloads, 1);
    assert.equal(browser.fetches.length, 1, 'the retry makes no request');
    stop();
  });
}

test('a contentEditable element defers the reload', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  browser.activeTag = 'DIV';
  browser.contentEditable = true;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  await wait(20);
  assert.equal(browser.reloads, 0);
  browser.contentEditable = false;
  await wait(40);
  assert.equal(browser.reloads, 1);
  stop();
});

test('an open dialog defers the reload until it closes', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  browser.overlay = true;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  await wait(20);
  assert.equal(browser.reloads, 0);
  browser.overlay = false;
  await wait(40);
  assert.equal(browser.reloads, 1);
  stop();
});

test('looks for every kind of overlay the four apps use', async (t) => {
  installFakeBrowser(t);
  const selectors = [];
  document.querySelector = (selector) => { selectors.push(selector); return null; };
  window.fetch = async () => NEWER;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.deepEqual(selectors, ['[role="dialog"], .modal, .modal-backdrop, .wh-dialog-backdrop, .wh-sheet']);
  stop();
});

test('a hidden tab neither asks nor reloads, and checks once it is visible', async (t) => {
  const browser = installFakeBrowser(t, { visibilityState: 'hidden' });
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.equal(browser.fetches.length, 0);

  document.visibilityState = 'visible';
  document.fire('visibilitychange');
  await settle();
  assert.equal(browser.fetches.length, 1);
  assert.equal(browser.reloads, 1);
  stop();
});

test('a tab hidden after the check waits to be visible before reloading', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  browser.overlay = true;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  browser.overlay = false;
  document.visibilityState = 'hidden';
  await wait(40);
  assert.equal(browser.reloads, 0);
  document.visibilityState = 'visible';
  await wait(40);
  assert.equal(browser.reloads, 1);
  stop();
});

test('canReload holds the reload back until it allows it', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  let allowed = false;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({
    bakedStamp: BAKED, canReload: () => allowed, intervalMs: NEVER, retryMs: 5,
  });
  await focus();
  await wait(20);
  assert.equal(browser.reloads, 0);
  allowed = true;
  await wait(40);
  assert.equal(browser.reloads, 1);
  stop();
});

// If the CDN ever served a new version.json beside an old index.html, the
// reloaded page would still be the old build and would reload again, forever.
test('never reloads twice in one tab for the same build', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  browser.stored.set('hungerhunt:deploy-reload', NEWER_STAMP);
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  await wait(30);
  assert.equal(browser.reloads, 0);
  stop();
});

test('a later build still reloads a tab that was guarded for an earlier one', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [served('9999999', '2026-09-17T12:00:00.000Z')];
  browser.stored.set('hungerhunt:deploy-reload', NEWER_STAMP);
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.equal(browser.reloads, 1);
  assert.equal(browser.stored.get('hungerhunt:deploy-reload'), '9999999@2026-09-17T12:00:00.000Z');
  stop();
});

test('still reloads when sessionStorage is unavailable', async (t) => {
  const browser = installFakeBrowser(t, { storage: false });
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  await focus();
  assert.equal(browser.reloads, 1);
  stop();
});

// A deploy rolled back before this tab got round to reloading.
test('the running build served again cancels a pending reload', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER, SAME];
  browser.overlay = true;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  await focus();
  browser.overlay = false;
  await wait(40);
  assert.equal(browser.reloads, 0);
  assert.equal(mod.reloadIfDeployPending(), false);
  stop();
});

for (const [name, response] of [
  ['a failed request', new Error('offline')],
  ['a non-OK response', { ok: false, json: async () => ({ commit: 'def5678', builtAt: 'x' }) }],
  ['a body that is not JSON', { ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } }],
  ['a stamp with fields missing', { ok: true, json: async () => ({ app: 'x' }) }],
]) {
  test(`${name} is ignored and the next check tries again`, async (t) => {
    const browser = installFakeBrowser(t);
    browser.responses = [response, NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await focus();
    assert.equal(browser.reloads, 0);
    await focus();
    assert.equal(browser.reloads, 1);
    stop();
  });
}

test('a check already in flight is not doubled', async (t) => {
  const browser = installFakeBrowser(t);
  let answer;
  window.fetch = (url, init) => {
    browser.fetches.push({ url, init });
    return new Promise((resolve) => { answer = resolve; });
  };
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  window.dispatchEvent({ type: 'focus' });
  window.dispatchEvent({ type: 'focus' });
  await settle();
  assert.equal(browser.fetches.length, 1);
  answer(SAME);
  await settle();
  stop();
});

for (const [name, options, setup] of [
  ['a native shell', { bakedStamp: BAKED }, { native: true }],
  ['a build with no stamp', { bakedStamp: undefined }, {}],
  ['an empty stamp', { bakedStamp: '' }, {}],
]) {
  test(`${name} does nothing at all`, async (t) => {
    const browser = installFakeBrowser(t, setup);
    browser.responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ ...options, intervalMs: 5, retryMs: 5 });
    await focus();
    document.fire('visibilitychange');
    await wait(20);
    assert.equal(browser.fetches.length, 0);
    assert.equal(browser.reloads, 0);
    assert.equal(window.listenerCount('focus'), 0);
    assert.equal(document.listenerCount('visibilitychange'), 0);
    assert.equal(browser.intervals.size, 0);
    assert.equal(typeof stop, 'function');
    stop();
  });
}

test('stop removes every listener and timer', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: 5, retryMs: 5 });
  assert.equal(window.listenerCount('focus'), 1);
  assert.equal(document.listenerCount('visibilitychange'), 1);
  assert.equal(browser.intervals.size, 2);
  stop();
  assert.equal(window.listenerCount('focus'), 0);
  assert.equal(document.listenerCount('visibilitychange'), 0);
  assert.equal(browser.intervals.size, 0);
  await wait(30);
  assert.equal(browser.fetches.length, 0);
});

test('reloadIfDeployPending does nothing when no deploy is pending', async (t) => {
  const browser = installFakeBrowser(t);
  const mod = await freshModule();
  assert.equal(mod.reloadIfDeployPending(), false);
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
  assert.equal(mod.reloadIfDeployPending(), false);
  assert.equal(browser.reloads, 0);
  stop();
});

// Called only at the end of a kiosk session, when anything on screen
// belonged to the session that just ended.
test('reloadIfDeployPending reloads a pending deploy even over a dialog', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({
    bakedStamp: BAKED, canReload: () => false, intervalMs: NEVER, retryMs: NEVER,
  });
  await focus();
  assert.equal(browser.reloads, 0);
  browser.overlay = true;
  browser.activeTag = 'INPUT';
  assert.equal(mod.reloadIfDeployPending(), true);
  assert.equal(browser.reloads, 1);
  stop();
});

test('reloadIfDeployPending respects visibility and the loop guard', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  const mod = await freshModule();
  const stop = mod.startDeployWatch({
    bakedStamp: BAKED, canReload: () => false, intervalMs: NEVER, retryMs: NEVER,
  });
  await focus();

  document.visibilityState = 'hidden';
  assert.equal(mod.reloadIfDeployPending(), false);

  document.visibilityState = 'visible';
  browser.stored.set('hungerhunt:deploy-reload', NEWER_STAMP);
  assert.equal(mod.reloadIfDeployPending(), false);
  assert.equal(browser.reloads, 0);
  stop();
});

test('a stopped watcher does not reload on a retry tick', async (t) => {
  const browser = installFakeBrowser(t);
  browser.responses = [NEWER];
  browser.overlay = true;
  const mod = await freshModule();
  const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
  await focus();
  stop();
  browser.overlay = false;
  await wait(30);
  assert.equal(browser.reloads, 0);
});
