# Deploy-driven reload: open tabs pick up new frontend builds

**Date:** 2026-09-17
**Status:** approved in conversation; implementation to follow via a plan
**Follows:** `2026-09-16-auto-refresh-refetch-design.md` (step 1)

## Problem

Step 1 replaced the data-driven `window.location.reload()` with a
`hungerhunt:data-changed` event that screens refetch on. That was the right call
for data, but the reload was also, by accident, how an open tab picked up a new
Vercel deploy. Now a tab keeps running the bundle it loaded until somebody
reloads it by hand — an admin console left open all week never sees a fix.

Step 2 brings deploys back deliberately, as their own signal, and keeps data
changes from ever reloading anything.

## Decisions taken in conversation

- **Any new build counts as a new deploy**, not only a new commit. A Vercel
  redeploy of the same commit after flipping a build-time variable (e.g.
  `VITE_KIOSK_LOGIN_DISABLED`) must reach open tabs. The identity compared is
  `"<commit>@<builtAt>"`.
- **The kiosk takes part on the web only**, and **never reloads during an
  active order session** (see *Kiosk*).
- **Native shells skip the watcher.** The parent store app (Android + iOS) and
  the sideloaded kiosk and warehouse APKs serve `/version.json` out of their own
  bundle, so the check could never see a change there.
- **No backend `/version` endpoint** in this step. Nothing here would read it;
  the frontends reload on their own build stamp regardless of the backend.

## Design

### 1. One stamp, computed once: `scripts/versionStampPlugin.mjs`

Today `npm run build` is `vite build && node ../scripts/build-version.mjs`. The
stamp is taken *after* the bundle is built, with its own `new Date()`, so a
value baked into the bundle could never equal the file's `builtAt`.

A shared Vite plugin replaces the post-build step:

- In `config()` for `command === 'build'` it calls the existing
  `buildVersionPayload({ app, env: process.env, gitSha })` once (`app` is the
  basename of the Vite root, `gitSha` from the same `git rev-parse HEAD`
  fallback the script uses — moved into an exported helper so both share it).
- It returns `define: { 'import.meta.env.VITE_BUILD_STAMP': JSON.stringify(stamp) }`
  where `stamp = `${payload.commit}@${payload.builtAt}``.
- In `generateBundle` it emits `version.json` (same JSON text the script writes
  today: pretty-printed, trailing newline) via `this.emitFile`.
- For `vite serve` it defines nothing: `import.meta.env.VITE_BUILD_STAMP` is
  `undefined` in dev and in vitest, and the watcher does nothing.

`import.meta.env.VITE_BUILD_STAMP` rather than a custom global so vitest,
ESLint and code that never ran through the plugin see a plain `undefined`
instead of a `ReferenceError`.

Each app's `vite.config.js` adds the plugin; each app's `build` and
`build:release` drop `&& node ../scripts/build-version.mjs` (running it would
overwrite `version.json` with a different `builtAt`). `build-version.mjs` keeps
`buildVersionPayload` and stays runnable by hand; its existing tests stand.
`vercel.json` is unchanged — it already serves `/version.json` with
`Cache-Control: no-store`.

### 2. The watcher: `src/utils/deployWatch.js`, byte-identical in all four apps

```js
startDeployWatch({ bakedStamp, canReload = () => true,
                   intervalMs = 300_000, retryMs = 15_000 }) → stop()
reloadIfDeployPending() → boolean
stampOf(versionJson) → string | null   // `${commit}@${builtAt}`, null if either is missing
```

**Inert when** `bakedStamp` is falsy, or `window.Capacitor?.isNativePlatform?.()`
is true. Inert means no request, no listener, no timer; `stop` is still a
function. Capacitor is detected through the global the native bridge injects,
so the module imports nothing and the admin app (no Capacitor) is unaffected.

**Checking.** Every `intervalMs` (5 min), and on `focus` and
`visibilitychange`→visible, if the tab is visible and no check is in flight:
`fetch('/version.json?_=<now>', { cache: 'no-store' })`. A non-OK response,
network error, bad JSON or a body `stampOf` returns `null` for is ignored —
the next check tries again. If `stampOf(body) !== bakedStamp`, the module
records that stamp as pending. There is **no check at start-up**: a page that
has just loaded is, by definition, the current build.

Once a deploy is pending, periodic checks keep running (a second deploy
replaces the pending stamp), and a cheap local retry runs every `retryMs`
(15 s) that makes no request and only attempts the reload, so closing a
dialog does not mean waiting up to five minutes.

**Reloading.** An attempt reloads only when all hold:

- `document.visibilityState === 'visible'`
- the person is not editing — the guard from `ca564e9`, unchanged: active
  element is an `INPUT`, `TEXTAREA` or `SELECT` or is contentEditable, or the
  document has any of `[role="dialog"], .modal, .modal-backdrop,
  .wh-dialog-backdrop, .wh-sheet`
- `canReload()` returns true
- the loop guard allows it

Otherwise the deploy stays pending and the next attempt tries again.

**Loop guard.** Just before reloading, the module writes the pending stamp to
`sessionStorage['hungerhunt:deploy-reload']`. If that key already holds the
pending stamp, it does not reload for it again in this tab. This stops a
reload storm if the CDN ever serves a new `version.json` beside an old
`index.html`. `sessionStorage` access is wrapped in try/catch; if storage is
unavailable, the reload still happens; a reloaded page makes no check for
another `intervalMs`, so the worst case is one reload per five minutes, not a
tight loop.

**`reloadIfDeployPending()`** is the session-boundary hook the kiosk uses: if
a deploy is pending, the tab is visible and the loop guard allows it, it
reloads and returns true. It skips the editing guard and `canReload` — it is
only called at the moment a session has ended, when any dialog on screen
belonged to that session. It returns false and does nothing when the watcher
is inert or nothing is pending.

Pending state is module state, like `observedRevision` in
`dataAutoRefresh.js`; `stop()` clears the timers and listeners but not the
pending stamp.

**Separation from data refresh.** `deployWatch.js` does not import
`dataAutoRefresh.js` and nothing in it reacts to `hungerhunt:data-changed`.
`dataAutoRefresh.js` is not touched and stays byte-identical.

### 3. Where each app starts it

Parent, admin, warehouse — in `App.jsx`, beside the existing
`startDataAutoRefresh` effect:

```js
useEffect(() => startDeployWatch({ bakedStamp: import.meta.env.VITE_BUILD_STAMP }), []);
```

It runs whether or not anybody is signed in: a login screen has nothing to
lose, and a half-typed login is covered by the editing guard.

### 4. Kiosk

`kioskToken` is **not** the session signal. With the gate on it is, roughly;
but in demo mode (`VITE_KIOSK_LOGIN_DISABLED`, live today) `DemoSession`
writes a fresh token as soon as it mounts and clears the old one only at the
next start, so a token is present nearly all the time.

Instead, a kiosk-only module `src/utils/kioskSession.js`:

```js
setOrderSessionActive(active: boolean)
isOrderSessionActive() → boolean
```

- `KioskBilling` sets it true on mount and false on unmount (one `useEffect`).
  `KioskBilling` is the whole order session: catalogue, basket, verify sheet,
  approval/payment phases and the result screens.
- Setting it false calls `reloadIfDeployPending()`. Unmount is exactly the
  session boundary in both modes — `KioskScreen.handleLogout` navigating to
  `/login`, or `DemoKiosk` remounting `DemoSession` for the next visitor — so a
  pending deploy lands between two sessions, never inside one.
- `App.jsx` starts the watcher with
  `canReload: () => !isOrderSessionActive()`, so the periodic path can only
  reload on the login screen (editing guard still applies to a half-typed
  admission number) or on the demo's brief "Opening the store" screen, where
  nothing has been bought.

Consequences, accepted: a demo till whose visitor never taps Done runs the
old build until somebody does (demo sessions have no idle or cap clock). The
APK is inert either way; neither APK needs rebuilding for this.

## Error handling

All failures degrade to "no reload this time": fetch errors, non-OK status,
malformed JSON, missing fields, unavailable `sessionStorage` (guard skipped,
reload allowed). Nothing is logged to the user and nothing throws out of a
timer or listener.

## Testing

- **`deployWatch.test.js`** — node `--test` in parent, admin and warehouse
  (identical copies), and a vitest + jsdom equivalent in the kiosk. Fixture
  mirrors each app's `dataAutoRefresh.test.js` fake window/document, adding a
  fake `fetch`, `sessionStorage`, `document.activeElement`,
  `document.querySelector` and `location.reload` counter. Cases:
  - no request at start-up
  - same stamp → no reload
  - different stamp → reload; loop-guard key written
  - editing (input focused / dialog open) → deferred; reloads on the retry
    tick after it clears
  - hidden tab → no request and no reload; visible again → checks
  - `canReload` false → deferred; true → reloads
  - loop guard already holds the stamp → no reload
  - native shell or empty stamp → inert (no fetch, no listeners, no timers)
  - fetch rejects / non-OK / bad JSON / missing fields → ignored
  - `reloadIfDeployPending`: false with nothing pending; reloads when pending
    even with a dialog open; respects visibility and loop guard
  - `stop()` removes every listener and timer
- **Plugin** — `frontend-admin/tests/versionStampPlugin.test.js`: the stamp
  defined for a build equals `stampOf` of the `version.json` it emits; serve
  mode defines nothing; emitted JSON has exactly the documented fields.
- **Kiosk** — `kioskSession` test: mount/unmount of `KioskBilling` toggles the
  flag and unmount calls `reloadIfDeployPending`; `App.test.jsx`: the watcher
  is started with a `canReload` that is false while a session is active.
- Each app's existing suite and `npm run build` still pass, and the built
  `dist/version.json` stamp matches the one inside `dist/assets/*.js`.

## Rollout

- A push to `main` releases all four Vercel apps. Tabs open at that moment run
  a bundle with no watcher and need one manual reload; after that, deploys
  arrive by themselves.
- No Render deploy (backend untouched).
- No APK or store rebuild needed: native shells are inert, which is today's
  behaviour. The next batched parent build and APK rebuilds pick the code up
  harmlessly.

## Out of scope

- Backend `GET /version`.
- Any in-app "new version available" banner — the reload is silent.
- Reloading on data-revision changes (explicitly never).
