# Backend production deploy — plan

Deploying the `Ashok-work` backend to the live Render service. This is the plan to
review *before* anything is pushed. Nothing here has been executed.

Companion to [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), which covers the parent
*app* release. This one covers the *server*.

Verified against the repo on 2026-08-17. Facts marked **[verified]** were checked
directly; everything else needs a decision or an action outside this repo.

---

## What is live today

`https://hungerhunt-dbat.onrender.com` runs the pre-rewrite codebase — the code on
`main`. **[verified]** `main`'s `backend/server.js` mounts nine routes and has no
`app.js` and no `/api/v1` anywhere in its source. The deployed service 404s on
`/health`, which this branch's README documents as existing.

So this is not a patch to a running v1. **There is no v1 in production to restore.**
The `/api/v1` surface — purchase orders, analytics, fulfillment orders, caretaker
fulfillment, accounting exports, replenishment drafts — is new in this branch and has
never been deployed.

`Ashok-work` is 157 commits ahead of `main`, and `main` is an ancestor of it
**[verified]** — so this is a fast-forward, not a merge. Mechanically simple; that is
the *only* simple part.

Deploy mechanism: Render's own GitHub integration. There is no `render.yaml` in the
repo and [.github/workflows/ci.yml](../.github/workflows/ci.yml) has no deploy job
**[verified]** — it runs tests only. Whoever owns the Render dashboard controls which
branch auto-deploys, and that setting is not visible from here.

---

## 1. Blocking — rotate the exposed credentials first

Not a formality and not deferrable past this deploy. Every one of these was committed
to git and removing them from tracking did not remove them from history. `main` still
carries `backend/.env-backend` and `backend/firebase-service-account.json` in tree.

- [ ] Firebase service account key
- [ ] `JWT_SECRET` — rotating signs everyone out, which is the intent
- [ ] MongoDB Atlas password inside `MONGO_URI`
- [ ] Cloudinary API secret
- [ ] Gmail app password

The Atlas password is currently readable in plaintext in `backend/.env` on this
machine. Rotate in Atlas first, then set the new value in Render — never by editing a
file in the repo.

Full list and context: [FIX-PLAN.md](../FIX-PLAN.md#-action-required-cannot-be-done-from-here).

---

## 2. Render environment variables

The server refuses to boot in production until these are right — `validateRuntimeEnv`
throws before the port opens. That is a safety net, but it means a missing value is a
failed deploy, not a degraded one.

I ran the current `backend/.env` against the production rules. Results **[verified]**:

**Already valid**

| Variable | Status |
|---|---|
| `JWT_SECRET` | 42 chars, OK |
| `PARENT_JWT_SECRET` | 64 chars, OK |
| `STUDENT_JWT_SECRET` | 64 chars, OK |
| all three | distinct, as required |

(They still get rotated per step 1 — valid is not the same as uncompromised.)

**Will fail the deploy as they stand**

| Variable | Current | Needed |
|---|---|---|
| `PARENT_CLIENT_URL` | `http://localhost:5173` | HTTPS origin, no path |
| `ADMIN_CLIENT_URL` | `http://localhost:5174` | HTTPS origin, no path |
| `WAREHOUSE_CLIENT_URL` | not set | HTTPS origin |
| `KIOSK_CLIENT_URL` | not set | HTTPS origin |
| `BUSINESS_TIME_ZONE` | not set | valid IANA zone (`Asia/Kolkata`) |

The four client URLs must be HTTPS, must not be a local hostname, must carry no
credentials, and must be a bare origin — no path, query or fragment. `/api` on the end
will be rejected.

**Set explicitly even though the validator allows absence**

- `TRUST_PROXY` — currently unset. Render puts a proxy in front of the service, so
  without this every request appears to come from the proxy IP and *all clients share
  one rate-limit bucket*: a handful of failed logins locks out everyone. Set it to the
  integer number of hops, normally `1`. `TRUST_PROXY=true` is refused at boot on
  purpose — it would let any client spoof `X-Forwarded-For`.

**Also required in production** (present locally, confirm they are set in Render):
`EMAIL_USER`, `EMAIL_PASS`, `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`,
`CLOUDINARY_API_SECRET`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`,
`FIREBASE_PRIVATE_KEY`.

**Optional, defaults apply**: `MAX_ADMIN_ACCOUNTS`, `MAX_CARETAKER_ACCOUNTS`,
`MAX_WAREHOUSE_ACCOUNTS`, the four `ANALYTICS_*` values, the six `TALLY_*` values.
See [backend/.env.example](../backend/.env.example).

### Open question — the warehouse origin

`WAREHOUSE_CLIENT_URL` is mandatory in production, but there is no warehouse
deployment. The CORS allowlist in `app.js` names Vercel hosts for beta, parent and
kiosk only — nothing for warehouse **[verified]**. Either the warehouse frontend gets
deployed as part of this release, or a placeholder HTTPS origin goes in to satisfy the
validator and the app stays unreachable. **Decide before scheduling.**

---

## 3. Data migration

Order matters, and one of these is not reversible by re-running it.

### 3a. `npm run migrate:enterprise` — no dry run

This one **writes immediately**. There is no preview flag, unlike the backfills.
It does three things:

1. Backfills defaults — `active` on students/products/suppliers, `safetyStock` 0 on
   products, `leadTimeDays` 7 on suppliers.
2. Drops `one_pending_order_per_student` and
   `one_fulfillment_order_per_student_business_week`, guarded by an existence check.
3. Calls `createIndexes()` on twelve models.

It refuses to run unless MongoDB is a replica set or sharded cluster — wallet and
approval transactions are not safe on standalone. Production Atlas is a replica set, so
this passes there **[verified]**; a standalone local Mongo will refuse it.

**Take an Atlas snapshot before running this.** The index drops and the `createIndexes`
sweep are the least reversible part of the release.

### 3b. The four backfills — preview by default

All four are read-only unless given `--apply` **[verified]**. Run each without the flag,
read the output, then re-run with it.

| Order | Command | Notes |
|---|---|---|
| 1 | `npm run backfill:hostels` | Throws if any student hostel value is blank — correct those first. Caretaker account creation is blocked until this completes. |
| 2 | `npm run backfill:staff-profiles` | `--apply` additionally requires `--profiles=<path>` pointing at a reviewed JSON file. Throws if any account lacks a complete profile. |
| 3 | `npm run backfill:product-subcategories` | Preview prints proposed assignments. |
| 4 | `npm run backfill:category-subcategories` | Preview prints proposed ordering. |

Hostels first: caretaker records depend on hostels existing as records.

### 3c. Size the purchase-code migration

`node scripts/purchaseCodeAudit.js` — read-only. Covered in
[RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md); run it *before* deploying, not after.

### ⚠ Running any of these safely

`backend/.env` resolves `MONGO_URI` to the live Atlas cluster. Every command above
inherits it. Pass the target explicitly on each invocation rather than trusting the
file, and confirm which database you are pointed at before every `--apply`.

---

## 4. The first boot drops an index

Separate from the migration, and it happens on *every* deploy:
[server.js:30](../backend/server.js#L30) drops
`one_fulfillment_order_per_student_business_week` from whatever database it connects to.

This is deliberate — the weekly one-order rule was lifted, and a database still holding
the unique index would go on refusing students with a duplicate-key error the
application no longer expects. Already-absent is the normal case after the first boot.
Any error other than `IndexNotFound` / `NamespaceNotFound` is fatal by design.

Consequence for this release: **the first production boot permanently removes a live
constraint.** If the weekly limit is still wanted in production, this deploy is the
wrong shape and needs a decision before it ships, not after.

---

## 5. Deploy sequence

1. [ ] Credentials rotated (step 1) and the new values in Render.
2. [ ] Render env vars set and verified (step 2), including the warehouse decision.
3. [ ] Atlas snapshot taken, restore path confirmed.
4. [ ] `npm test` green on the exact commit — **422/422 passing locally [verified]**.
   Note these are mock-based and touch no database, so a green suite says nothing about
   the migration.
5. [ ] `purchaseCodeAudit.js` run, affected families counted.
6. [ ] Maintenance window agreed — students cannot transact during the migration.
7. [ ] `migrate:enterprise` against production.
8. [ ] The four backfills, preview then `--apply`, in the order above.
9. [ ] Push / promote the commit so Render builds it.
10. [ ] Verification (step 6).

Steps 7–9 are the window. Everything before is reversible.

---

## 6. Verification after deploy

- [ ] `GET /health` returns `{"status":"ready","db":"connected"}` — this endpoint does
      not exist on the current deployment, so its presence confirms the new code is live.
- [ ] A representative `/api/v1` route answers `401` rather than `404` — proves the new
      surface is mounted.
- [ ] `npm run audit:wallets` (`scripts/reconcileWallets.js`) — confirm balances
      reconcile after the migration.
- [ ] One real login per role, from the deployed frontends, over HTTPS.
- [ ] Confirm the rate limiter sees real client IPs, not the proxy — the check that
      `TRUST_PROXY` actually took effect.

Do **not** verify login endpoints by firing failed requests at them. Until
`TRUST_PROXY` is confirmed working, that is the exact action that locks out every real
user.

---

## 7. Rollback

Render can redeploy the previous commit, which restores the *code* in minutes. That is
the easy half.

It does not restore the *data*. By then `migrate:enterprise` has dropped two indexes,
rebuilt twelve models' indexes and written defaults across four collections, and the
boot path has dropped the weekly-order index. Rolling code back to `main` against a
migrated database leaves old code reading new-shaped data.

**The Atlas snapshot from step 5.3 is the real rollback.** Restoring it means losing
transactions written after the snapshot, which is why the maintenance window matters.

---

## 8. Known gaps

- No `render.yaml`, so the service's build command, start command, Node version and
  branch binding live only in the Render dashboard and are not reviewable here or
  captured in version control. Worth committing a `render.yaml` as part of this work.
- CI runs tests but does not deploy or run migrations — the sequence above is manual
  and has no automated guard.
- No staging environment. Every step in section 3 would be rehearsed against a restored
  snapshot on a separate cluster if one existed. Strongly worth doing before the real run.
- The parent app ships as native iOS/Android builds with the API URL baked in at build
  time. If the API origin changes in this release, those builds need rebuilding and
  resubmitting — see [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md).
