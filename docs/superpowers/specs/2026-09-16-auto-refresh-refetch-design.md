# Auto-refresh: refetch in place instead of reloading the page

**Date:** 2026-09-16
**Status:** approved in conversation; implementation to follow via a plan

## Problem

All four frontends share an identical `src/utils/dataAutoRefresh.js`. It polls
`GET /api/data-revision` every 4 seconds and, when the process-wide counter has
moved, calls `window.location.reload()`. The counter moves on every successful
write from any client.

With ~900 accounts live, writes arrive every few seconds during a school break.
Every open admin, warehouse and parent screen reloads on each one — losing
scroll position, dialogs, and any half-read page — for changes most of those
screens do not show. Two fixes shipped today (`82add11`, `d7b7d51`) removed the
session-only writes and a parent-device reload loop; the remaining reloads are
genuine write volume and this is the design for them.

The screens the owner wants live without touching anything:

- Admin: `Dashboard` (ledger, alert banners)
- Warehouse: `CaretakerOrders`
- Parent: wallet balance and orders (`Dashboard`, `Accounts`, `ChildDetails`)

Every one of these already refetches itself in place on its own clock (parent:
on `PUSH_EVENT`; warehouse: every 15 s; admin: every 30 s / 60 s). The reload
gives them a faster signal, not freshness they lack.

## Design

### Mechanism

`dataAutoRefresh.js` keeps polling exactly as now. When the revision moves it
**dispatches a window event** instead of reloading:

```js
window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
// DATA_CHANGED_EVENT = 'hungerhunt:data-changed'
```

The event carries no detail. It means "something changed; refetch what you
show". Screens that subscribe call the loader they already have. Screens that
do not subscribe are unaffected and refresh on navigation, as today.

Removed from the utility, because they existed only to protect forms from a
destructive reload:

- `userIsEditing()` and the dialog/overlay query
- `pendingRefresh` deferral
- `pauseWhen` option (kiosk used it to protect a session; a refetch does not
  need protecting)

Kept:

- the `enabled` option (no polling before sign-in)
- the visibility check: a hidden tab does not dispatch; on becoming visible it
  checks once, so a tab that was hidden through several changes refetches once
- `observeMutationRevision` and the response interceptor wiring, so a tab still
  does not refetch on its own write

`window.location.reload()` no longer appears in the utility. The `ErrorBoundary`
retry button in the parent app keeps its own reload; that one is a user action.

### Subscribing

`DATA_CHANGED_EVENT` is exported from `dataAutoRefresh.js` itself, so the four
copies stay self-contained. A screen subscribes with one
`window.addEventListener(DATA_CHANGED_EVENT, refresh)` line inside the effect
that already owns its loader, removed in that effect's cleanup.

No shared hook. The parent screens' listeners live inside effects that also
carry cancellation flags and a payment-sheet guard; pulling them into a hook
would mean restructuring those effects for the sake of removing four lines of
boilerplate each, which is the wrong trade while the goal is to stop the
disturbance. Warehouse and admin screens subscribe in the same one-line way.

### Per app

| App | Utility change | Subscribers | Existing timers |
|---|---|---|---|
| Parent | yes | `Dashboard`, `Accounts`, `ChildDetails` (both loaders) | none to keep; `PUSH_EVENT` stays |
| Warehouse | yes | `CaretakerOrders` (`loadArrivals({ silent: true })`) | 15 s interval stays as safety net |
| Admin | yes | `Dashboard` (`fetchHistory`), `ReportAlertBanner`, `StockAlertBanner` (their `load`) | 30 s / 60 s intervals stay |
| Kiosk | yes | none — the till reads `/inventory` at checkout and never reloads mid-session today | — |

The utility is four identical copies. They stay four copies (there is no
shared package between the apps); the change is applied to each and the copies
must remain byte-identical, which a diff in the plan's verification step
confirms.

### Parents without notification permission

Today those parents get no `PUSH_EVENT` and therefore no in-place refresh; they
relied on the reload. With `DATA_CHANGED_EVENT` on the same screens they get the
same freshness as everyone else, from the poll.

### Sequencing and rollout

Each app is independent and deploys independently (a push to `main` releases
all four Vercel apps; the kiosk and warehouse APKs are sideloaded and need a
rebuild). Order:

1. Parent — largest population, screens already have the pattern.
2. Warehouse — one screen.
3. Admin — three subscribers.
4. Kiosk — utility only.

Backend: no change. The revision counter, header, and `readCache` are untouched.

### What is deliberately lost, and the follow-up

A full reload also happened to fetch a newly deployed frontend bundle. After
this change an open tab keeps running old code until the person reloads. The
owner accepted this for now. **Follow-up (step 2, separate spec):** poll each
app's `/version.json` build stamp alongside the revision and reload — deferred
while a form is being edited — when the deployed stamp differs from the one the
tab was built with. That is a deploy-driven reload a few times a month, in
place of a write-driven one every few seconds.

## Testing

- `dataAutoRefresh.test.js` (new, `node --test`, one per app or one shared
  fixture copied): with a fake `window`/`document` and a stub `api`, assert
  that a moved revision dispatches `DATA_CHANGED_EVENT`; an unchanged revision
  does not; the first poll (no prior observed revision) does not; a hidden tab
  does not dispatch and dispatches once on becoming visible; `enabled: false`
  never calls the api; the returned stop function removes listeners and stops
  the interval; and `window.location.reload` is never called.
- The one-line subscriptions in screens are not unit-tested: the three apps
  with subscribers run `node --test` with no React renderer. The manual checks
  below cover them.
- Existing suites stay green: backend 1069, parent 67, and the admin,
  warehouse, kiosk suites at their current counts.
- Manual: two parent devices on the same child, kiosk sale on that child;
  both balances update without a reload. Admin dashboard open during a kiosk
  sale: ledger row appears, scroll position kept.

## Out of scope

- Splitting the counter by topic (`orders`, `stock`, `wallets`). Revisit if
  refetch chatter itself becomes a cost.
- The deploy-driven reload (follow-up above).
- Kiosk APK rebuild scheduling.
