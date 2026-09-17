import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/* jsdom's visibilityState and location are read-only, and this environment
   has no usable sessionStorage or fetch; these make them ours for the length
   of a test. The focused element and open overlays are real DOM. */
let visibility = 'visible';
let reloads = 0;
let fetches = [];
let responses = [];
let stored = new Map();

beforeEach(() => {
  visibility = 'visible';
  reloads = 0;
  fetches = [];
  responses = [];
  stored = new Map();
  document.body.innerHTML = '';
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: () => { reloads += 1; } },
  });
  vi.stubGlobal('fetch', async (url, init) => {
    fetches.push({ url, init });
    const next = responses.length > 1 ? responses.shift() : responses[0];
    if (next instanceof Error) throw next;
    return next;
  });
  vi.stubGlobal('sessionStorage', {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => { stored.set(key, String(value)); },
  });
  vi.resetModules();
});

afterEach(() => {
  delete window.Capacitor;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const freshModule = () => import('./deployWatch.js');

const served = (commit, builtAt) => ({
  ok: true,
  json: async () => ({ app: 'hungerhunt-kiosk', commit, builtAt, ref: 'main', env: 'production' }),
});

const BAKED = 'abc1234@2026-09-17T10:00:00.000Z';
const SAME = served('abc1234', '2026-09-17T10:00:00.000Z');
const NEWER = served('def5678', '2026-09-17T11:00:00.000Z');
const NEWER_STAMP = 'def5678@2026-09-17T11:00:00.000Z';

const NEVER = 60_000;
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const focus = async () => { window.dispatchEvent(new Event('focus')); await settle(); };

describe('deploy watch', () => {
  test('asks nothing at start-up', async () => {
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await settle();
    expect(fetches).toHaveLength(0);
    stop();
  });

  test('the same build leaves the till alone', async () => {
    responses = [SAME];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await focus();
    expect(fetches).toHaveLength(1);
    expect(reloads).toBe(0);
    stop();
  });

  test('a newer build reloads and sets the loop guard', async () => {
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await focus();
    expect(reloads).toBe(1);
    expect(stored.get(mod.DEPLOY_RELOAD_KEY)).toBe(NEWER_STAMP);
    stop();
  });

  // The kiosk passes canReload: () => !isOrderSessionActive().
  test('an order session in progress holds the reload until it ends', async () => {
    responses = [NEWER];
    let inSession = true;
    const mod = await freshModule();
    const stop = mod.startDeployWatch({
      bakedStamp: BAKED, canReload: () => !inSession, intervalMs: NEVER, retryMs: 5,
    });
    await focus();
    await wait(20);
    expect(reloads).toBe(0);
    inSession = false;
    await wait(40);
    expect(reloads).toBe(1);
    stop();
  });

  test('a focused admission-number field defers the reload', async () => {
    responses = [NEWER];
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.focus();
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
    await focus();
    await wait(20);
    expect(reloads).toBe(0);
    input.blur();
    await wait(40);
    expect(reloads).toBe(1);
    stop();
  });

  test('an open dialog defers the reload', async () => {
    responses = [NEWER];
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.appendChild(dialog);
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
    await focus();
    await wait(20);
    expect(reloads).toBe(0);
    dialog.remove();
    await wait(40);
    expect(reloads).toBe(1);
    stop();
  });

  test('a hidden tab neither asks nor reloads', async () => {
    visibility = 'hidden';
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await focus();
    expect(fetches).toHaveLength(0);
    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(reloads).toBe(1);
    stop();
  });

  test('never reloads twice for the same build', async () => {
    responses = [NEWER];
    stored.set('hungerhunt:deploy-reload', NEWER_STAMP);
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: 5 });
    await focus();
    await wait(30);
    expect(reloads).toBe(0);
    stop();
  });

  test('a failed check is ignored', async () => {
    responses = [new Error('offline'), NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: NEVER, retryMs: NEVER });
    await focus();
    expect(reloads).toBe(0);
    await focus();
    expect(reloads).toBe(1);
    stop();
  });

  // The sideloaded APK serves its own bundled version.json.
  test('inside the native shell it does nothing', async () => {
    window.Capacitor = { isNativePlatform: () => true };
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: 5, retryMs: 5 });
    await focus();
    await wait(20);
    expect(fetches).toHaveLength(0);
    expect(reloads).toBe(0);
    stop();
  });

  test('with no stamp it does nothing', async () => {
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: undefined, intervalMs: 5, retryMs: 5 });
    await focus();
    await wait(20);
    expect(fetches).toHaveLength(0);
    stop();
  });

  test('the session boundary reloads a pending build even over its own dialog', async () => {
    responses = [NEWER];
    const mod = await freshModule();
    expect(mod.reloadIfDeployPending()).toBe(false);
    const stop = mod.startDeployWatch({
      bakedStamp: BAKED, canReload: () => false, intervalMs: NEVER, retryMs: NEVER,
    });
    await focus();
    const dialog = document.createElement('div');
    dialog.className = 'modal';
    document.body.appendChild(dialog);
    expect(mod.reloadIfDeployPending()).toBe(true);
    expect(reloads).toBe(1);
    stop();
  });

  test('stop ends the checks', async () => {
    responses = [NEWER];
    const mod = await freshModule();
    const stop = mod.startDeployWatch({ bakedStamp: BAKED, intervalMs: 5, retryMs: 5 });
    stop();
    await focus();
    await wait(30);
    expect(fetches).toHaveLength(0);
    expect(reloads).toBe(0);
  });
});
