# Hostel → Room Rename Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the hostel concept to "room" through code, DB, API, and all four app UIs; make caretakers multi-room with the rooms treated as one unit; keep blocks derived from the room-code prefix.

**Architecture:** Backend rename lands first (models → middleware/routes → controllers → tests) since DB field names thread through everything; a migration script converts local dev data so the suite and manual runs work. Then the warehouse app gets server-fed unit grouping, then admin/parent/kiosk get their mechanical renames. Blocks stay client-derived from the code prefix (`MINDS-101` → block `MINDS`).

**Tech Stack:** Node/Express + Mongoose (backend), React/Vite (4 frontends), node --test / vitest per existing suites.

**Spec:** `docs/superpowers/specs/2026-09-05-hostel-to-room-rename-design.md`

## Global Constraints

- **All work directly on `main`. Never create a branch. Never commit or push** — the owner commits. The tree already holds unrelated uncommitted changes in ~17 files; edit around them, never revert them, and NEVER run `git add`, `git stash`, or `git checkout -- <file>`.
- Backend `.env` points at local Mongo `hungerhunt_dev` — scripts hit dev data. **Never point anything at prod Atlas.** The prod migration is run only by the owner's explicit go.
- Leave alone: `'Hostel Essentials'` product subcategory (`backend/utils/productSubcategory.js:23` + its test), privacy-policy page copy (`frontend-parent/src/pages/PrivacyPolicy.jsx`), `docs/store-listing.md`, historical docs in `docs/superpowers/`, built iOS bundles under `frontend-parent/ios/App/App/public/`, anything under `android/`, `node_modules/`, `package-lock.json`.
- Naming: model `Room`, fields `roomId`/`roomNumber`/`roomIds`, routes `/api/rooms`, helper `normalizeRoomCode`. `Room.code` keeps the field name `code`.
- Unit tile label: room codes with the block prefix stripped, joined with `" · "` (under "Block MINDS", rooms MINDS-101+MINDS-102 label as `101 · 102`).
- Backend tests run with `npm test` in `backend/`; warehouse tests with `npm test` in `hungerhunt-warehouse/`.

---

### Task 1: Models + migration script

**Files:**
- Rename: `backend/models/Hostel.js` → `backend/models/Room.js` (`git mv` is forbidden — use `mv`, since no git operations are allowed; plain `mv` is fine because we never commit)
- Modify: `backend/models/Student.js:6-11`, `backend/models/Admin.js:26-36`, `backend/models/FulfillmentOrder.js:85-86,146-150`, `backend/models/StaffReport.js:21,34,94`
- Create: `backend/scripts/migrateHostelsToRooms.js`

**Interfaces:**
- Produces: `Room` model (default export, collection `rooms`), `normalizeRoomCode(value)`, `Student.roomId`/`Student.roomNumber`, `Admin.roomIds: [ObjectId]`, `FulfillmentOrder.studentSnapshot.roomId/.roomNumber`, `StaffReport.roomIds: [ObjectId]`, `StaffReport.raiser.roomNumbers: String`, `StaffReport.order.roomNumber: String`.

- [ ] **Step 1: Rename the model file and its contents**

`mv backend/models/Hostel.js backend/models/Room.js`; inside, rename `hostelSchema`→`roomSchema`, `normalizeHostelCode`→`normalizeRoomCode`, `mongoose.model('Hostel', …)`→`mongoose.model('Room', roomSchema)`. Fields `code`/`name`/`active` unchanged.

- [ ] **Step 2: Student, FulfillmentOrder, StaffReport field renames**

Mechanical: `hostelNumber`→`roomNumber`, `hostelId`→`roomId`, `ref: 'Hostel'`→`ref: 'Room'`. In `FulfillmentOrder.js` update the three compound indexes to `'studentSnapshot.roomId'`. In `StaffReport.js`: `raiser.hostelNumber`→`raiser.roomNumbers`, `order.hostelNumber`→`order.roomNumber`, and top-level `hostelId` becomes:

```js
roomIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
```

- [ ] **Step 3: Admin multi-room field**

Replace the `hostelId` field (Admin.js:26-36) with:

```js
roomIds: {
  type: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],
  default: [],
  validate: {
    validator(value) {
      const count = Array.isArray(value) ? value.length : 0;
      return this.role === 'caretaker' ? count > 0 : count === 0;
    },
    message: 'At least one room is required for caretaker accounts and rooms are not allowed for other roles.',
  },
},
```

- [ ] **Step 4: Write the migration script**

`backend/scripts/migrateHostelsToRooms.js` (follow the connect/disconnect harness used by `backend/scripts/backfillHostels.js`):

```js
// Renames the hostel concept to room in an existing database. Idempotent:
// every stage skips what is already converted.
import mongoose from 'mongoose';
import 'dotenv/config';

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const db = mongoose.connection.db;

  const collections = await db.listCollections().toArray();
  const names = collections.map((c) => c.name);
  if (names.includes('hostels') && !names.includes('rooms')) {
    await db.renameCollection('hostels', 'rooms');
  }

  await db.collection('students').updateMany(
    { hostelId: { $exists: true } },
    { $rename: { hostelId: 'roomId', hostelNumber: 'roomNumber' } }
  );

  const admins = db.collection('admins');
  const caretakers = await admins.find({ hostelId: { $exists: true } }).toArray();
  for (const account of caretakers) {
    await admins.updateOne(
      { _id: account._id },
      {
        ...(account.hostelId ? { $set: { roomIds: [account.hostelId] } } : {}),
        $unset: { hostelId: '' },
      }
    );
  }

  await db.collection('fulfillmentorders').updateMany(
    { 'studentSnapshot.hostelId': { $exists: true } },
    { $rename: {
      'studentSnapshot.hostelId': 'studentSnapshot.roomId',
      'studentSnapshot.hostelNumber': 'studentSnapshot.roomNumber',
    } }
  );
  const orders = db.collection('fulfillmentorders');
  for (const index of await orders.indexes()) {
    if (JSON.stringify(index.key).includes('hostelId')) await orders.dropIndex(index.name);
  }

  const reports = db.collection('staffreports');
  const staffReports = await reports.find({ hostelId: { $exists: true } }).toArray();
  for (const report of staffReports) {
    await reports.updateOne(
      { _id: report._id },
      {
        ...(report.hostelId ? { $set: { roomIds: [report.hostelId] } } : {}),
        $unset: { hostelId: '' },
      }
    );
  }
  await reports.updateMany(
    { 'raiser.hostelNumber': { $exists: true } },
    { $rename: { 'raiser.hostelNumber': 'raiser.roomNumbers' } }
  );
  await reports.updateMany(
    { 'order.hostelNumber': { $exists: true } },
    { $rename: { 'order.hostelNumber': 'order.roomNumber' } }
  );

  console.log('rooms:', await db.collection('rooms').countDocuments());
  console.log('students missing roomId:', await db.collection('students').countDocuments({ roomId: { $exists: false } }));
  console.log('caretakers missing roomIds:', await admins.countDocuments({ role: 'caretaker', $or: [{ roomIds: { $exists: false } }, { roomIds: { $size: 0 } }] }));
  console.log('orders missing snapshot roomId:', await orders.countDocuments({ 'studentSnapshot.roomId': { $exists: false } }));
  await mongoose.disconnect();
};

run().catch((error) => { console.error(error); process.exit(1); });
```

(The Mongoose model definitions recreate the three fulfillment indexes on next backend boot; the script only drops the stale ones.)

- [ ] **Step 5: Run the migration against local dev and check the printed counts**

Run: `cd backend && node scripts/migrateHostelsToRooms.js`
Expected: `missing` counts all `0`. Run it twice to prove idempotence.

### Task 2: Auth middleware, admin account surface, room routes

**Files:**
- Modify: `backend/middleware/authMiddleware.js:52-56`, `backend/controllers/adminController.js:6,57-86,136-170`, `backend/controllers/adminUserController.js:4,29,73,196-207,231-235`
- Rename: `backend/routes/hostelRoutes.js` → `backend/routes/roomRoutes.js`; update mount in `backend/app.js:22,266` to `app.use('/api/rooms', roomRoutes)`

**Interfaces:**
- Consumes: `Room`, `Admin.roomIds` from Task 1.
- Produces: `req.staff.roomIds: string[]` on every caretaker request; login response `{ rooms: [{id, code, name}] }` (top-level and in `staff`), replacing `hostelId`/`hostel`; staff list/update using `roomIds: []`; `/api/rooms` CRUD with `studentCount`/`caretakerCount`.

- [ ] **Step 1: Middleware**

```js
if (role === 'caretaker') {
  const account = await Admin.findById(payload.id).select('email roomIds').lean();
  if (!account?.roomIds?.length) return denied(res, 'Not authorized');
  req.staff.email = account.email;
  req.staff.roomIds = account.roomIds.map(String);
}
```

- [ ] **Step 2: adminController**

- Register: accept body `roomIds` (array of ids); validate every id is an active `Room` (`Room.find({_id: {$in: roomIds}, active: true})` length check); caretakers require ≥1, other roles none. Keep the backfill guard but check `Student.exists({ roomId: null })`-style conditions renamed.
- Login: replace the `hostelId`/`hostel` block with `const rooms = await Room.find({ _id: { $in: admin.roomIds } }).select('code name').lean()`; 403 messages become `'This caretaker account has no room assignment.'` / `'This caretaker account is assigned to missing rooms.'`; respond `rooms: rooms.map((room) => ({ id: String(room._id), code: room.code, name: room.name }))` both top-level and as `staff.rooms`.

- [ ] **Step 3: adminUserController**

`.populate('roomIds', 'code name')`, shape each staff row as `rooms: [{id, code, name}]` (was singular `hostel`); update route body `roomIds` (array), null→`[]` for non-caretakers.

- [ ] **Step 4: roomRoutes**

Rename file, identifiers, paths, and messages (`'Room code is required.'`, `'That room code already exists.'`, `'Room not found.'`, `'Move all active students before deactivating this room.'`). `withCounts` aggregates: students `{ roomId: { $in: ids } }` grouped on `$roomId`; caretakers `{ roomIds: { $in: ids }, role: 'caretaker' }` — **unwind the array**:

```js
Admin.aggregate([
  { $match: { roomIds: { $in: ids }, role: 'caretaker' } },
  { $unwind: '$roomIds' },
  { $match: { roomIds: { $in: ids } } },
  { $group: { _id: '$roomIds', count: { $sum: 1 } } },
]);
```

The code-change cascade at old `:77` becomes `Student.updateMany({ roomId: current._id }, { $set: { roomNumber: room.code } })`.

### Task 3: Student/parent/pending-order controllers + fulfillment snapshot writer

**Files:**
- Modify: `backend/controllers/studentController.js` (31 hits), `backend/controllers/parentController.js:162,469`, `backend/controllers/pendingOrderController.js:289`, `backend/utils/fulfillment.js:29-30`

**Interfaces:**
- Produces: student API accepts/returns `roomId`/`roomNumber` (list filter `?roomId=`, sort field `roomNumber`, bulk rows `roomNumber`); parent order payload field `roomNumber`; `studentSnapshot.roomId/.roomNumber` written at order creation.

- [ ] **Step 1: studentController rename**

Mechanical `hostel`→`room` through the file: import `Room, { normalizeRoomCode }`; `resolveHostel`→`resolveRoom` (error code `UNKNOWN_ROOM`, message `Unknown or inactive room: X.`); sort whitelist `'roomNumber'`; list filter `roomId`; bulk messages `'Room code is required.'` / `` `Room ${code} does not exist or is inactive.` ``; projection `roomId roomNumber`.

- [ ] **Step 2: parent/pending/fulfillment**

`parentController.js:162` populate select → `roomNumber`; `:469` payload key `roomNumber`; `pendingOrderController.js:289` populate select → `roomNumber`; `utils/fulfillment.js:29-30` snapshot keys `roomNumber`/`roomId`.

### Task 4: Caretaker scoping ($in), roomUnits meta, staff reports

**Files:**
- Create: `backend/utils/roomUnits.js`
- Modify: `backend/src/interfaces/http/controllers/fulfillmentOrderController.js` (scoping at `:128,139,165,213,246`, list + report responses), `backend/src/interfaces/http/controllers/staffReportController.js` (36 hits), `backend/src/domain/reports/staffReport.js:92`, `backend/src/domain/fulfillment/proofOfDelivery.js:37` and other comment/copy lines

**Interfaces:**
- Consumes: `req.staff.roomIds` (Task 2), snapshot `roomId` (Task 3).
- Produces: `buildRoomUnits() → Promise<Array<{ rooms: Array<{id, code}> }>>`; warehouse list `GET /v1/fulfillment-orders` and `GET /v1/fulfillment-orders/report` responses gain `meta.roomUnits`; grouped warehouse report accepts orders spanning one unit and stamps `meta.roomNumbers`.

- [ ] **Step 1: roomUnits helper**

```js
import Room from '../models/Room.js';
import Admin from '../models/Admin.js';

/* Rooms sharing an identical set of active caretakers form one delivery
   unit; a room nobody covers stands alone. */
export const buildRoomUnits = async () => {
  const [rooms, caretakers] = await Promise.all([
    Room.find({ active: { $ne: false } }).select('code').lean(),
    Admin.find({ role: 'caretaker', active: { $ne: false } }).select('roomIds').lean(),
  ]);
  const staffByRoom = new Map();
  for (const caretaker of caretakers) {
    for (const roomId of caretaker.roomIds || []) {
      const key = String(roomId);
      if (!staffByRoom.has(key)) staffByRoom.set(key, []);
      staffByRoom.get(key).push(String(caretaker._id));
    }
  }
  const units = new Map();
  for (const room of rooms) {
    const staff = (staffByRoom.get(String(room._id)) || []).sort();
    const unitKey = staff.length ? staff.join('+') : `room:${room._id}`;
    if (!units.has(unitKey)) units.set(unitKey, []);
    units.get(unitKey).push({ id: String(room._id), code: room.code });
  }
  const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return [...units.values()].map((unitRooms) => ({
    rooms: [...unitRooms].sort((a, b) => natural.compare(a.code, b.code)),
  }));
};
```

(Adjust the import paths to wherever the file lands relative to `models/`.)

- [ ] **Step 2: fulfillmentOrderController**

- All five caretaker filters become `'studentSnapshot.roomId': { $in: req.staff.roomIds }`.
- Non-caretaker (warehouse/admin) `list` response and the `/report` response add `meta.roomUnits: await buildRoomUnits()`. Caretaker responses do NOT include it.
- Serializer output key follows the snapshot rename automatically (`student.roomNumber`, `student.roomId`).

- [ ] **Step 3: staffReportController**

- Raiser stamp (old `:164-179`): `const rooms = await Room.find({ _id: { $in: req.staff.roomIds } }).select('code').lean()`; `raiser.roomNumbers = rooms.map((room) => room.code).join(' · ')`; report field `roomIds: req.staff.roomIds`.
- Order-scoped lookups (old `:147`, `:306`): filter `'studentSnapshot.roomId': { $in: req.staff.roomIds }`.
- `listStudentOrderReports` (old `:378`): `roomIds: { $in: req.staff.roomIds }`.
- Grouped warehouse report (old `:208-229`): replace "all orders share one hostel" with "all orders fall inside one unit": collect the orders' distinct snapshot `roomId`s, call `buildRoomUnits()`, and require one unit whose room-id set is a superset of the collected ids; otherwise 400 `'All orders in a grouped report must belong to one caretaker unit.'`. Stamp `meta.roomNumbers` (joined codes) instead of `meta.hostelNumber`, and `roomIds` = the unit's room ids.
- Per-unit open-report cap message (old `:298`) reworded to "room".
- `DELIVERY_SERVICE` label (staffReport.js:92) → `'How packages are being delivered to my rooms'` (Task 6 mirrors it in the warehouse).
- proofOfDelivery.js:37 copy → `'Record who at the room took the package — the caretaker who signed for it.'`

### Task 5: Backend tests, seed scripts, OpenAPI — suite green

**Files:**
- Modify: all 13 backend test files from the inventory (`studentHostels.test.js` → rename file to `studentRooms.test.js`), `backend/scripts/seedDevAccounts.js`, `backend/scripts/seedProdTestAccounts.js`, `backend/scripts/seedWarehouseOrders.js`, `backend/scripts/backfillCollectedPackages.js`, `backend/scripts/setStudentCheckout.js`, `backend/scripts/backfillHostels.js` → `backfillRooms.js`, `backend/package.json:17`, `docs/architecture/openapi.yaml`, `backend/.env.example:18-20` comment

**Interfaces:**
- Consumes: everything from Tasks 1-4.

- [ ] **Step 1: Test rename pass**

Mechanical rename in every test (fields, routes `/api/rooms`, exact message assertions listed in Tasks 2-4). Caretaker fixtures now set `roomIds: [id]`.

- [ ] **Step 2: New multi-room coverage (add to `caretakerRole.test.js`)**

Three tests: (a) a caretaker with two rooms lists orders from both and `meta.awaitingCollection` counts both; (b) `confirmCollection` succeeds for room B when assigned `[A, B]` and 404s for unassigned room C; (c) grouped warehouse report accepts orders spanning the two rooms of one unit and rejects a mix across two units. Follow the existing fixture style in that file.

- [ ] **Step 3: Scripts**

Field renames throughout. **Keep existing data values**: `seedProdTestAccounts.js` keeps code `TEST-HOSTEL-01` (it must match live prod records); `seedDevAccounts.js` may move to `DEV-ROOM-01`. `seedWarehouseOrders.js`: `HOSTELS_PER_BLOCK`→`ROOMS_PER_BLOCK`, room codes shaped `<BLOCK>-<n>` (e.g. `A-1`) so derived blocks work. `setStudentCheckout.js` flag `--hostel`→`--room`. npm script `backfill:hostels`→`backfill:rooms`.

- [ ] **Step 4: OpenAPI**

Rename the 5 field declarations + prose lines found at `docs/architecture/openapi.yaml:399,435,478,492-496,887,896,913,917,929,963`.

- [ ] **Step 5: Run the backend suite**

Run: `cd backend && npm test`
Expected: PASS. Then `grep -rn "hostel" backend --include='*.js' -il | grep -v node_modules` — only `productSubcategory` files and `seedProdTestAccounts.js` (the `TEST-HOSTEL-01` value) may remain.

### Task 6: Warehouse app — unit grouping + rename

**Files:**
- Modify: `hungerhunt-warehouse/src/utils/orderGroups.js` (+ its test), `utils/reports.js:24`, `utils/caretakerOrders.test.js:22`, `pages/Orders.jsx`, `pages/Records.jsx`, `pages/CaretakerOrders.jsx`, `pages/CollectOrder.jsx:217-218`, `pages/CaretakerReports.jsx:69`, `pages/Login.jsx:30-36`, `App.jsx:77,104-105,132-134`, `warehouse.css` (class list in spec)

**Interfaces:**
- Consumes: `meta.roomUnits` from `GET /v1/fulfillment-orders` and `/report`; orders carrying `student.roomId`/`student.roomNumber`; login response `rooms: [...]`.
- Produces: `blockFromRoom(roomNumber)`, `groupOrdersByBlock(orders, roomUnits)` returning `[{ key, label, units: [{ key, label, roomNumbers: string[], orders, orderCount, itemCount, items, overdue }], unitCount, orderCount, itemCount }]`.

- [ ] **Step 1: Rewrite orderGroups.js around units (test-first: update `orderGroups.test.js` expectations before the implementation)**

```js
const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const blockFromRoom = (roomNumber) => {
  const code = String(roomNumber || "").trim().toUpperCase();
  if (!code) return "Other";
  const separated = code.split(/[-/\s]+/).filter(Boolean);
  if (separated.length > 1) return separated[0];
  const prefix = code.match(/^[A-Z]+/i)?.[0];
  return prefix || code;
};

const stripBlock = (roomNumber, block) => {
  const code = String(roomNumber || "").trim();
  return code.toUpperCase().startsWith(`${block}-`) ? code.slice(block.length + 1) : code;
};

// itemCountOf and aggregateItems stay exactly as today.

export const groupOrdersByBlock = (orders, roomUnits = []) => {
  const unitByRoomId = new Map();
  roomUnits.forEach((unit, index) => {
    for (const room of unit.rooms || []) unitByRoomId.set(String(room.id), { index, unit });
  });

  const units = new Map();
  for (const order of orders) {
    const roomNumber = String(order.student?.roomNumber || "Unassigned").trim();
    const membership = unitByRoomId.get(String(order.student?.roomId || ""));
    const unitKey = membership ? `unit:${membership.index}` : `room:${roomNumber}`;
    if (!units.has(unitKey)) {
      units.set(unitKey, {
        key: unitKey,
        roomNumbers: membership ? membership.unit.rooms.map((room) => room.code) : [roomNumber],
        orders: [],
      });
    }
    units.get(unitKey).orders.push(order);
  }

  const blocks = new Map();
  for (const unit of units.values()) {
    const block = blockFromRoom(unit.roomNumbers[0]);
    if (!blocks.has(block)) blocks.set(block, []);
    const label = unit.roomNumbers.map((code) => stripBlock(code, block)).join(" · ");
    blocks.get(block).push({
      ...unit,
      label,
      orderCount: unit.orders.length,
      itemCount: unit.orders.reduce((sum, order) => sum + itemCountOf(order), 0),
      items: aggregateItems(unit.orders),
      overdue: unit.orders.some((order) => new Date(order.deliverBy).getTime() < Date.now()),
    });
  }

  return [...blocks.entries()]
    .map(([key, blockUnits]) => {
      const sorted = [...blockUnits].sort((a, b) => natural.compare(a.label, b.label));
      return {
        key,
        label: key === "Other" ? "Other rooms" : `Block ${key}`,
        units: sorted,
        unitCount: sorted.length,
        orderCount: sorted.reduce((sum, unit) => sum + unit.orderCount, 0),
        itemCount: sorted.reduce((sum, unit) => sum + unit.itemCount, 0),
      };
    })
    .sort((a, b) => natural.compare(a.key, b.key));
};
```

Test cases to cover: single-room unit label `101`; multi-room unit `101 · 102`; a room absent from `roomUnits` standing alone; empty `roomUnits` degrading to today's per-room behaviour; cross-block unit landing under its lowest room's block; `Other rooms` bucket.

- [ ] **Step 2: Orders.jsx**

`HostelTile`→`UnitTile` (kicker `unit.roomNumbers.length === 1 ? 'Room' : 'Rooms'`, `<h3>{unit.label}</h3>`); pass `meta.roomUnits` from the list fetch into `groupOrdersByBlock`; `transitionHostels`→`transitionUnits`; delivery dialog receivers keyed by `unit.key` with a11y copy per unit label; grouped report posts the unit's `orderIds`; `block.hostelCount`→`block.unitCount`; subtitle "Pack and deliver by block and room"; error copy `` `…for rooms ${label}` ``.

- [ ] **Step 3: Records.jsx, CaretakerOrders.jsx, small pages**

Records: pass `meta.roomUnits` (from `/v1/fulfillment-orders` at `:87` — capture `response.data.meta?.roomUnits` in state), `block.unitCount`, "Waiting at rooms". CaretakerOrders: title "Room packages", kicker "Entire unit order", empty state "Nothing is on its way to your rooms…", `Room {order.student.roomNumber}`, rename `hostelProducts`→`unitProducts`, `HostelOrderItems`→`UnitOrderItems`. CollectOrder `Room {…roomNumber}`; CaretakerReports "at another room"; `utils/reports.js:24` → `'How packages reach my rooms'` (mirrors Task 4).

- [ ] **Step 4: Login.jsx / App.jsx (tolerant profile read)**

Login stores `rooms: res.data.rooms`. App:

```js
const rooms = profile.rooms ?? (profile.hostel ? [profile.hostel] : []);
const roomLabel = rooms.map((room) => room.code).filter(Boolean).join(" · ");
```

Header copy `<small>{rooms.length === 1 ? 'Your room' : 'Your rooms'}</small>`, fallback "Rooms unavailable"; class `caretaker-identity__rooms`.

- [ ] **Step 5: CSS class rename + tests**

In `warehouse.css` and every JSX usage: `wh-hostel-grid`→`wh-unit-grid`, `wh-hostel-tile`→`wh-unit-tile`, `wh-hostel-tile-head`→`wh-unit-tile-head`, `wh-hostel-kicker`→`wh-unit-kicker`, `wh-hostel-count`→`wh-unit-count`, `wh-hostel-items`→`wh-unit-items`, `wh-hostel-actions`→`wh-unit-actions`, `wh-hostel-scroll`→`wh-unit-scroll`, `caretaker-hostel-order`→`caretaker-unit-order`, `caretaker-identity__hostel`→`caretaker-identity__rooms`.

Run: `cd hungerhunt-warehouse && npm test && npm run build`
Expected: PASS / clean build. Then `grep -rn "hostel" src/` → zero hits (theme.css comment may be edited too).

### Task 7: frontend-admin rename + multi-room staff UI

**Files:**
- Modify: `pages/Students.jsx`, `pages/Users.jsx`, `pages/users/StaffTab.jsx`, `pages/users/ArchivedUsersTab.jsx`, `pages/users/ParentsTab.jsx`, `pages/Register.jsx`, `pages/Billing.jsx`, `pages/RechargeHistory.jsx`, `pages/FulfillmentOrders.jsx`, `pages/StaffReports.jsx`, `utils/readStudentSheet.js` (+ `tests/readStudentSheet.test.js`), `utils/fulfillmentStatus.js`, `App.jsx:56`

**Interfaces:**
- Consumes: `/api/rooms`, student API `roomId`/`roomNumber`, staff rows `rooms: [...]`, register/update body `roomIds: []`.

- [ ] **Step 1: Students.jsx + import sheet**

`api.get('/rooms')`, filter param `roomId`, column `{ key: 'roomNumber', label: 'Room' }`, labels "Room", import-sheet column `roomNumber` (update `readStudentSheet.js:7` required column, `:90` message `'Room code is required.'`, its test, and the in-app help text naming the column).

- [ ] **Step 2: Staff management multi-select**

StaffTab + Register: replace the single "Assigned hostel" `<select>` with a checkbox list of active rooms writing `form.roomIds` (array); display column joins `account.rooms.map((room) => room.code)`. ArchivedUsersTab: search keys over `rooms`, restore body `roomIds`. Register loads `api.get('/rooms?active=1')`, error copy "Could not load rooms."

- [ ] **Step 3: Remaining pages**

Billing ("Room No.", `student.roomNumber`, search copy), RechargeHistory (CSV header `"Room Number"`, `Room ID: R—{st.roomNumber}`), FulfillmentOrders (`<th>Room</th>`, `data-label="Room"`, handover placeholder "Name or room role"), StaffReports (`raisedBy.roomNumbers`, `order.roomNumber`), ParentsTab (`Room {student.roomNumber}`), fulfillmentStatus label "handed over to the room", App.jsx legacy route path `/hostels`→`/rooms`.

Run: `cd frontend-admin && npm test 2>/dev/null; npm run build`
Expected: clean build; `grep -rn "hostel" src/ tests/` → zero.

### Task 8: frontend-parent + kiosk keys, final sweep

**Files:**
- Modify: `frontend-parent/src/components/OrderCard.jsx:130`, `components/PendingApprovalCard.jsx:693,703`, `pages/Accounts.jsx:73`, `pages/ChildDetails.jsx:794`, `pages/SetPurchasePassword.jsx:265` (data key → `roomNumber`; visible copy already says Room), kiosk comment lines (`KioskResultScreen.jsx:4`, `KioskBilling.jsx:862`), the four `theme.css:115` comments

**Interfaces:**
- Consumes: parent order payload `roomNumber`, student objects `roomNumber` (Task 3).

- [ ] **Step 1: Key renames + comment pass**

Swap every `hostelNumber` read for `roomNumber`; fix comments. Do NOT touch `PrivacyPolicy.jsx` copy or `ios/App/App/public` bundles.

- [ ] **Step 2: Builds + repo-wide sweep**

Run: `cd frontend-parent && npm run build; cd ../hungerhunt-kiosk && npm run build`
Expected: clean. Then repo sweep:
`grep -rni "hostel" backend frontend-admin frontend-parent hungerhunt-warehouse hungerhunt-kiosk --include='*.js' --include='*.jsx' --include='*.css' -l | grep -v node_modules | grep -v ios/App`
Expected leftovers ONLY: `backend/utils/productSubcategory.js`, `backend/tests/productSubcategory.test.js`, `backend/scripts/seedProdTestAccounts.js` (the literal `TEST-HOSTEL-01` value), `frontend-parent/src/pages/PrivacyPolicy.jsx`.

- [ ] **Step 3: End-to-end smoke on local dev**

Start the backend (`cd backend && npm run dev` or the project's start script) and hit: `GET /api/rooms` (auth as admin), caretaker login (expect `rooms: []` array), warehouse list (expect `meta.roomUnits`). Kill the server after.

---

## Post-plan (owner-gated, NOT part of execution)

Prod rollout per spec §Rollout: owner runs `migrateHostelsToRooms.js` against prod Atlas, deploys backend, redeploys 4 Vercel apps, rebuilds APKs (`build:release`) + parent native apps. Seeding the MINDS rooms happens after the owner supplies the data.
