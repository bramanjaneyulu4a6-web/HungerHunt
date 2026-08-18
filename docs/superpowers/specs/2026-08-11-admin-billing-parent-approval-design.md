# Admin billing: consent moves from the code to the parent

**Date:** 2026-08-11
**Status:** Approved, ready for implementation planning
**Branch:** Ashok-work
**Companion:** `2026-08-11-kiosk-student-self-serve-design.md` (same release; this spec wins where they touch)

## Summary

The admin console's billing screen stops asking for the student's 4-digit
purchase code. In its place, **every admin-billed order goes to the parent for
approval — regardless of the student's `requiresParentApproval` setting**.
Nothing an admin rings up charges a wallet until a parent says yes in the app.
A student whose parent has never registered cannot be billed from the admin
console at all; the screen refuses with a clear message.

Alongside it, the **cashier role is removed entirely**. The role model becomes:
**admin, student, warehouse, parent**. Admin has unrestricted access to every
staff surface. Warehouse is being built separately, concurrently, on this same
branch — this work does not touch it beyond the one collision noted below.

## Why the code can go

The purchase code existed at the admin till as proof the order was the
student's — a cashier could otherwise charge any wallet. Routing every
admin-billed order through parent approval replaces that proof with a stronger
one: the parent sees the exact items and says yes or no. The code survives
where it still does its job — at the kiosk, where the student is alone with
the machine.

## Decisions

| Decision | Chosen | Alternative rejected |
|---|---|---|
| Admin billing consent | Always parent approval, no code | Code stays; or approval only when `requiresParentApproval` |
| Student with no registered parent | Admin billing refuses them | Fall back to the code; direct charge |
| Cashier role | Removed entirely | Keep plumbing, hide UI |
| Warehouse role | Built separately, ignored here | Build or rename in this work |
| verify-payment / bill guards | Stay admin-capable through the transition | Student-only immediately |

That last row: after this ships, the new admin console never calls
`verify-payment` or `bill` — but an admin console cached from before the deploy
still does, with a code the parent set. Refusing the admin token there would
break those consoles for no safety gain. The routes stay open to admin tokens;
the new UI simply never uses them.

## Backend

**Cashier removal.** `'cashier'` leaves `STAFF_ROLES` in `utils/tokens.js` and
the `role` enum in `models/Admin.js`; `protectStaff`'s role list collapses to
admin; `MAX_CASHIER_ACCOUNTS` and the cashier branches in `adminController`
(register limits, login) go; `tests/cashierRole.test.js` is deleted. Accounts
already created with `role: 'cashier'` are refused on their next request (the
role claim no longer matches any accepted list) — they were created on this
unreleased branch, so nobody real is signed out. **Collision to coordinate:**
`tests/warehouseRole.test.js` — the concurrent warehouse work — signs a cashier
token to test exclusion; those assertions must be updated or dropped when
cashier goes, or the suite crashes at import.

**Admin-billed orders.** `createPendingOrder` gains an admin branch:

- Caller is an admin (`req.staff`): no `purchaseToken` required — the admin's
  own authenticated identity is what authorizes raising the order. The
  student's `isParentRegistered` must be true; otherwise **409** `{ code:
  'NO_PARENT', message }`. The order is created for every student, regardless
  of `requiresParentApproval`. The creating admin's id is recorded on the
  order (`raisedBy`), so a parent-approved charge is traceable to who rang it
  up.
- Caller is a student session (`req.student`): exactly as the kiosk spec says —
  `purchaseToken` required, student id from the token.

The existing approve/reject flow, and the charge on approval, are untouched.

## Frontend (frontend-admin, Billing.jsx)

- The verify modal, the code field, and the parent-phone plumbing are removed.
- Checkout posts `POST /pending-orders { studentId, items }` and shows "Sent to
  the parent for approval — nothing has been charged yet."
- A student with `isParentRegistered: false` is flagged in the search results
  and the pay button is disabled with the reason shown. `SEARCH_FIELDS` in
  `studentController` gains `isParentRegistered` so the screen can know.
- The role handling added with cashiers (register role picker, `staffRole`
  storage) is removed from the admin Login/Register screens.

## Accepted consequences

- An admin sale is no longer instant: the student walks away with nothing until
  a parent approves. That is the chosen trade — the admin console becomes an
  order-raiser, and the kiosk is the instant path.
- Students whose parents never registered can buy **only** at the kiosk with
  their code. The admin screen tells the admin why and what to do (invite the
  parent to register).
- `isParentRegistered` must be accurate. It is maintained by the existing
  parent-link machinery (`linkQuietly` / `unlinkStudent`); no new bookkeeping.

## Testing

- Admin raises an order with no code → 201, pending order exists, `raisedBy`
  set, nothing charged, no purchase token consumed.
- Admin bills a student with `requiresParentApproval: false` → still a pending
  order, never a direct charge.
- Admin bills a student with `isParentRegistered: false` → 409 `NO_PARENT`,
  nothing created.
- Student-session path unchanged: no token → refused (the admin exemption must
  not leak to students).
- Cashier removal: a `role: 'cashier'` token is refused on staff routes; the
  full suite passes with `cashierRole.test.js` deleted and
  `warehouseRole.test.js` updated.
