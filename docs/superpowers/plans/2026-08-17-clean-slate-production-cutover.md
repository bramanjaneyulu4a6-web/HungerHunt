# Clean-Slate Production Cutover Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Take the `Ashok-work` backend live on the existing Render service against a brand-new `graarr_ecommerce` Atlas database, with every reachable credential rotated and zero contact with the old `hungerhunt_production` data.

**Architecture:** Fresh install, not a migration. Phase 1 (Tasks 1–10) is executable now with only Atlas + Google dashboard access and produces a fully rehearsed production boot on the local machine, a locked founding-admin account in the live database, and a paste-ready env manifest. Tasks 11–12 are runbooks that stay blocked until Render/Vercel access exists.

**Tech Stack:** Node 26 / Express / Mongoose, MongoDB Atlas, Render (web service), Vercel (4 static frontends), Vite.

**Spec:** `docs/superpowers/specs/2026-08-17-clean-slate-production-cutover-design.md`

## Global Constraints

- **Never print a secret value** — not in chat, not in logs, not in command echoes. Verify secrets by variable *name*, string *length*, or command *exit code*. Commands below are written so secrets stay inside files and shell substitutions.
- **Never send any request to `https://hungerhunt-dbat.onrender.com`** during this plan except the read-only GETs in Task 11. Its rate limiter shares one bucket across all clients until the new code deploys; failed logins there can lock out the service.
- **Never connect to the old database.** The only permitted interaction with `hungerhunt_production` is the *negative* check in Task 2 proving the new user is refused. The old connection string (user `bramanjaneyulu4a6_db_user`) must never be used again. *(Moot as of 2026-08-20: `hungerhunt_production` was dropped. The negative check in Task 2 will now fail on a missing database rather than on authorization — read it as satisfied, not as a regression.)*
- **`OWNER` steps** need the human at the keyboard (Atlas/Google consoles, choosing passwords). The executor stops at each OWNER step, states exactly what to do, and waits. The executor never learns the founding admin password or types any owner password.
- **Scoped commits only.** The working tree carries unrelated in-progress kiosk changes (`hungerhunt-kiosk/src/kiosk.css`, `src/pages/KioskBilling.jsx`, `src/pages/Login.jsx`, `src/constants/`). `git add` only the files each task names — never `git add -A` / `git add .`.
- **On any Expected-vs-actual mismatch: STOP the task and report.** Do not improvise around a failed check; the checks are the point.
- All backend commands run from `/Users/gayani/HungerHunt/backend` unless stated. Node ≥ 20.6 required for `--env-file` (machine has 26.7 — Task 1 verifies).

---

### Task 1: Preflight gate

Everything later assumes this exact starting state. No files change in this task.

**Files:** none (verification only)

**Interfaces:**
- Produces: a confirmed-good baseline; every later task assumes these checks passed.

- [x] **Step 1: Confirm branch, remote, and the only dirty files are the known kiosk work**

Run: `cd /Users/gayani/HungerHunt && git branch --show-current && git status --short`
Expected: branch `Ashok-work`; status lists ONLY `hungerhunt-kiosk/src/kiosk.css`, `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, `hungerhunt-kiosk/src/pages/Login.jsx`, `?? hungerhunt-kiosk/src/constants/`, and (if already written) `?? docs/` entries for the spec/plan. Anything else → STOP, ask the owner what it is.

- [x] **Step 2: Confirm toolchain**

Run: `node --version && mongosh --version && jq --version`
Expected: node ≥ v20.6 (v26.7.0 known good); mongosh prints a version; jq prints a version. If `jq` is missing: `brew install jq`.

- [x] **Step 3: Confirm local MongoDB is up (dev work continues against it)**

Run: `brew services list | grep mongodb-community`
Expected: `started`.

- [x] **Step 4: Backend test suite green on this exact commit**

Run: `cd /Users/gayani/HungerHunt/backend && JWT_SECRET=ci-test-secret npm test 2>&1 | tail -6`
Expected: `pass 422`, `fail 0`. Any failure → STOP; the deploy candidate is broken.

- [x] **Step 5: Snapshot the current backend/.env for value carry-over**

Run: `cd /Users/gayani/HungerHunt/backend && cp .env .env.pre-cutover.bak && git check-ignore .env.pre-cutover.bak && wc -c .env.pre-cutover.bak`
Expected: `git check-ignore` echoes the filename (proving it can never be committed); byte count > 0. This backup is the source for Cloudinary/EMAIL_USER values and is deleted in Task 10.

---

### Task 2: New Atlas database user (OWNER) + connectivity proof

**Files:**
- Create: `backend/.env.production.local` (started here with `MONGO_URI` only; completed in Task 4)

**Interfaces:**
- Produces: `backend/.env.production.local` containing a working `MONGO_URI=` line for user `graarr_app` → database `graarr_ecommerce`. Tasks 4, 8, 9 consume this file.

- [x] **Step 1: Generate the password and write the MONGO_URI line (secret never displayed)**

Run:
```bash
cd /Users/gayani/HungerHunt/backend
umask 077
PW=$(openssl rand -hex 24)
cat > .env.production.local <<EOF
# Production env manifest — paste source for Render (Task 11). NEVER COMMIT.
MONGO_URI=mongodb://graarr_app:${PW}@ac-m3lsp9k-shard-00-00.94ctayx.mongodb.net:27017,ac-m3lsp9k-shard-00-01.94ctayx.mongodb.net:27017,ac-m3lsp9k-shard-00-02.94ctayx.mongodb.net:27017/graarr_ecommerce?replicaSet=atlas-13fhsx-shard-0&ssl=true&authSource=admin
EOF
unset PW
git check-ignore .env.production.local
```
Expected: `git check-ignore` echoes the filename. (Hex password = no URL-encoding hazards in the URI.)

- [x] **Step 2 (OWNER): Create the user in the Atlas console**

Log in at cloud.mongodb.com (account `dhiruv.kamma04@gmail.com`) → the project containing cluster `ac-m3lsp9k` → **Database Access** → **Add New Database User**:
- Authentication: Password. Username: `graarr_app`.
- Password: open `backend/.env.production.local` in your editor; copy the text between `graarr_app:` and `@` on the MONGO_URI line. Paste it as the password.
- Database User Privileges → **Specific Privileges** → Role `readWrite`, Database `graarr_ecommerce` (type the name; the database doesn't exist yet — that's expected). **No other roles.** Must NOT be `readWriteAnyDatabase` or Atlas admin.
- Add User. Then check **Network Access**: an entry must cover this machine (an existing `0.0.0.0/0` entry is fine for now).
Say "done" when finished.

- [x] **Step 3: Positive proof — new user can write and read its own database**

Run:
```bash
cd /Users/gayani/HungerHunt/backend
URI=$(grep '^MONGO_URI=' .env.production.local | cut -d= -f2-)
mongosh "$URI" --quiet --eval '
  db.cutover_probe.insertOne({at: new Date(), phase: 1});
  print("insert ok, count=" + db.cutover_probe.countDocuments());
  db.cutover_probe.drop();
  print("cleanup ok");
'
```
Expected: `insert ok, count=1` then `cleanup ok`. Auth failure → the console password doesn't match the file; redo Step 2 (Atlas → Edit user → Edit Password, re-copy from the file).

- [x] **Step 4: Negative proof — new user is refused on the old database**

Run:
```bash
cd /Users/gayani/HungerHunt/backend
URI=$(grep '^MONGO_URI=' .env.production.local | cut -d= -f2- | sed 's#/graarr_ecommerce?#/hungerhunt_production?#')
mongosh "$URI" --quiet --eval 'db.students.countDocuments()' 2>&1 | tail -2
```
Expected: an authorization error (`not authorized on hungerhunt_production` or similar). **If this returns a number, STOP** — the user was created with cluster-wide privileges; go back to Step 2 and scope it to `graarr_ecommerce` only.

---

### Task 3: Rotate Gmail app password and Firebase service-account key (OWNER)

**Files:**
- Modify: `backend/.env.production.local` (append `EMAIL_*` and `FIREBASE_*` lines)

**Interfaces:**
- Consumes: `.env.production.local` from Task 2.
- Produces: working `EMAIL_USER`, `EMAIL_PASS`, `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY` lines. Task 4 completes the file; Task 8 proves the Firebase key at boot; Task 9 proves the Gmail password by real delivery.

- [ ] **Step 1 (OWNER): New Gmail app password**

> **NOT DONE — deferred by owner decision on 2026-08-18.** The existing app
> password was carried over instead. It remains valid, and remains exposed in the
> history of a public repository. This box stays unticked until the rotation happens.

Google Account (the account in `EMAIL_USER` — see `grep '^EMAIL_USER=' .env.pre-cutover.bak | cut -d= -f1` context; the executor may show you the address, it is not a secret) → Security → 2-Step Verification → **App passwords** → create one named `hungerhunt-backend-2026`. Keep the 16-character password visible for Step 2. **Do not revoke the old one yet** — that happens after the rehearsal proves the new one works (Task 10).

- [x] **Step 2 (OWNER + executor): Append EMAIL lines without echoing the secret** — done, but with the *carried-over* password rather than a new one, Step 1 having been deferred. Delivery was proven in Task 9 Step 4.

Owner: paste the app password (spaces removed) when the shell prompts — input is silent:
```bash
cd /Users/gayani/HungerHunt/backend
EMAIL_USER_VAL=$(grep '^EMAIL_USER=' .env.pre-cutover.bak | cut -d= -f2-)
printf 'EMAIL_USER=%s\n' "$EMAIL_USER_VAL" >> .env.production.local
read -s -p "Paste new Gmail app password (input hidden): " APP_PW; echo
printf 'EMAIL_PASS=%s\n' "$APP_PW" >> .env.production.local
unset APP_PW EMAIL_USER_VAL
grep -c '^EMAIL_' .env.production.local
```
Expected: final output `2`.

- [x] **Step 3 (OWNER): New Firebase service-account key**

console.firebase.google.com → project `hungerhuntm` → ⚙ Project settings → **Service accounts** → **Generate new private key** → save the JSON as `/Users/gayani/HungerHunt/backend/.firebase-key-new.json` (inside `backend/` so the next step can reach it; it is git-ignored by no rule, so it MUST be deleted in Step 5). **Do not delete the old key in Google Cloud IAM yet** — after the rehearsal (Task 10).

- [x] **Step 4: Splice the key into the manifest in `\n`-escaped form**

The code un-escapes at read time (`config/firebase.js` does `.replace(/\\n/g, "\n")`), so the env value must be the JSON string form — quotes kept, `\n` literal, which is exactly what `jq` without `-r` prints:
```bash
cd /Users/gayani/HungerHunt/backend
{
  printf 'FIREBASE_PROJECT_ID=%s\n'  "$(jq -r '.project_id'   .firebase-key-new.json)"
  printf 'FIREBASE_CLIENT_EMAIL=%s\n' "$(jq -r '.client_email' .firebase-key-new.json)"
  printf 'FIREBASE_PRIVATE_KEY=%s\n'  "$(jq    '.private_key'  .firebase-key-new.json)"
} >> .env.production.local
grep -c '^FIREBASE_' .env.production.local
```
Expected: `3`.

- [x] **Step 5: Shred the downloaded JSON**

Run: `cd /Users/gayani/HungerHunt/backend && rm .firebase-key-new.json && ls .firebase-key-new.json 2>&1`
Expected: `No such file or directory`.

---

### Task 4: Complete the production manifest

**Files:**
- Modify: `backend/.env.production.local` (append everything else)

**Interfaces:**
- Consumes: the file as left by Task 3; Cloudinary values from `.env.pre-cutover.bak`.
- Produces: the complete production env. Task 8 boots from this file verbatim; Task 11 pastes it into Render verbatim (minus `PORT`).

- [x] **Step 1: Generate the three JWT secrets and append the remaining variables**

```bash
cd /Users/gayani/HungerHunt/backend
{
  printf 'NODE_ENV=production\n'
  printf 'PORT=5001\n'                       # rehearsal only; Render supplies its own PORT — do not paste PORT into Render
  printf 'JWT_SECRET=%s\n'         "$(openssl rand -hex 32)"
  printf 'PARENT_JWT_SECRET=%s\n'  "$(openssl rand -hex 32)"
  printf 'STUDENT_JWT_SECRET=%s\n' "$(openssl rand -hex 32)"
  printf 'BUSINESS_TIME_ZONE=Asia/Kolkata\n'
  printf 'TRUST_PROXY=1\n'                   # harmless locally; required behind Render's proxy
  printf 'PARENT_CLIENT_URL=https://hunger-hunt-parent.vercel.app\n'
  printf 'ADMIN_CLIENT_URL=https://hunger-hunt-beta.vercel.app\n'
  printf 'KIOSK_CLIENT_URL=https://hunger-hunt-kiosk.vercel.app\n'
  printf 'WAREHOUSE_CLIENT_URL=https://hunger-hunt-warehouse.vercel.app\n'   # candidate; finalized in Task 12
  printf 'MAX_ADMIN_ACCOUNTS=3\n'
  grep '^CLOUDINARY_CLOUD_NAME=' .env.pre-cutover.bak
  grep '^CLOUDINARY_API_KEY='    .env.pre-cutover.bak
  grep '^CLOUDINARY_API_SECRET=' .env.pre-cutover.bak   # rotation deferred — no dashboard access; tracked in spec
} >> .env.production.local
```

- [x] **Step 2: Verify completeness by names only**

Run: `cd /Users/gayani/HungerHunt/backend && grep -oE '^[A-Z_]+=' .env.production.local | tr -d '=' | sort`
Expected — exactly these 21 names, no more, no fewer:
```
ADMIN_CLIENT_URL
BUSINESS_TIME_ZONE
CLOUDINARY_API_KEY
CLOUDINARY_API_SECRET
CLOUDINARY_CLOUD_NAME
EMAIL_PASS
EMAIL_USER
FIREBASE_CLIENT_EMAIL
FIREBASE_PRIVATE_KEY
FIREBASE_PROJECT_ID
JWT_SECRET
KIOSK_CLIENT_URL
MAX_ADMIN_ACCOUNTS
MONGO_URI
NODE_ENV
PARENT_CLIENT_URL
PARENT_JWT_SECRET
PORT
STUDENT_JWT_SECRET
TRUST_PROXY
WAREHOUSE_CLIENT_URL
```

- [x] **Step 3: Verify the JWT trio meets the production validator's rules without printing them**

Run:
```bash
cd /Users/gayani/HungerHunt/backend && node --env-file=.env.production.local -e '
const s=[process.env.JWT_SECRET,process.env.PARENT_JWT_SECRET,process.env.STUDENT_JWT_SECRET];
console.log("lengths:",s.map(x=>x.length).join(","),"distinct:",new Set(s).size===3);'
```
Expected: `lengths: 64,64,64 distinct: true`.

---

### Task 5: Make `backend/.env` permanently local-safe

After this task, `npm run dev` with no override is incapable of touching any production database — the standing footgun dies here.

**Files:**
- Modify: `backend/.env` (full rewrite)

**Interfaces:**
- Consumes: `.env.pre-cutover.bak` (Cloudinary + EMAIL_USER values), the new Gmail app password and Firebase lines already in `.env.production.local`.
- Produces: a dev-only `.env`. All dev workflows (`npm run dev`, seeds, tests) use it with no inline override ever again.

- [x] **Step 1: Write the new dev .env (dev-only JWT secrets; prod secrets never reused in dev)**

```bash
cd /Users/gayani/HungerHunt/backend
umask 077
{
  printf '# Local development only. Production values live in .env.production.local (gitignored).\n'
  printf 'NODE_ENV=development\n'
  printf 'PORT=5001\n'
  printf 'MONGO_URI=mongodb://127.0.0.1:27017/hungerhunt_dev\n'
  printf 'JWT_SECRET=%s\n'         "$(openssl rand -hex 24)"
  printf 'PARENT_JWT_SECRET=%s\n'  "$(openssl rand -hex 24)"
  printf 'STUDENT_JWT_SECRET=%s\n' "$(openssl rand -hex 24)"
  printf 'PARENT_CLIENT_URL=http://localhost:5173\n'
  printf 'ADMIN_CLIENT_URL=http://localhost:5174\n'
  printf 'MAX_ADMIN_ACCOUNTS=3\n'
  grep '^EMAIL_USER='            .env.production.local
  grep '^EMAIL_PASS='            .env.production.local
  grep '^CLOUDINARY_CLOUD_NAME=' .env.pre-cutover.bak
  grep '^CLOUDINARY_API_KEY='    .env.pre-cutover.bak
  grep '^CLOUDINARY_API_SECRET=' .env.pre-cutover.bak
  grep '^FIREBASE_PROJECT_ID='   .env.production.local
  grep '^FIREBASE_CLIENT_EMAIL=' .env.production.local
  grep '^FIREBASE_PRIVATE_KEY='  .env.production.local
} > .env
grep -c 'hungerhunt_production\|94ctayx' .env; true
```
Expected: final grep prints `0` — no Atlas hostname or old database name survives in `.env`.

- [x] **Step 2: Prove a bare dev boot lands on local Mongo**

Run: `cd /Users/gayani/HungerHunt/backend && npm run dev 2>&1 | head -20 &` then after ~5s: `curl -s http://localhost:5001/health`
Expected in the log: `MongoDB Connected Successfully`, `Server running on port 5001`, and `✅ Firebase initialized` (proves the new key parses). Health returns `{"status":"ready","db":"connected"}`.
Then verify the connection target and stop the server:
`lsof -nP -p $(lsof -nP -iTCP:5001 -sTCP:LISTEN -t | head -1) -iTCP 2>/dev/null | grep 27017 | head -2` → connections to `127.0.0.1:27017` only. Kill: `lsof -nP -iTCP:5001 -sTCP:LISTEN -t | xargs kill`.
Note: dev JWT secrets are new, so previously issued dev tokens are invalid — re-login in dev apps once. Seeded dev account passwords are unaffected.

---

### Task 6: Commit `render.yaml` and the planning documents

**Files:**
- Create: `render.yaml` (repo root)
- Commit (already written): `docs/backend-production-deploy.md`, `docs/superpowers/specs/2026-08-17-clean-slate-production-cutover-design.md`, `docs/superpowers/plans/2026-08-17-clean-slate-production-cutover.md`

**Interfaces:**
- Produces: the reviewable service definition Task 11 mirrors into the Render dashboard.

- [x] **Step 1: Write `render.yaml`**

```yaml
# Service definition for the HungerHunt backend on Render.
#
# The live service was created by hand, so this file is the reviewable source
# of truth to MIRROR into the dashboard (Task 11 of the cutover plan) — applying
# it as a Blueprint would create a *second* service; don't, unless intentionally
# recreating from scratch. Values marked sync:false are secrets: set in the
# dashboard from backend/.env.production.local, never committed.
#
# autoDeploy is off on purpose: a push to Ashok-work must not become a silent
# production deploy. Deploys are triggered manually until the team decides otherwise.
services:
  - type: web
    name: hungerhunt-dbat
    runtime: node
    rootDir: backend
    buildCommand: npm ci
    startCommand: npm start
    healthCheckPath: /health
    branch: Ashok-work
    autoDeploy: false
    envVars:
      - key: NODE_ENV
        value: production
      - key: BUSINESS_TIME_ZONE
        value: Asia/Kolkata
      - key: TRUST_PROXY
        value: "1"
      - key: MAX_ADMIN_ACCOUNTS
        value: "3"
      - key: PARENT_CLIENT_URL
        value: https://hunger-hunt-parent.vercel.app
      - key: ADMIN_CLIENT_URL
        value: https://hunger-hunt-beta.vercel.app
      - key: KIOSK_CLIENT_URL
        value: https://hunger-hunt-kiosk.vercel.app
      - key: WAREHOUSE_CLIENT_URL
        value: https://hunger-hunt-warehouse.vercel.app
      - key: MONGO_URI
        sync: false
      - key: JWT_SECRET
        sync: false
      - key: PARENT_JWT_SECRET
        sync: false
      - key: STUDENT_JWT_SECRET
        sync: false
      - key: EMAIL_USER
        sync: false
      - key: EMAIL_PASS
        sync: false
      - key: CLOUDINARY_CLOUD_NAME
        sync: false
      - key: CLOUDINARY_API_KEY
        sync: false
      - key: CLOUDINARY_API_SECRET
        sync: false
      - key: FIREBASE_PROJECT_ID
        sync: false
      - key: FIREBASE_CLIENT_EMAIL
        sync: false
      - key: FIREBASE_PRIVATE_KEY
        sync: false
```
(No `PORT` entry — Render injects its own.)

- [x] **Step 2: Confirm nothing secret is staged, then commit — named files only**

Run:
```bash
cd /Users/gayani/HungerHunt
git add render.yaml docs/backend-production-deploy.md \
  docs/superpowers/specs/2026-08-17-clean-slate-production-cutover-design.md \
  docs/superpowers/plans/2026-08-17-clean-slate-production-cutover.md
git status --short   # review: ONLY the four files above staged; kiosk files still unstaged
git diff --cached | grep -ciE '[0-9a-f]{48}|BEGIN PRIVATE KEY|graarr_app:[0-9a-f]{8}'; true
```
Expected: status shows exactly 4 staged files; the secret-scan grep prints `0` (it matches real secret shapes — 48+ hex chars, a pasted private key, a real password in the URI — none of which appear in documentation text).
Then: `git commit -m "Plan the clean-slate production cutover and pin the Render service definition"`
Do NOT push — `autoDeploy: false` is not yet true on the dashboard side, and pushing is a separate decision recorded in Task 11.

---

### Task 7: Point the four frontends back at the local backend

The deployed API still runs the old code until Task 11; the newer frontends belong on the local backend meanwhile. Values below are the verbatim pre-session contents (backups also exist at the session scratchpad `env-backup-local/`, but these inline copies are authoritative if that directory is gone).

**Files:**
- Modify: `frontend-admin/.env`, `frontend-parent/.env`, `hungerhunt-kiosk/.env`, `hungerhunt-warehouse/.env` (all gitignored — no commit)

**Interfaces:**
- Produces: dev frontends that talk to `http://localhost:5001/api`.

- [x] **Step 1: Restore each file's first line**

In each of the four files, set line 1 back to:
`VITE_API_BASE_URL=http://localhost:5001/api`
(replacing `VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api`). Every other line stays untouched — `frontend-parent/.env` keeps its `VITE_FIREBASE_*`/`VITE_VAPID_KEY` block and trailing comments; the others keep their trailing comments.

- [x] **Step 2: Verify**

Run: `cd /Users/gayani/HungerHunt && grep -H '^VITE_API_BASE_URL' frontend-admin/.env frontend-parent/.env hungerhunt-kiosk/.env hungerhunt-warehouse/.env`
Expected: all four print `http://localhost:5001/api`. Any Vite dev server running must be restarted to pick this up (Vite reads env at startup): kill anything on 5173–5176, e.g. `for p in 5173 5174 5175 5176; do lsof -nP -iTCP:$p -sTCP:LISTEN -t | xargs kill 2>/dev/null; done; true` — restarting them is optional now; they're not needed until normal dev work resumes.

---

### Task 8: Dress rehearsal — the production boot, locally

This is the same gate Render will run. Passing here means Task 11 cannot fail on configuration.

**Files:** none (runtime verification)

**Interfaces:**
- Consumes: complete `.env.production.local` (Task 4).
- Produces: a running rehearsal server on :5001 that Task 9 registers the founding admin against. **Leave it running at the end of this task.**

- [x] **Step 1: Ensure port 5001 is free**

Run: `lsof -nP -iTCP:5001 -sTCP:LISTEN -t | xargs kill 2>/dev/null; sleep 1; lsof -nP -iTCP:5001 -sTCP:LISTEN | wc -l`
Expected: `0`.

- [x] **Step 2: Boot with the production env (background, log to file)**

Run: `cd /Users/gayani/HungerHunt/backend && node --env-file=.env.production.local server.js > /tmp/rehearsal-boot.log 2>&1 &`
(`--env-file` sets variables before any module loads; `dotenv` never overrides existing variables, so nothing from `.env` leaks in.)

- [x] **Step 3: Read the boot log after ~15s (Atlas TLS handshakes are slower than local)**

Run: `sleep 15 && cat /tmp/rehearsal-boot.log`
Expected, in order:
1. `✅ Firebase initialized` — the rotated key parses.
2. `MongoDB Connected Successfully` — `validateRuntimeEnv` passed (it throws *before* connect; reaching this line proves every production env rule was satisfied) and `graarr_ecommerce` is reachable.
3. `Server running on port 5001`.
The weekly-order index drop logs nothing on an empty database (IndexNotFound is silently the goal). Failure modes: an env-validation throw names the bad variable — fix it in `.env.production.local` and re-run from Step 1; `querySrv`/auth errors → recheck Task 2.

- [x] **Step 4: Health check and index audit**

Run: `curl -s http://localhost:5001/health`
Expected: `{"status":"ready","db":"connected"}`
Run:
```bash
cd /Users/gayani/HungerHunt/backend
URI=$(grep '^MONGO_URI=' .env.production.local | cut -d= -f2-)
mongosh "$URI" --quiet --eval '
  print("collections: " + db.getCollectionNames().length);
  const bad = db.fulfillmentorders.getIndexes().filter(i => i.name === "one_fulfillment_order_per_student_business_week");
  print("weekly-order index present: " + (bad.length > 0));
'
```
Expected: `collections:` ≥ 1 (Mongoose registered its models) and `weekly-order index present: false`.

---

### Task 9: Found the admin account, lock the door, prove email (OWNER)

**Files:** none (live-database state change)

**Interfaces:**
- Consumes: the rehearsal server from Task 8, still running on :5001.
- Produces: exactly one admin in `graarr_ecommerce`; registration locked; Gmail app password proven by a delivered email.

- [x] **Step 1 (OWNER): Register the founding admin — run this yourself; the executor must not see the password**

In your own terminal, with your real name/phone/email and a password of 8+ characters that you choose and store in your password manager:
```bash
curl -s -X POST http://localhost:5001/api/admin/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"YOUR NAME","phone":"YOUR PHONE","email":"you@example.com","password":"YOUR-CHOSEN-PASSWORD"}'
```
Expected: `{"message":"Admin registered successfully","role":"admin"}`. This account is the production founding admin — it survives into the live deployment because this *is* the live database.

- [x] **Step 2: Executor verifies the door locked behind the first account**

Run:
```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST http://localhost:5001/api/admin/register \
  -H 'Content-Type: application/json' \
  -d '{"name":"Nobody","phone":"0000000000","email":"nobody@example.invalid","password":"aaaaaaaa"}'
```
Expected: `401` or `403` (the middleware's "Only a signed-in admin can create additional admin accounts."). **A `201` here is a critical failure — STOP everything**; it would mean the bootstrap gate is broken.

- [x] **Step 3: Executor verifies exactly one admin exists**

Run:
```bash
cd /Users/gayani/HungerHunt/backend
URI=$(grep '^MONGO_URI=' .env.production.local | cut -d= -f2-)
mongosh "$URI" --quiet --eval 'print("admins: " + db.admins.countDocuments())'
```
Expected: `admins: 1`.

- [x] **Step 4 (OWNER): Login works, and the email pipeline delivers**

Login (your terminal): `curl -s -X POST http://localhost:5001/api/admin/login -H 'Content-Type: application/json' -d '{"email":"you@example.com","password":"YOUR-CHOSEN-PASSWORD"}'` → expect a JSON response containing a token.
Then trigger a real email: `curl -s -X POST http://localhost:5001/api/admin/forgot-password -H 'Content-Type: application/json' -d '{"email":"you@example.com"}'` → within ~2 minutes an email arrives at that address, proving the rotated Gmail app password sends. **Do not click the link** — it points at the not-yet-live admin URL; just delete the email. Say "email arrived" or "no email" to the executor.
(No email → check the Google account's security activity and the rehearsal log tail: `tail -5 /tmp/rehearsal-boot.log`.)

---

### Task 10: Phase-1 closeout

**Files:**
- Modify: `docs/superpowers/specs/2026-08-17-clean-slate-production-cutover-design.md` (status line)
- Delete: `backend/.env.pre-cutover.bak`

**Interfaces:**
- Produces: a shut-down rehearsal, revoked old Google credentials, and a committed record that Phase 1 is complete.

- [x] **Step 1: Stop the rehearsal server**

Run: `lsof -nP -iTCP:5001 -sTCP:LISTEN -t | xargs kill 2>/dev/null; sleep 1; curl -s -m 2 http://localhost:5001/health || echo "down"`
Expected: `down`.

- [x] **Step 2 (OWNER): Revoke the superseded Google credentials — new ones are now proven**

- Google Account → Security → App passwords → delete every HungerHunt-related app password EXCEPT `hungerhunt-backend-2026`.
- Firebase console → project settings → Service accounts → **Manage service account permissions** (opens Google Cloud IAM) → the `firebase-adminsdk` service account → Keys → delete all keys except the one whose creation date is today.
Say "done".

- [x] **Step 3: Delete the old-env backup (its MONGO_URI is the compromised credential)**

Run: `cd /Users/gayani/HungerHunt/backend && rm .env.pre-cutover.bak && ls .env.pre-cutover.bak 2>&1`
Expected: `No such file or directory`. (The old Atlas user itself is deleted in Task 11 Step 6, once nothing deployed uses it.)

- [x] **Step 4: Mark the spec and commit**

In the spec file, change the line `**Status:** Approved approach (A), pending spec review` to `**Status:** Phase 1 complete (rehearsed boot, founding admin created) — awaiting Render/Vercel access for Phases 2–3`.
Run:
```bash
cd /Users/gayani/HungerHunt
git add docs/superpowers/specs/2026-08-17-clean-slate-production-cutover-design.md
git commit -m "Record Phase 1 of the production cutover as complete"
```

---

### Task 11: Deploy the backend — DONE 2026-08-18 (Step 7 closed 2026-08-18)

Executed 2026-08-18. All steps complete. Step 7 failed on first attempt and was closed later the same day; the investigation is kept at the end of this task because the wrong answer was recorded first.

Do not start until the owner confirms Render login. Every value pasted comes from `backend/.env.production.local`; every setting mirrors `render.yaml`.

**Files:** none (dashboard + verification)

- [x] **Step 1 (OWNER): Mirror `render.yaml` into the existing service** — dashboard → `hungerhunt-dbat` → Settings: branch `Ashok-work`, root directory `backend`, build `npm ci`, start `npm start`, health check path `/health`, auto-deploy **off**.
- [x] **Step 2 (OWNER): Environment** — add every variable from `.env.production.local` EXCEPT `PORT` (Render supplies it). **`FIREBASE_PRIVATE_KEY` is the one value not pasted verbatim:** in the file it is wrapped in double quotes (jq wrote it that way). `node --env-file` strips those quotes, but Render's env UI stores exactly what you paste — so paste it **without** the surrounding quotes, keeping the literal `\n` sequences. A leading `"` survives into `config/firebase.js` and breaks the PEM parse. Verified locally 2026-08-18: after unescaping, the key yields 28 newlines and a correct `-----BEGIN PRIVATE KEY-----` prefix.
- [x] **Step 3 (OWNER): Push the branch, then Manual Deploy** — `git push origin Ashok-work` (first push of the cutover; auto-deploy is off, so the push itself deploys nothing), then dashboard → Manual Deploy → latest commit. Watch the deploy log for the same three boot lines as Task 8 Step 3.
- [x] **Step 4: Executor verifies the new code is live (read-only)**

Run: `curl -s https://hungerhunt-dbat.onrender.com/health && curl -s -o /dev/null -w ' v1:%{http_code}\n' https://hungerhunt-dbat.onrender.com/api/v1/analytics/inventory`
Expected: `{"status":"ready","db":"connected"}` and ` v1:401` — `/health` does not exist on the old code, so a ready response IS the proof of cutover; `401` (not `404`) proves the v1 surface is mounted and auth-gated. (Corrected 2026-08-18: the probe path must be `/api/v1/analytics/inventory` — the router mounts no root route, so bare `/api/v1/analytics` legitimately 404s even when the slice is live. Verified against the local rehearsal.)
- [x] **Step 5 (OWNER): One real login** — sign in with the founding admin at the API via any frontend pointed at it (or curl the login route over HTTPS). Expect success; the account was created in Task 9 into this same database.
- [x] **Step 6 (OWNER): Retire the old Atlas user** — Atlas → Database Access → delete `bramanjaneyulu4a6_db_user`. Nothing uses it anymore: the new service uses `graarr_app`, and the old service stops existing as a going concern at this moment. The old `hungerhunt_production` data stays untouched as an archive. **Superseded 2026-08-20:** the archive was dropped — the owner judged the pre-cutover records not worth retaining. A temporary user scoped to that database alone was created for the drop and deleted immediately afterwards, so the "no live credential can reach it" property still holds. No export was taken.
- [x] **Step 7: Rate-limiter sanity (TRUST_PROXY)** — ✅ **CLOSED 2026-08-18, `TRUST_PROXY=3`, see findings below** — from two different networks (e.g. Wi-Fi and phone hotspot), one failed login each: both must get `401` (per-client buckets). Then several rapid failed logins from ONLY the hotspot until a `429` appears, and confirm the Wi-Fi network still receives `401` — proving buckets are per-IP. Safe now precisely because there are no real users yet to lock out.

**Step 7 (2026-08-18): failed, then closed. `TRUST_PROXY` 1 → 3.**

Twelve consecutive failed logins returned twelve 401s where the eleventh should have
been a 429. `NODE_ENV` was `production`, so the development skip was not firing, and a
local probe of the real `authLimiter` produced `401 x10` then `429`, so the code was
correct.

Two readings fitted the outside evidence: a hop count that resolved `req.ip` to a
rotating edge address, or more than one process each holding its own in-memory store.
The second was recorded as the leading answer and was wrong. What settled it:

- `npm start` is `node server.js` — no cluster, no pm2 — so one process per instance.
- A local probe established the rule: under `trust proxy = N`, Express returns the
  **N-th entry from the right** of `X-Forwarded-For`.
- `TRUST_PROXY=1` produced two or three stable buckets (the rightmost hop is a small
  pool of edge addresses). `TRUST_PROXY=2` produced a **fresh bucket on every request**
  (that position varies per request). Only a three-entry chain explains both.
- `TRUST_PROXY=3` produced one bucket: `401` with remaining 9,8,7,6,5,4,3,2,1,0 on a
  single reset clock, then `429` on the eleventh and twelfth. Verified in production.

So Render fronts the service with **three** hops, not the one the variable assumed.
No code change was required. A diagnostic route reporting the real chain was written
and committed on a branch in case a fixed hop count proved unreliable; it was never
deployed and can be discarded.

Also verified along the way: client-supplied `X-Forwarded-For` does **not** control the
limiter key — injected values are pushed left of the client address Cloudflare appends
— so there is no spoofing bypass at any of these settings.

Every limiter keys on `req.ip`, so `kioskSessionLimiter` and `searchLimiter` were fixed
by the same change.

---

### Task 12: Deploy the four frontends — DONE 2026-08-19

All four are live and verified from outside: each bundle carries
`https://hungerhunt-dbat.onrender.com/api` and no `localhost`, each answers a
nonsense deep link with the app's own HTML (Vercel's Vite preset supplies the
single-page fallback, so no `vercel.json` rewrite was needed), and the backend
returns an `access-control-allow-origin` for each of the four origins while
refusing an unknown one.

`hunger-hunt-parent`, `hunger-hunt-beta` and `hunger-hunt-kiosk` already existed and
redeployed themselves from `main` when PR #1 merged, with their API URL already set.
Only the warehouse project was new. Naming it `hunger-hunt-warehouse` — the value the
manifest and `render.yaml` already carried — meant **no Render change and no redeploy**
for Step 2.

- [x] **Step 1 (OWNER): Four Vercel projects** from this repo — root directories `frontend-parent`, `frontend-admin`, `hungerhunt-kiosk`, `hungerhunt-warehouse` (warehouse is net-new; the other three may reuse the existing `hunger-hunt-*` projects if they're in reach, or be created fresh). Framework preset: Vite. Each project gets env var `VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api`. `frontend-parent` additionally gets every `VITE_FIREBASE_*` and `VITE_VAPID_KEY` value from `frontend-parent/.env` — these are public client config, safe in Vercel's env UI.
- [x] **Step 2: Reconcile origins** — no change required; the four live URLs match the four `*_CLIENT_URL` values already in Render, the manifest and `render.yaml`.
- [x] **Step 3 (OWNER): End-to-end login per role** — done 2026-08-19. Founding admin, one warehouse account and one caretaker account, all created from the admin UI and all three signed in against the deployed apps. The caretaker needed a hostel first: the schema refuses a caretaker without one, and `hostels` was empty. The hostel created for it carries the placeholder code `TEST` and still wants renaming — edit it in place rather than replacing it, because the caretaker points at its `_id` and a code change cascades `hostelNumber` to students, while nothing deletes a hostel. Parent/student flows follow data setup, which is normal admin work, not cutover work.
- [x] **Step 4: Final sweep** — done 2026-08-19. `/health` ready, both v1 probes 401, all four frontends 200 at the root and on a deep link, and a CORS preflight answered for each of the four origins while an unknown origin is refused. **The system is live.**

---

## Self-review notes (kept for the executor)

- Spec coverage: Atlas user/scoping → Task 2; Gmail/Firebase rotation → Tasks 3, 10; env split → Tasks 4–5; render.yaml → Task 6; frontend revert → Task 7; rehearsal + founding admin + locked bootstrap → Tasks 8–9; Render/Vercel runbooks incl. old-user retirement and TRUST_PROXY proof → Tasks 11–12. Cloudinary rotation is deliberately absent (no access) — tracked in the spec's Security notes.
- The `hunger-hunt-beta` → admin mapping in `*_CLIENT_URL` values is a candidate assumption carried from the old Vercel projects; Task 12 Step 2 is the reconciliation point if reality differs.
- Old-database safety: the only credential that can reach `hungerhunt_production` after Task 10 Step 3 is the old Atlas user, which only the owner can wield, and Task 11 Step 6 deletes it. *(2026-08-20: the database itself is gone, so this reduces to nothing to protect.)*
