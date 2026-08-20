# Release checklist — parent app

The parent app ships three ways from one codebase (browser, iOS, Android), and
two of those three cannot be corrected after the fact without another review
cycle. This is the list that stands between a build and a parent's phone.

Work top to bottom. The first section is done once, before the first release
ever goes out; everything after it is done every time.

The kiosk and warehouse apps are also packaged for Android, but they are
sideloaded rather than published, and almost nothing below applies to them —
no store record, no review, and different rules for versions and signing. They
have their own list: [docs/android-apk-builds.md](docs/android-apk-builds.md).

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
      after deploy.** It shelves every product that predates inventory-at-creation
      (idempotent — running it again touches nothing that already has a row).

- [ ] **Tell the counter staff that admin billing no longer charges.** An order
      raised from the admin console now always goes to the parent to approve —
      the student's four-digit code is not asked for there any more, and
      nothing moves until a parent answers. A student who wants food now buys
      it at the kiosk with their own code. Students whose parents have never
      registered cannot be billed from the console at all.

- [ ] **Decide what the store listings say.** Both stores ask the same
      question in different words, and this app has an answer neither of them
      treats lightly: it shows a named child's wallet balance and itemised
      spending to an adult identified by a phone number. Everything below is
      the store's requirement, not a legal opinion — the privacy answers in
      particular need whoever owns the school's data policy to sign them off,
      not whoever builds the app.

      *Apple, in App Store Connect:*
      - App record created under the right team, bundle id
        `com.hungerhunt.parent`.
      - Privacy policy URL and support URL. Both are required fields; neither
        can be a placeholder.
      - Privacy nutrition labels covering, at minimum, name, phone number,
        purchase history and identifiers, and whether any of it is linked to
        the user.
      - Age rating, and an answer to whether the app is directed at children —
        the data is *about* children, but the account holder is a parent, and
        which of those Apple's Kids Category rules follow is the call to get
        right before submitting rather than after a rejection.
      - Screenshots for every required device class (6.9" and 6.5" iPhone at
        least).
      - A working demo parent account plus notes for App Review, since every
        screen is behind a login they cannot create themselves.
      - Export compliance: the app makes HTTPS calls and nothing more, which
        is the standard exemption — declare it, do not skip it.
      - Push notification purpose, if asked: transactional account activity,
        not marketing.
      - Account deletion. Apple requires an in-app route to delete the account
        for any app that lets you create one. Parent accounts here are created
        by the school, which is the argument for exemption — make that
        argument deliberately.

      *Google, in Play Console:*
      - App record, and Play App Signing enrolled at creation (it cannot be
        added later without a key reset).
      - Data Safety form — separate from Apple's labels, asks about collection
        *and* sharing *and* encryption in transit, and is cross-checked
        against observed behaviour.
      - Privacy policy URL, content rating questionnaire, and target audience.
        Naming a child audience pulls in the Families policy and its own
        review; naming an adult one has to be true of the actual listing.
      - App access: reviewer credentials for a parent account, or the whole
        app looks like a login screen.
      - Screenshots and a 1024×500 feature graphic.
      - Ship to the internal testing track first and install from it. It is
        the only way to find out that the signed bundle behaves before
        production does.

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
npm test            --prefix backend            # 452 tests, all mocked; no database is touched
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
- [ ] **The bundle about to be wrapped points at the production API.** This is
      the one check that catches a build made against the wrong `.env`, and it
      catches it in seconds rather than on a tester's phone:

      ```bash
      cd frontend-parent
      grep -rhoE 'https?://[a-zA-Z0-9.:-]+/api\b' \
        dist android/app/src/main/assets/public ios/App/App/public | sort -u
      ```

      The production API URL, printed once, is the pass. Anything local means
      the `.env` was wrong at `npm run build` and both native shells now carry
      that same wrong bundle — fix `.env`, rebuild, and re-run `npx cap sync`
      before going further. More than one URL means the shells were synced
      before the last build rather than after it.

      Do not simplify this to a search for `localhost`. React-router and axios
      both embed a literal `http://localhost` as a fallback for an unreadable
      `window.location`, so it appears in every bundle regardless — a check
      that always reports something is one that gets ignored, including on the
      build where it mattered.

> Never point tests or scripts at the production database. The `.env` files in
> this repo resolve to the live Atlas cluster; the backend tests are mock-based
> and need no database at all.

### 4. Ship

The whole sequence, from a clean tree to two uploadable artifacts. Steps that
need a human in a GUI are marked; nothing else is interactive.

```bash
cd frontend-parent

# 1. The bundle. .env must already hold the production https API URL — this is
#    the step that bakes it in, and no later step can change it. build:release
#    is `build` with scripts/validate-frontend-release-env.mjs in front of it:
#    it refuses http and a local host, so a misaimed
#    build fails here in a second rather than on a tester's phone in a week.
npm run build:release
npx cap sync

# 2. Android. Needs android/app/google-services.json and a release keystore
#    (see "Signing", below). With no keystore configured this now refuses to
#    start, in about a second, naming the values it could not find — rather
#    than building an unsigned .aab that Play rejects at the end of the upload.
cd android && ./gradlew :app:bundleRelease
#    → app/build/outputs/bundle/release/app-release.aab

# 3. iOS. Archiving is done from Xcode: the signing certificate and the Push
#    Notifications capability both live in the Signing & Capabilities tab, and
#    a command-line archive would need them configured there first anyway.
cd .. && npx cap open ios
#    Xcode → destination "Any iOS Device (arm64)" → Product → Archive
#           → Distribute App → App Store Connect
```

**Signing — manual, and not from this repo.**

- [ ] Android: the release keystore is created once, with
      `keytool -genkeypair -v -keystore <path outside the repo>.jks -alias upload
      -keyalg RSA -keysize 2048 -validity 10000`, and referenced from a
      `keystore.properties` that is **not** committed (`.gitignore` already
      covers `*.jks`, `*.keystore` and `keystore.properties`). Type the
      password at the prompt rather than passing it on the command line, where
      it lands in shell history. Copy
      [frontend-parent/android/keystore.properties.example](frontend-parent/android/keystore.properties.example)
      to `keystore.properties` and fill in the four values; every one of them
      can come from an environment variable instead, named in that file, which
      is how a build machine supplies them.
- [ ] `validity 10000` is not a formality. The key must outlive every update
      the app will ever have: Play refuses an upload signed with an expired
      certificate, and there is no way to re-sign an existing listing with a
      new one.
- [ ] That keystore is backed up somewhere other than the machine that built
      it. Losing it means losing the ability to update the app at all —
      unless Play App Signing is enrolled, in which case the upload key can be
      reset by Google and only the *upload* key is lost.
- [ ] iOS: an Apple Developer team is selected on the *App* target, the
      Distribution certificate exists, and the App ID
      `com.hungerhunt.parent` carries the Push Notifications entitlement.
- [ ] iOS archive is built against a **physical-device** destination, not a
      simulator. A simulator archive cannot be distributed.
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
- **The parent app has no frontend tests.** The 452 backend tests cover its API
  surface and auth, and the other three apps each have a small suite CI runs,
  but nothing exercises a parent-app screen; every one of them is verified by
  hand, which is what section 5 is for.
- **Nothing tests the native shells.** CI runs on Linux and builds the web
  bundle only; iOS and Android are exercised only by an actual release.
- **`npm run build` still has a silent fallback.** `src/services/api.js`
  defaults to `http://localhost:5000/api` when `VITE_API_BASE_URL` is unset —
  and 5000 is the port this repo already moved off. A plain `build` with no env
  file therefore succeeds, ships, and reaches nothing. `npm run build:release`
  is the one that refuses; the plain target is left permissive because CI
  builds without an env file on every push.
- **The browser build is not an offline app.** `public/manifest.webmanifest`
  now exists and `index.html` links it, so a browser can add it to a home
  screen — but the only service worker is the Firebase push worker, which
  caches nothing. Out of signal it is a blank page, where the two native
  builds at least start.
