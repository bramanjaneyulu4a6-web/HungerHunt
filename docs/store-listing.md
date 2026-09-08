# Store listing — Hunger Hunt Parent

Every field App Store Connect and Google Play Console ask for, answered once,
so that submission is copying rather than writing.

Companion to [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), which is the
order of operations for a release. This file is the *content* of one.

---

## How to use this file

This is the source of truth for both consoles. Copy from here into App Store
Connect and Play Console; do not compose in the console and copy back, because
the two stores ask overlapping questions and answering them separately is how
they end up disagreeing. When the app changes, this file changes with it, in
the same commit — a privacy answer is checked against observed behaviour, and
the store finds the drift before you do. The privacy policy page,
`frontend-parent/src/pages/PrivacyPolicy.jsx`, is the third copy of the same
statements and must agree with both; see [Copy that must stay in
step](#copy-that-must-stay-in-step) at the end.

Every character count below was measured, not estimated. A field over its
limit is rejected at submission, which is the most expensive moment to find
out.

---

## Before any of this can be submitted

This started as three things that were agreed but not in the build. **Two have
since shipped and one is still open.** Submitting while anything here is
outstanding means the listing and the review notes describe an app the
reviewer does not have, which is a rejection with a slow appeal.

Each line below was re-checked against the repo on 2026-09-03; the file it was
checked against is named, so the next reader can re-check it rather than trust
this paragraph.

- [x] **In-app account deletion exists — shipped.** `deleteParentAccount` is in
      `backend/controllers/parentController.js` and mounted as
      `router.delete('/account', protectParent, accountDeleteLimiter, deleteParentAccount)`
      in `backend/routes/parentRoutes.js` — the gate first, so the limiter that
      follows it keys by parent account rather than by IP. The screen is
      `frontend-parent/src/pages/Account.jsx`, routed at `/account` in
      `frontend-parent/src/App.jsx` and linked from both the desktop and the
      mobile nav in `frontend-parent/src/components/Navbar.jsx`. Covered by
      `backend/tests/parentAccountDeletion.test.js`. The description copy, the
      review notes, both privacy forms and §6 of the privacy policy therefore
      describe behaviour a reviewer can actually perform, not behaviour
      promised.
- [ ] **The submitted build has live payments on and the demo checkout off —
      still open, and still the one thing blocking submission.**
      `frontend-parent/src/services/payments.js` reads two flags:
      `VITE_PAYMENTS_ENABLED` must be the exact string `true` (line 34), and
      `VITE_DEMO_UPI_ENABLED` must be `false` — note line 40 is `!== 'false'`,
      so the demo is *on* unless explicitly turned off, and
      `PendingApprovalCard.jsx:394` computes `demoCheckout` from the same pair.
      Left at their `.env.example` defaults the app ships with a labelled UPI
      *preview* that never calls the payment API and never moves money — while
      this file's review notes argue about real payments for physical goods. A
      reviewer following those notes would find a demo.

      The build can no longer ship that by accident:
      `scripts/validate-frontend-release-env.mjs` — which `check:release` and
      `build:release` run, and therefore `sync:release`, `bundle:android` and
      `apk:release` — now refuses a release unless `VITE_DEMO_UPI_ENABLED` is
      exactly `false`, and unless `VITE_PAYMENTS_ENABLED` says `true` or
      `false` in so many words. What it deliberately does *not* do is insist on
      `true`: shipping without payments is a legitimate choice, and the check
      exists to stop a build shipping on a default nobody chose, not to make
      the decision. So this item stays open, because it is the decision that is
      open. If it is taken as payments off, cut the payments paragraphs from
      both descriptions and both sets of review notes rather than leaving them
      to be contradicted.
      **`RELEASE-CHECKLIST.md` carries this as a pre-upload gate in its "Every
      release" section — that is the operational copy; this is the reason for
      it. Change one and change the other.**
- [x] **`ITSAppUsesNonExemptEncryption` is set in `Info.plist` — shipped.** It
      is now a top-level key with the boolean value `false` in
      `frontend-parent/ios/App/App/Info.plist`; confirm with
      `plutil -p frontend-parent/ios/App/App/Info.plist`. App Store Connect
      therefore stops asking the export-compliance question at upload — see
      [export compliance](#export-compliance).

---

## Shared facts

| | |
|---|---|
| App name | Hunger Hunt Parent |
| Bundle id (iOS) / application id (Android) | `com.hungerhunt.parent` |
| Current version | 1.0.0, build 1 |
| Privacy policy URL | `https://hunger-hunt-parent.vercel.app/privacy-policy` |
| Support URL | `https://hunger-hunt-parent.vercel.app/terms-and-conditions` |
| Marketing URL | *(leave blank — there is no marketing site)* |
| Support / contact email | `dhruv.kamma04@gmail.com` |
| Support phone (Play requires email; phone optional) | `<<FILL IN, or omit>>` |
| Registered address (already published in the app's policy pages) | 120/3-M-I-S, Sainath Nagar, Revenue Ward No. 120, Kurnool, Andhra Pradesh, India - 518003 — registered office of GRAARR MANAGEMENT SERVICES PRIVATE LIMITED |
| Primary language | English (India) |
| Price | Free |
| Countries | India only |

Three notes on that table.

**The support email is `dhruv.kamma04@gmail.com`.** Apple requires a support
URL that a user can actually reach support through, and Play requires a support
email address as a listing field — so this has to stay a real, monitored
mailbox. It is published in the Contact sections of `TermsAndConditions.jsx`
and `PrivacyPolicy.jsx`, so the app agrees with the listing.

**The support URL points at the Terms page** because that is the only page in
the app carrying contact details today. If a proper support page is ever
added, change it here first.

**Version and build numbers come from three files that drift.** The table in
RELEASE-CHECKLIST.md §1 is the authority; `npm run check:native` fails when
they disagree.

### Categories

| Store | Answer | Why |
|---|---|---|
| Apple primary | Education | The whole app is one school's arrangement with its parents. Finance would be a truer description of the wallet screens and a worse one of the app, and it invites the financial-services scrutiny that a school tuck-shop balance does not deserve. |
| Apple secondary | Food & Drink | |
| Play category | Education | Play's "Food & Drink" sits under Apps and would put this beside restaurant delivery, which is not what a parent is looking for. |
| Play tags (up to 5) | School, Parenting, Food & Drink, Payments, Education | Play's tag list is fixed and changes; pick the nearest five it offers on the day. |

---

## Apple — App Store Connect

### App name — 18/30

```
Hunger Hunt Parent
```

### Subtitle — 26/30

```
Your child's school wallet
```

### Promotional text — 148/170

Editable without a new build, which makes it the right place for anything
seasonal. It is not indexed for search.

```
Top up your child's canteen wallet, follow every purchase as it happens, and approve or decline a purchase before a single rupee leaves the balance.
```

### Keywords — 95/100

Comma-separated, no spaces — a space after a comma is a wasted character.
Words already in the app name and subtitle (hunger, hunt, parent, child,
school, wallet) are deliberately absent: Apple indexes those fields already,
and repeating them buys nothing.

```
canteen,pocket,money,student,hostel,tuck,shop,balance,approve,purchase,upi,topup,allowance,dorm
```

### Description — 2901/4000

```
Hunger Hunt Parent is how a parent at our school sees what their child spends in the canteen, and how they put money into the wallet the child spends it from.

Every student here has a school wallet. They buy food at the counter and at the self-serve kiosk with a four-digit purchase code, and packages are handed to them at the hostel. This app is the parent's side of that: the balance, the history, the money going in, and the say over what goes out.

WHAT YOU SEE

- Each child linked to you, their class and room, and what is in their wallet right now.
- Every order: what was bought, what it cost, and how far it has got, from the moment it is paid for through to the package reaching the dorm.
- Every movement of money in the wallet - top-ups you made, order payments taken out, refunds for cancelled orders - each one showing the balance before and after.
- History arrives a page at a time, so a year of buying lunch does not have to load at once.

WHAT YOU CAN DO

- Add money to a child's wallet by UPI. Pick one of the preset amounts or type your own; the balance updates as soon as the payment settles.
- Switch on "Ask me before each purchase" for a child. The counter can then no longer charge that child directly: every purchase comes to you first, nothing leaves the wallet until you agree, and a request nobody answers expires after three days.
- Approve or decline a purchase that is waiting on you, with the full basket and the total in front of you before you answer.
- Set a spending limit - an amount, over a daily, weekly or monthly period - so the whole balance cannot go in one afternoon.
- Set or change the four-digit purchase code your child types at the counter. If it is forgotten, setting a new one asks for your own account password, never the old code.

NOTIFICATIONS

You are told when a purchase is waiting for your approval, when one you approved has gone through, when your child buys something at the counter, and when a recharge lands in the wallet. That is the whole list. Nothing in this app markets anything to you.

SIGNING IN

The school office creates parent accounts from the phone number the school already has on record, so there is nothing to sign up for here. The first time you sign in, a code is sent by SMS to that number to prove it is yours, and you choose a password. Every sign-in after that is your phone number and that password.

PAYMENTS

Money you add is real money, paid by UPI through PhonePe, and it is spent on real food your child collects at the school counter and at the hostel. All amounts are in Indian rupees.

PRIVACY

This app serves one school. It holds your name, your phone number and, if provided, your email address, plus your children's names, wallet balances and purchase history. It carries no advertising, no analytics and no tracking of any kind. You can delete your account from inside the app, at Account then Delete my account.
```

Every claim above is a screen that exists: balances and class/room on
`Accounts.jsx`, orders and wallet activity on the two tabs of
`ChildDetails.jsx`, the approval toggle and the spending limit in the same
file, the four-digit code and its password-based reset in
`SetPurchasePassword.jsx`, and account deletion on `Account.jsx`. Nothing here
describes a feature that has to be built to make it true. What still has to be
*configured* before upload is the payment flags — see [Before any of this can
be submitted](#before-any-of-this-can-be-submitted).

### What's New (version 1.0.0) — 416/4000

```
First release.

Hunger Hunt Parent brings the school canteen wallet to your phone: your children's balances, everything they have bought, every top-up and refund, and a notification the moment a purchase needs your approval.

You can add money by UPI, require your approval before a purchase is charged, cap what can be spent over a day, a week or a month, and set the four-digit code your child uses at the counter.
```

### Screenshots

The sizes, the shot list and the script that turns captures into store files
are in [store-assets.md](store-assets.md): this file is the words of a listing,
that one is the pictures. One fact about them belongs here, because it is
settled in a build setting rather than behind a camera.

**The app declares itself an iPhone app and nothing else.**
`frontend-parent/ios/App/App.xcodeproj/project.pbxproj` sets
`TARGETED_DEVICE_FAMILY = "1"` in both configurations (lines 328 and 351), so
what this listing owes App Store Connect is the iPhone screenshots and nothing
else — no **13" iPad set at 2064 x 2752**, and no iPad in App Review. The
decision is recorded in [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) under
"Before the first release"; if it is ever reversed, a full iPad set shot on an
iPad becomes a condition of submitting at all, and this paragraph changes with
it.

### Copyright — 15/100

App Information → Copyright. Required; the record cannot be saved without it.
Apple's format is the year the rights were obtained followed by the owner, with
no `(c)` symbol — Apple draws one — and no URL.

```
2026 GRAARR MANAGEMENT SERVICES PRIVATE LIMITED
```

The owner is not invented for the store record; it is the name the app already
publishes as its own. `frontend-parent/src/pages/TermsAndConditions.jsx` §1
says the platform "is owned by GRAARR MANAGEMENT SERVICES PRIVATE LIMITED
(HungerHunt), whose registered office is at 120/3-M-I-S, Sainath Nagar, Revenue
Ward No. 120, Kurnool, Andhra Pradesh, India - 518003"; §5 says the platform's
content is "owned by or licensed to
HungerHunt"; and the footer shared by every policy page,
`frontend-parent/src/components/PolicyPage.jsx`, prints that same name above
that same address — the address already in [Shared facts](#shared-facts). No
`package.json` carries an author or licence field and there is no `LICENSE`
file, so those three passages are the whole of the evidence, and they agree.

The year is the year of first publication, not of the latest update. It does
not get bumped annually; it changes only if the app's first release slips into
another year.

**If HungerHunt is registered under a longer legal name** — a proprietorship,
or a private limited with a suffix — that is what belongs in this field, and in
§1 of the Terms with it. Nothing in the repo states one, so nothing here
invents one. Change both together or the store record and the app stop naming
the same owner, which is the thing a reviewer comparing them is checking.

### Content rights — No

Asked at submission: *"Does your app contain, show, or access third-party
content?"* The answer is **No**, and the reasoning is worth having written down
before anyone asks for it, because a "no" here is seven separate claims and each
was checked on its own.

| Could be third-party | What is actually there |
|---|---|
| **Imagery** | The bundle holds one picture and its crop: `frontend-parent/public/Logo.jpeg` and the `favicon.png` cut from it, which are the app's own mark. `grep -rn -i image frontend-parent/src` returns nothing but CSS gradients and masks. |
| **Product photographs** | Real, and not in this app. `Product.image` in `backend/models/Product.js` holds a Cloudinary URL, filled by `backend/scripts/assignProductImages.js` from a folder of packet shots somebody collected and paired by `backend/utils/productImageMap.js`. Those *are* third-party pictures of branded goods — and they are drawn by the kiosk and the admin catalogue, never here: `parentController.js:454` returns each order line as `{ name, quantity, price }` and nothing more. |
| **Fonts** | System stacks only, so nothing licensed is embedded. `frontend-parent/src/index.css:20` is `system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` and `parent.css:253` is `Georgia, 'Times New Roman', 'Noto Serif', serif`; every other declaration in the app is `font-family: inherit`. There is no `@font-face`, no `fonts.googleapis.com` link and no font file in the build. Play's feature graphic is the same by design — `scripts/store-graphic/feature-graphic.html:39` uses that system stack and line 11 says why. |
| **Icons** | Drawn in this repo, not licensed from a set. `frontend-parent/src/components/Icon.jsx` is 27 named entries, each one literal inline `<path>`, `<circle>` and `<rect>` markup written in the file — 64 shapes in all. The file imports nothing, and `frontend-parent/package.json` carries no icon package to license from. |
| **Product and brand names** | Text, used nominatively. Order history names what was bought, and some of what the school sells is branded — "Lay's Magic Masala", "7 UP", "Appy Fizz", "Lassi" (the alias list in `backend/utils/productImageMap.js` is the readable sample). Naming goods the school itself bought and resold is nominative use of a mark, not licensed content: no artwork, no logo, no rights transferred. |
| **Payment providers** | "PhonePe, Google Pay or Paytm" as plain text in `PaymentMethodChooser.jsx:195`, naming the apps a parent may pay with. Nominative use again, and nothing is embedded — PhonePe's checkout opens on PhonePe's own page. |
| **SDK-supplied content** | None. Firebase, the Capacitor plugins, React, axios and react-router are code under their own licences; not one of them puts third-party media, text or a catalogue on screen. The closest thing is Google's invisible reCAPTCHA during phone verification (`frontend-parent/src/services/phoneVerification.js`), which draws nothing unless it challenges, and runs under Firebase's own terms. |

Everything else the app shows is the school's own record or the parent's own
data: children's names and balances, items the school itself entered in its
catalogue at prices it set, transactions, and four settings. There is no
user-generated content, no feed, no media library, and no web view onto
anything outside the app.

**One loose thread to watch.** `frontend-parent/index.html:31` preconnects to
`res.cloudinary.com`, left behind by copying the head from an app that does
show catalogue art. It fetches nothing and is harmless — but the moment a
version of this app renders a product picture, the honest answer to this
question becomes **Yes**, and this section has to be rewritten rather than
re-used.

If a reviewer nonetheless reads the payment-provider or product names as
third-party content, the answer becomes **Yes** with the confirmation that the
necessary rights are held: PhonePe is an integrated payment provider under its
own merchant agreement, and the product names are the names of physical goods
the school buys and resells. Do not volunteer the Yes — answer No, and keep
this paragraph for the reply if it is queried.

### Age rating

Answer the questionnaire with **no** to every content question: no violence,
no sexual content, no profanity, no alcohol/tobacco/drugs, no realistic or
simulated gambling, no contests, no horror, no medical or treatment
information, no unrestricted web access, no user-generated content, and no
messaging between users. The app has none of them — it renders a balance, a
list of purchases, and four settings.

Resulting rating: **4+**.

### Is this app directed at children? — No

The data in this app is *about* a child; the account holder, and the only
person who can ever sign in, is an adult with a school-registered phone
number. There is no child-facing surface: a student cannot sign in here at
all, and the app is never installed on a student's device. It therefore does
not go in the Kids Category and does not come under Apple's Kids Category
rules.

Say this in exactly those terms if asked to elaborate. The one thing to avoid
is answering as though the *subject* of the data settled the question — it is
the audience that does, and the audience here is a parent.

### Export compliance

- Does your app use encryption? **Yes.**
- Does it qualify for an exemption? **Yes.** The app makes HTTPS requests and
  nothing else. All of it is the operating system's own TLS, used for the
  standard purpose of protecting a network call; the app ships no encryption
  of its own and no non-standard cryptography. This is the exemption in
  Category 5 Part 2 for a product using only the platform's encryption.
- No annual self-classification report or ERN is required.
- `ITSAppUsesNonExemptEncryption` is set to `false` in
  `frontend-parent/ios/App/App/Info.plist`, so this is answered in the build
  rather than by hand on every upload and App Store Connect will not ask at
  upload. Verify with `plutil -p frontend-parent/ios/App/App/Info.plist`,
  which prints `"ITSAppUsesNonExemptEncryption" => false`. Keep it: removing
  it puts the question back on every single upload.

### Push notification purpose

Transactional account activity only. Four notifications exist, and they are
the only four the backend can send:

| Trigger | Text |
|---|---|
| A purchase is waiting for the parent's approval (`pendingOrderController.js`) | "Approval needed — {child} wants to spend ₹{amount}. Tap to review." |
| An approved purchase went through (`pendingOrderController.js`) | "Order approved — ₹{amount} spent. Balance ₹{balance}." |
| The child bought something at the counter (`transactionController.js`) | "🛒 Purchase Alert — Spent ₹{amount}. Balance ₹{balance}" |
| A wallet recharge landed (`studentController.js`) | "💰 Wallet Recharge — ₹{amount} added. New balance ₹{balance}" |

There is no marketing notification, no promotional channel and no mechanism to
send one: every call site is a money movement on the parent's own account.

---

## Apple — privacy nutrition labels

Every type below is **linked to the user's identity** (the whole app is behind
one parent account) and **not used for tracking** (there is no advertising
identifier, no cross-app or cross-site tracking, no data broker, and no ATT
prompt because nothing requires one). Purpose for every type: **App
Functionality**.

### Data collected

| Category → Type | Collected | What it is, and where it lives |
|---|---|---|
| Contact Info → Name | Yes | Two people's names, not one. The parent's own (`Parent.fatherName`, set by the school office, returned by `parentSessionView` in `parentController.js`) **and each linked child's** — `getParentDashboardDetails` selects `name` for every child and `Accounts.jsx` renders it, and `parentPackageView` returns `studentName` on every order. |
| Contact Info → Phone Number | Yes | `Parent.phone`. The sign-in identifier, and the number Firebase texts a verification code to on first sign-in. |
| Contact Info → Email Address | Yes | Optional `Parent.email`. When supplied, it is used for password-reset links (`forgotPassword`); parents without one recover access through the school’s phone-verification reset flow. |
| Purchases → Purchase History | Yes | The child's orders and wallet ledger, read by `getChildBills`, `getChildRecharges` and `getChildPackages`. |
| Financial Info → Other Financial Info | Yes | Wallet balance, top-up amounts and payment outcome — `Student.pocketMoney` and the `PaymentIntent` row. |
| Identifiers → User ID | Yes | The parent account id, carried in the session token. |
| Identifiers → Device ID | Yes | The FCM push token and its platform, stored in `Parent.pushTokens` by `savePushToken`. |
| Diagnostics → Other Diagnostic Data | Yes | The backend's HTTP access log (`morgan('combined')` in `app.js`): method, path, status, user agent, timestamp and originating IP, retained by the host. |
| Other Data → Other Data Types | Yes | Two credentials and one school detail, none of which has a category of its own on this form. **The parent's account password** (`Parent.password`) and **the child's four-digit purchase code** (`Student.purchasePassword`, `select: false`), each stored only as a bcrypt hash — `bcrypt.hash(…, 10)` at `parentController.js:87`, `:254`, `:522`, `:575` and `:622`, never as plaintext, and never readable back. **Each child's admission number, class and room number** (`Student.admissionNumber`, `Student.className` with `Student.section`, `Student.roomNumber`), shown on `Accounts.jsx` and `Account.jsx` and printed on a recharge receipt. |

### Data explicitly not collected

Leaving a category blank and answering it "not collected" are different
answers. Answer these, do not skip them.

| Category | Types | Why not |
|---|---|---|
| Contact Info | Physical Address, Other User Contact Info | Never asked for, no field for it. The app does show each child's admission number, class and room number, which is neither a physical address nor contact information — it is declared above under Other Data → Other Data Types, which is where this form has room for it. |
| Financial Info | Payment Info, Credit Info | The parent enters UPI details on PhonePe's own checkout, which the app hands off to. No card or UPI credential ever reaches this app or its backend. |
| Health & Fitness | all | — |
| Location | Precise, Coarse | No location permission is requested on either platform. |
| Sensitive Info | all | — |
| Contacts | all | No contacts permission. |
| User Content | Photos/Video, Audio, Gameplay, Customer Support, Other | No upload path, no in-app support channel. |
| Browsing History | all | — |
| Search History | all | — |
| Identifiers | Advertising Identifier | No ad SDK, no IDFA access. |
| Usage Data | Product Interaction, Advertising Data, Other | **Nothing analytics-shaped exists.** `grep -rn "analytics\|gtag\|mixpanel\|sentry" frontend-parent/src` returns **zero hits** — re-run 2026-09-03. It returned exactly one before amendments A2 and A4 landed, and that hit was the word "analytics" inside the privacy policy's own prose, claiming an analytics use the build never had. `frontend-parent/src/firebase.js` carries no `measurementId` and never calls `getAnalytics`, so even the Firebase SDK that *is* in the build collects nothing. |
| Diagnostics | Crash Data, Performance Data | No crash reporter, no performance SDK. Only the server access log above. |

### Third parties in the data path

None of these is an SDK collecting on its own account. All three are named
because a reviewer comparing this form to network traffic will see them, and
because the Data Safety "not shared" answer below depends on each one being a
disclosed service provider. **This list of three is the canonical one** — if a
fourth is ever added, it goes in here, in the Data Safety sharing note, and in
the privacy policy, together.

- **Google Firebase** receives the parent's phone number in order to send the
  first-sign-in SMS and to verify the resulting ID token, and receives the
  device push token in order to deliver notifications. The web build also
  calls **Google reCAPTCHA** during phone verification
  (`RecaptchaVerifier`, invisible, in
  `frontend-parent/src/services/phoneVerification.js`). This is the same
  statement the app's privacy policy already makes, in §2.
- **Google, as mail provider.** Every password-reset email is sent over
  authenticated SMTP to `smtp.gmail.com:587`
  (`backend/utils/mailer.js:13-25`), which transfers the parent's email
  address, and the reset link, to Google. It is the same company as Firebase
  but a different service and a different data item, so it is listed
  separately rather than folded in. §4 of the privacy policy names it — "Google
  … carries our password-reset email" — as amendment A1 required; see [Copy
  that must stay in step](#copy-that-must-stay-in-step).
- **PhonePe** receives a merchant order id, an amount in paise and a return
  URL — and nothing about the parent or the child. Confirmed in
  `backend/src/domain/payments/providers/phonepe.js`: `createPayment` sends
  `merchantOrderId`, `amount`, `expireAfter` and `merchantUrls.redirectUrl`,
  and nothing else. Whatever the parent types into PhonePe's checkout is
  PhonePe's collection, under PhonePe's own policy, on PhonePe's own page.

---

## Apple — review notes — 3844/4000

Paste the whole of the following into App Store Connect → App Review
Information → Notes.

**That field caps at 4000 characters and truncates silently at paste.** The
first draft of this block ran to 4030 and lost its tail — which was the
directed-at-children argument, the part a reviewer most needs when the app
displays a named child's spending. Keep the count under 4000 and re-measure
after any edit; the IAP argument and the password-already-set paragraph are
the two that must survive any future trim.

```
WHY THIS APP DOES NOT USE IN-APP PURCHASE

Money added in this app buys physical food. Every student at this school has a
canteen wallet; they spend it at a staffed counter and a self-serve kiosk on
the school premises, and the packages are handed to them in person at their
hostel. Nothing bought with that money is digital, and none of it is consumed
inside the app: it never unlocks a feature, a subscription or any content. A
parent here is putting real rupees into their child's real canteen account, as
they would by handing them cash at the school gate.

Payments therefore run through PhonePe, a UPI payment provider licensed in
India, under the physical-goods-and-services provision of the App Store Review
Guidelines rather than through in-app purchase. The app shows the amount and
the outcome; PhonePe's own checkout takes the payment.

HOW TO SIGN IN — PLEASE READ, THE ACCOUNT MATTERS

There is no registration in the app and no self-service sign-up anywhere. The
school office creates each parent account from the phone number the school
already holds for that family, and links it to that family's children. Without
the credentials in the fields above, every screen is a login screen.

Sign-in asks for a 10-digit Indian mobile number, then "Continue", then the
password on the next step.

The account we have supplied ALREADY HAS ITS PASSWORD SET, so signing in is
only phone number + password. This matters: the app sends a parent to one-time
SMS verification only when their account has never had a password. The
supplied account is past that point and will never ask you for an SMS code —
deliberately, because that code would go to a phone in India that you do not
have. If a "Create your password" screen ever appears asking for a 6-digit
code, the account has been reset; please contact us rather than attempting it.

ACCOUNT DELETION

A parent can delete their own account in the app: Account → Delete my account,
confirmed with the account password. Deleting ends their ability to sign in,
signs out every device the account is open on, removes the saved password,
withdraws every device registered for notifications, and stops the account
standing as their children's registered parent, so it can no longer see or act
on those accounts. The one thing that stops it is a purchase still waiting
for that parent's approval — answering it moves money, so the app asks them to
answer that first and then delete.

The children's wallet balances and purchase history are not erased. They are
the school's record of what a student was given and what they spent, and they
stay with the school; a minimal account record is retained alongside them so
that approvals and payments made before deletion remain attributable.

NOTIFICATIONS

Push is transactional only, and there are exactly four: a purchase is waiting
for your approval, an approved purchase has gone through, your child bought
something at the counter, a wallet recharge landed. Every one is a movement of
money on the signed-in parent's own account. There is no marketing
notification and no mechanism to send one.

WHAT YOU WILL SEE

Dashboard: purchases awaiting approval, and orders in progress. Student
accounts: each linked child with their wallet balance. A child's page has an
Orders tab (past and in-flight orders with delivery status) and a Wallet tab
(add money by UPI, the wallet ledger, the spending limit, and the "Ask me
before each purchase" switch). Purchase code sets the four digits the child
types at the canteen counter.

WHO THIS APP IS FOR

One school, in India. The account holder is always an adult parent or
guardian; a student cannot sign in and the app is not installed on student
devices. The data shown is about a child, but the audience is not a child,
which is why the app is not directed at children and is not in the Kids
Category.
```

---

## Google — Play Console

### Store listing

**App title — 18/30**

```
Hunger Hunt Parent
```

**Short description — 74/80**

```
Track your child's canteen wallet, top it up, and approve what they spend.
```

This line is also the strapline on the 1024×500 feature graphic. If it changes
here, the graphic is regenerated.

**Full description — 2777/4000**

```
Hunger Hunt Parent is the parent's side of the school canteen. It shows what your child has in their school wallet, what they have been buying, and where their orders have got to - and it lets you put money in and decide what goes out.

Every student here has a wallet. They buy food at the canteen counter and at the self-serve kiosk with their own four-digit purchase code, and packages are handed to them at the hostel door. This app is where a parent keeps up with all of it.

SEE WHERE THE MONEY IS

- Every child linked to you, their class and room, and the balance in their wallet right now.
- Every order: what was bought, what it cost, and how far it has got, from payment through to the package arriving at the dorm.
- Every movement of money in the wallet - your top-ups, payments taken for orders, refunds for cancelled orders - each showing the balance before and after it.
- History loads a page at a time, so a whole school year of lunches never has to load at once.

DECIDE WHAT GOES OUT

- Add money to a child's wallet by UPI. Choose a preset amount or type your own; the balance updates as soon as the payment settles.
- Switch on "Ask me before each purchase". The counter can then no longer charge that child directly: each purchase comes to you first, nothing leaves the wallet until you agree, and an unanswered request expires after three days.
- Approve or decline a waiting purchase, with the full basket and total in front of you.
- Set a spending limit - an amount over a daily, weekly or monthly period - so the whole balance cannot go in one afternoon.
- Set or change the four-digit purchase code your child types at the counter. Forgotten codes are replaced using your own account password, never the old code.

NOTIFICATIONS YOU ACTUALLY WANT

You are notified when a purchase is waiting for your approval, when one you approved has gone through, when your child buys at the counter, and when a recharge lands. That is the entire list. This app never markets anything to you.

SIGNING IN

The school office creates parent accounts from the phone number the school has on record, so there is no sign-up here. On your first sign-in a code is sent by SMS to that number to prove it is yours, and you choose a password; after that it is your phone number and password.

PAYMENTS

Money you add is real money, paid by UPI through PhonePe, and it is spent on real food that your child collects at the school counter and at the hostel. All amounts are in Indian rupees.

PRIVACY

This app serves one school. It holds your name, phone number and, if provided, your email address, plus your children's names, wallet balances and purchase history. No advertising, no analytics, no tracking. You can delete your account from inside the app, at Account then Delete my account.
```

### Target audience and content

| Question | Answer |
|---|---|
| Target age groups | **18 and over**, and only that. Do not tick any younger band. |
| Does your app appeal to children? | **No.** The account holder is an adult; a student has no account here and cannot sign in. Ticking any band below 18, or answering yes, pulls the app into the Families policy and its separate review — for an app no child can use. |
| Does your app contain ads? | **No.** No ad SDK, no ad network, no promoted content anywhere in the build. |
| Is this a news app? | No. |
| COVID-19 contact tracing/status app? | No. |
| Government app? | No. |
| Financial features | **None to declare.** The app does not offer loans, insurance, investments, or crypto, and is not a payment aggregator: it hands a checkout to PhonePe, a licensed provider, and never touches a payment instrument. |
| Data safety | See the next section. |

### Content rating questionnaire (IARC)

Category: **Utility, Productivity, Communication or Other**.

| Asked, in substance | Answer |
|---|---|
| Violence, of any kind | No |
| Sexual content or nudity | No |
| Profanity or crude humour | No |
| Controlled substances — drugs, alcohol, tobacco | No |
| Gambling, real or simulated | No |
| Horror or fear-inducing content | No |
| Users can interact, communicate, or exchange content | No. There is no messaging, no comments, no user-generated content, and no way for one parent to see or reach another. |
| Shares the user's location with other users | No |
| Allows users to purchase digital goods | **No.** Money added to a wallet buys physical food collected in person at the school. Nothing digital is sold, and no digital content is unlocked. |
| Digital purchases via Google Play Billing | Not used at all. Play's "Contains in-app purchases" badge is driven by Play Billing, so it will correctly not appear on the listing. |

Expected outcome: **Everyone / PEGI 3 / rated for all ages** — which is a
statement about content, not about audience. It does not conflict with the
18-and-over target audience above, and both answers are correct as given.

### App access

Choose **All or some functionality is restricted**, and add one instruction
set covering the whole app. Name it `Parent account (the whole app)`.

The "Any other instructions" field takes roughly 500 characters, which is a
quarter of what Apple's notes field allows — so this is the short version, and
the one sentence that cannot be dropped is the password-already-set one. A
reviewer can work around most confusion; they cannot work around being sent an
SMS to a phone on another continent.

**Any other instructions — 481/500**

```
Every screen is behind a parent login; the school office creates accounts and there is no sign-up in the app.

Enter the 10-digit phone number below, tap Continue, then the password.

This account already has its password set, so it will never ask for an SMS code — a parent is sent to SMS verification only when their account has never had one, and that code goes to a phone in India you do not have. If a "Create your password" screen asks for a 6-digit code, contact us instead.
```

Username and password go into the two credential fields, not into these
instructions and not into this file.

### Store settings

- App or game: **App**
- Free or paid: **Free**
- Category: **Education**
- Contact details: email `dhruv.kamma04@gmail.com`, website
  `https://hunger-hunt-parent.vercel.app`, phone optional
- Privacy policy: `https://hunger-hunt-parent.vercel.app/privacy-policy`
- Enrol in **Play App Signing at app creation**. It cannot be added later
  without a key reset.
- Target API level 36, already set in
  `frontend-parent/android/variables.gradle`.

---

## Google — Data Safety

Google asks three things Apple does not: whether data is *shared* as well as
collected, whether it is encrypted in transit, and whether there is a way to
request deletion. All three are answered below.

### Overview answers

| Question | Answer |
|---|---|
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes.** Every call is HTTPS. `RELEASE-CHECKLIST.md` §2 makes an https production API URL a release gate, and both platforms block plaintext HTTP from an app anyway. |
| Do you provide a way for users to request that their data be deleted? | **Yes — account deletion is in the app**, at Account → Delete my account, and also at the web URL `https://hunger-hunt-parent.vercel.app/account`. |
| Is data shared with third parties? | **No.** See the note below — this is the answer the code supports, and the reason matters. |

**Why "not shared", when data does leave for three third parties.** Google's
Data Safety definition of *sharing* is a transfer to a third party, and it
explicitly excludes a transfer to a service provider that processes the data
on the developer's behalf. Every transfer this app makes is of that kind, and
the list is exactly three — the same three as in [Third parties in the data
path](#third-parties-in-the-data-path):

| Provider | What it receives | Why it is a service provider, not a recipient |
|---|---|---|
| **Google Firebase** (and Google reCAPTCHA on web) | The parent's phone number, to send and verify the first-sign-in SMS; the device push token, to deliver notifications. reCAPTCHA runs invisibly during web phone verification. | It sends the message we ask it to send, to the number we give it, and nothing here is handed to it as a recipient in its own right. It does apply its own terms to what it receives — Firebase phone auth checks the number for spam and abuse — which is disclosed in the policy rather than denied. |
| **Google, as mail provider** (`smtp.gmail.com`, `backend/utils/mailer.js`) | The parent's email address and the password-reset link. | It carries our mail. Nothing else is sent through it — there is no mailing list and no marketing send. |
| **PhonePe** | A merchant order id, an amount in paise, an expiry and a return URL. Nothing that identifies the parent or the child. | It takes a payment we initiate. What the parent types into PhonePe's own checkout is PhonePe's collection, on PhonePe's page, under PhonePe's policy. |

That answer is defensible only while the privacy policy names all three and
claims no wider sharing. **It now does both**: amendment A1 landed in
`frontend-parent/src/pages/PrivacyPolicy.jsx` on 2026-09-02, so §4 names
Google (SMS, notifications, password-reset mail) and PhonePe, and the sentence
offering sharing "with our affiliates" is gone. The standing rule has not
changed, though, and it is the reason A1 exists: **if the policy ever says
"affiliates" again when the form is submitted, this answer is wrong** — a
reviewer opening the policy URL this listing supplies would see "shared with
affiliates" beside a form answering No.

### Data types

Every type: **collected**, **not shared**, **not processed ephemerally**
(it is stored), **required** (the app cannot work without it — nothing here is
an optional extra the parent opts into).

| Google category → type | Purposes |
|---|---|
| Personal info → Name | App functionality; Account management — covers both the parent's own name and each linked child's, which the app shows on every account card and every order |
| Personal info → Email address | App functionality; Account management |
| Personal info → Phone number | App functionality; Account management |
| Personal info → User IDs | App functionality; Account management |
| Financial info → Purchase history | App functionality |
| Financial info → Other financial info (wallet balance, top-up amounts) | App functionality |
| App activity → App interactions | App functionality — not collected in the app, but the backend's HTTP access log (`morgan('combined')`, `backend/app.js:136`) records the method, path and status of every request, and a path is a screen. Kept to run the service and to rate-limit sign-in and payment against abuse |
| App activity → Other actions (approve/decline a purchase, spending-limit and approval settings) | App functionality |
| Device or other IDs | App functionality — the FCM push token, so notifications can reach the right device |
| Personal info → Other info | App functionality; Account management — the parent's account password and the child's four-digit purchase code, both held only as bcrypt hashes, plus each child's admission number, class and room number |

### Declared as not collected

Location (approximate and precise), Personal info → physical address, race and
ethnicity, political or religious beliefs, sexual orientation;
Financial info → **payment info** and credit score (the parent's UPI details
are entered on PhonePe's own checkout and never reach this app); Health and
fitness; Messages; Photos and videos; Audio files; Files and docs; Calendar;
Contacts; App activity → in-app search history, installed
apps, other user-generated content; Web browsing history; App info and
performance → **crash logs, diagnostics, other app performance data** (there
is no crash reporter and no analytics SDK in the build).

**On credentials, and on the school's own details.** Google's type list has no
password row and no school-details row, and Personal info → **Other info** is
the catch-all it provides — so that is where the account password, the child's
four-digit purchase code and the child's admission number, class and room
number are declared, rather than left undeclared for want of an exact label. Both
credentials are bcrypt hashes; the form has no way to say so, which is why the
privacy policy says it in §2 instead. Apple's equivalent is Other Data → Other
Data Types, declared for the same three items. **The two forms and §2 of the
policy now list the same things** — that symmetry is the point, and an edit to
any one of the three is wrong until the other two match it.

**On the server access log, in full, because the two forms answer it
differently.** One behaviour, three answers, and a reviewer comparing the
forms has to be able to see why. The behaviour: `morgan('combined')` at
`backend/app.js:136` writes an HTTP access log — method, path, status, user
agent, timestamp and originating IP — retained by the host, and
`backend/middleware/rateLimit.js` keys limiters on `ipKeyGenerator(req.ip)`.
It is disclosed to the parent in §2 of the privacy policy.

- **App activity → App interactions: declared, above.** Google defines this as
  information about how a user interacts with the app — pages visited,
  sections tapped. A path in an access log *is* the screen the parent opened,
  the log is retained rather than processed ephemerally, and the request that
  produced it was transmitted off the device by the app. This row was answered
  "not collected" until 2026-09-03, which was wrong, and it is the row Apple's
  Diagnostics → Other Diagnostic Data corresponds to.
- **App info and performance → Diagnostics: still not collected, correctly.**
  Google defines this category as *app performance* telemetry — crash logs,
  battery life, loading time, latency, framerate. There is no crash reporter
  and no performance SDK in the build, and an HTTP access line is not a
  performance measurement. Apple's form has no "app interactions" type, so on
  that form the same log lands under Diagnostics → Other Diagnostic Data; the
  two categories are shaped differently, which is why the same behaviour is
  declared in differently-named rows. **The rows differ; the behaviour
  declared does not.**
- **The IP address itself: no row on this form, and none invented.** Google's
  type list has no IP entry, and nothing here derives a listed type from it —
  no approximate location, no advertising profile. Apple does have somewhere
  to put it, inside the Other Diagnostic Data answer above. Do not "fix" that
  by inventing a Google category for it.

---

## Account deletion — the canonical wording

**This is the source of truth for how deletion is described everywhere.** Task
4 of the release plan copies the block below verbatim into
`frontend-parent/src/pages/PrivacyPolicy.jsx` (replacing the second paragraph
of §6, "Retention and deletion"), and the Account screen's own copy says the
same thing in fewer words. Change it here first, then in both of those.

> **Deleting your account**
>
> You can delete your Hunger Hunt Parent account yourself, from inside the
> app. Open **Account** and choose **Delete my account**. You will be asked
> for your account password to confirm it, because deletion cannot be undone.
>
> Deleting your account ends your ability to sign in. Every device signed in
> to the account is signed out at once, including the one you are deleting
> from; your saved password is removed; every device registered to receive
> notifications for the account is withdrawn, so nothing further is sent to
> any of them; and the account stops standing as your children's registered
> parent, so it can no longer see or act on their accounts.
>
> One thing will stop a deletion: a purchase still waiting for your approval.
> Answering it moves money, and that is your decision to make rather than
> something a deletion should make for you. Approve or decline the request
> first, then delete.
>
> Your children's wallet balances and purchase history are not erased. They
> are the school's record of what a student was given and what they spent —
> the school's, not your account's — and they stay with the school. For the
> same reason, a minimal record of your account is retained alongside them, so
> that approvals you gave and payments you made before deletion remain
> attributable.

---

## Reviewer account

Both stores need one working parent account, and neither reviewer can create
one. Set this up on **production**, not on a local database, and set it up
before either submission.

What the owner has to create:

1. **One parent account**, from the admin console, with a fictional family
   name and a phone number the school genuinely controls. Not a real family's
   record: the reviewer will see the children's names and everything they have
   bought.
2. **Its password already set.** This is the part that decides whether App
   Review can sign in at all. `getParentLoginStep` in
   `backend/controllers/parentController.js` routes an account to Firebase SMS
   verification when — and only when — it is active and has no password yet.
   An account in that state can only be opened by someone holding the phone
   that receives the SMS, which a reviewer in Cupertino or Mountain View is
   not. Complete the first-sign-in flow yourself on a device holding that SIM,
   choose the password, and hand over the password. After that the account
   takes the ordinary phone-plus-password path and no SMS is ever sent to it.
   **Do not reset it, archive it, or re-provision it between submission and
   approval** — any of those puts it back on the SMS path and the reviewer is
   locked out with no message explaining why.
3. **One child linked to it**, with a plausible balance (₹1,500–₹2,500 reads
   as ordinary) and a handful of past purchases and at least one top-up, so
   the Orders and Wallet tabs are not empty. An empty account looks broken and
   invites questions.
4. **A four-digit purchase code set** for that child, so the Purchase code
   screen shows its changed state rather than its first-time state.
5. **"Ask me before each purchase" left off**, so the reviewer sees the
   ordinary case. If you want them to see an approval, raise one from the
   admin console shortly before submitting — it expires after three days, so
   time it, and be ready to raise another during a long review.

```
Phone number: <<FILL IN, DO NOT COMMIT>>
Password:     <<FILL IN, DO NOT COMMIT>>
```

Those two values go straight into App Store Connect → App Review Information
and Play Console → App access, and nowhere else. They are not written into
this file, not into a commit message, and not into a screenshot. This repo's
history has already cost one round of credential exposure; a reviewer login on
production is not the place to repeat it.

---

## Copy that must stay in step

Three places say the same things about data and deletion. A change to any one
of them is wrong until all three agree, because both stores check the listing
against the app and the policy against both.

| Where | What it holds |
|---|---|
| **This file** | The canonical deletion wording, both privacy forms, and every store field. Change it here first. |
| **`frontend-parent/src/pages/PrivacyPolicy.jsx`** | The published policy at `/privacy-policy`, which is the URL both consoles point at. §2 must keep naming the Firebase phone-number transfer, PhonePe, the server access log, and both stored credentials; §3 must name the password-reset email as the only mail this app sends and §4 must name Google as the provider that carries it, which is where the mail path is disclosed — it is a transfer of an address already collected, not a collection of its own, so it does not belong in §2; §4 must stop offering affiliate sharing; §6 carries the deletion wording above. Twelve specific amendments are set out below. |
| **`frontend-parent/src/pages/Account.jsx`** (Task 3) | The parent's own words for the same thing, on the screen where they press the button. |

### Required amendments to `PrivacyPolicy.jsx`

**Status: all twelve have been applied** to
`frontend-parent/src/pages/PrivacyPolicy.jsx` — A1–A6 and A10–A11 on
2026-09-02, A7–A9 and A12 on 2026-09-03 — and the page has been read back
against this file end to end, in both directions: nothing the forms declare is
missing from the policy, and nothing the policy admits is denied by a form.

**A13, 2026-09-08: the admission number.** The app began showing each child's
admission number to their parent — `Account.jsx` lists it above the class, and
`ReceiptDialog.jsx` prints it on a wallet-recharge receipt — after §2 had been
settled, so the list in §2 was silent about a school detail on screen. It is
named there now, and in both privacy forms alongside the class and room number.
This is the failure mode A7 records, arriving from the other direction: a new
screen, not a cut sentence, and an exhaustive list is only exhaustive on the
day it was written.
They are kept below rather than deleted because each one records *why* a
sentence reads as it does, and because the "currently" quote is what a future
edit has to avoid reintroducing. Read them as standing constraints on that
file, not as outstanding work.

**They were blocking, and they are an instruction set, not a wishlist.** The
published policy is the URL both consoles are given; a reviewer opens it and
reads it beside the form. Twelve passages in it contradicted answers this file
gives. A1–A6 each made a *broader* claim than the code supports, so in each
case the store answer was the accurate one and the policy was the liability.
A7–A9 and A10–A12 are the opposite failure, and every one of them was created
by the narrowing in A5: an exhaustive list denies by omission, so each thing
the forms declare had to be put back — the server access log (A7), the two
stored credentials (A10), the account identifier (A12) — while A8, A9 and A11
close smaller gaps in the same direction. A policy narrower than the form
fails the cross-check in exactly the same way as a broader one.

Nothing below needs re-deriving: the offending text, its line, and the
exact replacement are given. Two mechanical notes — the file is JSX, so an
apostrophe inside text is written `&apos;`, and the surrounding `<p>` and
`<section>` tags stay exactly as they are. Only the sentences change.

---

**A1 — §4 "Sharing and disclosure": remove affiliate sharing.**
*Blocks the Data Safety "is data shared with third parties: No" answer.*
Affiliate sharing is not Google's service-provider exclusion, so as written
the policy says the app shares data while the form says it does not.

Currently (line 56):

> We may share information with our affiliates and with service providers that help us operate the platform, fulfil orders, deliver notifications, process payments, prevent fraud, or meet legal obligations. Third parties that collect information directly from you apply their own privacy policies, which you should review before providing information.

Replace with:

> We do not sell your information and we do not share it with affiliates or advertisers. We pass information to a small number of service providers, each only for the task named and on the terms that provider applies: Google, which sends the one-time SMS that verifies your phone number, delivers the app&apos;s notifications, and carries our password-reset email; and PhonePe, which takes UPI payments and is told only an order reference and an amount. We ask them for nothing beyond those tasks and give them nothing to market to you with, though a provider may also use what it receives for its own service — Google, for example, checks the phone number you verify for spam and abuse, as described above. Information you enter on PhonePe&apos;s own checkout is collected by PhonePe under its own privacy policy.

That single amendment also discharges the two long-standing gaps: PhonePe and
Google-as-mail-provider are now named, which is what the "not shared" answer
rests on.

Note what the replacement deliberately does *not* say. An earlier draft had
these providers "process it only on our instructions, and only for the task
named", which is itself an over-claim of the A1–A6 kind: §2 already tells the
parent, correctly, that Firebase uses the verified phone number for spam and
abuse prevention, which is Google's purpose and not ours. "On the terms that
provider applies", plus the Firebase example, is true of all three and still
excludes what A1 exists to exclude — no affiliates, no advertisers, no
recipient in its own right. Do not restore the stronger phrasing; it
contradicts the paragraph two sections above it.

---

**A2 — §3 "How we use information": remove "analysis and surveys".**
*Blocks the "no analytics" claim in both store descriptions and the
not-collected answers for Usage Data, crash logs and diagnostics.* There is no
analytics SDK anywhere in the build — `firebase.js` has no `measurementId` and
never calls `getAnalytics`, and the only match for the word in
`frontend-parent/src` is this policy's own prose.

Currently (line 48), inside the long purposes sentence:

> ... enforce our terms, perform analysis and surveys, and communicate service updates.

Replace that clause with:

> ... enforce our terms, and communicate service updates.

---

**A3 — §3: remove the marketing opt-out sentence.**
*Blocks "This app never markets anything to you" in both descriptions and the
transactional-only push declaration on both forms.* The app has no marketing
channel: the four push messages are all money movements, and the only email it
can send is a password reset.

Currently (lines 48-49):

> Where information is used for marketing, you may opt out of those communications.

Replace with:

> We do not use your information for marketing. The only messages this app sends are about your own account: a purchase waiting for your approval, a purchase that has gone through, and money added to a wallet — plus a password-reset email when you ask for one.

---

**A4 — §6 "Retention and deletion": remove "analytics and research".**
Same class as A2, and the one most likely to be missed because it sits in a
retention paragraph rather than a purposes one.

Currently (line 84):

> ... or other legitimate purpose, and may retain anonymised information for analytics and research.

Replace with:

> ... or other legitimate purpose.

---

**A5 — §2 "Information we collect": narrow it to what the app collects.**
*Blocks the Apple label table and the Google Data Safety type list, both of
which say none of this is collected.* `Parent` holds `fatherName`, `phone`,
`email`, a password hash and push tokens — no date of birth, no address, no
identity document.

**Scope: A5 governs §2's *first* paragraph only, and its quoted replacement is
that paragraph in full.** §2 has five paragraphs, and the other four are owned
elsewhere: A7 (the access log), A10 (credentials), A11 (PhonePe), A12 (the
account identifier), and the Firebase SMS paragraph, which is not an amendment
— it was written by hand alongside Firebase phone auth and is correct as it
stands. Do not read A5's quoted text as the whole of §2, and do not "restore"
§2 to it.

Currently (lines 23-27):

> We collect information you provide while registering, using the platform, or communicating with us. This may include your name, date of birth, address, mobile number, email address, identity or address information, and information connected with your child&apos;s school account. We also collect information about orders, wallet activity, payments, preferences, and your use of the platform.

Replace with:

> We collect what the school gives us when it creates your account, and what you do in the app afterwards. That is your name, your mobile number and, if provided, your email address; the children linked to you, with their names, admission number, class, hostel room and wallet balance; the orders placed on those wallets and the money moving in and out of them; the settings you choose, such as a spending limit or whether a purchase needs your approval; and a notification token for each device you sign in on, so that we can reach it. We do not ask for your date of birth, your address, or any identity document.

---

**A6 — §6: replace the deletion paragraph with the canonical wording.**
*This is the amendment the App Store's account-deletion requirement turns on,
and it must not be paraphrased.* The current paragraph tells the parent to ask
somebody, which is precisely what Apple does not accept.

Currently (lines 87-89):

> You may ask HungerHunt or your school administration for assistance with account deletion. Deletion may be delayed while an order, payment, shipment, grievance, or legal obligation remains unresolved. Once an account is deleted, access to that account and its associated information is lost.

Replace with the four paragraphs in [Account deletion — the canonical
wording](#account-deletion--the-canonical-wording) above, verbatim.

---

**A7 — §2: disclose the server access log and the originating IP address.**
*Required by the Apple label's Diagnostics → Other Diagnostic Data = **Yes**
([Data collected](#data-collected)).* A5 replaced an open-ended list ending
"and your use of the platform" with an exhaustive one ending "We do not ask
for your date of birth, your address, or any identity document". Exhaustive
prose has to be complete: as amended, §2 says nothing about the access log
`morgan` writes (`backend/app.js:136`, `'combined'` in production) or the
originating IP the rate limiters key on (`ipKeyGenerator(req.ip)` in
`backend/middleware/rateLimit.js`). The form declares it; the policy must not
be silent about it.

Add as a new paragraph after the first paragraph of §2 (before the
payment-provider paragraph):

> Our servers also keep an ordinary access log of the requests the app makes — the address requested, the time, the result, the app or browser used, and the internet (IP) address the request came from. We use it to keep the service running and to limit how often a request can be repeated, which is how we protect sign-in and payment from abuse. It is not used to build a profile of you and it is not used for advertising.

The last sentence is what keeps this consistent with the Google form, which
declares no location type and no advertising use for it — see the "On IP
addresses, deliberately" note under [Declared as not
collected](#declared-as-not-collected).

---

**A8 — §3: remove "improve the customer experience".**
*Blocks the single declared purpose on both forms.* Apple's label gives one
purpose for every type, **App Functionality**; Google's gives **App
functionality** and **Account management**. Neither has a
product-improvement purpose, and improving an experience is measured or it is
nothing — which is the claim A2 already removed from the same sentence.

Currently, inside the purposes sentence in §3:

> ... maintain wallet and payment records, improve the customer experience, resolve disputes, ...

Replace that clause with:

> ... maintain wallet and payment records, resolve disputes, ...

---

**A9 — §7 "Your rights and choices": name the deletion right.**
*Supports Play's "Do you provide a way for users to request that their data be
deleted?" = **Yes** and Apple's account-deletion requirement.* After A6, §6
describes deletion fully — but §7 is the section headed "Your rights", and it
offers only access, correction and withdrawal of consent. A reviewer checking
the deletion answer reads the rights section; the route must be findable from
there rather than only from a retention heading.

Add as a second paragraph of §7:

> You can also delete your account outright, yourself, from inside the app: open <strong>Account</strong> and choose <strong>Delete my account</strong>. Section 6 sets out what deleting removes and what stays with the school.

---

**A10 — §2: declare the two stored credentials.**
*Supports Apple's Other Data → Other Data Types = **Yes** and Google's
Personal info → **Other info**, both added 2026-09-02.* After A5 the paragraph
is exhaustive in shape — it ends "We do not ask for your date of birth, your
address, or any identity document" — so anything stored and unmentioned reads
as denied. Two credentials were unmentioned, and the page contradicted itself
twice over: §5 speaks of "your account credentials" and §6 of removing "your
saved password". `Parent.password` and `Student.purchasePassword`
(`select: false`) are both bcrypt hashes — `bcrypt.hash(…, 10)` at
`parentController.js:87`, `:254`, `:522`, `:575`, `:622`.

Add as a new paragraph after §2's first:

> We also hold the password you choose for your account, and the four-digit purchase code you set for a child to type at the canteen counter. Neither is kept as text: each is stored only as a one-way scrambled value that cannot be turned back into what you typed, so nobody at HungerHunt can read your password or your child&apos;s code, or tell it to you. A forgotten purchase code is replaced using your own account password, never recovered.

The last sentence matches `resetPurchasePassword` and the line both store
descriptions already carry. Neither store's form can express "hashed, not
stored in the clear", which is why the policy says it here.

---

**A11 — §2: name PhonePe rather than "a payment provider".**
*Supports Google's Financial info → **payment info: not collected** and
Apple's Financial Info → Payment Info = No.* §4 names PhonePe precisely; §2
said only "A payment provider may collect payment-instrument information",
which is vaguer than the form and leaves the "never reaches this app" claim
unstated on the page.

Currently, the opening of §2's payment paragraph:

> A payment provider may collect payment-instrument information needed to complete a payment. Its collection is governed by its own privacy policy.

Replace with:

> PhonePe, the provider that takes our UPI payments, collects the payment details you enter on its own checkout to complete a payment. Those details are collected by PhonePe under its own privacy policy and never reach HungerHunt.

The rest of that paragraph — the PIN and password warning — is unchanged.

---

**A12 — §2: disclose the account identifier.**
*Supports Apple's Identifiers → **User ID** and Google's Personal info →
**User IDs**, both of which have always been declared.* Found by the
both-directions check on 2026-09-03: both forms declared an account identifier
carried in the session token, and §2 — exhaustive in shape — never mentioned
one. Same failure class as A7: the form declared what the policy was silent
about.

Add as the closing sentence of the A10 paragraph:

> Your account also carries an identifier we generate for it, which is what the sign-in session on each of your devices refers to.

---

### After the amendments land

Re-read the policy end to end against this file's two privacy sections before
either submission. The check runs both ways. "Does it claim anything the app
does not do" is the failure mode that produced A1–A6, and it is the one to
watch when prose is added. "Does the form declare anything the policy is
silent about" is the failure mode that produced A7, and it is the one to watch
when prose is cut — a narrowing is not automatically safer than a catch-all.
A policy narrower than the form fails a reviewer's cross-check just as a
broader one does.
