# Hunger Hunt — Parent app

React + Vite, shipped three ways from one codebase: a browser app, an iOS app
and an Android app (the native shells via Capacitor).

Parents sign in with the phone number the school holds, see each child's wallet
balance, purchase and recharge history, set the purchase password used at the
counter, and set a spending limit.

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
`.env` are filled in. **Native push additionally needs all of the following**,
and silently delivers nothing until they are done:

1. **Android — `google-services.json`**
   Firebase Console → Project settings → *Your apps* → add an Android app with
   package name `com.hungerhunt.parent`. Download and place at
   `android/app/google-services.json`. (`android/app/build.gradle` already
   applies the plugin when this file exists.)

2. **iOS — `GoogleService-Info.plist`**
   Same screen, add an iOS app with bundle id `com.hungerhunt.parent`.
   Download, then drag into `ios/App/App/` **in Xcode** so it joins the target —
   copying it in Finder is not enough.

3. **iOS — APNs key**
   Apple Developer → Certificates, Identifiers & Profiles → Keys → new key with
   *Apple Push Notifications service* enabled. Upload the `.p8` to Firebase
   Console → Project settings → Cloud Messaging → *Apple app configuration*,
   with your Key ID and Team ID. Without this, Firebase has no way to reach
   Apple and iOS devices get nothing.

4. **iOS — capabilities in Xcode**
   Target *App* → Signing & Capabilities → add **Push Notifications**, and add
   **Background Modes** with *Remote notifications* ticked.

5. **A physical iPhone.** The simulator cannot register with APNs.

`AppDelegate.swift` already forwards the APNs device token to the plugin, and
`AndroidManifest.xml` already declares `POST_NOTIFICATIONS` (required from
Android 13). Neither needs editing.

### Checking it works

Recharge a wallet from the admin app — `topUpWallet` notifies the parent. With
the app backgrounded the notification should appear in the tray like any other
app's; with it open, the same notification should appear rather than nothing.
Tapping it opens that child's page.

If nothing arrives, check in this order: the backend logs an FCM error;
`Parent.pushTokens` actually has a row for the device; the permission was
granted in OS settings.
