# Hunger Hunt — Parent app

React + Vite, shipped three ways from one codebase: a browser app, an iOS app
and an Android app (the native shells via Capacitor).

Parents sign in with the phone number the school holds, see each child's wallet
balance, purchase and recharge history, set the purchase password used at the
counter, and set a spending limit.

A parent can also ask to approve each purchase before it is paid for. With that
on, the counter takes the purchase password as usual but raises a request rather
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

`VITE_API_BASE_URL` must point at the backend. Everything else is push
notifications — the app runs fine without them.

## Native builds

```bash
npm run build             # dist/ is what the native shells serve
npx cap sync              # copy dist/ + register plugins into ios/ and android/
npx cap open ios          # or: npx cap open android
```

`capacitor.config.json` deliberately has **no `server.url`**. With one, the
native app loads a dev server over the network instead of the bundle it ships
with — fine on a laptop, useless on a parent's phone. For live reload during
development, ask for it per-run instead of putting it back in the file:

```bash
npx cap run ios --live-reload --external
```

Note that `VITE_API_BASE_URL` is baked in at `npm run build`. A phone cannot
reach `localhost`, so a device build needs the real API URL — and it must be
**https**: both platforms block plaintext HTTP to anything but localhost.

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
