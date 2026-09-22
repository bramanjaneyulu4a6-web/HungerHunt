# Super-admin Portal (act as warehouse / caretaker) — design

Date: 2026-09-22
Status: draft, pending review

## Problem

A super-admin currently has to leave the admin console to see orders the way
the warehouse or a caretaker sees them — the standalone `hungerhunt-warehouse`
app has its own grouped-by-room pack/deliver/handover flow and its own
caretaker approval flow, neither of which is reachable from the admin
console. There is also no way for a super-admin to see or act on every room's
caretaker-facing orders at once; a real caretaker account is scoped to the
handful of rooms it holds.

## Goal

From the admin console (`frontend-admin`), a super-admin can open a
full-screen **Portal** popup on the Student Orders page and, without any
separate login, operate the real warehouse pack/deliver/handover flow, or
switch to a caretaker view that spans every room instead of one caretaker's
own. Nothing changes on the standalone `hungerhunt-warehouse` app.

## Non-goals

- No changes to `hungerhunt-warehouse` (no email login, no mode switcher
  there). A super-admin still cannot sign in to that app directly.
- No "Order Complete" / student-purchase-code collection step in Portal — see
  **Scope decision** below.
- No Inventory or Purchases screens in Portal (Orders only, per the existing
  Warehouse admin section).

## Scope decision: no collection step

The real caretaker app's "Order Complete" action hands the screen to the
student standing in front of the caretaker so they can type their own
4-digit purchase code — the code, not the caretaker's tap, is what marks a
package collected ([[package-collection-by-student-code]]). That has no
meaning for a super-admin working remotely, so Portal's caretaker view omits
that action. A delivered package can still be marked collected from the
existing Student Orders status picker, which already allows any admin to
move an order to any of the five stages
([[admin-order-status-anywhere]]).

## Where this sits

- New button, **"Portal"**, on `frontend-admin/src/pages/FulfillmentOrders.jsx`
  (Student Orders page), rendered only when `useCurrentStaff().me.isSuperAdmin`.
- Opens `PortalModal.jsx`, a full-screen overlay, with an internal
  **Warehouse / Caretaker** toggle. Both views are read from and acted on
  live — no separate "launch" step beyond opening the modal.

## Warehouse view

A direct, adapted port of `hungerhunt-warehouse/src/pages/Orders.jsx`: orders
grouped by block and room-unit, Pack → Deliver → Handover per unit or per
whole block, the receiver-name handover dialog, the packing-issue report
dialog, and "Print orders list."

- Calls the same `/api/v1/fulfillment-orders*` endpoints the standalone app
  calls, using the admin's own existing session token (`adminToken`).
  `protectWarehouse` already admits role `admin`, so **no backend change is
  needed for this view.**
- Feature toggles (`warehouse.pack`, `warehouse.printOrders`,
  `warehouse.dispatch`, `warehouse.handover`, `warehouse.blockActions`,
  `warehouse.reportIssue`) keep working unmodified:
  `frontend-admin`'s `useFeature` already bypasses hiding entirely for a
  super admin, matching how every other super-admin-only surface in this
  console already behaves.

### New/ported files (frontend-admin)

| File | Source | Notes |
|---|---|---|
| `src/components/portal/PortalOrdersBoard.jsx` | adapted from `hungerhunt-warehouse/src/pages/Orders.jsx` | same markup/behavior, imports frontend-admin's own `api`, `useFeature`, `Icon`, ui kit |
| `src/utils/portal/orderGroups.js` | copied from `hungerhunt-warehouse/src/utils/orderGroups.js` | pure logic, unchanged |
| `src/utils/portal/ordersPrintSheet.js` | trimmed from `hungerhunt-warehouse/src/utils/ordersPrintSheet.js` | drops the `Capacitor.isNativePlatform()` native branch — frontend-admin is web-only; keeps the new-tab/download fallback |
| `src/utils/portal/contentDisposition.js` | copied from `hungerhunt-warehouse/src/utils/contentDisposition.js` | small, pure |
| `src/portal.css` | subset of `hungerhunt-warehouse/src/warehouse.css` | only the `.wh-*` rules these ported screens use; loaded only while the modal is mounted; no collisions with `admin.css` (checked) |

`Icon.jsx`, `components/ui/index.jsx`, `theme.css`, `format.js`,
`availability.js`, `cloudinaryThumb.js` are already byte-identical between
`frontend-admin` and `hungerhunt-warehouse`
(`scripts/check-shared-files.mjs`), so the ported board reuses them directly
with no adaptation.

## Caretaker view

A direct, adapted port of `hungerhunt-warehouse/src/pages/CaretakerOrders.jsx`
and `components/CaretakerApprovals.jsx`: the status timeline for every
in-flight package, the unit/room order summary, search, package history, the
pending-approval queue (approve / decline / trim an order still awaiting the
caretaker's own answer), and "Notify Parent via WhatsApp." The only
deliberate omission is the "Order Complete" button (see **Scope decision**).

Scoped to **every active room**, not one caretaker's own — this is the part
that needs a backend change.

### Backend change: all-rooms caretaker session

Every caretaker-scoped endpoint (`pendingOrderController.js`'s
`getCaretakerPendingOrders`/`caretakerOwner`/`markParentNotified`, and
`fulfillmentOrderController.js`'s `list`/`caretakerHistory`/
`confirmCollection`) filters purely on `req.staff.roomIds`, which
`authMiddleware.js`'s `staffGate` populates from the signed-in account's own
`roomIds` when the token's role is `caretaker`. Because every one of those
controllers already keys off `req.staff.roomIds` and nothing else, a single
change in `staffGate` is enough to make all of them caretaker-view-only
across every room, with **no controller changes**.

1. **`backend/utils/tokens.js`** — `signStaffToken(id, role, extra = {})`
   gains an optional third argument merged into the signed payload
   (`jwt.sign({ id, role, ...extra }, ...)`). Backward compatible; existing
   callers are unaffected.

2. **New endpoint**, `POST /api/admin/portal/caretaker-session`
   (`backend/routes/portalRoutes.js`, mounted at `/api/admin/portal`,
   gated by `protectSuperAdmin`): mints
   `signStaffToken(req.staff.id, 'caretaker', { allRooms: true })` and
   returns it. Called by the popup, not by any login flow — the resulting
   token is held only for the popup's lifetime (see **Frontend session
   handling** below). Portal's own modal header carries a plain "Caretaker
   view — all rooms" label rather than porting the standalone app's
   caretaker identity card (name/phone/rooms banner), which exists there to
   greet a single caretaker on their own device and has no equivalent
   meaning for a super-admin browsing every room's orders at once.

3. **`backend/middleware/authMiddleware.js`**, `staffGate`'s caretaker
   handling gets a documented special case for a token carrying
   `allRooms: true`:
   - The row-existence check (currently
     `Admin.exists({ _id: payload.id, ...roleFilter(allowed) })`, which
     would reject a super-admin's row for `protectCaretaker` because its
     stored `role` is `admin`, not `caretaker`) instead checks the row
     against the same `SUPER_ADMIN` filter `Admin.js` already exports
     (`role: admin` (or missing), `isSuperAdmin: true`, `active` not false).
     Re-checked on **every** request, so revoking `isSuperAdmin` ends the
     caretaker-portal session immediately, the same way it already ends
     every other super-admin surface.
   - `req.staff.roomIds` is set to every active `Room`'s id
     (`Room.find({ active: { $ne: false } }).distinct('_id')`) instead of
     the account's own `roomIds`, and `req.staff.allRooms = true` is set for
     anything downstream that wants to know.
   - The existing plain-caretaker branch (a real `caretaker`-role row, no
     `allRooms` claim) is unchanged.

   `Room` needs importing into `authMiddleware.js`, which does not
   currently import it.

### Frontend session handling (frontend-admin)

- On first switching to the Caretaker tab, `PortalModal.jsx` calls
  `POST /api/admin/portal/caretaker-session` (via the admin's own
  `adminToken`, sent automatically by frontend-admin's `api` client) and
  keeps the returned caretaker token **in memory only**, for calls this tab
  makes. It is never written to `localStorage` and never touches the
  `adminToken`/`warehouseToken` keys either app relies on elsewhere, so
  closing the popup (or navigating away) simply drops it — there is nothing
  to sign out of.
- The ported caretaker board's `api` calls need this second token instead of
  `adminToken`; the ported component takes the token as a prop / uses a
  small wrapped Axios instance rather than frontend-admin's shared `api`
  singleton (which is hard-wired to `adminToken`).

### New/ported files (frontend-admin)

| File | Source | Notes |
|---|---|---|
| `src/components/portal/PortalCaretakerBoard.jsx` | adapted from `hungerhunt-warehouse/src/pages/CaretakerOrders.jsx` | drops the "Order Complete" button/navigation; everything else carries over |
| `src/components/portal/PortalCaretakerApprovals.jsx` | adapted from `hungerhunt-warehouse/src/components/CaretakerApprovals.jsx` | unchanged behavior |
| `src/components/portal/PortalNotifyParentButton.jsx` | adapted from `hungerhunt-warehouse/src/components/NotifyParentButton.jsx` | uses the trimmed `portalOpenWhatsApp.js` below |
| `src/components/portal/PortalReportForm.jsx` | adapted from `hungerhunt-warehouse/src/components/ReportForm.jsx` | unchanged behavior |
| `src/utils/portal/awaitingParent.js` | copied from `hungerhunt-warehouse/src/utils/awaitingParent.js` | pure logic, unchanged |
| `src/utils/portal/caretakerOrders.js` | copied from `hungerhunt-warehouse/src/utils/caretakerOrders.js` | pure logic, unchanged |
| `src/utils/portal/reports.js` | copied from `hungerhunt-warehouse/src/utils/reports.js` | unchanged |
| `src/utils/portal/parentWhatsApp.js` | copied from `hungerhunt-warehouse/src/utils/parentWhatsApp.js` | unchanged |
| `src/utils/portal/openWhatsApp.js` | trimmed from `hungerhunt-warehouse/src/utils/openWhatsApp.js` | drops the `Capacitor.isNativePlatform()` branch; keeps the browser `window.open` path |
| `src/utils/portal/api.js` | new | a second Axios instance carrying the in-memory caretaker-session token instead of `adminToken` |

These are deliberately-adapted copies, not registered in
`scripts/check-shared-files.mjs` — unlike the files that script does track,
Portal's copies are meant to diverge (no native branches, no collection
step, a different token), the same reasoning the kiosk-billing precedent in
that script's own comments already documents for a fork with a real reason.

## Data flow summary

```
Super-admin (already signed in to frontend-admin, adminToken)
        │
        ▼
  "Portal" button (Student Orders page, isSuperAdmin only)
        │
        ▼
  PortalModal (full-screen)
   ├─ Warehouse tab ──uses adminToken──▶ /api/v1/fulfillment-orders*
   └─ Caretaker tab
         │  (first open)
         ▼
   POST /api/admin/portal/caretaker-session   (protectSuperAdmin)
         │  role:'caretaker', allRooms:true — held in memory only
         ▼
   /api/v1/caretaker/fulfillment-orders*, /api/pending-orders/caretaker*,
   /api/v1/caretaker/reports
         │
         ▼
   authMiddleware.staffGate: allRooms claim + live super-admin row
         →  req.staff.roomIds = every active Room's id
```

## Error handling

- `POST /api/admin/portal/caretaker-session` returns 403 (via
  `requireSuperAdmin`) if the account is not currently a super admin —
  covers both "never was" and "was revoked since this admin session began."
  The popup shows this as a plain error banner on the Caretaker tab and does
  not fall back to anything; it does not sign the admin out of the console
  (that session is untouched).
- Any 401 `AUTH_REQUIRED` on a caretaker-mode call (the in-memory token
  expiring — 1 day TTL, same as every staff token) clears the in-memory
  token and re-requests a fresh one on the next caretaker-tab action, rather
  than surfacing a broken screen.
- Existing per-request error handling in both ported boards (toasts, retry
  banners) carries over unchanged.

## Testing

- Backend:
  - `staffGate`'s new branch: a live super-admin's `allRooms` token is
    admitted and sees every room; a non-super-admin or revoked-super-admin
    token carrying the same claim is rejected; the existing plain-caretaker
    path is unaffected.
  - `POST /api/admin/portal/caretaker-session`: super-admin only (403
    otherwise), returns a token that the caretaker-scoped endpoints accept
    with all rooms visible.
  - Extends the existing `backend/tests/caretakerRole.test.js` pattern
    rather than inventing a new harness.
- Frontend: this is almost entirely ported/adapted UI with unchanged
  behavior, so no new component tests are planned; verification is a manual
  run-through of both Portal tabs (via the `run` skill) plus the existing
  lint/build checks. `scripts/check-shared-files.mjs` continues to pass
  unchanged since none of the newly-added files are on its list.

## Open questions for review

- None outstanding — the scope decision above (dropping the collection
  step) is the one call made without a fresh round of confirmation; flag it
  if that's wrong.
