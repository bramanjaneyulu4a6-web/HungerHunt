# Release checklist — parent app

The parent app ships three ways from one codebase (browser, iOS, Android), and
two of those three cannot be corrected after the fact without another review
cycle. This is the list that stands between a build and a parent's phone.

Work top to bottom. The first section is done once, before the first release
ever goes out; everything after it is done every time.

---

## Before the first release

These are open items, not formalities. Each one is a real gap today.

- [ ] **Rotate every credential that was committed to git.** They were removed
      from tracking, which does not remove them from history — anyone who has
      ever had repo access can still read them. The list is in
      [FIX-PLAN.md](FIX-PLAN.md#-action-required-cannot-be-done-from-here):
      the Firebase service account key, `JWT_SECRET` (rotating it signs
      everyone out, which is the point), the MongoDB Atlas password inside
      `MONGO_URI`, the Cloudinary API secret, and the Gmail app password.
      Scrubbing history afterwards is optional; rotating is not.

- [ ] **Finish the native push setup.** The code is all committed, and it
      delivers nothing until the manual steps are done — Android needs
      `google-services.json`; iOS needs four separate things and is silent
      until all four are in place. Both are written out step by step in
      [frontend-parent/README.md](frontend-parent/README.md#setup-that-cannot-be-done-from-the-repo).
      Test on a physical iPhone; the simulator cannot register with APNs.

- [ ] **Remove the dev auth bypass** when `Ashok-work` merges to `main`. It is
      branch-scoped and deliberately still here: `frontend-parent/src/utils/authBypass.js`
      and its use in `src/context/AuthContext.jsx`, `VITE_AUTH_BYPASS` in the
      parent `.env`, and `backend/middleware/devBypass.js` with `AUTH_BYPASS`.
      Both ends are already fenced — the frontend branch is dropped from any
      production build by `import.meta.env.DEV`, and the backend refuses to
      boot if `AUTH_BYPASS=true` meets `NODE_ENV=production` — so this is
      hygiene rather than an emergency. Do it anyway: the fences are the last
      line, not the plan.

- [ ] **Size the purchase-code migration before you deploy, not after.** A
      student's only secret is a four-digit code, and the counter takes nothing
      else — so a code set before that rule stops working the moment this ships.
      Nothing can read one back out of its hash to find them first. Run
      `node scripts/purchaseCodeAudit.js` from `backend/` (read-only): the
      number that matters is *with a purchase code set*, not the roster size,
      and only the parent app ever sets one. If it is zero there is nothing to
      migrate. Anything else is the list of families who may need to set a new
      code, which they can do themselves — Forgot Purchase Code asks for their
      own account password, not the old code. Re-run it after a few days of
      trading: students who always used four digits record themselves on their
      next purchase, and the remainder is the real number to chase.

- [ ] **Import the admission numbers before turning on the kiosk.** The
      self-serve terminal identifies a student by the school's own admission
      number, and a student whose record has none cannot open a session at
      all — they are refused at the gate. The field is `admissionNumber`; it
      goes through the existing bulk import as a sheet column, and the roster
      shows "Not set" for anyone still missing one. This is data, not code: no
      deploy fixes it, and nobody can use the kiosk until it is done.

- [ ] **Set `STUDENT_JWT_SECRET`.** It signs the kiosk's student sessions. It
      is optional and falls back to `JWT_SECRET`, so an unset key does not turn
      terminals away — which is exactly why it is easy to forget. While it is
      unset, a kiosk session is signed with the same key as a staff token.

- [ ] **Know what the open kiosk route exposes, and decide it is still what you
      want.** `POST /students/kiosk-session` takes an admission number and no
      secret, by decision. Anyone who can reach the API can walk the number
      space and read back names and wallet balances, and open a session as any
      student. They cannot spend: the four-digit code still gates checkout, and
      five wrong ones lock it for fifteen minutes. The rate limiter is the only
      other thing in front of it. The upgrade path, if the logs ever show
      enumeration, is one-time device enrollment — written up in
      `docs/superpowers/specs/2026-08-11-kiosk-student-self-serve-design.md`.

- [ ] **Create warehouse account(s) in the admin console (Account type →
      Warehouse).** A warehouse account can see and raise purchase orders,
      receive deliveries, and read stock and suppliers — no students, no
      wallets, no prices. Nobody can sign into `hungerhunt-warehouse` until at
      least one exists.

- [ ] **Clear out any `role: 'cashier'` accounts.** The role is gone with the
      counter it belonged to. Nobody is signed out by this — every cashier
      token was issued on an unreleased branch — but a row still carrying the
      role can no longer sign in anywhere, and login tells it so rather than
      failing obscurely. Delete those accounts or re-create them as admin:
      `db.admins.find({ role: 'cashier' })`.

- [ ] **Sign the storeroom device into `hungerhunt-warehouse`.** Its dev port
      (5176) is pinned with `strictPort` because the backend's CORS allowlist
      is a hardcoded array of origins; a deployed instance needs its own
      origin added the same way.

- [ ] **Run `node scripts/backfill-inventory-rows.mjs` from `backend/` once
      after deploy** — shelves every product that predates inventory-at-creation
      (idempotent).

- [ ] **Tell the counter staff that admin billing no longer charges.** An order
      raised from the admin console now always goes to the parent to approve —
      the student's four-digit code is not asked for there any more, and
      nothing moves until a parent answers. A student who wants food now buys
      it at the kiosk with their own code. Students whose parents have never
      registered cannot be billed from the console at all.

- [ ] **Decide what the store listings say.** Screenshots, description, privacy
      policy URL, and a support contact. An app that reads a child's spending
      will be asked what it collects and who sees it.

---

## Every release

### 1. Set the version in all three places

They are separate files and nothing keeps them in step, so a mismatch ships
quietly.

| Where | Field | Currently |
|---|---|---|
| `frontend-parent/package.json` | `version` | `1.0.0` |
| `frontend-parent/android/app/build.gradle` | `versionCode`, `versionName` | `1`, `"1.0"` |
| Xcode → target *App* → General | Version, Build (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` in `project.pbxproj`) | `1.0`, `1` |

- [ ] `versionCode` is an integer and **must increase for every single upload**
      to Play, including one that replaces a build rejected an hour earlier.
      Play refuses a repeat, and the error arrives at the end of the upload.
- [ ] iOS `CURRENT_PROJECT_VERSION` (Build) has the same rule per
      `MARKETING_VERSION` on App Store Connect.

### 2. Point the build at production

- [ ] `VITE_API_BASE_URL` in `frontend-parent/.env` is the production API, over
      **https**. It is baked into the bundle at `npm run build`, not read at
      runtime, so a build made against `localhost` is a build that reaches
      nothing from a phone — and both platforms block plaintext HTTP to
      anything but localhost, so http fails silently on device rather than
      loudly on a laptop.
- [ ] Backend `PARENT_CLIENT_URL` points at the deployed parent app, or the
      password-reset emails link somewhere nobody can reach.
- [ ] Backend is running with `NODE_ENV=production` and `TRUST_PROXY` set to
      the number of proxy hops in front of it. Without `TRUST_PROXY` every
      request looks like it came from the proxy, so all parents share one
      rate-limit bucket and a few failed logins lock out everybody.

### 3. Verify

CI runs the first four of these on every push and pull request
([.github/workflows/ci.yml](.github/workflows/ci.yml)). Run them locally before
tagging anyway — CI does not build the native shells.

```bash
npm test            --prefix backend            # 71 tests, all mocked; no database is touched
npm run lint        --prefix frontend-parent    # must be 0 errors, 0 warnings
npm run lint        --prefix hungerhunt-kiosk
npm run build       --prefix frontend-parent
npm run build       --prefix frontend-admin
npm run build       --prefix hungerhunt-kiosk
node scripts/check-shared-files.mjs             # the files duplicated across apps still match

cd frontend-parent && npx cap sync              # copies dist/ into ios/ and android/
```

- [ ] All of the above pass.
- [ ] `npx cap sync` ran **after** the final `npm run build`. The native shells
      serve a copy of `dist/`, so a shell synced before the last build ships
      the previous bundle, and nothing about it looks wrong until someone
      notices the fix is missing.

> Never point tests or scripts at the production database. The `.env` files in
> this repo resolve to the live Atlas cluster; the backend tests are mock-based
> and need no database at all.

### 4. Ship

```bash
cd frontend-parent
npx cap open ios          # Xcode → Product → Archive → Distribute
npx cap open android      # Android Studio → Build → Generate Signed Bundle (.aab)
```

- [ ] iOS archive is built against a **physical-device** destination, not a
      simulator. A simulator archive cannot be distributed.
- [ ] Android bundle is signed with the release keystore, and that keystore is
      backed up somewhere other than the machine that built it. Losing it means
      losing the ability to update the app at all.
- [ ] Tag the commit that produced the build, so a bug report naming a version
      can be traced to source.

### 5. Smoke-test what shipped

On a real device, against production, signed in as a real parent:

- [ ] Log in; the dashboard lists the right children with the right balances.
- [ ] Open a child: purchases and recharges both load, and "Load older entries"
      fetches another page.
- [ ] Set or change the four-digit purchase code, then have the counter accept
      it. Check the field brings up a number pad on the phone and refuses a
      fifth digit.
- [ ] Switch on "Ask me before each purchase" for one child, ring up a sale at
      the counter, and check that the till says the order is awaiting approval
      and that **no money has left the wallet**. Approve it in the app and
      confirm the balance drops by the right amount exactly once. Then switch
      the setting back off and confirm the counter charges directly again.
- [ ] Recharge that child's wallet from the admin app — the notification should
      arrive with the app backgrounded, appear with it open, and open that
      child's page when tapped. This is the one path that only works if the
      manual push setup above was completed correctly.
- [ ] Force-quit and reopen: the session is restored rather than bouncing to
      the login screen.

---

## Known gaps in the safety net

Worth knowing when deciding how much the green checkmarks are worth.

- **`frontend-admin` is not linted by CI.** `eslint .` reports 10 errors there
  today, mostly react-hooks rules. It is left out of the lint matrix rather
  than parked on red, and belongs back in the moment those are fixed — the
  change is one word in [ci.yml](.github/workflows/ci.yml).
- **The backend has no eslint config**, so nothing lints it.
- **There are no frontend tests.** The 71 backend tests cover the parent API
  surface and auth; every screen is verified by hand, which is what section 5
  is for.
- **Nothing tests the native shells.** CI runs on Linux and builds the web
  bundle only; iOS and Android are exercised only by an actual release.
- **The web build is not installable as a PWA** — there is no manifest linked
  from `index.html`. It is a website and two native apps, not three.
