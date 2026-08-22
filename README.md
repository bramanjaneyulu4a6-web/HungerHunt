# HungerHunt

Enterprise implementation and deployment status: [docs/architecture/implementation-status.md](docs/architecture/implementation-status.md)

A school meal and pocket-money system. Students carry a wallet balance; staff bill purchases at a kiosk; parents watch spending and set limits from their phone.

The whole stack is JavaScript — Node/Express on the server, React + Vite in the four clients.

## The five apps

| Directory | What it is | Dev port |
|---|---|---|
| `backend/` | Express + MongoDB API, Cloudinary uploads, Firebase push, Gmail SMTP | 5000 |
| `frontend-admin/` | School office dashboard: students, products, inventory, purchases, billing, recharges | 5174 |
| `frontend-parent/` | Parent app (also packaged as iOS/Android via Capacitor): balances, history, wallet limits, purchase password | 5173 |
| `hungerhunt-kiosk/` | Counter terminal for staff to ring up purchases (also packaged as an Android APK) | 5175 |
| `hungerhunt-warehouse/` | Storeroom app: suppliers, purchase orders, receiving deliveries, stock (also packaged as an Android APK) | 5176 |

Three of the apps are web apps wrapped in Capacitor, so `frontend-parent/ios/`, `frontend-parent/android/`, `hungerhunt-kiosk/android/` and `hungerhunt-warehouse/android/` are native shells around the same React code — there is no separate mobile codebase.

The parent app is the only one headed for the App Store and Play. The kiosk and warehouse shells are built as APKs and installed by hand onto the school's own terminal and storeroom device; they never go near a store. The two paths have different rules about signing, versions and updates, and they are written up separately — [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md) for the parent app, [docs/android-apk-builds.md](docs/android-apk-builds.md) for the other two.

`hungerhunt-warehouse`'s dev port is pinned with `strictPort` rather than left to float — the backend's CORS allowlist is a hardcoded array of origins, so a dev server that drifted onto a different port would be silently rejected by every request.

## Setup

Each app keeps its own `.env`. Copy the example and fill in real values:

```bash
cp backend/.env.example           backend/.env
cp frontend-admin/.env.example    frontend-admin/.env
cp frontend-parent/.env.example   frontend-parent/.env
cp hungerhunt-kiosk/.env.example  hungerhunt-kiosk/.env
cp hungerhunt-warehouse/.env.example hungerhunt-warehouse/.env
```

`.env` files are gitignored. Never commit real credentials — see Security below.

Then install and run each app in its own terminal:

```bash
npm install --prefix backend              && npm run dev --prefix backend
npm install --prefix frontend-admin       && npm run dev --prefix frontend-admin
npm install --prefix frontend-parent      && npm run dev --prefix frontend-parent
npm install --prefix hungerhunt-kiosk     && npm run dev --prefix hungerhunt-kiosk
npm install --prefix hungerhunt-warehouse && npm run dev --prefix hungerhunt-warehouse
```

With `NODE_ENV=development` and `MONGO_URI` configured in `backend/.env`, seed
the fixed development identities with:

```bash
npm run seed:dev-accounts --prefix backend
```

The command is idempotent: it updates the same admin, warehouse, parent, and
student records each time. It refuses to run outside development.

`GET /health` on the backend reports server and database status.

## Environment variables

**backend** — `MONGO_URI`, `JWT_SECRET`, `PORT`, `MAX_ADMIN_ACCOUNTS`, `PARENT_CLIENT_URL` and `ADMIN_CLIENT_URL` (used to build password-reset links in emails), `EMAIL_USER` / `EMAIL_PASS` (Gmail app password), `CLOUDINARY_*`, and `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`. Firebase is optional — leave it unset and push notifications simply switch off instead of crashing the server.

Set `TRUST_PROXY` when deploying behind a proxy or managed host (usually `1`, the number of hops in front of the server). Without it every request appears to come from the proxy's IP, so all clients share one rate-limit bucket and a handful of failed logins locks out everyone. Setting it to `true` is refused at boot — it would let any client spoof `X-Forwarded-For` and skip the limiter altogether.

**frontends** — `VITE_API_BASE_URL` pointing at the backend's `/api`. The parent app additionally needs `VITE_VAPID_KEY` for web push.

## Authentication

Two separate identities share one JWT secret:

- **Admin** (`protectAdmin`) — the office dashboard *and* the kiosk. The kiosk signs in with staff admin credentials; everything it calls (student search, payment verification, billing) requires that token.
- **Parent** (`protectParent`) — the parent app. Parents may only act on students linked to their own account; the server enforces this on every child-scoped endpoint rather than trusting the ID in the request.

There are exactly two secrets in the system, and they belong to different people. A student has a **purchase code**: four digits, set by the parent, typed at the counter, and nothing else — the counter refuses anything that is not four digits before it reaches the database. A parent has their **account password**, which signs them into the app and is also what resets a child's code when it is forgotten. A student never has a password; a parent never types a code to buy anything.

Four digits because of where it is used: on a touch screen, by a child, with a queue behind them. What bounds the spending is the wallet balance, the spending limit and the approval flow below — not the length of the code.

A parent can also switch on **purchase approval** for a child. The code is still taken at the counter — it is what proves the order is that student's — but it now raises a request instead of charging: nothing leaves the wallet until the parent approves it in the app, and they can drop lines from the order first. Requests expire after three days, and a student may only have one open at a time. The two gates answer different questions, which is why both exist: the code says *whose* order this is, the approval says the money may be spent.

## Security notes

- `.env` files and `backend/firebase-service-account.json` are gitignored. They were committed in earlier history, so **the credentials in that history must be treated as compromised and rotated**.
- Credential endpoints and student search are rate-limited; `helmet` sets security headers; CORS is restricted to the origins listed in `app.js`. The Vite dev-server origins on that list are only accepted when the server is *not* running with `NODE_ENV=production`, and a plaintext-loopback value arriving through `ADMIN_CLIENT_URL`/`PARENT_CLIENT_URL`/`KIOSK_CLIENT_URL`/`WAREHOUSE_CLIENT_URL`/`CORS_ORIGINS` is dropped in production too. `capacitor://localhost` and `https://localhost` are *not* dev origins — they are what the native Android and iOS builds send, and they stay allowed everywhere.
- Password reset uses hashed, expiring tokens delivered by email. Forgot-password responses are deliberately generic so they cannot be used to discover which emails are registered.

## Project layout

```
backend/
  config/       cloudinary, firebase (both degrade gracefully if unconfigured)
  controllers/  request handlers
  middleware/   auth, ownership checks, rate limits, uploads
  models/       Mongoose schemas
  routes/       route tables
  utils/        mailer, reset tokens, push notifications
```

Each frontend follows the standard Vite layout: `src/pages`, `src/components`, `src/utils/api.js` (axios instance that attaches the token).

The Warehouse–Accounts procurement boundary is migrating to Clean Architecture under `backend/src`: domain policies and deterministic analytics, application use cases/DTOs, Mongoose repository adapters, and versioned HTTP controllers/routes. Existing unversioned endpoints remain compatibility adapters. See [the architecture and analytics design](docs/architecture/warehouse-accounts.md) and the [OpenAPI 3.1 contract](docs/architecture/openapi.yaml).

The whole slice sits behind `FEATURE_V1_PROCUREMENT`, off unless it is set to exactly `true`. Off, the `/api/v1` routes are not mounted, nothing under `backend/src` is reachable, no order can enter the `PENDING_REVIEW` workflow, and request ids and the structured error envelope stay off too — every existing route answers exactly as it did before the slice existed. What the flag does not undo is data: orders already in a v1 state stay in the database, invisible to the legacy warehouse inbox, until it is switched back on.

## Checks and releases

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request: the backend tests, the `frontend-admin`, `hungerhunt-kiosk` and `hungerhunt-warehouse` test suites, `eslint` at zero warnings for all four frontends, a build of all four, and `scripts/check-shared-files.mjs`, which guards the handful of files deliberately duplicated across the apps.

What CI does not cover is the native shells: it runs on Linux and builds the web bundles only, so `frontend-parent`'s iOS and Android projects and the kiosk and warehouse Android projects are exercised only when someone builds one.

Shipping the parent app to the App Store or Play has its own list, including the credential rotation still outstanding: [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md). Building and installing the kiosk and warehouse APKs is [docs/android-apk-builds.md](docs/android-apk-builds.md).

## Known gaps

Tracked in [FIX-PLAN.md](FIX-PLAN.md). Not yet built: receipt printing, parent-initiated top-up/payments, refunds and voids, manual inventory adjustments, and cost/margin reporting.

Native push is wired up and its credentials are in place on both platforms — see [frontend-parent/README.md](frontend-parent/README.md#setup-that-cannot-be-done-from-the-repo) for what they are and where they go. The gap that remains is testing: the Android path has been exercised end to end, the iOS path never has on a physical iPhone, and a simulator cannot register with APNs.

The 601 backend tests cover the parent API surface and auth. The frontends are lightly covered — `frontend-admin`, `hungerhunt-kiosk` and `hungerhunt-warehouse` each have a suite that CI runs, mostly over utilities and the shared availability rule, plus one hook and one component in the kiosk; `frontend-parent` has none. Whole screens and flows are still verified by hand.
