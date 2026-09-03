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

The unticked ones are open items, not formalities: each is a real gap today.
The ticked ones are settled — a decision taken deliberately, or work that has
landed — and they stay on the page because both stores ask about them and the
answer has to be findable at the moment the form does.

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

- [x] **The kiosk is intentionally public, with no device credential or
      enrollment.** This product decision was confirmed on 2026-08-27.
      `POST /students/kiosk-session` takes an admission number and no secret.
      Anyone who can reach the API can try admission numbers and open a student
      session, but cannot spend: the four-digit purchase code still gates
      checkout, five wrong attempts lock it for fifteen minutes, and the open
      route is tightly rate-limited. Keep enumeration visible in operational
      logs; device enrollment is not part of the intended product.

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

- [ ] **Run `npm run backfill:collected-packages -- --prod --apply` from
      `backend/` once after deploy.** Delivery no longer ends a package: the
      warehouse marks `DELIVERED` when it hands the package to the caretaker,
      and the student's own purchase code marks it `COLLECTED`. Every package
      delivered under the old rule would otherwise sit in its caretaker's queue
      forever, asking children to type a code for food they ate weeks ago.
      Preview it first without `--apply`, and pass `--since=<deploy time>` if
      packages have already been delivered under the new rule.

- [ ] **Tell the caretakers that "Received all" is gone.** They no longer
      confirm anything on their own — each student types their four-digit
      purchase code on the caretaker's screen to take their own package, and
      five wrong codes lock that student out of both the dorm door and the
      till for fifteen minutes.

- [ ] **Tell the storeroom that they now name who took the package.** Marking
      a package handed over asks for the caretaker's name at the hostel door;
      a name only, no ID or phone numbers, which the server refuses.

- [ ] **Tell the admins that Reports is the shared issue queue.** The admin
      console separates reports into *Students*, *Caretakers*, *Warehouse* and
      *Parents*. Every admin sees the same queue, any of them may answer any
      report, and the answer is recorded under the name of the admin who wrote
      it. An undismissable banner counts what is unanswered on every screen —
      nothing else notifies anyone, because staff accounts have no email or
      push channel.

- [ ] **Tell the counter staff that admin billing no longer charges.** An order
      raised from the admin console now always goes to the parent to approve —
      the student's four-digit code is not asked for there any more, and
      nothing moves until a parent answers. A student who wants food now buys
      it at the kiosk with their own code. Students whose parents have never
      registered cannot be billed from the console at all.

- [x] **In-app account deletion shipped.** Both stores require a way out of the
      app for anything that has accounts, and the office's archive route is not
      it — that one needs a member of staff. The parent's own route is
      **Account → Delete my account** (`frontend-parent/src/pages/Account.jsx`,
      at `/account`), which calls `DELETE /api/parent/account`
      (`deleteParentAccount` in `backend/controllers/parentController.js`). It
      asks for the account password, then ends every session on every device
      including the one that pressed the button, drops the stored password and
      every notification device it was reaching, and stops that parent standing
      as their children's registered parent. It refuses while a purchase is
      waiting for their answer, because answering one moves money and a
      deletion route is the wrong place to decide it either way. The children's
      balances and purchase history stay with the school — the privacy policy
      says so in as many words, and the wording both consoles are given is in
      [docs/store-listing.md](docs/store-listing.md). Covered by
      `backend/tests/parentAccountDeletion.test.js`.

- [x] **iOS export compliance is answered in the build.**
      `ITSAppUsesNonExemptEncryption` is `false` in
      `frontend-parent/ios/App/App/Info.plist`. The app makes HTTPS calls and
      nothing more, which is the standard Category 5 Part 2 exemption; putting
      the answer in the plist stops App Store Connect asking it by hand on
      every single upload.

- [ ] **Decide what the store listings say — then copy it out of
      [docs/store-listing.md](docs/store-listing.md).** Both stores ask the
      same question in different words, and this app has an answer neither of
      them treats lightly: it shows a named child's wallet balance and itemised
      spending to an adult identified by a phone number. What that file holds
      is the store's requirement, not a legal opinion — the privacy answers in
      particular need whoever owns the school's data policy to sign them off,
      not whoever builds the app.

      Every field either console asks for is written there once and measured
      against its character limit: names and descriptions, Apple's privacy
      labels and Google's Data Safety answers, the age rating and the
      directed-at-children call, the review notes, and what the reviewer's
      account has to be able to see. Screenshots and graphics — the shot list,
      the exact size each store demands, and the script that turns raw captures
      into them — are in [docs/store-assets.md](docs/store-assets.md). Copy out
      of those files into the consoles and never back the other way: the two
      stores ask overlapping questions, and answering each console on its own
      is how they end up disagreeing with each other and with the app.

      Two toolchain deadlines are not listing copy, so they are not in that
      file. Apple requires Xcode 26 / the iOS 26 SDK for submissions after
      28 April 2026 — the local unsigned Release build has been checked with
      Xcode 26, and the signed archive still needs the distribution profile.
      Play requires Android 16 / API 36 from 31 August 2026, and
      `frontend-parent/android/variables.gradle` already targets 36.

      Official references: [Apple submission requirements](https://developer.apple.com/app-store/submitting/),
      [Apple account deletion](https://developer.apple.com/support/offering-account-deletion-in-your-app/),
      [Google target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878),
      [Google testing requirements](https://support.google.com/googleplay/android-developer/answer/14151465),
      and [Google account deletion requirements](https://support.google.com/googleplay/android-developer/answer/13327111).

- [ ] **Decide whether this is an iPhone app or an iPhone-and-iPad app. It is
      currently both, and nobody chose that.**
      `frontend-parent/ios/App/App.xcodeproj/project.pbxproj` sets
      `TARGETED_DEVICE_FAMILY = "1,2"` in both build configurations — Debug at
      line 328, Release at line 351. Family 1 is iPhone, family 2 is iPad. That
      is Capacitor's default, inherited rather than decided, and it is the more
      expensive of the two answers. Nothing in this repo changes it for you:
      it is a product call, not a build detail.

      **Option A — narrow it to iPhone.** Set both lines to `"1"`. App Store
      Connect then stops requiring iPad screenshots, and App Review stops
      testing on an iPad. The app still installs and runs on one, in the iPhone
      compatibility window, which is what most single-school apps do.

      **Option B — keep iPad.** Then a **13" iPad screenshot set — 2064 × 2752,
      portrait — is required before the build can be submitted at all**, and
      App Review will run the entire app on an iPad and file whatever it finds
      there against the submission. That means capturing the shot list a second
      time on an iPad (see [docs/store-assets.md](docs/store-assets.md)) and
      checking the layout at that width first, because no screen in this app
      has been designed for it. The tooling is ready either way:
      `scripts/store-screenshots.mjs` already emits an `apple-ipad-13/`
      directory alongside the two iPhone sizes.

      Leaving the file alone is not a way of avoiding the decision — it *is*
      option B, taken by default. The moment that becomes expensive is the
      upload, which is the worst moment to find out.

- [ ] **Run Play's closed test: 12 opted-in testers, 14 continuous days.** Not
      a condition to check — this is a personal developer account created after
      13 November 2023, and Google will not let it so much as *apply* for
      production access until a closed test has held at least 12 testers who
      opted in, unbroken for 14 days. The clock starts when the test starts, so
      recruiting is the thing to begin before the build is finished. It is also
      the only way to find out how the signed bundle behaves before production
      does.

      Android parents need something to use in the meantime, and that is a
      signed APK installed by hand: `npm run apk:release --prefix
      frontend-parent`, off the same keystore and the same pre-build checks as
      the Play bundle. It has its own section, including the uninstall every
      sideloader has to do when the Play version finally arrives:
      [The parent app's interim APK](docs/android-apk-builds.md#the-parent-apps-interim-apk).

---

## Every release

### 1. Set the version in all three places

They are separate files. `npm run check:native` now fails when they drift, but
the build numbers still have to be incremented deliberately for each upload.

| Where | Field | Currently |
|---|---|---|
| `frontend-parent/package.json` | `version` | `1.0.0` |
| `frontend-parent/android/app/build.gradle` | `versionCode`, `versionName` | `1`, `"1.0.0"` |
| Xcode → target *App* → General | Version, Build (`MARKETING_VERSION`, `CURRENT_PROJECT_VERSION` in `project.pbxproj`) | `1.0.0`, `1` |

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
- [ ] **Both payment flags are set deliberately — and the release build now
      refuses to run until they are.** Both default the wrong way round for a
      store build: `frontend-parent/src/services/payments.js` turns payments on
      only when `VITE_PAYMENTS_ENABLED` is exactly `true`, and leaves the demo
      on unless `VITE_DEMO_UPI_ENABLED` is exactly `false`;
      `PendingApprovalCard.jsx` runs the demo when either of those holds.
      `frontend-parent/.env` sets neither today, so a release built on the
      defaults shows parents a payment screen labelled as a preview that never
      moves any money. Apple rejects placeholder or demo functionality under
      guideline 2.2, and Google requires a submitted app to be fully
      functional.

      That is no longer left to somebody reading this line.
      `scripts/validate-frontend-release-env.mjs` now asserts both flags, and
      every release path runs it — `check:release` and `build:release`, and
      through them `sync:release`, `bundle:android` and `apk:release`. It
      refuses the build unless `VITE_DEMO_UPI_ENABLED` is exactly `false`, and
      unless `VITE_PAYMENTS_ENABLED` is explicitly `true` or `false`.

      The asymmetry between those two is the decision itself, so it is worth
      keeping in view: **shipping without payments is a legitimate choice**, and
      the check does not demand `true`. What it refuses is shipping on a
      default nobody chose. The demo checkout is not a choice at all — there is
      no combination of flags that ships it.

      Setting the flags is still only half of it, and the half nothing checks:
      real payments also need the backend's `PHONEPE_*` credentials (listed in
      `backend/.env.example`), or the app offers a checkout the server cannot
      start. The other way out is to submit with payments off and cut the
      payments paragraphs from both descriptions and both sets of review notes
      in [docs/store-listing.md](docs/store-listing.md), so the listing stops
      describing a feature the reviewer will not find. Either decision is fine.
      Not making one is now a failed build rather than a rejected submission,
      which is the cheaper place to find out.
- [ ] Backend is running with `NODE_ENV=production` and `TRUST_PROXY` set to
      the number of proxy hops in front of it. Without `TRUST_PROXY` every
      request looks like it came from the proxy, so all parents share one
      rate-limit bucket and a few failed logins lock out everybody.

### 3. Verify

CI runs the web tests, lints, builds and the parent native-configuration check
on every push and pull request ([.github/workflows/ci.yml](.github/workflows/ci.yml)).
Run these locally before tagging anyway — CI does not compile the native shells.

```bash
npm test            --prefix backend            # 705 tests, all mocked; no database is touched
npm test            --prefix frontend-parent    # validation and formatting unit tests
npm run lint        --prefix frontend-parent    # must be 0 errors, 0 warnings
npm run lint        --prefix hungerhunt-kiosk
npm run build       --prefix frontend-parent
npm run build       --prefix frontend-admin
npm run build       --prefix hungerhunt-kiosk
node scripts/check-shared-files.mjs             # the files duplicated across apps still match
VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api \
  VITE_PAYMENTS_ENABLED=true VITE_DEMO_UPI_ENABLED=false \
  npm run sync:release --prefix frontend-parent
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

# 1. Android. Validate versions, native/Firebase files, the production API and
#    signing; then build, sync both native shells, and create the Play bundle.
#    Set the URL in .env or supply it for this command as shown — along with
#    the two payment flags from section 2, which this now refuses to build
#    without. It needs
#    android/app/google-services.json and a release keystore
#    (see "Signing", below). With no keystore configured this now refuses to
#    start, in about a second, naming the values it could not find — rather
#    than building an unsigned .aab that Play rejects at the end of the upload.
VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api \
  VITE_PAYMENTS_ENABLED=true VITE_DEMO_UPI_ENABLED=false \
  npm run bundle:android
#    → android/app/build/outputs/bundle/release/app-release.aab

# 2. iOS. The command above has already synced its production bundle. Archiving
#    is done from Xcode: the signing certificate and the Push
#    Notifications capability both live in the Signing & Capabilities tab, and
#    a command-line archive would need them configured there first anyway.
npx cap open ios
#    Xcode → destination "Any iOS Device (arm64)" → Product → Archive
#           → Distribute App → App Store Connect
```

**Signing — manual, and not from this repo.**

- [x] Android: the release keystore exists on this machine.
      `frontend-parent/android/keystore.properties` is present and filled in,
      and points at the `.jks` upload keystore. None of it is in git —
      `.gitignore` covers `*.jks`, `*.keystore` and `keystore.properties`. For
      any of those four values the file does not supply, the build falls back
      to an environment variable named in
      [keystore.properties.example](frontend-parent/android/keystore.properties.example),
      which is how a build machine supplies them. Note the direction: the file
      wins wherever it has a value, one value at a time, so an environment
      variable set against a key the file already fills is ignored rather than
      obeyed. If the keystore ever has to be made again it is
      `keytool -genkeypair -v -keystore <path outside the repo>.jks -alias
      upload -keyalg RSA -keysize 2048 -validity 10000`, with the password
      typed at the prompt rather than passed on the command line where it
      lands in shell history.
- [ ] The certificate in that keystore outlives every update the app will ever
      have. `-validity 10000` is not a formality: Play refuses an upload signed
      with an expired certificate, and there is no way to re-sign an existing
      listing with a new one. Check it with
      `keytool -list -v -keystore <path>.jks` before the first upload rather
      than in year ten.
- [ ] **That keystore is backed up somewhere other than the machine that built
      it.** Still open, and it is the one item on this page that nothing later
      can recover from. Losing it means losing the ability to update the app at
      all — unless Play App Signing is enrolled, in which case Google can reset
      the upload key and only the *upload* key is lost.
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
- [ ] Open **Account**: your own details are right, all four policy pages open,
      and **Delete my account** refuses a wrong password inside the dialog
      without signing you out. Do not complete the deletion on a real account.
- [ ] Force-quit and reopen: the session is restored rather than bouncing to
      the login screen.

---

## Known gaps in the safety net

Worth knowing when deciding how much the green checkmarks are worth.

- **The parent app has utility tests, not screen-level tests.** Validation,
  formatting, the payment hold and the demo-UPI helper all run in CI, and
  backend tests cover the API surface and auth, but no automated test drives a
  parent workflow through the UI; those are still verified by hand in
  section 5.
- **Nothing tests the native shells.** CI runs on Linux and builds the web
  bundle only; iOS and Android are exercised only by an actual release.
- **`npm run build` still has a silent fallback.** `src/services/api.js:6`
  defaults to `http://localhost:5001/api` when `VITE_API_BASE_URL` is unset. A
  plain `build` with no env file therefore succeeds, ships, and reaches
  nothing. `npm run build:release` is the one that refuses; the plain target is
  left permissive because CI builds without an env file on every push.
- **The browser build is not an offline app.** `public/manifest.webmanifest`
  now exists and `index.html` links it, so a browser can add it to a home
  screen — but the only service worker is the Firebase push worker, which
  caches nothing. Out of signal it is a blank page, where the two native
  builds at least start.
