# Caretaker role — design

**Status:** spec only. No implementation plan, no task breakdown.

## The job

A dorm caretaker receives the packages the warehouse sends to their hostel and
confirms each one arrived. That confirmation is the last step of a package's
life and today it is done by the storeroom, on the storeroom's word, with a
receiver name typed into a browser prompt. Moving it to the person who actually
takes delivery makes the proof true rather than reported.

One action, one hostel. A caretaker packs nothing, orders nothing, sees no
money.

## Role

`caretaker` joins `admin` and `warehouse` in `Admin.role` and in
`STAFF_ROLES` ([tokens.js](../../../backend/utils/tokens.js)). It gets its own
gate, `protectCaretaker(['admin', 'caretaker'])`, beside the three in
[authMiddleware.js](../../../backend/middleware/authMiddleware.js) — a
caretaker must not inherit `protectWarehouse`, which reaches stock, suppliers
and purchase orders.

Account creation follows the existing shape exactly: the admin console's
register form gains a third option, and `MAX_CARETAKER_ACCOUNTS` joins the
`LIMITS` map in [adminController.js](../../../backend/controllers/adminController.js)
(suggest 20 — roughly one per hostel, with room for a handover).

## Hostels become a collection

Today `hostelNumber` is a required free string on `Student`, snapshotted onto
every `FulfillmentOrder`, and read in 47 places across all four apps. Matching a
caretaker to a dorm on that string would mean `D-4` and `D4` are different
hostels and nobody finds out until a package is confirmed by the wrong person.
So the hostel becomes a real row, and the string becomes a display copy of it.

**`Hostel`** — `{ code, name, active }`, same shape and admin surface as
[StockGroup](../../../backend/models/StockGroup.js): a unique `code` (the
string students already carry, stored trimmed and upper-cased), an optional
human name, and `active` so a closed dorm stops being offered without breaking
the records that point at it. Never deleted — students, orders and caretaker
accounts reference it forever, the rule suppliers and products already follow.

**The link runs on ids, the display runs on strings.** Three fields carry it:

- `Student.hostelId` — the truth about where a student lives. `hostelNumber`
  stays beside it as a denormalized copy, written from the hostel on every
  save, so student search, the four frontends and the spreadsheet import keep
  reading the field they read today.
- `FulfillmentOrder.studentSnapshot.hostelId` — added next to the existing
  `hostelNumber`. The string stays frozen because a snapshot records what was
  true when the package was raised; the id is what the caretaker query matches.
- `Admin.hostelId` — required when the role is `caretaker`, rejected for any
  other role.

A caretaker's scope is then `studentSnapshot.hostelId === their hostelId`. An
exact reference match, with no normalisation to get wrong.

**Writes resolve, they do not invent.** Creating or editing a student, and the
bulk spreadsheet import in
[readStudentSheet.js](../../../frontend-admin/src/utils/readStudentSheet.js),
resolve the hostel string against the collection and refuse anything that does
not match, listing the unknown values. Silently creating a hostel from a
typo is exactly how `D-4` and `D4` both come to exist.

**Backfill,** one script, in order: distinct `hostelNumber` values across
students become `Hostel` rows; every student gets its `hostelId`; every
fulfilment order gets `studentSnapshot.hostelId`. It must run before the first
caretaker account exists, and it is worth reading its list of distinct values
by eye before it writes — that list is where the existing typos are, and
merging them is a decision about real students, not one for a script.

## What a caretaker can reach

Two operations on the existing `/v1/fulfillment-orders` surface, narrowed by
the gate rather than duplicated onto a new one:

- **`GET /`** — orders in their hostel with status `OUT_FOR_DELIVERY`. The
  controller adds the hostel filter when `req.staff.role === 'caretaker'`;
  admins and warehouse accounts see the list they see today.
- **`POST /:id/transition`** — `DELIVERED` only, and only for an order in
  their hostel. Any other target status is 403 for this role; a mismatched
  hostel is 404, so a caretaker cannot learn that another dorm's order exists.

Everything else on that router stays warehouse-only: alerts, history, report,
acknowledge, and every other transition.

## Proof of delivery

`proofOfDelivery.receivedBy` currently carries a name the storeroom typed in.
When a caretaker confirms, they *are* the receiver, so the server fills
`receivedBy` from their account and ignores any value in the body — the field
keeps its meaning and the prompt disappears. `recordedBy` is their account id,
as it already is for staff.

This is the seam the barcode work lands on. Scanning replaces which order the
request names, not what the request means: the same endpoint, the same proof,
with a scanned token proving presence instead of a tapped button. Nothing in
this spec should assume the button is permanent, and nothing in it should have
to change when the scanner arrives.

## Screens

**Admin console** — two additions. A hostels page, modelled on the stock
groups screen already there: list, add, rename, deactivate, and a count of the
students living in each so a dorm is not deactivated out from under anyone.
Then [Register.jsx](../../../frontend-admin/src/pages/Register.jsx) gains a
`caretaker` option and, when it is chosen, a required hostel picker fed from
that collection — a select, not a text box, which is the whole point of the
collection existing. Wording matches the warehouse option already there: what
the account can do, and what it cannot.

The student form and the spreadsheet import move to the same picker and the
same resolution rule; a student's hostel stops being something anyone can
type.

**Warehouse app** — the login response already returns the role. A caretaker
gets a single screen and no tab bar: the packages on their way to their hostel,
each a card with the student's name, room, and item names with quantities, and
one button that confirms it arrived. No prices, no totals — a caretaker has no
business with what a package cost. The three staff tabs are not rendered and
their routes redirect, so a caretaker who bookmarks `/inventory` lands back on
their own screen rather than on a screen full of failed requests.

## Out of scope

Barcode scanning. Retiring `Student.hostelNumber` — the denormalized copy is
what keeps this change off the parent, kiosk and warehouse apps, and dropping
it is a separate job for the day nothing reads it. Rooms within a hostel;
`Hostel` is the building, and the room stays part of the student record.
Caretakers editing anything about a package other than confirming it. Overdue
alerts for caretakers — chasing a late package stays the storeroom's job.

## Worth testing

The backfill maps every existing student to a hostel and leaves none
unresolved; a student write with an unknown hostel is refused rather than
inventing one; `hostelNumber` stays in step with `hostelId` after a hostel is
renamed. Then the role itself: the gate refuses a caretaker every warehouse
route; a caretaker cannot transition an order outside their hostel, and cannot
transition one inside it to anything but `DELIVERED`; `receivedBy` comes from
the account and not the body; and a caretaker account cannot be created without
a hostel.
