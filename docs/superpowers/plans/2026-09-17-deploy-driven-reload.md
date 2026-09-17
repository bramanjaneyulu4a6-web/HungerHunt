# Deploy-Driven Reload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open tabs of the four HungerHunt frontends reload themselves when a newer build of their app is deployed, never mid-edit and never during a kiosk order session.

**Architecture:** A shared Vite plugin computes the build stamp once, bakes it into the bundle as `import.meta.env.VITE_BUILD_STAMP` and emits `version.json` from the same object. A byte-identical `src/utils/deployWatch.js` in each app polls `/version.json` every 5 minutes and reloads when the deployed stamp differs, deferred while editing / hidden / `canReload()` false. The kiosk marks its order session active while `KioskBilling` is mounted and reloads at the session boundary.

**Tech Stack:** Vite 8 (rolldown), React 19, node `--test` (parent, admin, warehouse), vitest 4 + jsdom (kiosk).

**Spec:** `docs/superpowers/specs/2026-09-17-deploy-driven-reload-design.md`

## Global Constraints

- `src/utils/deployWatch.js` must be **byte-identical** in `frontend-parent`, `frontend-admin`, `hungerhunt-warehouse`, `hungerhunt-kiosk` (check with `md5`).
- `src/utils/deployWatch.test.js` must be byte-identical in parent, admin, warehouse (node `--test`); the kiosk has its own vitest version.
- `src/utils/dataAutoRefresh.js` is **not touched** in any app.
- `deployWatch.js` imports nothing and never references `hungerhunt:data-changed`.
- Stamp format: `` `${commit}@${builtAt}` ``, fields straight from `buildVersionPayload`.
- Defaults: `intervalMs = 300_000`, `retryMs = 15_000`; loop-guard key `hungerhunt:deploy-reload` in `sessionStorage`.
- Editing guard selector, verbatim: `'[role="dialog"], .modal, .modal-backdrop, .wh-dialog-backdrop, .wh-sheet'`; active element tags `INPUT`, `TEXTAREA`, `SELECT`, or `isContentEditable`.
- No backend changes. No `vercel.json` changes.
- **Shared working tree:** other sessions edit this repo concurrently. Never `git stash`. Run `git status` before each commit, inspect `git diff <path>` for every file before staging it, stage by explicit path only (never `git add -A` / `git add .`). If a file has changes you did not make, stop and report.
- Commit messages end with a blank line then `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>` (use the model name your session reminder gives, if different).
- Do **not** push.
- Match surrounding style: the frontends use double quotes in some files and single in others — follow each file. Comments explain *why*, in the prose style of the existing utilities.

## File Map

| File | Responsibility |
|---|---|
| `scripts/build-version.mjs` (modify) | export `localGitSha` so the plugin shares it |
| `scripts/versionStampPlugin.mjs` (create) | one stamp per build → `define` + emitted `version.json` |
| `frontend-admin/tests/versionStampPlugin.test.js` (create) | plugin contract |
| `*/vite.config.js` ×4 (modify) | register the plugin |
| `*/package.json` ×4 (modify) | drop the post-build `build-version.mjs` step |
| `*/src/utils/deployWatch.js` ×4 (create) | the watcher |
| `{parent,admin,warehouse}/src/utils/deployWatch.test.js` (create) | node tests |
| `hungerhunt-kiosk/src/utils/deployWatch.test.js` (create) | vitest tests |
| `{parent,admin,warehouse}/src/App.jsx` (modify) | start the watcher |
| `hungerhunt-kiosk/src/utils/kioskSession.js` (create) | order-session flag + boundary reload |
| `hungerhunt-kiosk/src/hooks/useOrderSession.js` (create) | marks the session for a component's lifetime |
| `hungerhunt-kiosk/src/hooks/useOrderSession.test.jsx` (create) | hook + flag tests |
| `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (modify) | call the hook |
| `hungerhunt-kiosk/src/App.jsx`, `App.test.jsx` (modify) | start the watcher with `canReload` |

---

### Task 1: Build stamp plugin

**Files:**
- Modify: `scripts/build-version.mjs` (the `localGitSha` const)
- Create: `scripts/versionStampPlugin.mjs`
- Create: `frontend-admin/tests/versionStampPlugin.test.js`
- Modify: `frontend-parent/vite.config.js`, `frontend-admin/vite.config.js`, `hungerhunt-warehouse/vite.config.js`, `hungerhunt-kiosk/vite.config.js`
- Modify: `build` and `build:release` scripts in the four `package.json` files

**Interfaces:**
- Produces: `versionStampPlugin({ app?, env?, gitSha?, now? }) → VitePlugin` (named export) and `STAMP_DEFINE_KEY = 'import.meta.env.VITE_BUILD_STAMP'`; `localGitSha(): string | null` exported from `build-version.mjs`.
- Task 2 produces `stampOf` in `frontend-admin/src/utils/deployWatch.js`; this task's test must not depend on it — it recomputes the stamp inline from the emitted JSON with the same formula. (Task 2 adds a cross-check.)

- [ ] **Step 1: Export `localGitSha`**

In `scripts/build-version.mjs` change `const localGitSha = () => {` to `export const localGitSha = () => {`. Nothing else in that file changes.

- [ ] **Step 2: Write the failing test** — `frontend-admin/tests/versionStampPlugin.test.js`

```js
// The stamp baked into a bundle and the stamp served beside it at
// /version.json must be the same value, or every open tab would believe a new
// build had been deployed the moment it loaded.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { versionStampPlugin, STAMP_DEFINE_KEY } = await import('../../scripts/versionStampPlugin.mjs');

const AT = new Date('2026-09-17T10:00:00.000Z');
const ENV = { VERCEL_GIT_COMMIT_SHA: 'ff0ca7cabc123', VERCEL_GIT_COMMIT_REF: 'main', VERCEL_ENV: 'production' };

const build = (options) => {
  const plugin = versionStampPlugin(options);
  const config = plugin.config({}, { command: 'build', mode: 'production' });
  const emitted = [];
  plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
  return { plugin, config, emitted };
};

describe('versionStampPlugin', () => {
  test('bakes the same stamp it writes to version.json', () => {
    const { config, emitted } = build({ app: 'frontend-admin', env: ENV, gitSha: null, now: AT });
    const file = emitted.find((f) => f.fileName === 'version.json');
    assert.ok(file, 'version.json is emitted');
    assert.equal(file.type, 'asset');

    const served = JSON.parse(file.source);
    const baked = JSON.parse(config.define[STAMP_DEFINE_KEY]);
    assert.equal(baked, `${served.commit}@${served.builtAt}`);
    assert.equal(baked, 'ff0ca7c@2026-09-17T10:00:00.000Z');
  });

  test('writes the documented fields and nothing else, as the script did', () => {
    const { emitted } = build({ app: 'frontend-admin', env: { ...ENV, SECRET_TOKEN: 'no' }, gitSha: null, now: AT });
    const source = emitted[0].source;
    assert.ok(source.endsWith('}\n'), 'pretty-printed with a trailing newline');
    assert.deepEqual(Object.keys(JSON.parse(source)).sort(), ['app', 'builtAt', 'commit', 'env', 'ref']);
    assert.equal(JSON.parse(source).app, 'frontend-admin');
  });

  test('uses the define key the watcher reads', () => {
    assert.equal(STAMP_DEFINE_KEY, 'import.meta.env.VITE_BUILD_STAMP');
  });

  // The dev server has no version.json to compare against, so the watcher
  // must see no stamp at all and stay inert.
  test('defines nothing and emits nothing when serving', () => {
    const plugin = versionStampPlugin({ app: 'x', env: ENV, gitSha: null, now: AT });
    assert.equal(plugin.config({}, { command: 'serve', mode: 'development' }), undefined);
    const emitted = [];
    plugin.generateBundle.call({ emitFile: (file) => emitted.push(file) });
    assert.equal(emitted.length, 0);
  });

  test('falls back to the local commit when Vercel says nothing', () => {
    const { config } = build({ app: 'x', env: {}, gitSha: 'abc1234567', now: AT });
    assert.equal(JSON.parse(config.define[STAMP_DEFINE_KEY]), 'abc1234@2026-09-17T10:00:00.000Z');
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd frontend-admin && node --test tests/versionStampPlugin.test.js`
Expected: FAIL — cannot find module `scripts/versionStampPlugin.mjs`.

- [ ] **Step 4: Write the plugin** — `scripts/versionStampPlugin.mjs`

```js
/* Stamps a build once, and hands the same stamp to both places that need it.
 *
 * An open tab decides whether it is out of date by comparing the stamp baked
 * into its own bundle with the one the CDN serves at /version.json. Those two
 * must come from one object: build-version.mjs used to run after `vite build`
 * with its own clock, so its builtAt could never match anything the bundle
 * had been given, and every tab would have reloaded the moment it opened.
 *
 * So the stamp is taken when the build starts, given to the bundle as
 * import.meta.env.VITE_BUILD_STAMP, and written out as version.json at the end
 * of the same build. The dev server gets neither: with no stamp the watcher
 * does nothing, which is right for a page Vite is already hot-reloading. */
import { basename } from 'node:path';
import { buildVersionPayload, localGitSha } from './build-version.mjs';

export const STAMP_DEFINE_KEY = 'import.meta.env.VITE_BUILD_STAMP';

export const versionStampPlugin = ({
  app = basename(process.cwd()),
  env = process.env,
  gitSha,
  now,
} = {}) => {
  let payload = null;

  return {
    name: 'hungerhunt-version-stamp',

    config(_config, { command }) {
      if (command !== 'build') return undefined;
      payload = buildVersionPayload({
        app,
        env,
        gitSha: gitSha === undefined ? localGitSha() : gitSha,
        now: now ?? new Date(),
      });
      return {
        define: {
          [STAMP_DEFINE_KEY]: JSON.stringify(`${payload.commit}@${payload.builtAt}`),
        },
      };
    },

    generateBundle() {
      if (!payload) return;
      this.emitFile({
        type: 'asset',
        fileName: 'version.json',
        source: `${JSON.stringify(payload, null, 2)}\n`,
      });
      console.log(`version.json — ${payload.app} @ ${payload.commit} (${payload.env})`);
    },
  };
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd frontend-admin && node --test tests/versionStampPlugin.test.js tests/buildVersion.test.js`
Expected: PASS, both files.

- [ ] **Step 6: Register the plugin in all four apps**

In each `vite.config.js`, add the import after the existing `@vitejs/plugin-react` import and add the plugin after `react()`:

```js
import { versionStampPlugin } from '../scripts/versionStampPlugin.mjs'
```

- `frontend-parent/vite.config.js` and `frontend-admin/vite.config.js`: `plugins: [react(), versionStampPlugin()],`
- `hungerhunt-warehouse/vite.config.js`: `plugins: [react(), versionStampPlugin()],` (keep the `server` block and its comment)
- `hungerhunt-kiosk/vite.config.js`: inside the returned object, `plugins: [react(), versionStampPlugin()],`

- [ ] **Step 7: Drop the post-build script step**

In each of the four `package.json` files, remove ` && node ../scripts/build-version.mjs` from **both** `build` and `build:release`. Resulting values:

- `frontend-parent`: `"build": "vite build"`, `"build:release": "node ../scripts/validate-frontend-release-env.mjs --payments && vite build"`
- `frontend-admin`, `hungerhunt-warehouse`, `hungerhunt-kiosk`: `"build": "vite build"`, `"build:release": "node ../scripts/validate-frontend-release-env.mjs && vite build"`

Leave every other script untouched. (If a package.json has other scripts that also invoke `build-version.mjs`, report it rather than guessing.)

- [ ] **Step 8: Verify a real build in each app**

For each app directory:

```bash
npm run build
cat dist/version.json
```

Expected: the build succeeds and prints `version.json — <app> @ <sha> (local)`, and `dist/version.json` has the five documented fields. (The stamp cannot appear inside the bundle yet — nothing references `import.meta.env.VITE_BUILD_STAMP` until Tasks 4–5, which check it.) `dist/` is git-ignored; confirm with `git status` that no build output is untracked.

- [ ] **Step 9: Commit**

```bash
git status
git diff scripts/build-version.mjs frontend-parent/vite.config.js frontend-admin/vite.config.js hungerhunt-warehouse/vite.config.js hungerhunt-kiosk/vite.config.js frontend-parent/package.json frontend-admin/package.json hungerhunt-warehouse/package.json hungerhunt-kiosk/package.json
git add scripts/build-version.mjs scripts/versionStampPlugin.mjs frontend-admin/tests/versionStampPlugin.test.js \
  frontend-parent/vite.config.js frontend-admin/vite.config.js hungerhunt-warehouse/vite.config.js hungerhunt-kiosk/vite.config.js \
  frontend-parent/package.json frontend-admin/package.json hungerhunt-warehouse/package.json hungerhunt-kiosk/package.json
git commit -m "Stamp each build once, for the bundle and version.json alike

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: The watcher module and its node tests (parent, admin, warehouse)

**Files:**
- Create: `frontend-admin/src/utils/deployWatch.js`, then identical copies at `frontend-parent/src/utils/deployWatch.js`, `hungerhunt-warehouse/src/utils/deployWatch.js`, `hungerhunt-kiosk/src/utils/deployWatch.js`
- Create: `frontend-admin/src/utils/deployWatch.test.js`, then identical copies in parent and warehouse
- Modify: `frontend-admin/tests/versionStampPlugin.test.js` (one added cross-check test)

**Interfaces:**
- Produces (all named exports of `deployWatch.js`):
  - `stampOf(version: object | null | undefined): string | null`
  - `startDeployWatch({ bakedStamp: string | undefined, canReload?: () => boolean, intervalMs?: number, retryMs?: number } = {}): () => void`
  - `reloadIfDeployPending(): boolean`
  - `DEPLOY_RELOAD_KEY = 'hungerhunt:deploy-reload'`

- [ ] **Step 1: Write the failing test** — `frontend-admin/src/utils/deployWatch.test.js`

```js
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
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-admin && node --test src/utils/deployWatch.test.js`
Expected: FAIL — cannot find module `./deployWatch.js`.

- [ ] **Step 3: Write the module** — `frontend-admin/src/utils/deployWatch.js`

```js
/* Reloads an open tab once a newer build of this app has been deployed.
 *
 * The data-revision poll used to reload the page, and that was, by accident,
 * how an open tab picked up a new deploy. That reload is gone: data changes
 * are announced and refetched in place (dataAutoRefresh.js), and nothing here
 * listens to them. This is the deliberate replacement for the other half —
 * a signal about code, not data.
 *
 * The build bakes a stamp into the bundle (import.meta.env.VITE_BUILD_STAMP)
 * and serves the same stamp at /version.json; see
 * scripts/versionStampPlugin.mjs. A stamp that differs means another build is
 * live. The reload then waits for a moment it cannot cost anybody anything:
 * the tab visible, nothing being typed, no dialog open, and whatever the app
 * adds through canReload. Until then it retries on a short local clock that
 * makes no request.
 *
 * Native shells (the store app, the sideloaded APKs) serve version.json out
 * of their own bundle, so it can never differ; the watcher does not start
 * there, nor without a stamp (the dev server and tests). */

export const DEPLOY_RELOAD_KEY = "hungerhunt:deploy-reload";

const OVERLAY_SELECTOR =
  '[role="dialog"], .modal, .modal-backdrop, .wh-dialog-backdrop, .wh-sheet';

let pendingStamp = null;

export const stampOf = (version) => {
  const commit = version?.commit;
  const builtAt = version?.builtAt;
  if (typeof commit !== "string" || !commit) return null;
  if (typeof builtAt !== "string" || !builtAt) return null;
  return `${commit}@${builtAt}`;
};

const isNativeShell = () => Boolean(window.Capacitor?.isNativePlatform?.());

const isVisible = () => document.visibilityState === "visible";

const userIsEditing = () => {
  const active = document.activeElement;
  const editing = active && (
    ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName) ||
    active.isContentEditable
  );
  return Boolean(editing || document.querySelector(OVERLAY_SELECTOR));
};

const readGuard = () => {
  try {
    return window.sessionStorage.getItem(DEPLOY_RELOAD_KEY);
  } catch {
    return null;
  }
};

const writeGuard = (stamp) => {
  try {
    window.sessionStorage.setItem(DEPLOY_RELOAD_KEY, stamp);
  } catch {
    // Without storage there is no guard; a reloaded page makes no check for a
    // whole interval, so the worst case is one reload per interval.
  }
};

/* One reload per build per tab. If a CDN ever served the new version.json
   beside the old index.html, the reloaded page would still be the old build
   and would otherwise reload again straight away, for ever. */
const reloadFor = (stamp) => {
  if (readGuard() === stamp) return false;
  writeGuard(stamp);
  window.location.reload();
  return true;
};

/* For the end of a kiosk order session: the moment it ends, anything on
   screen belonged to it, so only visibility and the loop guard apply. */
export const reloadIfDeployPending = () => {
  if (!pendingStamp || !isVisible()) return false;
  return reloadFor(pendingStamp);
};

export const startDeployWatch = ({
  bakedStamp,
  canReload = () => true,
  intervalMs = 300_000,
  retryMs = 15_000,
} = {}) => {
  if (!bakedStamp || isNativeShell()) return () => {};

  let stopped = false;
  let checking = false;

  const attemptReload = () => {
    if (stopped || !pendingStamp) return;
    if (!isVisible() || userIsEditing() || !canReload()) return;
    reloadFor(pendingStamp);
  };

  const check = async () => {
    if (stopped || checking || !isVisible()) return;
    checking = true;
    try {
      const response = await window.fetch(`/version.json?_=${Date.now()}`, {
        cache: "no-store",
      });
      if (response.ok) {
        const deployed = stampOf(await response.json());
        if (deployed === bakedStamp) pendingStamp = null;
        else if (deployed) pendingStamp = deployed;
      }
    } catch {
      // Offline, a deploy mid-flight, an HTML error page: the next check
      // tries again.
    } finally {
      checking = false;
    }
    attemptReload();
  };

  // No check now: a page that has just loaded is the current build.
  const checkTimer = window.setInterval(check, intervalMs);
  const retryTimer = window.setInterval(attemptReload, retryMs);
  const onFocus = () => check();
  const onVisibility = () => { if (isVisible()) check(); };
  window.addEventListener("focus", onFocus);
  document.addEventListener("visibilitychange", onVisibility);

  return () => {
    stopped = true;
    window.clearInterval(checkTimer);
    window.clearInterval(retryTimer);
    window.removeEventListener("focus", onFocus);
    document.removeEventListener("visibilitychange", onVisibility);
  };
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-admin && node --test src/utils/deployWatch.test.js`
Expected: PASS, all tests. If a timing test flakes, widen its `wait()` — do not weaken an assertion.

- [ ] **Step 5: Add the plugin ↔ watcher cross-check** — append to `frontend-admin/tests/versionStampPlugin.test.js`, inside the `describe` block:

```js
  test('the watcher reads the emitted file back to the baked stamp', async () => {
    const { stampOf } = await import('../src/utils/deployWatch.js');
    const { config, emitted } = build({ app: 'frontend-admin', env: ENV, gitSha: null, now: AT });
    assert.equal(stampOf(JSON.parse(emitted[0].source)), JSON.parse(config.define[STAMP_DEFINE_KEY]));
  });
```

Run: `cd frontend-admin && node --test tests/versionStampPlugin.test.js` — Expected: PASS.

- [ ] **Step 6: Copy to the other apps and verify**

```bash
for a in frontend-parent hungerhunt-warehouse hungerhunt-kiosk; do cp frontend-admin/src/utils/deployWatch.js $a/src/utils/deployWatch.js; done
for a in frontend-parent hungerhunt-warehouse; do cp frontend-admin/src/utils/deployWatch.test.js $a/src/utils/deployWatch.test.js; done
md5 */src/utils/deployWatch.js frontend-parent/src/utils/deployWatch.test.js frontend-admin/src/utils/deployWatch.test.js hungerhunt-warehouse/src/utils/deployWatch.test.js
(cd frontend-parent && npm test) && (cd frontend-admin && npm test) && (cd hungerhunt-warehouse && npm test)
```

Expected: four identical module hashes, three identical test hashes, all three suites PASS. (The kiosk copy is tested in Task 3; do not add the node test file to the kiosk.)

- [ ] **Step 7: Commit**

```bash
git status
git add frontend-admin/src/utils/deployWatch.js frontend-parent/src/utils/deployWatch.js hungerhunt-warehouse/src/utils/deployWatch.js hungerhunt-kiosk/src/utils/deployWatch.js \
  frontend-admin/src/utils/deployWatch.test.js frontend-parent/src/utils/deployWatch.test.js hungerhunt-warehouse/src/utils/deployWatch.test.js \
  frontend-admin/tests/versionStampPlugin.test.js
git commit -m "Add a deploy watcher that reloads a tab onto a newer build

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Kiosk vitest suite for the watcher

**Files:**
- Create: `hungerhunt-kiosk/src/utils/deployWatch.test.js`
- Do **not** modify `hungerhunt-kiosk/src/utils/deployWatch.js` (byte-identical copy from Task 2). If a test here reveals a bug, fix it in `frontend-admin`, re-copy to all four, re-run all four suites.

**Interfaces:**
- Consumes: `stampOf`, `startDeployWatch`, `reloadIfDeployPending`, `DEPLOY_RELOAD_KEY` from `./deployWatch.js` (Task 2).

- [ ] **Step 1: Write the test** — `hungerhunt-kiosk/src/utils/deployWatch.test.js`

```js
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
```

- [ ] **Step 2: Run it**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/deployWatch.test.js`
Expected: PASS. (The module already exists, so this is a characterization suite — if any test fails, determine whether the test or the module is wrong before changing anything; module fixes go through `frontend-admin` and are re-copied, per the Files note.)

If `vi.stubGlobal('fetch' | 'sessionStorage', …)` does not reach `window.fetch` / `window.sessionStorage` in this environment, assign them on `window` instead with `Object.defineProperty(window, name, { configurable: true, value })` in `beforeEach` and delete them in `afterEach`.

- [ ] **Step 3: Full kiosk suite**

Run: `cd hungerhunt-kiosk && npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git status
git add hungerhunt-kiosk/src/utils/deployWatch.test.js
git commit -m "Kiosk: cover the deploy watcher under jsdom

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Start the watcher in parent, admin and warehouse

**Files:**
- Modify: `frontend-admin/src/App.jsx` (import block; the `startDataAutoRefresh` effect in `App`, around line 38)
- Modify: `frontend-parent/src/App.jsx` (import block; the `startDataAutoRefresh` effect in `AppContent`, around line 120)
- Modify: `hungerhunt-warehouse/src/App.jsx` (import block; the `startDataAutoRefresh` effect, around line 252)

**Interfaces:**
- Consumes: `startDeployWatch({ bakedStamp })` from `./utils/deployWatch` (Task 2); `import.meta.env.VITE_BUILD_STAMP` (Task 1).

- [ ] **Step 1: Add the import in each file**

Directly below the existing `import { startDataAutoRefresh } from './utils/dataAutoRefresh';` line (match that line's quote style and extension usage exactly):

```js
import { startDeployWatch } from './utils/deployWatch';
```

- [ ] **Step 2: Add the effect in each file**

Directly after the existing `useEffect(() => startDataAutoRefresh(...), []);` statement, in the same component:

```js
  // A separate signal from the one above: that one is about data and never
  // reloads; this one reloads onto a newer deploy of the app itself.
  useEffect(() => startDeployWatch({ bakedStamp: import.meta.env.VITE_BUILD_STAMP }), []);
```

Use the file's quote style (none needed here) and indentation.

- [ ] **Step 3: Lint, test, build**

```bash
for a in frontend-parent frontend-admin hungerhunt-warehouse; do (cd $a && npm run lint && npm test && npm run build) || break; done
```

Expected: all pass. Then confirm the stamp reached each bundle:

```bash
for a in frontend-parent frontend-admin hungerhunt-warehouse; do (cd $a && node -e "const v=require('./dist/version.json');const s=v.commit+'@'+v.builtAt;const fs=require('fs');const hit=fs.readdirSync('dist/assets').filter(f=>f.endsWith('.js')).some(f=>fs.readFileSync('dist/assets/'+f,'utf8').includes(s));console.log('$a',s,hit?'IN BUNDLE':'MISSING');process.exit(hit?0:1)"); done
```

Expected: three lines ending `IN BUNDLE`. If `npm run lint` fails on files you did not touch, record those errors (do not fix them) and instead require `npx eslint src/App.jsx src/utils/deployWatch.js src/utils/deployWatch.test.js` to be clean.

- [ ] **Step 4: Commit**

```bash
git status
git diff frontend-admin/src/App.jsx frontend-parent/src/App.jsx hungerhunt-warehouse/src/App.jsx
git add frontend-admin/src/App.jsx frontend-parent/src/App.jsx hungerhunt-warehouse/src/App.jsx
git commit -m "Reload admin, parent and warehouse tabs onto new deploys

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: Kiosk — never reload inside an order session

**Files:**
- Create: `hungerhunt-kiosk/src/utils/kioskSession.js`
- Create: `hungerhunt-kiosk/src/hooks/useOrderSession.js`
- Create: `hungerhunt-kiosk/src/hooks/useOrderSession.test.jsx`
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (imports; top of the `KioskBilling` component body, line ~147)
- Modify: `hungerhunt-kiosk/src/App.jsx` (imports; `App` component)
- Modify: `hungerhunt-kiosk/src/App.test.jsx` (mocks; one new test)

**Interfaces:**
- Consumes: `startDeployWatch`, `reloadIfDeployPending` from `./utils/deployWatch` (Task 2).
- Produces: `setOrderSessionActive(active: boolean): void`, `isOrderSessionActive(): boolean` (kioskSession.js); `useOrderSession(): void` (default-less named export in useOrderSession.js).

- [ ] **Step 1: Write the failing test** — `hungerhunt-kiosk/src/hooks/useOrderSession.test.jsx`

```jsx
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { cleanup, renderHook } from '@testing-library/react';

vi.mock('../utils/deployWatch', () => ({
  reloadIfDeployPending: vi.fn(() => false),
}));

const { reloadIfDeployPending } = await import('../utils/deployWatch');
const { isOrderSessionActive, setOrderSessionActive } = await import('../utils/kioskSession');
const { useOrderSession } = await import('./useOrderSession');

beforeEach(() => {
  setOrderSessionActive(false);
  reloadIfDeployPending.mockClear();
});

afterEach(() => {
  cleanup();
});

describe('order session', () => {
  test('is not active until a till is on screen', () => {
    expect(isOrderSessionActive()).toBe(false);
  });

  test('is active for exactly as long as the till is mounted', () => {
    const { unmount } = renderHook(() => useOrderSession());
    expect(isOrderSessionActive()).toBe(true);
    unmount();
    expect(isOrderSessionActive()).toBe(false);
  });

  // The end of a session is the one moment a waiting deploy can land
  // without interrupting anybody — and, on the demo kiosk, the only one.
  test('ending the session lands a waiting deploy', () => {
    const { unmount } = renderHook(() => useOrderSession());
    expect(reloadIfDeployPending).not.toHaveBeenCalled();
    unmount();
    expect(reloadIfDeployPending).toHaveBeenCalledTimes(1);
  });

  test('starting a session never reloads', () => {
    setOrderSessionActive(true);
    expect(reloadIfDeployPending).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd hungerhunt-kiosk && npx vitest run src/hooks/useOrderSession.test.jsx`
Expected: FAIL — cannot resolve `../utils/kioskSession`.

- [ ] **Step 3: Write `hungerhunt-kiosk/src/utils/kioskSession.js`**

```js
import { reloadIfDeployPending } from "./deployWatch";

/* Whether a student's order session is on screen right now.
 *
 * kioskToken cannot answer this. With the gate on it roughly does, but the
 * demo kiosk writes the next visitor's token the moment a session ends and
 * only clears it when the one after starts, so a token is nearly always
 * there. The till being mounted is the session: catalogue, basket, the pay
 * sheet, approval and the result screen all live inside KioskBilling.
 *
 * A new deploy must never land in the middle of that. The moment it ends is
 * the one safe point, and on the demo kiosk — which has no idle clock and
 * goes straight into the next session — the only one, so that is where a
 * waiting deploy is let in. */
let active = false;

export const isOrderSessionActive = () => active;

export const setOrderSessionActive = (next) => {
  active = Boolean(next);
  if (!active) reloadIfDeployPending();
};
```

- [ ] **Step 4: Write `hungerhunt-kiosk/src/hooks/useOrderSession.js`**

```js
import { useEffect } from "react";

import { setOrderSessionActive } from "../utils/kioskSession";

/* Marks an order session for the lifetime of the component that calls it.
   KioskBilling calls it; see src/utils/kioskSession.js for why. */
export const useOrderSession = () => {
  useEffect(() => {
    setOrderSessionActive(true);
    return () => setOrderSessionActive(false);
  }, []);
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd hungerhunt-kiosk && npx vitest run src/hooks/useOrderSession.test.jsx`
Expected: PASS.

- [ ] **Step 6: Call the hook from `KioskBilling`**

In `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, add to the imports (next to the other `../hooks/...` imports, matching their style):

```js
import { useOrderSession } from "../hooks/useOrderSession";
```

and as the **first statement** inside `const KioskBilling = ({ student, onLogout }) => {`:

```js
  // While this till is on screen a student is mid-order, and no deploy may
  // reload it; see src/utils/kioskSession.js.
  useOrderSession();
```

- [ ] **Step 7: Write the failing App test**

In `hungerhunt-kiosk/src/App.test.jsx`, add a mock after the existing `vi.mock('./utils/dataAutoRefresh', …)` block:

```jsx
vi.mock('./utils/deployWatch', () => ({
  startDeployWatch: vi.fn(() => () => {}),
  reloadIfDeployPending: vi.fn(() => false),
}));
```

and add this test inside the same `describe` that holds `'the till never polls the change counter …'` (it uses the same `renderAppAt` helper and demo setup):

```jsx
  test('watches for new deploys, but never lets one reload an order session', async () => {
    await renderAppAt('/');
    await screen.findByText('Till for Demo Student');

    const { startDeployWatch } = await import('./utils/deployWatch');
    const { setOrderSessionActive } = await import('./utils/kioskSession');
    expect(startDeployWatch).toHaveBeenCalledTimes(1);
    const [{ canReload }] = startDeployWatch.mock.calls[0];

    setOrderSessionActive(true);
    expect(canReload()).toBe(false);
    setOrderSessionActive(false);
    expect(canReload()).toBe(true);
  });
```

If `startDeployWatch` is not reset between tests in this file (check the existing `beforeEach`/`afterEach`), call `startDeployWatch.mockClear()` at the start of the new test before `renderAppAt`.

Run: `cd hungerhunt-kiosk && npx vitest run src/App.test.jsx`
Expected: the new test FAILS (`startDeployWatch` called 0 times); all existing tests still pass.

- [ ] **Step 8: Start the watcher in the kiosk `App`**

In `hungerhunt-kiosk/src/App.jsx`:

- Add `import { useEffect } from "react";` as the first import.
- Add after the `LOGIN_DISABLED` import:

```js
import { startDeployWatch } from "./utils/deployWatch";
import { isOrderSessionActive } from "./utils/kioskSession";
```

- In `function App()`, after the existing comment block about not polling the change counter and before `return (`:

```js
  /* New deploys, though, do reach the web kiosk — between students only. The
     periodic check may reload the login screen or the demo's "Opening the
     store" screen; a session in progress holds it, and the end of that
     session lets it in (src/utils/kioskSession.js). The sideloaded APK serves
     its own version.json, so the watcher does not start there. */
  useEffect(() => startDeployWatch({
    bakedStamp: import.meta.env.VITE_BUILD_STAMP,
    canReload: () => !isOrderSessionActive(),
  }), []);
```

- [ ] **Step 9: Verify**

```bash
cd hungerhunt-kiosk && npx vitest run src/App.test.jsx src/hooks/useOrderSession.test.jsx && npm test && npm run lint && npm run build
node -e "const v=require('./dist/version.json');const s=v.commit+'@'+v.builtAt;const fs=require('fs');const hit=fs.readdirSync('dist/assets').filter(f=>f.endsWith('.js')).some(f=>fs.readFileSync('dist/assets/'+f,'utf8').includes(s));console.log(s,hit?'IN BUNDLE':'MISSING');process.exit(hit?0:1)"
```

Expected: all PASS, `IN BUNDLE`. (Lint: same rule as Task 4 — only the files you touched must be clean if the tree has pre-existing lint errors.)

- [ ] **Step 10: Commit**

```bash
git status
git diff hungerhunt-kiosk/src/pages/KioskBilling.jsx hungerhunt-kiosk/src/App.jsx hungerhunt-kiosk/src/App.test.jsx
git add hungerhunt-kiosk/src/utils/kioskSession.js hungerhunt-kiosk/src/hooks/useOrderSession.js hungerhunt-kiosk/src/hooks/useOrderSession.test.jsx \
  hungerhunt-kiosk/src/pages/KioskBilling.jsx hungerhunt-kiosk/src/App.jsx hungerhunt-kiosk/src/App.test.jsx
git commit -m "Kiosk: take new deploys between order sessions only

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Whole-change verification

**Files:** none modified (unless a check fails — then fix in the owning task's files and commit separately).

- [ ] **Step 1: Byte-identity**

```bash
md5 */src/utils/deployWatch.js */src/utils/dataAutoRefresh.js frontend-parent/src/utils/deployWatch.test.js frontend-admin/src/utils/deployWatch.test.js hungerhunt-warehouse/src/utils/deployWatch.test.js
git diff 8b3a7a4 --stat -- '*/src/utils/dataAutoRefresh.js'
```

Expected: 4 identical `deployWatch.js`, 4 identical `dataAutoRefresh.js` (hash `98ccc8524a530c7dfcd1de01f866857e`), 3 identical node tests; the `git diff` prints nothing.

- [ ] **Step 2: Separation**

```bash
grep -n "import\|data-changed\|DATA_CHANGED" */src/utils/deployWatch.js
```

Expected: no matches.

- [ ] **Step 3: All suites and builds**

```bash
for a in frontend-parent frontend-admin hungerhunt-warehouse hungerhunt-kiosk; do echo "== $a"; (cd $a && npm test && npm run build) || echo "FAILED: $a"; done
```

Expected: no `FAILED` line; every build prints its `version.json — …` line; `grep -rl "build-version.mjs" */package.json` prints nothing.

- [ ] **Step 4: Stamp matches in every dist**

```bash
for a in frontend-parent frontend-admin hungerhunt-warehouse hungerhunt-kiosk; do (cd $a && node -e "const v=require('./dist/version.json');const s=v.commit+'@'+v.builtAt;const fs=require('fs');const hit=fs.readdirSync('dist/assets').filter(f=>f.endsWith('.js')).some(f=>fs.readFileSync('dist/assets/'+f,'utf8').includes(s));console.log('$a',s,hit?'IN BUNDLE':'MISSING')"); done
```

Expected: four `IN BUNDLE` lines.

- [ ] **Step 5: Tree check**

Run: `git status --short` — expected: none of this plan's files are modified or untracked (other sessions' files may appear; leave them alone). Report the list of commits made by this plan (`git log --oneline 8b3a7a4..HEAD`).
