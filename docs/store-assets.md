# Store screenshots and graphics — parent app

The images App Store Connect and Play Console will not let you publish without:
what has to be on screen in each one, who is allowed to appear in them, and how
a capture off a real handset becomes a file the store accepts.

Companion to [store-listing.md](store-listing.md), which is the *words* of a
listing, and to [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md), which is the
order a release happens in.

---

## The sizes

Verified against the stores' own pages on **2026-09-02**. Both change these
without announcing it, and a wrong size is refused at the end of an upload
rather than the start — so re-check before a submission, not after.

| Store | Asset | Pixels | Notes |
|---|---|---|---|
| Apple | iPhone 6.9" screenshot | 1290 × 2796 portrait | Also accepted at that class: 1260 × 2736 and 1320 × 2868 |
| Apple | iPhone 6.5" screenshot | 1242 × 2688 portrait | Also accepted: 1284 × 2778 |
| Apple | iPad 13" screenshot | 2064 × 2752 portrait | **Required while the build targets iPad** — see below. Also accepted at that class: 2048 × 2732 |
| Apple | Screenshot count | 1–10 across all device classes | |
| Play | Phone screenshot | 1080 × 1920 portrait | Any side 320–3840px, longest side at most 2× the shortest |
| Play | Screenshot count | 2–8 per device type | 2 is the minimum to publish at all; 4 at 1080px+ is the bar for store promotion |
| Play | Feature graphic | 1024 × 500 | Exactly; no tolerance and no aspect-ratio variants |
| Play | App icon | 512 × 512 | 32-bit PNG — must carry an alpha channel, max 1024 KB. See [The app icon](#the-app-icon) |

Sources: [Apple screenshot
specifications](https://developer.apple.com/help/app-store-connect/reference/screenshot-specifications/),
[Google Play graphic
assets](https://support.google.com/googleplay/android-developer/answer/9866151).

Five things about that table are easy to get wrong.

**The iPad row is there because the app is currently an iPad app.**
`frontend-parent/ios/App/App.xcodeproj/project.pbxproj` sets
`TARGETED_DEVICE_FAMILY = "1,2"` in both the Debug and the Release
configuration (lines 328 and 351) — family 1 is iPhone, family 2 is iPad. While
that is what the project says, App Store Connect will not accept the build for
review without a 13" iPad screenshot set, and App Review runs the app on an
iPad and files what it finds there against the submission.

Whether to keep iPad is an open decision, not a settled one, and it is recorded
as such in [RELEASE-CHECKLIST.md](../RELEASE-CHECKLIST.md) under "Before the
first release". Narrowing the value to `"1"` deletes the whole obligation:
no iPad set, no iPad review. Keeping `"1,2"` means owing a full iPad set,
captured on an iPad — which is the more expensive of the two answers and the
one that happens by default if nobody chooses. `scripts/store-screenshots.mjs`
emits the iPad size either way, because an unused directory costs seconds and a
missing one costs a refused submission.

**Apple needs only one of the two iPhone sets.** Supplying 6.9" alone
satisfies the requirement; Apple scales it down for every smaller class. The
6.5" set is here anyway because Apple's downscale is not sharpened, and the
figures in a wallet balance are exactly the kind of small type that goes soft.

**Neither store accepts an alpha channel** on a screenshot or the feature
graphic, and `sips` carries one straight through from the source rather than
flattening it — so one transparent capture produces a whole set of rejected
files. No `sips` flag strips it. The script therefore refuses to run at all
when it finds one, names the file, and exits non-zero; the fix is on the
capture side — re-export flat (Preview → File → Export, uncheck Alpha).

Note this cuts the other way for the Play app icon, which must *have* an alpha
channel. Same limitation, opposite direction: see [The app icon](#the-app-icon).

**Play's screenshot rule is a range, not a size.** 1080 × 1920 is a choice, not
a requirement — it is 9:16, which is what Play recommends for promotion
eligibility, and it is inside the 2:1 limit.

**This table and the `TARGETS` constant in
[`scripts/store-screenshots.mjs`](../scripts/store-screenshots.mjs) are the same
fact written twice.** Change them in the same commit or the script will
cheerfully produce a size no store wants.

---

## Who appears in the screenshots

Capture everything from the **fictional family created for App Review** — the
same account whose credentials go in the review notes. Not a staff member's own
children, and never a live family.

This is not tidiness. A screenshot carries a child's name, their grade, their
room number and what they ate, and it ends up on a public product page in two
stores that cache and mirror it. Scrubbing that afterwards means editing pixels
and hoping, and it only takes one shot that nobody re-checked. Shooting from a
fictional family removes the problem at the point it would be created.

---

## The shot list

In listing order. The first three carry the page — Apple shows the first one to
three in search results, so lead with the thing a parent is actually looking
for, which is the balance.

1. **Dashboard, two children.** Two cards, clearly different balances: one
   comfortable, one nearly empty. The low one is what makes a parent open the
   app, so it has to be visible in the first screenshot.
2. **Child detail.** The purchase list, with several plausible items and real
   prices — enough rows that it reads as a history rather than a demo.
3. **A purchase awaiting approval.** The approve/decline card with the basket
   and the total on screen. This is the feature that distinguishes the app;
   do not bury it.
4. **Set purchase code.** The four-digit pad, mid-entry.
5. **Recharge.** The top-up sheet with the preset amounts.
6. **A notification arriving — Play only.** Apple's guideline 2.3.3 asks that
   screenshots accurately represent the app experience, and a shot whose
   subject is the system notification banner rather than the app is a
   documented way to draw that rejection. Play has no equivalent objection.
   The upside is small and the downside is a review cycle, so it goes in the
   Play set and not the Apple one.

Every shot is portrait. Both stores accept landscape; mixing orientations in
one set looks like a mistake.

**If the iPad target is kept, shoot the list again on an iPad.** Do not upscale
the iPhone captures into the iPad slot: the app's layout is not the same at
that width — the dashboard's child cards and the approval card both reflow —
and a set of stretched phone screenshots is both obviously that and a poor
description of what an iPad reviewer will actually see. Six shots on an iPad,
same subjects, same fictional family, same portrait orientation. If instead
`TARGETED_DEVICE_FAMILY` is narrowed to `"1"`, skip this entirely and ignore
the `apple-ipad-13/` output directory.

---

## Before you send them

- [ ] No real names anywhere — parent, child, or caretaker.
- [ ] No real phone numbers. The login screen is the obvious trap.
- [ ] Status bar clean: full signal, sensible time, battery not in the red, no
      carrier name that identifies a person.
- [ ] No debug banner, no dev-build watermark, no yellow React warning overlay.
      Reviewers look for these specifically.
- [ ] The build is pointed at production, so the data on screen is the data the
      app really shows. A screenshot of a staging balance is a screenshot of
      something that does not exist.
- [ ] The demo UPI checkout is off if payments are being submitted as live —
      see the top of [store-listing.md](store-listing.md).
- [ ] Nothing shows a screen that is not in the submitted build.

---

## Turning the captures into store files

[`scripts/store-screenshots.mjs`](../scripts/store-screenshots.mjs) takes a
directory of captures and writes one correctly sized PNG per capture per store
size. It **scales to fit and pads the remainder white** — it never crops,
because somebody framed each of those shots on purpose. White is the parent
app's own surface colour (`<meta name="theme-color">` in
`frontend-parent/index.html`), so the padding does not read as a border.

```bash
mkdir -p ~/Desktop/hh-captures
# Copy the captures off the phones into that directory, named in listing order:
#   01-dashboard.png  02-child-detail.png  03-approval.png ...
node scripts/store-screenshots.mjs ~/Desktop/hh-captures ~/Desktop/hh-store
```

It prints a line per file and lays the output out by target:

```
~/Desktop/hh-store/
  apple-6.9/       1290x2796   -> App Store Connect, 6.9" iPhone
  apple-6.5/       1242x2688   -> App Store Connect, 6.5" iPhone
  apple-ipad-13/   2064x2752   -> App Store Connect, 13" iPad
  play-phone/      1080x1920   -> Play Console, Phone screenshots
```

Upload each directory to the matching slot. The filenames sort in listing
order, so the numbering you gave the captures survives.

The script exits non-zero rather than leaving a discovery to the console at the
end of an upload. It fails, loudly and by filename, in three cases:

- **A capture carries an alpha channel.** Checked before anything is written,
  so you get an error instead of a directory of files both stores will refuse.
- **A capture cannot be read.** `sips` answers a truncated or mis-named file
  with `<nil>` and exit status 0, so this is checked explicitly. That one file
  is skipped, the rest still convert, and the run fails at the end — a shot
  quietly missing from the set is how a listing goes up one screenshot short.
- **An output is the wrong size.** Every written file is measured, not assumed.

It runs on macOS only: it drives `sips`, which ships with the OS, so that this
adds no dependency to any package in the repo.

---

## The feature graphic

Play requires a 1024 × 500 banner. Apple has no equivalent and does not want
one.

It is authored as HTML —
[`scripts/store-graphic/feature-graphic.html`](../scripts/store-graphic/feature-graphic.html)
— and rendered by the Chrome already on the machine:

```bash
node scripts/render-store-graphic.mjs
# -> scripts/store-graphic/feature-graphic.png  1024x500
```

The point of the HTML is that the strapline is text in a file. **It is the
short description from [store-listing.md](store-listing.md) word for word** —
character-identical, with a `<br />` inserted at the comma so it sets over two
lines. When that line changes there, edit it here and re-run. Do not paraphrase
it to make it fit; shorten the short description first, so the store listing and
the banner never say different things.

Three constraints are already built into the page and are easy to undo by
accident:

- **Nothing is fetched.** The logo is a data URI and the type is a system font
  stack. A webfont that fails to load renders a different picture than the one
  anybody approved, and this is a flat image with no second chance.
- **Everything sits in the middle.** Play crops the graphic on some surfaces
  and lays its own controls over the edges. The empty margin is deliberate;
  spreading the lockup out to fill the canvas is how the app name loses a word.
- **The strapline is set over two lines.** On one line it has to drop to 24px
  to fit, and Play draws this banner about 300px wide on a phone, where 24px
  becomes a smear. Two lines hold it at 36px, which still reads at that size.
  A longer strapline will not fit — shorten the copy rather than the type.

The renderer pins the device scale factor to 1 and the default background to
opaque. Neither is fixing an observed failure — Chrome 152 headless on a Retina
Mac already returns an opaque 1024 × 500 without them. They are there so the
output does not depend on that staying true of the next Chrome, the next
display, or a machine where someone renders this by hand: a 2x render is
2048 × 1000 and Chrome's own default background is transparent, and Play refuses
both. The renderer then asserts the output is 1024 × 500 with no alpha and exits
non-zero if it is not, so a regression is caught here rather than at upload.

---

## The app icon

Play's 512 × 512 listing icon and Apple's 1024 × 1024 marketing icon both come
from `frontend-parent/resources/logo.png`, which is already 1024 × 1024.

```bash
mkdir -p ~/Desktop/hh-store
sips -s format png --resampleHeightWidth 512 512 \
  frontend-parent/resources/logo.png --out ~/Desktop/hh-store/play-icon-512.png
```

The `mkdir -p` is not optional. Given a `--out` path whose directory does not
exist, `sips` writes a *file* at that path with no extension and exits 0, and
the next command that expects a directory there fails somewhere unrelated.

**That command does not finish the Play icon.** `logo.png` is opaque —
`samplesPerPixel: 3`, no alpha — and `sips` has no flag that adds an alpha
channel, so the output is a 24-bit PNG. Play asks for a 32-bit one. The channel
has to exist; the pixels do not have to be transparent, and should not be —
Play draws its own mask over the icon, and a genuinely transparent icon shows
the mask through it.

So the last step is by hand: open the 512 × 512 file in Preview, **File →
Export**, format PNG, and tick **Alpha**. That writes the same picture with an
opaque alpha channel, which is what Play accepts.

Apple is the reverse. It takes its 1024 × 1024 marketing icon from the build
rather than an upload, and **rejects any alpha channel at all**, so it uses
`logo.png` as it already is. The two stores want opposite files, which is why
this is two assets and not one.
