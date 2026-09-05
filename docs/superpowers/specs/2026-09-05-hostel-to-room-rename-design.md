# Hostel → Room rename, derived blocks, and caretaker multi-room units

**Date:** 2026-09-05
**Status:** Approved (in-chat, 2026-09-05)
**Branch policy:** all work directly on `main`, no new branches. Existing
uncommitted changes on `main` are left intact and built upon.

## Goal

Rename the "hostel" concept to "room" through the entire system — code,
database, API surface, and UI of all four apps — and:

1. Keep blocks **derived** from the room code: the prefix before the first
   dash is the block (`MINDS-101` → block `MINDS`). No Block model. The
   first real block will be MINDS; rooms are seeded later with codes
   `MINDS-<number>` (seed data to be provided by the owner).
2. Allow caretakers to be assigned **one or more rooms**, treated as a
   single unit: one combined queue, one totals card, one warehouse tile.

## Naming map

| Today | Becomes |
|---|---|
| `Hostel` model / `hostels` collection | `Room` model / `rooms` collection |
| `normalizeHostelCode` | `normalizeRoomCode` |
| `Student.hostelId` / `.hostelNumber` | `.roomId` / `.roomNumber` |
| `Admin.hostelId` (single ObjectId) | `Admin.roomIds` (array of ObjectId) |
| `FulfillmentOrder.studentSnapshot.hostelId/.hostelNumber` | `.roomId` / `.roomNumber` |
| `StaffReport.hostelId` | `StaffReport.roomIds` (raiser's unit at report time) |
| `StaffReport.raiser.hostelNumber` | `.raiser.roomNumbers` (joined codes) |
| `StaffReport.order.hostelNumber` | `.order.roomNumber` |
| `GET/POST/PUT /api/hostels` | `/api/rooms` |
| Login response `hostelId` + `hostel: {id,code,name}` | `rooms: [{id, code, name}]` |
| `req.staff.hostelId` | `req.staff.roomIds` (array of strings) |
| npm script `backfill:hostels` | `backfill:rooms` |
| CSS `wh-hostel-*`, `caretaker-hostel-order`, `caretaker-identity__hostel` | `wh-room-*` / `wh-unit-*`, `caretaker-unit-order`, `caretaker-identity__rooms` |
| Import sheet column `hostelNumber`, CSV header "Hostel Number" | `roomNumber`, "Room Number" |
| UI copy "Hostel" | "Room" |

`Room.code` keeps the field name `code` (unique, uppercase). The
`Room` model keeps `code`, `name`, `active` unchanged otherwise.

## Caretaker multi-room unit

- `Admin.roomIds: [ObjectId]` with validator: caretakers require at least
  one; every other role must have an empty array. Multiple caretakers may
  still share rooms.
- `authMiddleware` loads the caretaker's `roomIds` per request (as today —
  the JWT stays room-free, so reassignment takes effect without re-login)
  and sets `req.staff.roomIds` (array of strings).
- Every caretaker-scoped query switches from equality to `$in`:
  fulfillment `list`, `awaitingCollection` count, `caretakerHistory`,
  `confirmCollection` (both pre-check and guarded update), and all staff
  report scoping. The caretaker dashboard's pinned totals card and
  `awaitingCollection` derive from that one server-side filter, so the
  "one unit" behaviour on the caretaker side falls out of the query change.
- `StaffReport` scoping: reports store `roomIds` (the raiser's rooms at
  report time); `listStudentOrderReports` filters by overlap
  (`roomIds: { $in: req.staff.roomIds }`).
- Admin staff management (register, staff list, staff update, archived
  restore) moves to multi-select room assignment; `caretakerCount` per
  room aggregates over the array.

## Warehouse board units

- Grouping stays client-side, but unit membership comes from the server:
  the staff fulfillment-order list response gains `meta.roomUnits` —
  rooms sharing an **identical caretaker set** form one unit; a room with
  no caretaker is its own unit.
- Board hierarchy: Block (derived from code prefix) → unit tile → orders.
  A unit tile covers all its rooms with one advance/deliver action, one
  receiver proof, and one grouped warehouse report.
- **Unit tile label: the room numbers with the block prefix stripped**,
  joined with " · " (e.g. under "Block MINDS": "101 · 102 · 103"; a
  single-room unit shows just "101"). Kicker reads "Room" / "Rooms".
- If a unit's rooms ever span blocks, the unit renders under the block of
  its lowest room code.
- The warehouse grouped-report validation relaxes from "orders must share
  one hostel" to "orders must belong to one unit".
- `blockFromHostel` → `blockFromRoom`, `groupOrdersByBlock` regrouped
  around `meta.roomUnits`; "Other hostels" → "Other rooms".

## Migration

New `backend/scripts/migrateHostelsToRooms.js`:

1. Rename collection `hostels` → `rooms`.
2. `$rename` `Student.hostelId→roomId`, `hostelNumber→roomNumber`.
3. `Admin`: wrap `hostelId` into `roomIds: [hostelId]`, unset `hostelId`.
4. `FulfillmentOrder`: `$rename` the two `studentSnapshot` fields; drop
   and recreate the three compound indexes on `studentSnapshot.roomId`.
5. `StaffReport`: `hostelId` → `roomIds: [hostelId]`,
   `raiser.hostelNumber` → `raiser.roomNumbers`,
   `order.hostelNumber` → `order.roomNumber`.
6. Verification counts printed at the end.

Run order: local dev Mongo (`hungerhunt_dev`) immediately for development
and tests. **Prod Atlas only on explicit owner go-ahead**, as step 1 of
the rollout below.

## Rollout (coordinated — old clients break at the API rename)

1. Run migration on prod Atlas, deploy backend on Render.
2. Redeploy the four Vercel apps (API URL is baked at build time).
3. Rebuild + re-sideload kiosk and warehouse APKs (`build:release`);
   rebuild parent native apps.
4. Warehouse localStorage: tolerant read of the persisted staff profile
   (`profile.rooms ?? [profile.hostel]`) so installed devices keep their
   header until next login.

## Deliberately left alone

- `'Hostel Essentials'` product subcategory (live catalogue data) and its
  test.
- Published privacy-policy wording and store-listing copy.
- Historical spec/plan documents.

Updated alongside code: `docs/architecture/openapi.yaml`, all 16 affected
test files, seed scripts (`seedDevAccounts`, `seedProdTestAccounts`,
`seedWarehouseOrders`, `backfillHostels` → room equivalents,
`setStudentCheckout --room` flag), `backfillCollectedPackages`.

## Testing

- Full backend test suite passes after the rename (field/route/message
  assertions updated, new coverage for multi-room `$in` scoping and the
  unit-overlap report filter).
- Warehouse `orderGroups` tests updated for unit grouping + label
  stripping; new cases: multi-room unit, unassigned room, cross-block
  unit placement.
- Seed script run against local dev to smoke the end-to-end flow.
