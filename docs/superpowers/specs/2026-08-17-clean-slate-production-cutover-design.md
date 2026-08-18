# Clean-slate production cutover — design

**Date:** 2026-08-17
**Status:** Approved approach (A), pending spec review
**Supersedes:** the migration-shaped plan in
[docs/backend-production-deploy.md](../../backend-production-deploy.md) — kept for
reference; its sections 3, 4 and 7 no longer apply because no data is carried over.

## Decision

Deploy the `Ashok-work` backend to the existing Render service
(`hungerhunt-dbat.onrender.com`) as a **fresh install against a brand-new database**,
not an upgrade of the old one. The old `hungerhunt_production` database is never
read, written, or migrated; it remains in the cluster as a dormant archive.

Rejected alternatives: in-place upgrade with data migration (production is dormant —
all cost, no benefit), new infrastructure under new accounts (changes the API URL for
nothing), from-scratch backend rewrite (the rewrite already exists on this branch:
157 commits, 422 passing tests — its only deficiency is never having been deployed).

## Constraint that shapes the phasing

At the time of writing, the only production dashboard in reach is **MongoDB Atlas**.
Render and Vercel access are pending. So:

- **Phase 1 — now:** everything Atlas-side and repo-side, plus a full local dress
  rehearsal of the production boot.
- **Phase 2 — when Render access arrives:** paste env, rebind branch, deploy.
- **Phase 3 — when Vercel access arrives:** deploy the four frontends.

Phases 2 and 3 are independent and can run in either order, because the API URL
(`hungerhunt-dbat.onrender.com`) is known today and never changes.

## Naming

| Thing | Name |
|---|---|
| New production database | `graarr_ecommerce` |
| New database user | `graarr_app` |
| Old database (untouched) | `hungerhunt_production` |
| Local dev database | `hungerhunt_dev` |

("GRAARR E-Commerce App" normalized: MongoDB database names cannot contain spaces.
Distinct names mean any connection string identifies its world at a glance.)

---

## Phase 1a — Atlas (owner clicks, assistant prepares and verifies)

Atlas manages database users through its console/API only — they cannot be created
from `mongosh`. Owner steps, with a generated password supplied at execution time:

1. Atlas console → Database Access → **Add New Database User**
   - Username `graarr_app`, password: generated (32+ chars), stored only in
     `backend/.env.production.local` (see 1b) — never in git, never in the spec.
   - Privileges: **`readWrite` scoped to `graarr_ecommerce` only.** Not `readWriteAnyDatabase`
     — this user must be physically unable to touch `hungerhunt_production`.
2. Network Access: confirm the existing rule allows connections from both this
   machine and Render. (If the list is `0.0.0.0/0` today, leave it; tightening it is
   a post-launch task, noted under Security.)
3. Assistant verifies: `mongosh` ping with the new credentials, confirm write+read
   into `graarr_ecommerce`, confirm the same credentials are **refused** on
   `hungerhunt_production`.

The database itself needs no creation step — it comes into existence on first write,
and the dress rehearsal (1c) performs that first write.

The old `bramanjaneyulu4a6_db_user` credential (password exposed in git history)
stays valid only until the old service is retired; deleting it is the final step of
Phase 2, not Phase 1 — the old deployment still uses it until then.

## Phase 1b — Local repository changes

**1. Split production config out of `backend/.env`** (approved decision):

- `backend/.env` → local development only: `MONGO_URI=mongodb://127.0.0.1:27017/hungerhunt_dev`,
  `NODE_ENV=development`, dev-appropriate values. A bare `npm run dev` can never
  again reach any production database. This retires the standing inline-override
  hazard permanently.
- `backend/.env.production.local` (new, matches existing `.env*` gitignore rules) →
  the complete production manifest: every variable Render needs, with real values.
  This file is both the dress-rehearsal env and the paste source for Phase 2.

**2. Fresh secrets** (generated, stored only in `.env.production.local`):

- `JWT_SECRET`, `PARENT_JWT_SECRET`, `STUDENT_JWT_SECRET` — all three regenerated
  (64 chars, distinct). The old `JWT_SECRET` is in git history; the other two are
  regenerated because rotation is free while nothing live depends on them.
- Rotated in Phase 1 — **their dashboards are accessible** (owner clicks, new values
  land in `.env.production.local`):
  - **Gmail app password:** Google Account → Security → App passwords → create a new
    one for the backend; **revoke the old one immediately** (the old deployment is
    dormant — losing its email sending costs nothing).
  - **Firebase service-account key:** Firebase console → Project settings → Service
    accounts → Generate new private key (feeds `FIREBASE_CLIENT_EMAIL` /
    `FIREBASE_PRIVATE_KEY`); then delete the old key under Google Cloud IAM →
    Service Accounts → Keys. The parent app's `VITE_FIREBASE_*` values need no
    rotation — those are public client config by design.
- Carried over for now, **rotation deferred**: the Cloudinary API secret only. It is
  in git history and remains a live risk on that service until rotated — a known,
  accepted gap, tracked under Security below.

**3. Production env manifest** — contents of `.env.production.local`:

| Variable | Value / source |
|---|---|
| `NODE_ENV` | `production` |
| `MONGO_URI` | new `graarr_app` connection string → `graarr_ecommerce` |
| `PORT` | Render supplies `PORT`; keep a sane default |
| `JWT_SECRET` / `PARENT_JWT_SECRET` / `STUDENT_JWT_SECRET` | freshly generated |
| `BUSINESS_TIME_ZONE` | `Asia/Kolkata` |
| `TRUST_PROXY` | `1` (Render's proxy; harmless in local rehearsal) |
| `PARENT_CLIENT_URL` | `https://hunger-hunt-parent.vercel.app` (candidate; final URL confirmed in Phase 3) |
| `ADMIN_CLIENT_URL` | `https://hunger-hunt-beta.vercel.app` (candidate) |
| `KIOSK_CLIENT_URL` | `https://hunger-hunt-kiosk.vercel.app` (candidate) |
| `WAREHOUSE_CLIENT_URL` | new Vercel project URL, placeholder HTTPS origin until Phase 3 |
| `EMAIL_USER` / `EMAIL_PASS` | `EMAIL_PASS` freshly rotated (new Gmail app password) |
| `CLOUDINARY_*` (3) | carried from current `.env` — rotation deferred (no dashboard access yet) |
| `FIREBASE_PROJECT_ID` / `FIREBASE_CLIENT_EMAIL` / `FIREBASE_PRIVATE_KEY` | freshly rotated (new service-account key) |
| `MAX_ADMIN_ACCOUNTS` | carried (optional) |

Client-URL values must be bare HTTPS origins — no path, no `/api` — or
`validateRuntimeEnv` refuses to boot. If Phase 3 lands on different final URLs, the
manifest and Render env are updated then; CORS follows automatically because these
same variables feed the allowlist.

**4. Commit `render.yaml`** capturing the service definition so it is reviewable in
the repo rather than living only in a dashboard: service name, branch `Ashok-work`,
Node runtime, `npm ci` build / `npm start` start commands rooted in `backend/`,
health check path `/health`, and the env var **names** (values marked `sync: false`
— set in the dashboard, never committed). Applying it is Phase 2; committing it is
Phase 1.

**5. Revert the four frontends to the local backend** (`VITE_API_BASE_URL=http://localhost:5001/api`,
from the session backups) — the old production API cannot serve these newer
frontends, so leaving them pointed at it helps nobody. They switch to the live URL
permanently as part of Phase 3.

## Phase 1c — Dress rehearsal (the core verification)

Boot the real production configuration on this machine, before any dashboard is
touched:

1. `npm test` green on the exact commit (baseline: 422/422).
2. Launch: `node --env-file=.env.production.local server.js` (or equivalent explicit
   env injection) — **never** via plain `npm run dev`, which now means local dev.
3. Expected observations, in order: `validateRuntimeEnv` passes (this is the same
   gate a Render boot must clear); Mongo connects to `graarr_ecommerce`; the
   weekly-order index drop logs its "nothing to drop" no-op; indexes build on the
   empty database; `GET /health` → `{"status":"ready","db":"connected"}`.
4. **Create the founding admin** (approved decision): `POST /api/admin/register`
   against the local rehearsal instance — the bootstrap route is open only while the
   admin collection is empty ([authMiddleware.js:153](../../../backend/middleware/authMiddleware.js#L153)).
   Credentials chosen by the owner at the keyboard, never written down by the
   assistant. Then verify the door locked: a second unauthenticated register attempt
   must be refused.
5. Confirm in Atlas that `graarr_ecommerce` now shows collections + 1 admin, and
   `hungerhunt_production` shows no new writes.

Exit criteria for Phase 1: all five observations above, plus the negative check that
`graarr_app` cannot read `hungerhunt_production`.

## Phase 2 — Render (runbook; blocked on access)

1. Dashboard → the `hungerhunt-dbat` service → Environment: paste every variable
   from `.env.production.local`.
2. Rebind the deploy branch to `Ashok-work` (or apply the committed `render.yaml` as
   a Blueprint). Confirm build command runs in `backend/`.
3. Deploy. First-boot expectations mirror the rehearsal exactly — same validator,
   same empty-index path (the founding admin already exists, so the bootstrap door
   is already shut).
4. Verify: `/health` returns ready (this endpoint 404s on the old code, so its
   presence proves the new code is live); a v1 route answers 401 not 404; founding
   admin can log in over HTTPS; a deliberate wrong-password attempt from a second
   network shows the rate limiter counting per-client (proves `TRUST_PROXY` took).
5. Retire the old world: delete the `bramanjaneyulu4a6_db_user` Atlas user. The old
   database stays as archive until the owner decides to export/drop it.

## Phase 3 — Vercel (runbook; blocked on access)

1. Four projects — parent, admin, kiosk, warehouse (warehouse is net-new). Each
   builds its app directory with `VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api`.
2. Collect the four final URLs. If any differ from the manifest's candidates, update
   the four `*_CLIENT_URL` values in Render env (CORS and password-reset links both
   follow from them) and redeploy the service.
3. Verify one real login per role from the deployed frontends.
4. No native-app rebuild is required: the API URL the mobile builds bake in is
   unchanged.

## Security notes

- **Closed by this design:** Mongo credential exposure (new scoped user; old user
  deleted at Phase 2 end), JWT secret exposure (regenerated), Gmail app password and
  Firebase service-account key (rotated in Phase 1, old ones revoked),
  bootstrap-registration window (founding admin created before the API is ever
  public), local-dev-hits-prod footgun (env split).
- **Open, tracked:** the Cloudinary API secret remains compromised-in-history until
  that dashboard is accessible — rotate on access, then update
  `.env.production.local` and Render. Atlas network access list tightening
  (Render egress IPs) is a post-launch hardening task.
- The old admin accounts, students, and transactions in `hungerhunt_production` do
  not exist in the new world. Anyone using old credentials against the new API is a
  stranger to it.

## Out of scope

Native parent-app store release (own checklist), warehouse barcode/receiver work,
old-database export or deletion, Vercel custom domains.
