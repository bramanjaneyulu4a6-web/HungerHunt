# Product decisions for deferred enterprise features

Status: Accepted

Date: 2026-08-13

These decisions apply to the current HungerHunt product: a school counter,
student wallet, parent-control, warehouse, and Accounts workflow. They should be
revisited only when the school identifies a concrete new operating process or
integration owner.

## 1. Customer fulfilment: weekly delivery to the student's dorm

HungerHunt fulfils each successful student order as a package delivered to the
student's dorm no later than 48 hours after successful payment. A student may place at most one
successful order in each business week.

Fulfilment is a separate aggregate from all similarly named records:

- `PendingOrder` is temporary parent-approval state and is not a package;
- `Transaction` is the immutable wallet purchase ledger and is not a dispatch
  workflow; and
- `Purchase` is procurement from a supplier and is not a student order.

A new `FulfillmentOrder` links one-to-one to the successful `Transaction`. It
copies the student name, admission number, dorm/hostel number, item names,
quantities, and prices at order time so later profile or catalogue edits do not
change a package already promised. The student's current dorm remains the
profile default, but the immutable order snapshot is what packing and delivery
use.

The aggregate follows guarded transitions:

```text
PENDING --pack--> PACKED --dispatch--> OUT_FOR_DELIVERY --hand over--> DELIVERED --student's code--> COLLECTED
   |
   +--cancel--> CANCELLED

PACKED --cancel--> CANCELLED
```

Each transition records its timestamp and authenticated staff actor.

`DELIVERED` and `COLLECTED` are two different facts and are deliberately not
one state. `DELIVERED` is the warehouse handing the package to the hostel's
caretaker, which is the act the 48-hour deadline measures and where the
storeroom's job ends. `COLLECTED` is the student taking it from the caretaker
afterwards. Collapsing them would let a package sit in a caretaker's room for
a week and still read as delivered on time, and — as the "received all" button
that this replaced showed — would let one tap close a hundred packages that
nobody had handed to anybody.

Only the delivery deadline treats `DELIVERED` as finished. The caretaker's own
queue keeps a delivered package until its student has taken it, and the
delivery report counts collected packages as delivered while reporting the gap
between the two separately.

### Proof of delivery

Delivery is the one transition that asserts something about a person outside
the system, so it is the one that must be proved. The proof is the smallest
thing that answers "who took it": a short receiver note naming the caretaker
who took the package at the hostel, plus the authenticated staff account that
recorded it and the server timestamp. The account and the time come from the
session and the clock, never from the request body, so neither can be typed
in.

The note is written by the warehouse, not the hostel: the person handing a
package over names who they handed it to, and the person receiving it does not
get to name themselves.

The receiver note is required to record a delivery, is capped at 60
characters, and is rejected if it contains six or more consecutive digits, an
`@`, or a URL — the shapes an admission number, an ID card, a phone number, or
a contact address arrives in. Room numbers are shorter than that, so
`Asha, room 214` is accepted.

Identity-document images, signatures, photographs, phone numbers, addresses,
and any other personal data about the receiver are explicitly not collected,
here or anywhere else. The free-text validation above is what keeps the note
from quietly becoming the place such data is stored regardless.

### Proof of collection

The last step has no free-text proof at all, because it does not need one. A
package is collected when the student it belongs to types their own four-digit
purchase code on the caretaker's screen. The caretaker's session gets the
request through the door and scopes it to their hostel; the code is what says
the right student is standing there. Neither alone is enough.

The code is checked against **the same** consecutive-miss counter and
fifteen-minute lock as checkout, deliberately: five wrong codes at the dorm
door lock the till too, and the other way round. A second door with its own
count would not be a second lock — it would be a way around the first one, and
four digits is ten thousand codes to anyone allowed to keep guessing. The
package's state is checked before the code is, so a student whose package has
not arrived yet does not spend one of five attempts learning that.

No member of staff can record a collection, on any route. The storeroom's
transition endpoint refuses `COLLECTED` outright, and the caretaker's route
has no transition endpoint at all.

### What a caretaker can raise

A caretaker has one channel to the school office and two things to put in it,
sharing one record because they need the same handling and the same trail:

- **An issue with a package**, raised from the code-entry panel at the moment
  of handover — something missing, the wrong items, damage, a student saying
  the package is not theirs, or a student who cannot produce their code.
- **A professional complaint about anything**, including about the warehouse,
  about another member of staff, or about the job.

Raising a package issue **does not hold the package**. It stays collectable,
because a student who is owed food should not lose it while an office reads a
message, and one missing juice should not stop them taking the rest.

These are read in the admin console and **nowhere else** — not in the warehouse
app, not by another caretaker. That follows from the second kind: a complaint
that can be read by the people it might be about is not a complaint channel,
and the caretaker filing one has to be able to know that before they type.
There is deliberately no warehouse route to this data.

Nothing about who is reporting comes from the request body. The name, role and
hostel are copied onto the report from the roster and the session, because a
report is a statement by a person and the only trustworthy source for which
person is the session that carried it here. An order issue is scoped to the
caretaker's own hostel exactly as collection is, and another hostel's package
answers 404 rather than a refusal — the same answer as one that does not exist.

**Every admin account sees the same queue**, and any of them may answer
anything in it. There is no owner and no assignment — which is exactly why the
report records **who answered it**, by name, snapshotted at the time so it
still reads correctly after that person leaves. A shared responsibility with no
name attached to its discharge is nobody's. The caretaker is shown that name
alongside the reply; an answer somebody has signed is a different piece of
writing from an anonymous one.

Because no owner means nobody is prompted, an undismissable banner counts the
unanswered reports on every screen of the console, naming how long the oldest
has waited. Nothing else tells staff a report exists: there is no staff email
and no staff push channel, so without it a complaint sits unread until somebody
happens to open the right page. The banner clears when the queue does.

The office can acknowledge a report silently, which means "read, being looked
at" and shows the other admins who has picked it up, but **resolving one
requires a note**: that note is what the caretaker who raised it reads, and a
channel that closes reports without answering them teaches people to stop
writing. Reopening is not a transition; a matter that comes back is a new
report, so the record of what was said, by whom, and when stays readable.

The queue is ordered oldest-first while it shows what is still owed, and
newest-first when read as a log. Deliberately not ordered by status: the three
values sort alphabetically, which would put a report somebody is already
handling ahead of one nobody has read.

One caretaker may hold 25 unanswered reports before being asked to wait. That
bounds the collection against a stuck client rather than rate-limiting by the
clock — a caretaker having a bad week may legitimately file several in an hour,
and a limiter that punished that would teach them to stop reporting.

### Parent visibility

The owning parent — and only the owning parent — can see each of their
children's packages: its state, the time it was ordered, the delivery
deadline, the times it was packed, dispatched, delivered and collected, and
the receiver note once it exists. Delivered and collected are shown as the
different things they are — "At the hostel" is not "Collected", and a parent
should be able to tell that their child has not picked the package up yet. The deadline is read from the order rather than
recalculated, so the parent and the storeroom are always looking at the same
one and no client needs to know the 48-hour rule or the business timezone.

The parent view carries no staff account, no transition trail, no internal
operational note, and no wallet transaction reference. The list is paged and
bounded like the other parent history screens.

### Overdue alerts

A package that is open and past its deadline is late. This is derived on read
from the deadline already stored on the order, so there is no scheduler to
keep alive and nothing to reconcile after a restart.

Staff acknowledge a late package, which records the acting account, the time,
and an optional follow-up note as an append-only entry, and withholds it from
the alert list for twelve hours. Acknowledgement never changes the package
state and never edits the transition history. The twelve hours are set against
the 48-hour delivery window: short enough that one click cannot quiet a
package for the rest of its life, long enough that the shift that acknowledged
it gets a chance to act before it returns. The number of late packages hidden
this way is always reported alongside the raised ones, so a quiet board is
never mistaken for one with nothing late on it.

### Delivery history and operational reports

Both are bounded to at most 93 days and read date-only bounds in
`BUSINESS_TIME_ZONE` with an inclusive through-date, matching the accounting
export. History is keyed on order time rather than delivery time, so a period
never silently drops the packages that were never delivered, and it is paged
with a clamped page size.

The operational report is deterministic, carries a schema version, and is
aggregate-only: counts by state, delivered on time against late, how many
deliveries carry a receiver record, and how long each step takes as both an
average and a median. No student, staff, item, or money detail leaves it. A
period with no deliveries reports a null on-time rate rather than a rate of
zero or one, and a range too large to answer is refused rather than answered
from a truncated read.

The weekly constraint uses the configured `BUSINESS_TIME_ZONE`, not the server's
clock. It is enforced by a unique database key on student plus business-week
start, so simultaneous kiosk requests cannot create two packages. The two-day
delivery time is stored on the order rather than recalculated by clients.

Package creation must join the wallet transaction atomically. A kiosk order
charges immediately when approval is not required. If parent approval is
required, the fulfilment package is created only when approval successfully
charges the wallet—not when the unapproved request is raised. The delivery
window begins at that successful charge in both cases.

Cancellation is allowed only before dispatch. It creates an append-only wallet
reversal, returns the package quantities to inventory, and retains the original
transaction. The reversal is exported to TallyPrime as a Credit Note. A
cancelled/refunded package releases the weekly slot so the student can place a
replacement order.

## 2. Accounting: operational subledger export before vendor integration

HungerHunt remains the operational source for wallet movements and purchases,
not the statutory book of account. The first accounting boundary will be a
versioned, read-only export rather than a direct vendor integration.

The export must include stable transaction IDs, timestamps in UTC plus the
configured business timezone, student reference, movement type, amount,
opening and closing balance, source reference, and reversal linkage when
refunds or voids are introduced. It must exclude purchase codes, passwords,
tokens, parent contact details, and unnecessary student profile data.

No chart-of-accounts numbers, tax classification, revenue-recognition rule, or
vendor-specific payload will be guessed in code. Accounts must supply those
before a journal adapter is built. Until then the export is explicitly an
operational reconciliation report, not a tax invoice or general-ledger import.

The first adapter targets TallyPrime's native XML bulk voucher import. Wallet
top-ups debit a configurable funding-clearing ledger and credit the student
wallet liability; paid orders debit that liability and credit a configurable
sales ledger. The target ledgers must already exist in Tally and Accounts owns
their groups and tax configuration. See `tallyprime-export.md`.

## 3. Replenishment: recommendations and drafts, never autonomous purchasing

Analytics may prefill a purchase-order draft, but it must not submit, approve,
or send an order automatically. Warehouse remains responsible for reviewing
quantities and submitting the request; Accounts remains responsible for the
approval decision.

Draft generation must:

- use the deterministic analytics output and record its `asOf` and
  `schemaVersion`;
- exclude inactive products and products at or above their reorder point;
- subtract quantities already covered by `PENDING_REVIEW`, `APPROVED`, or
  `PARTIALLY_RECEIVED` orders;
- create at most one active draft per warehouse and analytics date;
- show the estimated total before submission;
- allow every line to be edited or removed; and
- expire an untouched draft after seven days.

Implemented drafts use the larger of EOQ or the gap to the suggested reorder
point, then subtract remaining quantities on pending-review, approved, and
partially received orders. Warehouse can edit or remove suggested lines before
submitting the draft into the existing Accounts review queue.

There is no automatic schedule, autonomous approval, or hard-coded budget
ceiling. A future schedule and ceiling must be configuration owned by the
school, and breaching a ceiling must block submission rather than silently
reduce quantities.

## 4. LLM narrative: deferred and disabled by default

The deterministic dashboard is the supported analytics experience. No student,
parent, transaction, supplier, or inventory data will be sent to an external
model in the current release.

If narrative summaries are requested later, the adapter must be optional and
read-only. It may receive only aggregated analytics fields, never row-level
student or transaction data. It must not calculate metrics, mutate settings,
submit orders, approve orders, or trigger notifications. The output must be
labelled as generated commentary and store the analytics schema version, prompt
version, provider, model identifier, generation time, and request ID.

A provider, approved regions/data-retention terms, redaction review, monthly
cost ceiling, rate limit, fallback behaviour, and named product owner are
required before enabling it.

## 5. Money representation: migrate to integer paise

All persisted and transported monetary values will ultimately be integer paise.
Quantities, stock, percentages, analytics ratios, and durations remain numbers
in their natural units. API field names will carry the `Paise` suffix so rupees
and paise cannot be confused.

The migration is staged:

1. Introduce shared conversion/validation helpers and paise fields alongside
   existing rupee fields. New writes populate both during the compatibility
   window.
2. Backfill paise fields with `Math.round(rupees * 100)`, produce a discrepancy
   report, and refuse cutover if any value is non-finite, outside the safe
   integer range, or has more than two decimal places.
3. Change versioned APIs and all four clients to read/write paise fields. Keep
   legacy API adapters converting at the boundary.
4. Run wallet reconciliation and financial concurrency tests on a restored
   production backup, then make paise fields authoritative.
5. After one rollback window, remove legacy rupee fields in a separately
   backed-up migration.

No in-place conversion or automatic deletion is allowed. Every phase must be
re-runnable, report counts and discrepancies, and preserve immutable ledger
history. New financial workflows use strict two-decimal validation during the
compatibility period and will migrate with the original ledgers. The paise
cutover was explicitly deferred, so cancellation reversals retain the current
rupee representation until that work resumes.

## Implementation order

1. Operational accounting export (implemented for TallyPrime XML).
2. Replenishment draft generation (implemented).
3. Pre-dispatch cancellation and append-only wallet reversal (implemented).
4. Resume the deferred integer-paise migration before adding further financial
   movement types.
5. Revisit LLM only in response to an approved business need.
