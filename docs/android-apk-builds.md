# Android APK builds — kiosk and warehouse

How `hungerhunt-kiosk` and `hungerhunt-warehouse` are turned into Android apps and
put onto school devices.

Companion to [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), which covers the
*parent* app. That one goes to the App Store and Play. **This one does not go to
either store.** Both apps here are installed by hand — copied to the device and
tapped, or pushed over `adb`. Everything the checklist says about store listings,
privacy forms, review, and Play App Signing is irrelevant here; a few things it
says about signing and versions are not, and differ in the details below.

Verified against the repo on 2026-08-20: both shells were generated, built as
debug APKs, and built again as signed release APKs on a macOS machine with
JDK 21 and the Android SDK at `~/Library/Android/sdk`.

---

## Why no store

These two apps have a captive audience of school-owned hardware — one canteen
terminal, one storeroom device — and neither is something a parent or student
installs for themselves. A Play listing would mean a developer account, a data
safety declaration, a content rating, reviewer credentials, and a review wait,
all to reach two devices that someone is going to walk up to anyway.

The cost of skipping it is that **nothing updates itself**. Every fix is a
rebuild, a file copy, and a tap. That is the trade: faster to release, slower to
patch. For fixed terminals it is the right way round.

---

## What was set up

| | kiosk | warehouse |
|---|---|---|
| Application id | `com.hungerhunt.kiosk` | `com.hungerhunt.warehouse` |
| Launcher name | Hunger Hunt Kiosk | Hunger Hunt Warehouse |
| Splash background | `#ffffff` | `#171a1e` |

Both use Capacitor 8, matching the parent app, with `webDir: dist` and no
plugins — neither app sends push or reads the camera today. `minSdkVersion` is
24 and `compile`/`targetSdkVersion` are 36, inherited from
`android/variables.gradle` as Capacitor generates it.

The launcher icon is the same Hunger Hunt logo for both, copied from the parent
app's `resources/logo.png`. They are told apart by name, not by mark. If they
ever land on the same device and that turns out to be confusing, regenerate one
of them from a different source image — the command is in the last section.

**No backend change was needed.** The CORS allowlist in
[backend/app.js](../backend/app.js) already permits `https://localhost`, the
origin an Android Capacitor WebView sends, because the parent app's native
builds needed it. A deployed *web* instance of these apps needs its own origin
added to that list; an APK does not.

---

## One-time setup: the signing key

An APK that is not signed will not install. There is no key in this repo and
there cannot be one — a password in a tracked file is a password in every clone,
including the clones made before it was removed.

Create one keystore and use it for both apps:

```bash
keytool -genkeypair -v \
  -keystore ~/keys/hungerhunt-internal.jks \
  -alias internal -keyalg RSA -keysize 2048 -validity 10000
```

Type the passwords at the prompt rather than passing them on the command line,
where they land in shell history.

Then, in **each** app's `android/` directory:

```bash
cp keystore.properties.example keystore.properties
```

and fill in the four values. `keystore.properties`, `*.jks` and `*.keystore` are
all gitignored at the repo root. Every value can come from an environment
variable instead (`ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`), which is how a build machine
supplies them; the file wins where both are set, and the two can be mixed.

Three things about that key:

- **Back it up somewhere other than the machine that made it.** Android refuses
  an update whose signature does not match the installed copy, and there is no
  Play App Signing here to reset anything. Losing the key means visiting every
  device to uninstall and reinstall — and an uninstall clears app storage, which
  is where the signed-in session lives.
- **`-validity 10000` is not padding.** The certificate must outlive every
  update the app will ever get.
- **Keep it separate from the parent app's Play upload key.** That one lives
  under different rules and Google can reset it; there is no reason to spread it
  onto more machines than the store release needs.

If the key is missing, a release build now stops before it starts and names the
values it could not find. That is deliberate: left alone, Gradle would happily
produce an *unsigned* APK, and the first sign of trouble would be a device
refusing to install it with a message about an invalid package — a long way from
the setup step that actually caused it.

---

## Building an APK

```bash
cd hungerhunt-kiosk          # or hungerhunt-warehouse

npm run build:release        # validates the API URL, then builds dist/
npx cap sync android         # copies dist/ into the native shell
cd android && ./gradlew assembleRelease
#   → app/build/outputs/apk/release/app-release.apk
```

Three things that will bite in that order:

**`build:release`, not `build`.** Neither app has a fallback for
`VITE_API_BASE_URL` — `src/utils/api.js` passes it to axios exactly as given, so
a bundle built without it sends every request to a relative URL, which inside the
WebView means the app calls *itself*. It fails on the device, silently, at login.
`npm run build:release` runs
[scripts/validate-frontend-release-env.mjs](../scripts/validate-frontend-release-env.mjs)
first, which refuses a missing value, plain http, and a local host. The URL is
baked into the bundle at build time; no later step can change it.

**`cap sync` after the final build, not before.** The shell serves a *copy* of
`dist/`. Sync before the last build and the APK carries the previous bundle, and
nothing about it looks wrong until someone notices the fix is missing.

**Check the bundle before wrapping it**, which catches a build made against the
wrong `.env` in seconds rather than on the terminal:

```bash
grep -roE 'https?://(localhost|127\.0\.0\.1|192\.168\.[0-9.]+)(:[0-9]+)?' \
  dist android/app/src/main/assets/public
```

No output is the pass.

For a throwaway build to try something on a device, `./gradlew assembleDebug`
needs no key at all and produces `app/build/outputs/apk/debug/app-debug.apk`.
Debug APKs are signed with the local debug key: fine for a test device, and not
interchangeable with a release build — installing one over the other requires an
uninstall.

---

## Versions

Two files, and nothing keeps them in step:

| Where | Field |
|---|---|
| `package.json` | `version` |
| `android/app/build.gradle` | `versionCode`, `versionName` |

Both apps currently sit at `1.0.0` / `versionCode 1` / `versionName "1.0"`.

The Play rule that `versionCode` must increase for *every upload* does not apply
here — there is no upload. What Android enforces on a device is weaker: it will
reinstall the same `versionCode` over itself, and it refuses only a *downgrade*.
Raise it anyway on every build that leaves the machine. It is the only thing on
a device that says which build is on it, and a support call about a terminal
misbehaving is unanswerable without it.

---

## Installing on a device

Over USB with developer options enabled:

```bash
adb install -r app-release.apk      # -r replaces the installed copy, keeping data
```

Or copy the `.apk` to the device and open it, which needs "Install unknown apps"
allowed once for whichever app does the opening (Files, Drive, Chrome).

An update only installs over the existing app if it is signed with the same key.
If it is not, Android rejects it with a signature mismatch, and the only way
forward is uninstall-then-install — which takes the stored session with it and
means signing in again.

### Locking down the kiosk terminal

Wrapping the kiosk in an APK removes the address bar, but on its own it does not
stop a student leaving the app: Android's back gesture at the root of the app
exits to the launcher, as do Home and Recents.

The control for that is **screen pinning**, which is a device setting rather than
anything this repo can ship — Settings → Security → Screen pinning, then pin the
app from Recents. It holds the app in the foreground and takes a deliberate
gesture plus the device PIN to leave. It also covers the notification shade and
the Home button, which no amount of app code can. Set it up on the terminal
before the kiosk goes live.

The warehouse app needs none of this; it is used by staff on a normal device.

---

## What this does not include

- **CI does not build these shells.** [ci.yml](../.github/workflows/ci.yml) runs
  on Linux and builds the web bundles only, for all four apps. The Android
  projects are exercised only when someone builds one, exactly as with the parent
  app's shells.
- **No automatic updates**, no crash reporting, no analytics.
- **No iOS.** `npx cap add ios` would work, but neither device is an iPad and
  sideloading on iOS is a different problem entirely — it needs a paid developer
  account and re-signing every device every year.

---

## Regenerating icons and splash screens

Both were generated from `resources/logo.png` (1024×1024) inside each app:

```bash
npx @capacitor/assets@3 generate --android --assetPath resources \
  --iconBackgroundColor '#ffffff' --iconBackgroundColorDark '#ffffff' \
  --splashBackgroundColor '#ffffff' --splashBackgroundColorDark '#ffffff'
```

That is the kiosk's invocation; the warehouse uses `#171a1e` for both splash
colours and the dark icon background, matching the dark shell its storeroom
screens are built on. The generated files land in
`android/app/src/main/res/` and are committed.
