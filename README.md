# HungerHunt

A school meal and pocket-money system. Students carry a wallet balance; staff bill purchases at a kiosk; parents watch spending and set limits from their phone.

The whole stack is JavaScript — Node/Express on the server, React + Vite in the three clients.

## The four apps

| Directory | What it is | Dev port |
|---|---|---|
| `backend/` | Express + MongoDB API, Cloudinary uploads, Firebase push, Gmail SMTP | 5000 |
| `frontend-admin/` | School office dashboard: students, products, inventory, purchases, billing, recharges | 5174 |
| `frontend-parent/` | Parent app (also packaged as iOS/Android via Capacitor): balances, history, wallet limits, purchase password | 5173 |
| `hungerhunt-kiosk/` | Counter terminal for staff to ring up purchases | 5175 |

The parent app is a web app wrapped in Capacitor, so `frontend-parent/ios/` and `frontend-parent/android/` are native shells around the same React code — there is no separate mobile codebase.

## Setup

Each app keeps its own `.env`. Copy the example and fill in real values:

```bash
cp backend/.env.example           backend/.env
cp frontend-admin/.env.example    frontend-admin/.env
cp frontend-parent/.env.example   frontend-parent/.env
cp hungerhunt-kiosk/.env.example  hungerhunt-kiosk/.env
```

`.env` files are gitignored. Never commit real credentials — see Security below.

Then install and run each app in its own terminal:

```bash
npm install --prefix backend           && npm run dev --prefix backend
npm install --prefix frontend-admin    && npm run dev --prefix frontend-admin
npm install --prefix frontend-parent   && npm run dev --prefix frontend-parent
npm install --prefix hungerhunt-kiosk  && npm run dev --prefix hungerhunt-kiosk
```

`GET /health` on the backend reports server and database status.

## Environment variables

**backend** — `MONGO_URI`, `JWT_SECRET`, `PORT`, `MAX_ADMIN_ACCOUNTS`, `PARENT_CLIENT_URL` and `ADMIN_CLIENT_URL` (used to build password-reset links in emails), `EMAIL_USER` / `EMAIL_PASS` (Gmail app password), `CLOUDINARY_*`, and `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY`. Firebase is optional — leave it unset and push notifications simply switch off instead of crashing the server.

Set `TRUST_PROXY` when deploying behind a proxy or managed host (usually `1`, the number of hops in front of the server). Without it every request appears to come from the proxy's IP, so all clients share one rate-limit bucket and a handful of failed logins locks out everyone. Setting it to `true` is refused at boot — it would let any client spoof `X-Forwarded-For` and skip the limiter altogether.

**frontends** — `VITE_API_BASE_URL` pointing at the backend's `/api`. The parent app additionally needs `VITE_VAPID_KEY` for web push.

## Authentication

Two separate identities share one JWT secret:

- **Admin** (`protectAdmin`) — the office dashboard *and* the kiosk. The kiosk signs in with staff admin credentials; everything it calls (student search, payment verification, billing) requires that token.
- **Parent** (`protectParent`) — the parent app. Parents may only act on students linked to their own account; the server enforces this on every child-scoped endpoint rather than trusting the ID in the request.

Purchases are additionally gated by a per-student **purchase password** that the parent sets. Resetting it requires the parent's own account password.

## Security notes

- `.env` files and `backend/firebase-service-account.json` are gitignored. They were committed in earlier history, so **the credentials in that history must be treated as compromised and rotated**.
- Credential endpoints and student search are rate-limited; `helmet` sets security headers; CORS is restricted to the origins listed in `server.js`.
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

## Checks and releases

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs on every push and pull request: the backend tests, `eslint` for `frontend-parent` and `hungerhunt-kiosk`, a build of all three frontends, and `scripts/check-shared-files.mjs`, which guards the handful of files deliberately duplicated across the apps. `frontend-admin` is built but not yet linted — it has 10 outstanding eslint errors.

Shipping the parent app to the App Store or Play has its own list, including the credential rotation and push setup still outstanding: [RELEASE-CHECKLIST.md](RELEASE-CHECKLIST.md).

## Known gaps

Tracked in [FIX-PLAN.md](FIX-PLAN.md). Not yet built: receipt printing, parent-initiated top-up/payments, refunds and voids, manual inventory adjustments, and cost/margin reporting.

Native push is written but delivers nothing until the manual Firebase and Xcode steps are done — see [frontend-parent/README.md](frontend-parent/README.md#setup-that-cannot-be-done-from-the-repo). The 71 backend tests cover the parent API surface and auth; the frontends have no automated tests.
