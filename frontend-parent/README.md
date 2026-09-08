# Hunger Hunt — Parent app

React + Vite, shipped three ways from one codebase: a browser app, an iOS app
and an Android app (the native shells via Capacitor).

Parents sign in with the phone number the school holds, see each child's wallet
balance, purchase and recharge history, set the four-digit purchase code their
child types at the counter, and set a spending limit.

A parent can also ask to approve each purchase before it is paid for. With that
on, the counter takes the purchase code as usual but raises a request rather
than charging: it arrives as a notification, and the parent approves it — or
trims it down first — from **Requests** in the app. Nothing is deducted until
they do. A request that goes unanswered expires after three days, and the
student cannot place another until it is answered or lapses.

## Running it

```bash
cp .env.example .env      # then fill in the values
npm install
npm run dev
```

`VITE_API_BASE_URL` must point at the backend. The Firebase values are also
required for first-time password setup in the browser.

For local development, keep it at `http://localhost:5001/api`. Browser and iOS
Simulator builds use that value directly. On Android Emulator the app maps the
local hostname to `10.0.2.2`, Android's alias for the host computer, and the
debug manifest permits that local HTTP connection. Release builds do not carry
the cleartext exception. A physical phone still needs the computer's LAN IP or
a reachable HTTPS development URL; `localhost` cannot refer to the computer
from a separate device.

## Native builds

```bash
npm run build             # dist/ is what the native shells serve
npx cap sync              # copy dist/ + register plugins into ios/ and android/
npm run check:native:compile # compile both native PhonePe bridges
npx cap open ios          # or: npx cap open android
```

`capacitor.config.json` deliberately has **no `server.url`**. With one, the
native app loads a dev server over the network instead of the bundle it ships
with — fine on a laptop, useless on a parent's phone. For live reload during
development, ask for it per-run instead of putting it back in the file:

```bash
npx cap run ios --live-reload --external
```

Note that `VITE_API_BASE_URL` is baked in at `npm run build`. A physical phone
cannot reach the development machine through `localhost`, so a device build
needs the real API URL — and it must be **https**. The Android cleartext
exception is debug-only and exists solely for the emulator's `10.0.2.2` host
alias; release builds and the iOS shell retain their HTTPS-only policy.

### Building one to give someone

```bash
# Validates the production API, matching native versions, Firebase files and
# signing credentials; then builds, syncs and creates the signed Play bundle.
# Set VITE_API_BASE_URL in .env or supply it for this command as shown.
VITE_API_BASE_URL=https://hungerhunt-dbat.onrender.com/api npm run bundle:android
# → android/app/build/outputs/bundle/release/app-release.aab

# The production bundle was synced to iOS by the same command.
npx cap open ios                    # Xcode → Archive → Distribute
```

`npm run check:release` performs the preflight without building. Release
commands refuse local/plaintext API URLs, missing Firebase files and missing
Android signing instead of producing an artifact that cannot be shipped.
Before an iOS archive, `npm run check:native:compile` also compiles the local
PhonePe bridge against the pinned Android and iOS SDKs; the lighter
`check:native` command performs the platform-independent structural checks CI
can run on any host.

The full release sequence, including signing and the store paperwork, is in
[RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md).

The native shells do not run on a web origin: Capacitor serves the bundle from
inside the WebView and stamps `capacitor://localhost` (iOS) or
`https://localhost` (Android) on every request. Both are in the backend's CORS
allowlist in `backend/app.js`; without them the phone builds get a 403 on their
first call and look broken with nothing in the logs to explain it.

## First-time SMS verification

The office creates a parent with the phone number on record. On first sign-in,
Firebase sends an SMS OTP; the API verifies the resulting Firebase ID token
before it allows the parent to create a password. Later sign-ins use that phone
number and password.

Setup that must be completed in Firebase Console:

1. Authentication → Sign-in method → enable **Phone**.
2. Authentication → Settings → SMS region policy → allow **India**. New Firebase
   projects allow no SMS regions until this is configured.
3. Add `hunger-hunt-parent.vercel.app` under Authentication → Settings →
   Authorized domains. Web phone auth uses an invisible reCAPTCHA.
4. Put the Firebase project on the Blaze plan so it can send verification SMS.
   Use Firebase fictional phone numbers for development and automated testing.
5. Register the Android app's SHA-1 and SHA-256 fingerprints in Firebase. For
   iOS, keep Push Notifications enabled, upload the APNs key, and add the iOS
   app's Encoded App ID as a URL scheme in Xcode so reCAPTCHA fallback returns
   to the app.

The backend service account and each platform's Firebase client configuration
must all belong to the same Firebase project, or valid OTPs will be rejected by
the API.

## Push notifications

Web and native take different routes to the same place, and each needs its own
setup.

| | Browser | iOS / Android |
|---|---|---|
| Transport | FCM Web Push (VAPID) | APNs / FCM via `@capacitor/push-notifications` |
| Credentials from | `VITE_FIREBASE_*` + `VITE_VAPID_KEY` | `GoogleService-Info.plist` / `google-services.json` |
| Drawn while app is closed by | `public/firebase-messaging-sw.js` | the operating system |
| Drawn while app is open by | `src/utils/push.js` | iOS: itself (`presentationOptions`)<br>Android: a local notification |

`src/utils/push.js` picks the path; nothing else in the app knows which is in
use. The backend stores one token per device (`Parent.pushTokens`) so a parent
signed in on both their phone and a browser is notified on both.

### Setup that cannot be done from the repo

Web push works as soon as the `VITE_FIREBASE_*` and `VITE_VAPID_KEY` values in
`.env` are filled in.

Both native files below are ignored by git (`.gitignore` at the repo root), so
dropping one into place does not also stage it. Neither is in the repo today,
and until each is, its platform registers no token at all — the code is in
place and does nothing.

**Android** needs one file: Firebase Console → Project settings → *Your apps* →
add an Android app with package name `com.hungerhunt.parent`, download
`google-services.json`, place it at `android/app/google-services.json`.
`android/app/build.gradle` already applies the plugin when that file exists, and
`AndroidManifest.xml` already declares `POST_NOTIFICATIONS` (required from
Android 13). Nothing else.

**iOS** needs four, and delivers nothing at all until every one of them is done:

1. **`GoogleService-Info.plist`** — same Firebase screen, add an iOS app with
   bundle id `com.hungerhunt.parent`. Download, then drag it into
   `ios/App/App/` **in Xcode**, with *Add to targets: App* ticked. Copying it
   in Finder is not enough; it has to be in the target to be in the bundle.

2. **The Firebase iOS SDK** — Xcode → File → Add Package Dependencies →
   `https://github.com/firebase/firebase-ios-sdk` → add the **FirebaseMessaging**
   product to the *App* target.

   It goes in the Xcode project and not in `CapApp-SPM/Package.swift`, which
   `npx cap sync` regenerates — a dependency added there disappears at the next
   sync. `AppDelegate.swift` compiles with or without it (`#if canImport`), so
   before this step the app builds and reports why push is not working rather
   than failing to compile.

3. **An APNs key** — Apple Developer → Certificates, Identifiers & Profiles →
   Keys → new key with *Apple Push Notifications service* enabled. Upload the
   `.p8` to Firebase Console → Project settings → Cloud Messaging → *Apple app
   configuration*, with its Key ID and your Team ID. Without it Firebase has no
   way to reach Apple.

4. **The Push Notifications capability** — Xcode → target *App* → Signing &
   Capabilities → **+ Capability** → *Push Notifications*. This also registers
   the entitlement against the App ID on Apple's developer portal, which is why
   it has to be done through Xcode rather than by committing an entitlements
   file. *Background Modes → Remote notifications* is already set in
   `Info.plist`.

Then test on **a physical iPhone** — the simulator cannot register with APNs.

#### Why iOS needs the Firebase SDK at all

The backend sends every notification through Firebase, which addresses a device
by its FCM registration token. APNs issues something different: a device token,
64 hex characters, which FCM does not recognise. Left alone,
`@capacitor/push-notifications` publishes that APNs token, the backend stores
it, the first send is rejected as an unknown registration, and the token is
dropped as dead — silently, and identically to a parent who uninstalled the app.

`AppDelegate.swift` closes that gap: it hands the APNs token to Firebase and
publishes the FCM token Firebase exchanges it for. Android needs none of this —
the plugin talks to Firebase directly there and already returns an FCM token.

`Info.plist` also sets `FirebaseAppDelegateProxyEnabled` to `false`. Left on,
the Firebase SDK swizzles the app delegate and the notification-centre delegate
out from under Capacitor, and the symptom is notifications that arrive but fire
no `pushNotificationReceived` or tap handler. The token exchange above is
explicit precisely so that swizzling is not needed.

### Checking it works

Recharge a wallet from the admin app — `topUpWallet` notifies the parent. With
the app backgrounded the notification should appear in the tray like any other
app's; with it open, the same notification should appear rather than nothing.
Tapping it opens that child's page.

If nothing arrives, check in this order: the backend logs an FCM error;
`Parent.pushTokens` actually has a row for the device; the permission was
granted in OS settings.
