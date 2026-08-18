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
PENDING --pack--> PACKED --dispatch--> OUT_FOR_DELIVERY --deliver--> DELIVERED
   |
   +--cancel--> CANCELLED

PACKED --cancel--> CANCELLED
```

Each transition records its timestamp and authenticated staff actor.

### Proof of delivery

Delivery is the one transition that asserts something about a person outside
the system, so it is the one that must be proved. The proof is the smallest
thing that answers "who took it": a short receiver note naming the student or
the dorm representative, plus the authenticated staff account that recorded it
and the server timestamp. The account and the time come from the session and
the clock, never from the request body, so neither can be typed in.

The receiver note is required to record a delivery, is capped at 60
characters, and is rejected if it contains six or more consecutive digits, an
`@`, or a URL — the shapes an admission number, an ID card, a phone number, or
a contact address arrives in. Room numbers are shorter than that, so
`Asha, room 214` is accepted.

Identity-document images, signatures, photographs, phone numbers, addresses,
and any other personal data about the receiver are explicitly not collected,
here or anywhere else. The free-text validation above is what keeps the note
from quietly becoming the place such data is stored regardless.

### Parent visibility

The owning parent — and only the owning parent — can see each of their
children's packages: its state, the time it was ordered, the delivery
deadline, the times it was packed, dispatched and delivered, and the receiver
note once it exists. The deadline is read from the order rather than
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
