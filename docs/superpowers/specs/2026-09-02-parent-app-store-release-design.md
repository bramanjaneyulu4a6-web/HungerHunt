# Parent app — App Store and Play Store release readiness

Design agreed 2026-09-02. Scope is everything that stands between today's
`main` and two uploadable, submittable artifacts, restricted to what can be
built inside this repo. Console work, signing and device capture stay with the
owner and are listed at the end so the boundary is explicit rather than
implied.

## Context

All four release-readiness phases and the auth hardening are on `main`.
Push works end to end on Android; iOS is configured but has never been
exercised on a physical iPhone. The parent app already serves four public
policy routes (`/privacy-policy`, `/refund-policy`, `/shipping-policy`,
`/terms-and-conditions`), already refuses to build a release against a
non-production API, and Android already targets API 36 and refuses to produce
an unsigned release build.

What is missing is not the app. It is: a store-required account deletion route,
the listing content and privacy answers for two consoles, the image assets, and
an interim distribution path for Android while Play's closed-testing
requirement runs.

### Decisions taken during brainstorming

| Question | Decision |
|---|---|
| Developer accounts | Both exist; app records created in both consoles. |
| Account deletion | Build self-service deletion. Server-side it is an archive; to the parent it reads as deletion throughout. |
| Screenshots | Owner captures on real devices; this repo resizes, frames and produces the feature graphic. |
| Audience | One school, public listing, adults only. Target audience 18+, not directed at children. |
| Reviewer access | A real production parent account attached to a fictional family. |
| Play closed testing | Required — personal account created after 13 Nov 2023. Android ships as a sideloaded APK in the interim; the Play path is finished and left ready. |

### The constraint that shapes the privacy answers

Payments run through **PhonePe** (`models/PaymentIntent.js`, provider enum
`PHONEPE`), in real money, not through in-app purchase. Both stores' privacy
forms must therefore declare financial information, and Apple's review needs a
deliberate argument that a wallet top-up spent on physical food at a school
counter is a good "consumed outside the app" and so exempt from IAP. That
argument belongs in the review notes before the first submission, not after a
rejection.

---

## 1. Self-service account deletion

### Server

New route `DELETE /parent/account`, behind `protectParent`, taking the
account password in the body.

It performs the transition `archiveParent` already performs
(`controllers/adminUserController.js:182`):

- `active: false`, `archivedAt: new Date()`
- `pushTokens: []`, `fcmToken: null`
- `resetPasswordToken` / `resetPasswordExpire` cleared
- `tokenVersion` incremented — this is what ends every live session on every
  device at once, and is why no separate logout-everywhere step is needed
- `syncStudentRegistration(parent.studentIds)` so each child's
  `isParentRegistered` returns to false

Four differences from the admin path:

1. **Password required.** Compared with bcrypt against the stored hash. Without
   it, an unlocked borrowed phone closes the account. A wrong password is a
   401 and changes nothing.
2. **Pending approvals still block.** If a `PendingOrder` for this parent is
   `PENDING` or `PROCESSING`, respond 409 with parent-facing wording rather
   than the admin string. Refusing mirrors the existing admin guard and keeps
   money-moving semantics out of a deletion route.
3. **`archivedReason`** — a new `Parent` field, `enum: ['admin', 'parent']`.
   Set to `'parent'` here and `'admin'` in `archiveParent`, so the office can
   tell a self-closed account from one it closed. `archivedBy` stays null on
   the self-service path, which is now honest rather than ambiguous.
4. **Password cleared.** Re-admitting the parent goes through the office's
   existing "issue activation code" flow, which resets everything it needs.

The route is rate limited on the same authenticated-parent bucket the other
`protectParent` routes use.

### What survives, and the disclosure that makes that legitimate

The `Parent` row is retained. Its own model comment already states why: old
approvals and notifications need a resolvable parent id. The child's wallet
balance and purchase history belong to the school and are untouched.

This is defensible only if it is written down. So:

- `src/pages/PrivacyPolicy.jsx` section 6 ("Retention and deletion") is
  rewritten to describe the in-app route, name what deletion removes (access,
  credentials, notification registrations, the link to the children), and name
  what the school retains and why.
- The same words become the account-deletion answer in the store package, so
  the listing, the app and the policy page cannot drift apart. A Data Safety
  cross-check that finds them disagreeing is a rejection.

### App

There is no settings screen today: logout lives in `components/Navbar.jsx` and
`pages/Accounts.jsx` is the children list. So a new page.

**`/account`** — protected route, linked from both the desktop and bottom nav:

- The parent's own name, phone and email, read-only.
- The four policy links. Today these are reachable only from the login screen
  and the payment flow; a signed-in parent cannot find them at all, which is
  itself a store-listing weakness.
- A delete section at the foot of the page.

Deletion is a confirmation dialog that takes the password and an explicit
confirm action, modelled on the existing logout dialog in `Navbar.jsx` —
including its focus trap, which exists because the app bar holds the only way
to sign out on a phone and has to work with no pointer at all.

On success: clear the session and land on `/login` with "Your account has been
deleted."

Copy discipline: the parent sees "delete" everywhere. No "archive", no
"deactivate". The words "archived" and `archivedReason` are server-side and
admin-side only.

### Tests

Backend, in the mocked style of `tests/parentSurface.test.js` (no database):

- wrong password → 401, no write
- pending order present → 409, no write
- success → account archived with `archivedReason: 'parent'`, push tokens
  cleared, `tokenVersion` bumped
- a token issued before deletion is rejected by `protectParent` afterwards
- children unlink (`syncStudentRegistration` called with the right ids)

---

## 2. The submission package — `docs/store-listing.md`

One file holding every answer both consoles ask, so submission is copying
rather than composing.

**Apple, App Store Connect:** app name, subtitle, promotional text,
description, keywords, support and marketing URLs, privacy policy URL, age
rating answers, the not-directed-at-children argument, export compliance (the
standard HTTPS exemption — declared, not skipped), push notification purpose
(transactional account activity), privacy nutrition labels, and review notes.

**Google, Play Console:** title (≤30 chars), short description (≤80), full
description (≤4000), category, contact details, target audience 18+, content
rating questionnaire answers, App access reviewer credentials, ads declaration
(none), and the Data Safety form.

**The privacy answers are derived from the code, not guessed.** Collected:
parent name, phone, email, child wallet balance and itemised purchase history,
device push token, IP address (rate limiting). Third parties: Firebase Cloud
Messaging for push delivery, PhonePe for payments. Encrypted in transit.
Deletion available in-app, per section 1.

**Review notes** cover the three things a reviewer cannot work out alone: that
accounts are provisioned by the school and activated by the parent (so the
credentials supplied are the only way in), that deletion is available in-app at
`/account` and what it does, and the IAP-exemption argument for PhonePe.

Reviewer credentials are referenced as placeholders in the committed file. The
real ones are created by the owner on production and are not committed.

---

## 3. Assets

**`docs/store-assets.md`** — a shot list: which screens, on which device, in
what state, and what to scrub before sending them over. The captures should
come from the fictional reviewer family rather than a real one, which removes
the scrubbing problem at source.

**`scripts/store-screenshots.mjs`** — takes the captures and pads/resizes them
to the exact dimensions each store requires (Apple 6.9" and 6.5" iPhone; Play
phone set), so a handset that is not a store reference device does not cost a
rejected upload. It shells out to macOS's built-in `sips` for the resize and
composites the padding itself; no new image-processing dependency is added to
the repo.

**Feature graphic, 1024×500** — authored as HTML and rendered with the headless
Chrome already installed. Source committed so it can be re-rendered when the
copy changes.

---

## 4. Interim Android APK

`npm run apk:release` in `frontend-parent`, alongside the existing
`bundle:android`. The gradle guard already refuses an unsigned release for any
task matching `assemble|bundle|package…release`, so the APK path inherits the
same protection with no gradle change.

Documented in `docs/android-apk-builds.md`, which currently states that it
covers the kiosk and warehouse and explicitly *not* the parent app. That
framing needs amending rather than contradicting: the parent app is
store-bound, and its APK is a temporary measure with an expiry.

**The caveat that must be recorded, not discovered:** an APK signed with the
upload key and a Play-installed build signed by Google carry different
signatures. Every sideloaded install must be uninstalled — losing its local
state, including its session — before the Play build will install over it.
That is inherent to Play App Signing and is a known cost, not a bug to fix
later.

---

## 5. `RELEASE-CHECKLIST.md` updates

- Account deletion moves from an open Apple question to a shipped feature with
  a one-line description of what it does.
- The Play closed-testing requirement is recorded as *applicable*, with the
  12-testers-for-14-days path and the interim APK written in.
- The large "Decide what the store listings say" block is replaced by a pointer
  to `docs/store-listing.md` and `docs/store-assets.md`, so the answers live in
  one place instead of two.
- The every-release verification block gains the new backend tests and the
  parent-app `/account` smoke step.

---

## Boundary — what this repo cannot do

Left to the owner, and listed here so nothing is silently assumed done:

- Creating the release keystore (the password is typed at a prompt, never
  passed on a command line) and backing it up off the build machine.
- Xcode signing, the distribution profile, and the archive.
- Both consoles: listing fields, privacy forms, content rating, uploads.
- Creating the reviewer parent account and its fictional family on production.
- Capturing screenshots on real devices.
- Recruiting 12 testers and running the 14-day closed test.
- Testing iOS push on a physical iPhone — still the one gap never closed, and
  the device will be in hand for the screenshots anyway.

## Out of scope

- Screen-level automated tests for the parent app. The gap is real and already
  recorded in `RELEASE-CHECKLIST.md`; closing it is not release-blocking.
- Making the browser build work offline. `manifest.webmanifest` exists and is
  linked; no service worker caches anything. Unchanged here.
- Any change to the kiosk or warehouse apps.
- Credential rotation. The owner deferred it indefinitely; it is not reopened
  by this work.
