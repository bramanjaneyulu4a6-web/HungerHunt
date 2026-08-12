# HungerHunt — Fix Plan

Status: **Phases 0–4 complete.** Findings sourced from the full-codebase audit (2026-08-06); fixes applied the same day. Remaining known gaps are listed at the bottom.

---

## Phase 0 — Get the app running locally again ✅

- [x] `backend/.env`, `frontend-admin/.env`, `frontend-parent/.env` restored from the renamed `.env-*` files
- [x] `hungerhunt-kiosk/.env` created (the kiosk had never had one; its API base URL was `undefined`)
- [x] Boot crash fixed: `import 'dotenv/config'` is now the first import in `server.js`, so `config/firebase.js` sees env vars at module scope
- [x] Firebase now degrades gracefully — missing credentials disable push notifications instead of crashing the server
- [x] `.env.example` added for all four apps

**Verified:** backend boots, MongoDB connects, Firebase initializes, `/health` returns ok.

---

## Phase 1 — Dead-code purge ✅

**41,676 lines of stacked commented-out previous versions removed across 70 files.** Detection was scripted (dead versions were fully comment-prefixed, so the live block began at the first genuinely uncommented line) and spot-checked before applying.

Representative results:
- `frontend-admin/src/pages/Billing.jsx` 12,441 → 976 lines
- `frontend-admin/src/pages/Inventory.jsx` 4,798 → 390
- `frontend-admin/src/pages/Products.jsx` 4,262 → 705
- `frontend-parent/src/pages/ChildDetails.jsx` 2,489 → 573
- `backend/controllers/parentController.js` 1,375 → 432

Also removed:
- [x] `hungerhunt-kiosk/src/pages/Inventory.jsx` (4,798 lines, never routed)
- [x] `backend/config/db.js` (unused; `server.js` now connects inline *and* exits on failure)
- [x] `backend/routes/authRoutes.js` (duplicate of `adminRoutes.js` under a second prefix)
- [x] Orphaned binaries in `backend/uploads/`
- [x] Unused deps: `crypto` and `xlsx` (backend), `multer` (frontend-admin)
- [x] Dead `requestFCMToken` helper with its hardcoded VAPID key
- [x] Trailing dead block + `publicSearchStudents` in `studentController.js`
- [x] Obsolete `import React` in 21 files (unneeded with the modern JSX transform)

**Verified:** all three frontends build clean; backend boots.

---

## Phase 2 — Security ✅

1. [x] **Unauthenticated billing closed** — `POST /transactions/bill` sat above the auth guard; anyone could debit any wallet. The whole transaction router is now behind `protectAdmin`.
2. [x] **Student data leak closed** — `/students/public-search` returned every student's wallet balance and parent phone number, unauthenticated, on an empty query. Endpoint deleted entirely; the kiosk now uses the authenticated `/students/search`, which additionally requires ≥2 characters, escapes regex input, selects only safe fields, and caps results at 25.
3. [x] **Admin password takeover closed** — `forgotPassword` reset any admin's password given only an email. Replaced with a hashed, 10-minute expiring token delivered by email, plus a new `POST /admin/reset-password/:token`.
4. [x] **One auth route set** — `/api/auth/*` (unmounted, causing a guaranteed 404 on the admin forgot-password flow) removed; everything lives under `/api/admin/*`. The missing `/reset-password/:token` page was added to the admin app so the flow no longer dead-ends.
5. [x] **Parent ownership enforced** — `getChildDetails`, all three purchase-password endpoints and `updateWalletControl` took a `studentId` from the request without checking it belonged to the caller. A shared `assertOwnsStudent` helper now gates all five; a parent touching another family's child gets 403.
6. [x] **Secrets untracked** — `.env` files and `firebase-service-account.json` removed from git tracking, root `.gitignore` added. ⚠️ **They remain in git history — see Action Required below.**
7. [x] **Secret logging removed** — Cloudinary API secret was printed on every boot; the kiosk logged the auth token on every request.
8. [x] **Unprotected admin resources closed** — `stockGroupRoutes` and `unitRoutes` had no auth at all; also `GET /products` and `GET /inventory/public` were open. All now require a token. (`/inventory/public` deleted — the kiosk authenticates now.)
9. [x] **Admin Billing no longer skips the purchase-password gate** — it called checkout directly while both kiosk screens required verification. Now uses the same `/transactions/verify-payment` modal.
10. [x] **Purchase-password reset now verified** — required the parent's own account password, server-checked.
11. [x] **Kiosk checkout 500 fixed** — `bcrypt.compare` against an unset `purchasePassword` threw; now returns a clear "no purchase password set" message.
12. [x] **Upload limits added** — 5 MB cap, single file, images only (previously unbounded, any mime type).

13. [x] **Admin self-registration closed** — `POST /admin/register` was public, so a stranger could claim any unused slot under `MAX_ADMIN_ACCOUNTS`. It is now open only while zero admins exist (to bootstrap the first account); after that an existing admin must be signed in.

Additionally: `helmet` security headers, rate limiting on credential endpoints (10 per 15 min) and student search (60/min), and generic forgot-password responses so neither endpoint can be used to discover which emails are registered.

**Verified:** a live authorization sweep confirms every protected endpoint returns 401 without a token, and that the frontends' API calls all still map to mounted routes.

---

## Phase 3 — Broken functionality ✅

1. [x] Admin `/kiosk` route moved inside `<ProtectedRoute>` (it called admin-only endpoints from outside the auth wrapper) and added to the sidebar
2. [x] Password-reset links now use `PARENT_CLIENT_URL` / `ADMIN_CLIENT_URL` instead of hardcoded `localhost:5173`
3. [x] Kiosk gained a real login page, `ProtectedRoute`, a 401 response interceptor, and a logout button
4. [x] Kiosk crash on deleted products fixed — optional chaining plus filtering of orphaned inventory rows
5. [x] `studentController` no longer selects `photo class section` (fields that do not exist on the model)
6. [x] Duplicate FCM listener removed; `new Notification(...)` guarded for permission and for the Capacitor webview
7. [x] **Billing made safe under failure and concurrency** — inventory decrements are now conditional (`stock >= quantity`) so simultaneous kiosks cannot oversell, the wallet debit is conditional on sufficient balance, and any partially-applied checkout is rolled back. Previously a mid-way failure silently lost stock or money.
8. [x] Error handler respects `err.status` (CORS rejections were surfacing as 500); added a 404 handler and a `/health` route
9. [x] UI fixes: "Portal Portal" typo, wallet-control save-button nesting, hardcoded transaction status extracted to one constant, sidebar logo restored
10. [x] Dependencies aligned: all three apps on React 19; kiosk switched from `oxlint` to the shared `eslint` config

---

## Phase 4 — Hygiene & hardening ✅

- [x] All debug `console.log` removed from live paths (backend controllers/routes and all three frontends); boot-time messages kept, `console.error` kept in genuine catch blocks
- [x] Customer-facing diagnostic alert on the kiosk replaced with an inline error banner; `react-hot-toast` (installed but unused) now wired up
- [x] `helmet`, `morgan` request logging, and rate limiting added
- [x] Opt-in pagination on `getStudents` and `getAllTransactions` (`?page=&limit=`, capped at 500). Response shape is unchanged when the params are absent, so existing callers keep working. Products and inventory were left unpaginated deliberately — a canteen catalog is small and the added complexity would not pay for itself
- [x] `.env.example` for all four apps; root `README.md` rewritten (the previous one was lost in the last pull)
- [x] Admin dashboard polling relaxed from every 3 seconds to every 30 seconds plus a refresh on window focus
- [x] ESLint config for the parent app now ignores `ios/` and `android/` — it had been linting Xcode build output and bundled assets, which accounted for 418 of its 426 reported problems

**Lint status:** parent 426 → 5, admin 30 → 11, kiosk 9 → 2. Everything remaining is `react-hooks/immutability`, `set-state-in-effect` and `exhaustive-deps` — strict advisory rules from eslint-plugin-react-hooks v7 that require restructuring component logic. Left alone deliberately; fixing them is a refactor, not a bug fix.

---

## Deploy notes

Settings that change behaviour at a deploy boundary. All three live in the environment, never in a tracked file; `backend/.env.example` lists them with the same explanation and no values.

**`PARENT_JWT_SECRET` — set, locally.** Parent tokens are signed with this key and admin tokens with `JWT_SECRET`. It falls back to `JWT_SECRET` if unset, so a deploy that omits it keeps working: the `role` claim on every token still separates the two sides, and the backend says which of the two it is doing at startup. With a second key an admin token presented on a parent route fails at the signature, before any claim is read, rather than depending on the role check being applied by whatever middleware is written next.

It now holds a 64-character random value in the local gitignored `.env`, and the startup warning is gone. **It is still unset in production** — that environment needs its own value, different from both `JWT_SECRET` and the local one. Nothing tracked in this repo contains either secret.

**`LEGACY_TOKEN_GRACE_UNTIL` — expires 2026-08-20.** Tokens issued before they carried a `role` claim are accepted until this date, so deploying that change does not sign every parent and admin out mid-session. After it, the whole branch in `backend/utils/tokens.js` is dead and should be deleted along with the tests that pin a grace date.

The date was originally 2026-08-14, one parent-token lifetime after the change was written. That was wrong in the way these dates usually are: it has to be a lifetime past the **deploy**, because until this reaches production, production is still issuing roleless tokens and the clock has not started. It is now the 20th and should move again if the deploy does.

**These two are ordered**, and the backend now says which side of the date it is on at every boot rather than leaving it to this document. Set `PARENT_JWT_SECRET` *before* the legacy window closes. While the window is open, `verifyToken` also tries `JWT_SECRET` for parent tokens, so a parent token issued before the second key existed still verifies and nobody is signed out. After the window closes that fallback is gone, and introducing the key then invalidates every live parent token at once — recoverable by logging in again, but a support morning for no reason.

**`PURCHASE_AUTH_GRACE_UNTIL` — expires 2026-08-21.** A bill must carry the single-use token `verify-payment` returns once the purchase password is accepted; bills sent without one are still charged until this date. The window exists because the backend and the three frontends deploy separately and the till is a screen that stays open all day on the bundle it loaded that morning — requiring the token immediately would fail every sale from a tab nobody had reloaded.

Order of deployment does not matter, which is the point of the window: the backend is safe to ship first and old clients keep selling. Each un-upgraded bill logs a line naming the student, so whether any client is still stale is something to read in the logs rather than guess at. Once those lines stop, bring the date forward to close the gap early. Bills that *do* carry a token are checked in full from the first day, whatever the date says.

---

## ⚠️ Action required (cannot be done from here)

**Rotate every credential that was committed to git.** Removing the files from tracking does not remove them from history — anyone with repo access can still read them. Rotate:

- Firebase service account key (`backend/firebase-service-account.json`)
- `JWT_SECRET` — rotating this invalidates all existing admin and parent sessions, which is the point
- MongoDB Atlas password in `MONGO_URI`
- Cloudinary API secret
- Gmail app password (`EMAIL_PASS`)

Optionally scrub history afterwards with BFG or `git filter-repo`, but rotation is the fix that actually matters.

---

## Not done — deferred features

Receipt/bill printing · parent top-up and payment gateway · native push via `@capacitor/push-notifications` (plus a production `capacitor.config.json`; it currently points native builds at `localhost:5173`) · refunds and voids · cost/margin reporting from `Purchase.purchasePrice` · server-side Excel import · websocket live updates · consolidating the two near-identical admin billing screens · automated tests and CI

Manual inventory adjustments and low-stock alerts shipped with the admin-inventory-ordering-repair plan, along with product archiving (in place of hard delete) and purchase-order cancellation.
