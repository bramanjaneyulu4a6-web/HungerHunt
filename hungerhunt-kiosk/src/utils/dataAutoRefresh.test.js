import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';

/* jsdom's visibilityState and location are read-only; these make them ours
   for the length of a test. */
let visibility = 'visible';
let reloads = 0;

beforeEach(() => {
  visibility = 'visible';
  reloads = 0;
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => visibility,
  });
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: { reload: () => { reloads += 1; } },
  });
  vi.resetModules();
});

afterEach(() => {
  vi.restoreAllMocks();
});

/* observedRevision is module state; resetModules above gives each test a
   module that has seen nothing yet, the same clean slate a page load gives. */
const freshModule = () => import('./dataAutoRefresh.js');

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
const focus = async () => { window.dispatchEvent(new Event('focus')); await settle(); };

const watch = (mod) => {
  const seen = [];
  window.addEventListener(mod.DATA_CHANGED_EVENT, (event) => seen.push(event));
  return seen;
};

const NEVER = 60_000;

describe('data auto-refresh', () => {
  test('the first poll has nothing to compare against and announces nothing', async () => {
    const mod = await freshModule();
    const seen = watch(mod);
    const stop = mod.startDataAutoRefresh(fakeApi([1]), { intervalMs: NEVER });
    await settle();

    expect(seen).toHaveLength(0);
    stop();
  });

  test('a revision that moved is announced once, and the page is not reloaded', async () => {
    const mod = await freshModule();
    const seen = watch(mod);
    const stop = mod.startDataAutoRefresh(fakeApi([1, 2]), { intervalMs: NEVER });
    await settle();
    await focus();

    expect(seen).toHaveLength(1);
    expect(seen[0].type).toBe('hungerhunt:data-changed');
    expect(reloads).toBe(0);
    stop();
  });

  test('an unchanged revision announces nothing', async () => {
    const mod = await freshModule();
    const seen = watch(mod);
    const stop = mod.startDataAutoRefresh(fakeApi([7]), { intervalMs: NEVER });
    await settle();
    await focus();
    await focus();

    expect(seen).toHaveLength(0);
    stop();
  });

  test('a hidden tab does not poll, and catches up with one announcement when shown', async () => {
    const mod = await freshModule();
    const seen = watch(mod);
    const api = fakeApi([1, 5]);
    const stop = mod.startDataAutoRefresh(api, { intervalMs: NEVER });
    await settle();
    expect(api.calls).toHaveLength(1);

    visibility = 'hidden';
    await focus();
    await focus();
    expect(api.calls).toHaveLength(1);
    expect(seen).toHaveLength(0);

    visibility = 'visible';
    document.dispatchEvent(new Event('visibilitychange'));
    await settle();
    expect(api.calls).toHaveLength(2);
    expect(seen).toHaveLength(1);
    stop();
  });

  test('nothing is polled while disabled', async () => {
    const mod = await freshModule();
    const api = fakeApi([1, 2]);
    const stop = mod.startDataAutoRefresh(api, { enabled: () => false, intervalMs: NEVER });
    await settle();
    await focus();

    expect(api.calls).toHaveLength(0);
    stop();
  });

  test("a tab's own write is not announced back to it", async () => {
    const mod = await freshModule();
    const seen = watch(mod);
    const stop = mod.startDataAutoRefresh(fakeApi([1, 3]), { intervalMs: NEVER });
    await settle();

    mod.observeMutationRevision({ config: { method: 'post' }, headers: { 'x-data-revision': '3' } });
    await focus();

    expect(seen).toHaveLength(0);
    stop();
  });

  test('stopping means later focus does not poll', async () => {
    const mod = await freshModule();
    const api = fakeApi([1, 2]);
    const stop = mod.startDataAutoRefresh(api, { intervalMs: NEVER });
    await settle();

    stop();
    await focus();
    expect(api.calls).toHaveLength(1);
  });
});
