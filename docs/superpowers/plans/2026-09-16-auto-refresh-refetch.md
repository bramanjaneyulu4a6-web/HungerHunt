# Auto-refresh Refetch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the four frontends from doing a full page reload whenever the backend's data-revision counter moves; dispatch a window event instead and have the screens that must stay live refetch in place.

**Architecture:** Each app owns an identical `src/utils/dataAutoRefresh.js` that polls `GET /data-revision` every 4 s. The reload call becomes `window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT))`; the editing/dialog guard, the deferred-refresh flag and the `pauseWhen` option are deleted because they only protected forms from a destructive reload. Screens that need liveness add one `addEventListener(DATA_CHANGED_EVENT, …)` line inside the effect that already owns their loader. Backend untouched.

**Tech Stack:** React 18 + Vite in each app; `node --test` (parent, admin, warehouse) and vitest + jsdom (kiosk) for unit tests; axios clients.

**Spec:** `docs/superpowers/specs/2026-09-16-auto-refresh-refetch-design.md`

## Global Constraints

- The four copies of `dataAutoRefresh.js` must be **byte-identical** after this work (Task 5 diffs them).
- `window.location.reload()` must not appear in any `dataAutoRefresh.js`. The parent `ErrorBoundary` keeps its own reload button; leave it alone.
- The event name is exactly `hungerhunt:data-changed`, exported as `DATA_CHANGED_EVENT` from `dataAutoRefresh.js`.
- **Do not run `git commit` or `git add` from inside a task.** Another session is working in this same tree at the same time. Each task ends by handing the exact file list back; the orchestrator stages those paths and commits.
- Do not touch: `backend/`, `frontend-admin/src/App.jsx`, `frontend-admin/src/pages/Users.jsx`, `frontend-admin/src/pages/Students.jsx`, or anything else under `frontend-admin/src/pages/users/` — those are being edited by the other session.
- Existing timers on the subscribed screens stay (warehouse 15 s, admin 30 s / 60 s). They are the safety net; do not remove them.

---

## The new shared utility (used verbatim by Tasks 1–4)

This is the full replacement for `src/utils/dataAutoRefresh.js` in every app. Copy it exactly; do not adapt it per app.

```js
const MUTATING_METHODS = new Set(["post", "put", "patch", "delete"]);

/* Fired on window when the backend reports that something changed. It carries
 * no detail: it means "refetch what you show", and each screen that wants to
 * stay live subscribes with one addEventListener and calls its own loader. */
export const DATA_CHANGED_EVENT = "hungerhunt:data-changed";

let observedRevision = null;

export const observeMutationRevision = (response) => {
  const method = String(response?.config?.method || "").toLowerCase();
  const revision = response?.headers?.["x-data-revision"];
  if (MUTATING_METHODS.has(method) && revision != null) {
    observedRevision = String(revision);
  }
  return response;
};

/* Polls a data-free backend revision rather than every business endpoint,
 * and announces a change on window for screens to refetch in place.
 *
 * This used to reload the page. A reload threw away scroll position, open
 * dialogs and half-typed forms on every open screen in the school each time
 * anybody, anywhere, wrote anything — several times a minute during a break.
 * Nothing here touches window.location any more.
 *
 * A hidden tab does not poll; the moment it is visible again it checks once,
 * so several changes while it was hidden become one refetch. */
export const startDataAutoRefresh = (api, {
  enabled = () => true,
  intervalMs = 4_000,
} = {}) => {
  let stopped = false;
  let checking = false;

  const check = async () => {
    if (stopped || checking || !enabled()) return;
    if (document.visibilityState !== "visible") return;
    checking = true;
    try {
      const before = observedRevision;
      const response = await api.get("/data-revision", {
        params: { _: Date.now() },
        headers: { "Cache-Control": "no-cache" },
      });
      const next = String(response.data.revision);
      observedRevision = next;
      if (before != null && before !== next) {
        window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
      }
    } catch {
      // Offline and backend restarts are normal transient states; the next
      // successful check catches up.
    } finally {
      checking = false;
    }
  };

  const interval = window.setInterval(check, intervalMs);
  const onFocus = () => check();
  const onVisibility = () => { if (document.visibilityState === "visible") check(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);
  check();

  return () => {
    stopped = true;
    window.clearInterval(interval);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
```

## The `node --test` test file (used verbatim by Tasks 1–3)

Save as `src/utils/dataAutoRefresh.test.js` in the parent, admin and warehouse apps. Identical in all three.

```js
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
```

---

### Task 1: Parent app — utility, test, three live screens

**Files:**
- Modify: `frontend-parent/src/utils/dataAutoRefresh.js` (replace whole file)
- Create: `frontend-parent/src/utils/dataAutoRefresh.test.js`
- Modify: `frontend-parent/src/pages/Dashboard.jsx:3` (import) and `:64-75` (listeners)
- Modify: `frontend-parent/src/pages/Accounts.jsx:3` (import) and `:47-54` (listeners)
- Modify: `frontend-parent/src/pages/ChildDetails.jsx:4` (import), `:213-225` and `:391-402` (listeners)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DATA_CHANGED_EVENT` (string, `'hungerhunt:data-changed'`) exported from `frontend-parent/src/utils/dataAutoRefresh.js`; `startDataAutoRefresh(api, { enabled?, intervalMs? })` — `pauseWhen` no longer accepted.

- [ ] **Step 1: Write the failing test**

Create `frontend-parent/src/utils/dataAutoRefresh.test.js` with the test file above, verbatim.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-parent && node --test src/utils/dataAutoRefresh.test.js`
Expected: FAIL. Several tests fail, e.g. "a revision that moved is announced once" with `seen.length` 0 (the old module reloads instead of dispatching; `DATA_CHANGED_EVENT` is `undefined` so `watch` subscribes to nothing).

- [ ] **Step 3: Replace the utility**

Overwrite `frontend-parent/src/utils/dataAutoRefresh.js` with "The new shared utility" above, verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-parent && node --test src/utils/dataAutoRefresh.test.js`
Expected: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Subscribe `Dashboard.jsx`**

At line 3, next to the existing `PUSH_EVENT` import, add:

```js
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
```

In the effect at lines 64–75, change the listener block so it reads:

```js
    load();
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    const stopWaitingOnPayment = onBackgroundRefreshResumed(load);
    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      stopWaitingOnPayment();
    };
```

- [ ] **Step 6: Subscribe `Accounts.jsx`**

At line 3, next to the existing `PUSH_EVENT` import, add:

```js
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
```

In the effect at lines 47–54, change the listener block so it reads:

```js
    load();
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener(DATA_CHANGED_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener(DATA_CHANGED_EVENT, load);
      window.removeEventListener('focus', load);
    };
```

- [ ] **Step 7: Subscribe both effects in `ChildDetails.jsx`**

At line 4, next to the existing `PUSH_EVENT` import, add:

```js
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
```

The tab effect at lines 213–225 becomes:

```js
  useEffect(() => {
    if (!enabled) return;

    const refresh = () => reload();
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);

    return () => {
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, reload]);
```

The balance effect's listener block at lines 391–402 becomes:

```js
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    window.addEventListener('focus', refresh);
    const stopWaitingOnPayment = onBackgroundRefreshResumed(load);

    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener(DATA_CHANGED_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      stopWaitingOnPayment();
    };
```

Leave the surrounding comments and the `claimBackgroundRefresh` guard exactly as they are.

- [ ] **Step 8: Run the parent suite and lint**

Run: `cd frontend-parent && npm test && npm run lint`
Expected: `ℹ pass 74` (67 existing + 7 new), `ℹ fail 0`; lint exits 0 with no output.

- [ ] **Step 9: Confirm no reload remains in the utility**

Run: `grep -n "location.reload\|pauseWhen\|userIsEditing\|pendingRefresh" frontend-parent/src/utils/dataAutoRefresh.js`
Expected: no output.

- [ ] **Step 10: Hand back for commit**

Do not commit. Report these paths for the orchestrator to stage:
`frontend-parent/src/utils/dataAutoRefresh.js`, `frontend-parent/src/utils/dataAutoRefresh.test.js`, `frontend-parent/src/pages/Dashboard.jsx`, `frontend-parent/src/pages/Accounts.jsx`, `frontend-parent/src/pages/ChildDetails.jsx`.

---

### Task 2: Warehouse app — utility, test, CaretakerOrders

**Files:**
- Modify: `hungerhunt-warehouse/src/utils/dataAutoRefresh.js` (replace whole file)
- Create: `hungerhunt-warehouse/src/utils/dataAutoRefresh.test.js`
- Modify: `hungerhunt-warehouse/src/pages/CaretakerOrders.jsx` (import near the top; new effect after line 173)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DATA_CHANGED_EVENT` exported from `hungerhunt-warehouse/src/utils/dataAutoRefresh.js`.

- [ ] **Step 1: Write the failing test**

Create `hungerhunt-warehouse/src/utils/dataAutoRefresh.test.js` with the test file above, verbatim.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd hungerhunt-warehouse && node --test src/utils/dataAutoRefresh.test.js`
Expected: FAIL (as in Task 1 Step 2).

- [ ] **Step 3: Replace the utility**

Overwrite `hungerhunt-warehouse/src/utils/dataAutoRefresh.js` with "The new shared utility" above, verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd hungerhunt-warehouse && node --test src/utils/dataAutoRefresh.test.js`
Expected: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Subscribe `CaretakerOrders.jsx`**

Add to the imports at the top of the file (next to the existing `import api from '../utils/api'` line):

```js
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
```

Directly after the existing interval effect (lines 170–173, the one with `REFRESH_INTERVAL_MS`), add:

```js
  // The backend announces every change within seconds; the interval above is
  // the safety net for when that announcement is missed.
  useEffect(() => {
    const refresh = () => loadArrivals({ silent: true });
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [loadArrivals]);
```

- [ ] **Step 6: Run the warehouse suite and lint**

Run: `cd hungerhunt-warehouse && npm test && npm run lint`
Expected: pass count = previous count + 7, `ℹ fail 0`; lint exits 0.

- [ ] **Step 7: Confirm no reload remains in the utility**

Run: `grep -n "location.reload\|pauseWhen\|userIsEditing\|pendingRefresh" hungerhunt-warehouse/src/utils/dataAutoRefresh.js`
Expected: no output.

- [ ] **Step 8: Hand back for commit**

Do not commit. Report these paths: `hungerhunt-warehouse/src/utils/dataAutoRefresh.js`, `hungerhunt-warehouse/src/utils/dataAutoRefresh.test.js`, `hungerhunt-warehouse/src/pages/CaretakerOrders.jsx`.

---

### Task 3: Admin app — utility, test, Dashboard and both banners

**Files:**
- Modify: `frontend-admin/src/utils/dataAutoRefresh.js` (replace whole file)
- Create: `frontend-admin/src/utils/dataAutoRefresh.test.js`
- Modify: `frontend-admin/src/pages/Dashboard.jsx` (import; effect at lines 84–97)
- Modify: `frontend-admin/src/components/ReportAlertBanner.jsx` (import; effect at lines 52–57)
- Modify: `frontend-admin/src/components/StockAlertBanner.jsx` (import; effect at lines 45–50)

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DATA_CHANGED_EVENT` exported from `frontend-admin/src/utils/dataAutoRefresh.js`.

- [ ] **Step 1: Write the failing test**

Create `frontend-admin/src/utils/dataAutoRefresh.test.js` with the test file above, verbatim.

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-admin && node --test src/utils/dataAutoRefresh.test.js`
Expected: FAIL (as in Task 1 Step 2).

- [ ] **Step 3: Replace the utility**

Overwrite `frontend-admin/src/utils/dataAutoRefresh.js` with "The new shared utility" above, verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-admin && node --test src/utils/dataAutoRefresh.test.js`
Expected: `ℹ pass 7`, `ℹ fail 0`.

- [ ] **Step 5: Subscribe `Dashboard.jsx`**

Add to the imports (next to the existing `import api from "../utils/api"` line):

```js
import { DATA_CHANGED_EVENT } from "../utils/dataAutoRefresh";
```

The effect at lines 84–97 becomes:

```js
  // Refresh transaction history every 30 seconds, whenever the window regains
  // focus, and the moment the backend announces a change.
  useEffect(() => {
    const initial = setTimeout(fetchHistory, 0);

    const interval = setInterval(fetchHistory, 30000);
    window.addEventListener("focus", fetchHistory);
    window.addEventListener(DATA_CHANGED_EVENT, fetchHistory);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("focus", fetchHistory);
      window.removeEventListener(DATA_CHANGED_EVENT, fetchHistory);
    };
  }, [fetchHistory]);
```

- [ ] **Step 6: Subscribe `ReportAlertBanner.jsx`**

Add to the imports (next to the existing `api` import):

```js
import { DATA_CHANGED_EVENT } from "../utils/dataAutoRefresh";
```

Lines 52–57 become:

```js
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
```

- [ ] **Step 7: Subscribe `StockAlertBanner.jsx`**

Add to the imports (next to the existing `api` import):

```js
import { DATA_CHANGED_EVENT } from "../utils/dataAutoRefresh";
```

Lines 45–50 become:

```js
    load();
    const timer = setInterval(load, POLL_MS);
    window.addEventListener(DATA_CHANGED_EVENT, load);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener(DATA_CHANGED_EVENT, load);
    };
```

- [ ] **Step 8: Run the admin suite and lint**

Run: `cd frontend-admin && npm test && npm run lint`
Expected: pass count = previous count + 7, `ℹ fail 0`; lint exits 0. If lint reports errors **only** in files listed under "Do not touch" in Global Constraints, those belong to the other session — report them and continue.

- [ ] **Step 9: Confirm no reload remains in the utility**

Run: `grep -n "location.reload\|pauseWhen\|userIsEditing\|pendingRefresh" frontend-admin/src/utils/dataAutoRefresh.js`
Expected: no output.

- [ ] **Step 10: Hand back for commit**

Do not commit. Report these paths: `frontend-admin/src/utils/dataAutoRefresh.js`, `frontend-admin/src/utils/dataAutoRefresh.test.js`, `frontend-admin/src/pages/Dashboard.jsx`, `frontend-admin/src/components/ReportAlertBanner.jsx`, `frontend-admin/src/components/StockAlertBanner.jsx`.

---

### Task 4: Kiosk app — utility, vitest test, drop `pauseWhen`

**Files:**
- Modify: `hungerhunt-kiosk/src/utils/dataAutoRefresh.js` (replace whole file)
- Create: `hungerhunt-kiosk/src/utils/dataAutoRefresh.test.js` (vitest, not node:test)
- Modify: `hungerhunt-kiosk/src/App.jsx:52-56`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `DATA_CHANGED_EVENT` exported from `hungerhunt-kiosk/src/utils/dataAutoRefresh.js`. No kiosk screen subscribes.

- [ ] **Step 1: Write the failing test**

The kiosk runs vitest with `environment: 'jsdom'`, so it has a real `window` and `document`; only `visibilityState` and `location.reload` need standing in. Create `hungerhunt-kiosk/src/utils/dataAutoRefresh.test.js`:

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/dataAutoRefresh.test.js`
Expected: FAIL. "a revision that moved is announced once" fails with `expected [] to have a length of 1`; the old module tries `window.location.reload()` and `reloads` would be 1.

- [ ] **Step 3: Replace the utility**

Overwrite `hungerhunt-kiosk/src/utils/dataAutoRefresh.js` with "The new shared utility" above, verbatim.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/dataAutoRefresh.test.js`
Expected: 7 passed.

- [ ] **Step 5: Drop `pauseWhen` from `App.jsx`**

Lines 52–56 currently read:

```jsx
  useEffect(() => startDataAutoRefresh(api, {
    // Never interrupt a student's basket. Inventory is read again at checkout,
    // and the pending revision reloads as soon as that short session ends.
    pauseWhen: () => Boolean(localStorage.getItem("kioskToken")),
  }), []);
```

Replace with:

```jsx
  // Nothing on the kiosk subscribes to the change signal: the till reads
  // inventory fresh at checkout, and a student's basket is never interrupted.
  // Polling still runs so the shared utility behaves the same on every app.
  useEffect(() => startDataAutoRefresh(api), []);
```

- [ ] **Step 6: Run the kiosk suite and lint**

Run: `cd hungerhunt-kiosk && npm test && npm run lint`
Expected: all tests pass (previous count + 7); lint exits 0. `App.test.jsx` mocks `startDataAutoRefresh` as `() => () => {}`, which still matches the new call shape.

- [ ] **Step 7: Confirm no reload remains in the utility**

Run: `grep -n "location.reload\|pauseWhen\|userIsEditing\|pendingRefresh" hungerhunt-kiosk/src/utils/dataAutoRefresh.js hungerhunt-kiosk/src/App.jsx`
Expected: no output.

- [ ] **Step 8: Hand back for commit**

Do not commit. Report these paths: `hungerhunt-kiosk/src/utils/dataAutoRefresh.js`, `hungerhunt-kiosk/src/utils/dataAutoRefresh.test.js`, `hungerhunt-kiosk/src/App.jsx`.

---

### Task 5: Cross-app verification (orchestrator, after Tasks 1–4 are committed)

**Files:** none modified.

- [ ] **Step 1: The four utilities are byte-identical**

Run from the repo root:

```bash
for a in frontend-parent hungerhunt-kiosk hungerhunt-warehouse; do
  diff frontend-admin/src/utils/dataAutoRefresh.js $a/src/utils/dataAutoRefresh.js && echo "$a identical"
done
```

Expected: three lines ending `identical`, no diff output.

- [ ] **Step 2: No reload anywhere but the parent ErrorBoundary**

Run: `grep -rn "location.reload" --include='*.js' --include='*.jsx' --exclude-dir=node_modules --exclude-dir=dist --exclude-dir=android frontend-admin/src frontend-parent/src hungerhunt-kiosk/src hungerhunt-warehouse/src`
Expected: exactly one line, `frontend-parent/src/components/ErrorBoundary.jsx`.

- [ ] **Step 3: All four suites green**

Run each: `cd frontend-parent && npm test`, `cd frontend-admin && npm test`, `cd hungerhunt-warehouse && npm test`, `cd hungerhunt-kiosk && npm test`.
Expected: `fail 0` in each.

- [ ] **Step 4: Manual check before pushing (owner)**

Two parent devices signed in to the same child, kiosk sale on that child: both balances update without the page reloading. Admin dashboard open during a kiosk sale: the new ledger row appears and the scroll position is kept.
