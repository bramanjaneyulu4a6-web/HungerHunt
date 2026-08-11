# Kiosk: student self-serve till

**Date:** 2026-08-11
**Status:** Approved, ready for implementation planning
**Branch:** Ashok-work

> **Amended 2026-08-11, same day:** the role model changed after this spec was
> approved. The cashier role is removed; the roles are **admin, student,
> warehouse, parent** (warehouse is being built separately and is out of scope
> here). Where this spec says "staff" or `protectStaff`, read "admin". Admin
> billing also stops using the purchase code — see the companion spec,
> `2026-08-11-admin-billing-parent-approval-design.md`, which takes precedence
> where the two touch.

## Summary

The kiosk stops being a cashier's terminal and becomes a self-serve one. A
student identifies themselves with their school-issued admission number, orders,
and pays with the 4-digit purchase code they already have. No member of staff
signs in, and none is present.

The staff-operated till does not go away — it lives in the admin console at
`frontend-admin/src/pages/Billing.jsx`, which keeps its student search and its
own copy of the checkout. Only `hungerhunt-kiosk` changes.

## What exists today

- The kiosk signs in **staff** via `POST /admin/login` and stores an
  `adminToken` (`hungerhunt-kiosk/src/pages/Login.jsx`). Roles are `admin` and
  `cashier`; both work the till.
- The cashier finds the student with `GET /students/search` (`protectStaff`).
- Checkout posts to `POST /transactions/verify-payment` with `studentId`, the
  parent's `phone` and the 4-digit `password`. It returns a purchase token bound
  to that exact cart, single-use, expiring in two minutes. `POST
  /transactions/bill` then spends it.
- A student with `requiresParentApproval` raises `POST /pending-orders` instead,
  and the kiosk polls `GET /pending-orders/:id/status`.
- Every till route is `protectStaff`. **There is no student session or student
  token anywhere in the system.** The only student secret is `purchasePassword`
  — a bcrypt hash of a 4-digit code, validated by `purchaseCodeProblem` in
  `backend/utils/validation.js`.
- There is **no school or admission identifier** on the Student model. Fields
  are name, fatherName, hostelNumber, grade, parentPhoneNumber. `hostelNumber`
  cannot serve as a login: it is not unique, and siblings share one.

## Decisions

Recorded because each was a fork with a real alternative.

| Decision | Chosen | Alternative rejected |
|---|---|---|
| Who signs in | Student only; no staff on the device | Device enrolled once by staff |
| Login credential | Admission number alone, no secret | Admission number + 4-digit code |
| Payment credential | 4-digit purchase code at checkout | Login is enough, one tap to pay |
| Passcode | Reuse the existing purchase code | A separate login PIN |
| Admission number source | School's existing issued IDs, imported | New field, admin- or auto-assigned |
| Parent-phone factor | Dropped; server derives it | Student types it at checkout |
| Session | Short-lived student JWT | No token; server-side session store |
| API access | Endpoints stay open | Device token; IP allowlist |
| Wrong-code policy | 5 attempts, then 15-minute lock | Device rate limit only |

## Screens

The login screen becomes the kiosk's resting state. The `START ORDER` welcome
splash (`showWelcome`, `.kiosk-welcome`) is **removed** — it is the same tap as
login, and keeping both puts two screens in front of a hungry queue. This closes
one of the three threads left open in the 2026-08-07 till redesign.

1. **Login.** Full-screen numeric pad. "Enter your admission number." No secret.
2. **Ordering.** Today's till with the student-search bar gone — `wall-top`, the
   `serving` block and `lookup-results` are all removed. In their place a
   session header: name, admission number, wallet balance, and a **Done** button
   for early logout.
3. **Checkout.** The existing 4-digit code pad. The parent's-mobile field is
   removed.
4. **Result.** An animated **Order confirmed** or **Awaiting parent approval**,
   held for 5 seconds and then returning to login. A tap returns immediately.
   The idle prompt does not run on this screen — the session is already over.

Two refusals are built explicitly at login rather than discovered later:

- An admission number that matches no student.
- A student whose parent has not set a purchase code. Letting them build a cart
  they cannot pay for wastes the queue's time; `verify-payment` already refuses
  this case, but at the wrong moment.

## Session lifetime

A session ends on any of four events: the hard cap, the idle prompt expiring,
checkout completing, or the student tapping **Done**. Ending a session clears
the cart, drops the token and returns to login.

- **Hard cap: 7 min 30 sec from login.** A banner appears at 7:00 warning that
  the session is ending. At 7:30 the cut is absolute.
- **Idle: 30 sec.** Thirty seconds without a touch raises "Still there?" with a
  visible 10-second countdown. Any touch dismisses it and resumes the session.
  Ignored, it logs out. Touches reset the idle timer and never the hard cap.
  A "touch" is any pointer or key event on the document, so scrolling the wall
  or typing in the search field counts. Neither timer runs on the login screen:
  both start at login and belong to the session.
- The JWT expires at 450 seconds, so the cap is enforced by the server and a
  page reload cannot extend it.

One deliberate exception, for correctness rather than convenience: if `POST
/transactions/bill` is already in flight when the cap fires, the client waits
for the response before ending the session. Otherwise money moves and nobody is
told it did. The session ends immediately afterward — the cap is not extended,
the confirmation is simply not thrown away.

## Data model

Add to `backend/models/Student.js`:

- `admissionNumber` — String, unique, indexed, trimmed. The school issues these;
  they arrive by import. A student without one cannot use the kiosk, which makes
  the import a **launch prerequisite, not a follow-up**.
- `purchaseCodeAttempts` — Number, default 0. Consecutive wrong codes.
- `purchaseCodeLockedUntil` — Date, default null.

The admin console needs the field on its add/edit student form and in bulk
import, or the roll cannot be maintained after launch.

## Backend

**Tokens** (`backend/utils/tokens.js`). Add `signStudentToken(id,
admissionNumber)` with `role: 'student'` and `expiresIn: 450`. Give it
`STUDENT_JWT_SECRET` with the same `|| JWT_SECRET` fallback the parent secret
uses, so a deploy that has not set it keeps working. This is a third instance of
the existing per-identity-secret pattern, not a new idea. `verifyToken` learns
`'student'` alongside `'staff'` and `'parent'`.

**Middleware** (`backend/middleware/authMiddleware.js`). Add `protectStudent`,
which verifies the role claim and loads the student onto the request.

**New route.** `POST /students/kiosk-session` — open, tightly rate-limited by a
new limiter in the shape of the existing `searchLimiter`. Takes
`{ admissionNumber }`. Returns the token plus only the fields the screen needs:
name, admission number, wallet balance, and the parent-approval flag.

**Re-scoped to accept a student token**, in addition to their current guards.
Each route below keeps working for staff and additionally accepts a student
token, via a guard that tries both rather than by dropping the staff check —
the admin console calls three of these routes and must not break:

- `GET /inventory`
- `POST /transactions/verify-payment`
- `POST /transactions/bill`
- `POST /pending-orders`
- `GET /pending-orders/:id/status`

**`verify-payment` changes shape.** `studentId` is read from the token and never
from the body — this is what stops a session for one student from charging
another. The parent-phone check is dropped. Everything else stays exactly as
built: the 4-digit rule enforced before the database is touched, the bcrypt
compare, the `purchaseCodeIsPin` bookkeeping, and the single-use cart-bound
purchase token. `createPendingOrder` likewise takes `studentId` from the token
rather than the body when the caller is a student.

**Lockout.** Five consecutive wrong codes lock that student's checkout for 15
minutes across every kiosk. The counter resets on a correct code. A locked
student loses their cart and returns to login with the reason shown.

`GET /students/search` stays `protectStaff` — the admin till still needs it.

## Frontend (hungerhunt-kiosk)

- `pages/Login.jsx` — rewritten as an admission-number pad. The email/password
  form and the `/admin/login` call go.
- `components/ProtectedRoute.jsx` — gates on the student token.
- `App.jsx` — `KioskScreen`'s logout clears the student session.
- `pages/KioskBilling.jsx` — remove the search bar, `searchResults`,
  `selectStudent` and `showWelcome`; add the session header, the two timers, the
  "Still there?" prompt and the animated result screen. The student now comes
  from the session rather than from a lookup.
- `utils/api.js` — send the student token.

`authBypassEnabled` in `ProtectedRoute.jsx` must be removed before this ships.
It is already on the release checklist.

## Accepted risk

Recorded as an explicit decision, not an oversight.

With an open session route, **admission numbers are enumerable**. Anyone who can
reach the API can walk the number space and read back student names and wallet
balances, and can open a session as any student. Once in a session they can
build a cart in that student's name, though they cannot spend: the 4-digit code
still gates the money, and the 15-minute lockout limits guessing to roughly
5 attempts per 15 minutes against a 10,000-value space.

Two things follow from having no device credential, and both are mitigations
rather than fixes:

- The session route is rate-limited hard.
- Its response carries the minimum fields the screen needs.

The option that closes this properly is one-time device enrollment: an admin
signs the kiosk in once at setup and the device keeps a long-lived token, with
no staff involvement afterward. It was offered and declined. It remains the
upgrade path if enumeration ever shows up in the logs.

## Testing

New backend coverage:

- Session route: valid admission number, unknown one, student with no purchase
  code, rate limit.
- Token scoping: a token for student A cannot charge or raise a pending order
  for student B.
- Expiry: a token past 450 seconds is refused.
- Lockout: five wrong codes lock, a correct code resets the counter, a locked
  student is refused for 15 minutes.
- `verify-payment` succeeds with no phone in the body.

Existing tests that post a phone to `verify-payment` need updating —
`backend/tests/parentSurface.test.js` and `backend/tests/pendingOrders.test.js`.

Frontend: the timers are the part most likely to break quietly. Cover that the
idle prompt fires at 30 seconds, that a touch dismisses it, that the hard cap
fires at 7:30 regardless of activity, and that an in-flight bill is awaited.

## Open items

- The admission-number import gates launch. The data has to come from the
  school before anyone can use the kiosk.
- Nutrition storage and the `check-shared-files.mjs` entry for
  `KioskBilling.jsx` remain open from the 2026-08-07 redesign and are untouched
  by this work.
