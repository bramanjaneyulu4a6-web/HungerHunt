# Handoff brief — Tasks 7 & 8: admin, parent and kiosk frontends (hostel → room)

**For:** a second Claude Code session working in `/Users/gayani/HungerHunt` at the
same time as the primary session.
**You own:** `frontend-admin/`, `frontend-parent/`, `hungerhunt-kiosk/`.
**You must not touch:** `backend/`, `hungerhunt-warehouse/` — the other session is
actively editing both right now. Editing them causes lost work.

---

## 1. What is happening, in one paragraph

The "hostel" concept is being renamed to "room" across the whole product, and
caretakers are becoming multi-room (their assigned rooms behave as one delivery
unit). The backend rename is **already done and reviewed** — models, auth,
admin surface, `/api/rooms` router, student/parent controllers, and all
caretaker scoping now speak "room". The other session is finishing the backend
tests/scripts and the warehouse app. Your job is the remaining three frontends,
which still speak "hostel" everywhere and are currently talking to an API that
no longer has those field names.

Blocks are **derived, not stored**: a room code's prefix before the first dash
is its block (`MINDS-101` → block `MINDS`). There is no Block model and you do
not need to build one. Room codes will be seeded later as `MINDS-<number>`.

---

## 2. Hard constraints (these override any habit)

- Work directly in `/Users/gayani/HungerHunt` on branch `main`.
  **Never create a branch. Never commit. Never run `git add`, `git stash`,
  `git checkout -- <file>`, `git reset`, or `git clean`.** The owner commits.
- The working tree contains ~17 files of the owner's unrelated in-progress
  work, plus live edits from the other session. Leave every file outside your
  three directories alone. Do not "tidy up" anything you did not change.
- `npm install` in `backend/` dirties ~300 half-tracked files — don't run it,
  and never `git add -A` anything.
- Do not point anything at production. Do not run backend scripts.
- **Do not run a repo-wide find-and-replace.** Several "hostel" strings are
  deliberate keeps (section 6).

---

## 3. The API contract you are coding against (verified in the backend source)

These are live now. Field names are exact — a typo fails silently at runtime.

**Rooms**
- `GET /api/rooms` — was `/api/hostels`. Optional `?active=1`.
  Returns room docs plus `studentCount` and `caretakerCount`.
  Room doc shape: `{ _id, code, name, active }` (the field is still `code`).
- `POST /api/rooms` body `{ code, name }`; `PUT /api/rooms/:id` body
  `{ code, name, active }`.
- Error messages: `'Room code is required.'`, `'That room code already exists.'`,
  `'Room not found.'`, `'Move all active students before deactivating this room.'`

**Students**
- List filter query param: `roomId` (was `hostelId`).
- Sortable field: `roomNumber` (was `hostelNumber`).
- Create/update accept **either** `roomId` **or** `roomNumber` (the code).
- Bulk import rows carry `roomNumber`. Validation messages:
  `'Room code is required.'` and `` `Room ${code} does not exist or is inactive.` ``
- Student objects come back with `roomId` and `roomNumber`.

**Staff accounts (this is the multi-room part)**
- `GET /api/admin/users/staff` rows now carry
  `rooms: [{ id, code, name }]` — **always present, `[]` for non-caretakers**.
  The old singular `hostel` object is gone.
- `POST /api/admin/register` and `PUT /api/admin/users/staff/:id` take
  **`roomIds`: an array of room ids**. Caretakers require at least one; every
  other role must send `[]`. Server messages you may surface:
  `'Only caretaker accounts may be assigned rooms.'`
- Login (`POST /api/admin/login`) returns `rooms: [{id, code, name}]` at the top
  level and inside `staff` — **only for caretakers**; other roles omit the key
  entirely. Treat it as optional.

**Orders / reports**
- Fulfillment order objects: `student.roomNumber`, `student.roomId`.
- Staff report objects: `order.roomNumber` (string) and
  `raisedBy.roomNumbers` (string — the raiser's room codes already joined with
  `' · '` server-side; render it as-is, do not split it).

---

## 4. Task 7 — frontend-admin

Every file below still says "hostel". Rename data keys **and** user-facing copy
("Hostel" → "Room"). Line numbers are from before your edits; treat them as
signposts, not gospel.

| File | What to change |
|---|---|
| `src/pages/Students.jsx` (~38 hits — biggest) | `api.get('/hostels')` → `api.get('/rooms')`; list query `hostelId` → `roomId`; form state `hostelId` → `roomId`; column def `{ key: 'hostelNumber', label: 'Hostel' }` → `{ key: 'roomNumber', label: 'Room' }`; state `hostels`/`hostelFilter` → `rooms`/`roomFilter`; every select option + label; the import-sheet help text that names the column `hostelNumber` → `roomNumber` |
| `src/pages/Users.jsx` (:17,25-32,75) | loads `/hostels` → `/rooms`; passes `hostels` prop → `rooms` |
| `src/pages/users/StaffTab.jsx` | **the multi-room UI** — see below |
| `src/pages/Register.jsx` (~15 hits) | `api.get('/hostels?active=1')` → `/rooms?active=1`; **multi-select** room assignment writing `form.roomIds` (array); error copy "Could not load rooms."; clears on role change |
| `src/pages/users/ArchivedUsersTab.jsx` (:56,64-65,110,162,180) | search keys over `rooms`; restore body `roomIds` (array) |
| `src/pages/users/ParentsTab.jsx` (:217,223) | search placeholder; `Hostel {student.hostelNumber}` → `Room {student.roomNumber}` |
| `src/pages/Billing.jsx` (:81,106,334,361,373-374,427,464,642) | "Hostel No." column → "Room No."; `student.hostelNumber` → `roomNumber`; search copy |
| `src/pages/RechargeHistory.jsx` (:46,82,93,115,166,241) | CSV export header `"Hostel Number"` → `"Room Number"`; the UI string `Hostel ID: H—{st.hostelNumber}` → `Room ID: R—{st.roomNumber}`; search filter |
| `src/pages/FulfillmentOrders.jsx` (:55,73,432,437,451) | `<th>Hostel</th>` → `<th>Room</th>`; `data-label="Hostel"` → `"Room"`; handover dialog `placeholder="Name or hostel role"` → `"Name or room role"` |
| `src/pages/StaffReports.jsx` (:7,35,188,206) | `report.raisedBy.hostelNumber` → `raisedBy.roomNumbers`; `report.order.hostelNumber` → `order.roomNumber` |
| `src/utils/readStudentSheet.js` (:7,90) | required import column `'hostelNumber'` → `'roomNumber'`; message → `'Room code is required.'` |
| `src/tests/../../tests/readStudentSheet.test.js` (:10) | the column name in the fixture |
| `src/utils/fulfillmentStatus.js` (:2,29) | label `'handed over to the hostel'` → `'handed over to the room'` |
| `src/App.jsx` (:56) | legacy redirect route `/hostels` → `/rooms` |
| `src/theme.css` (:115) | comment only |

### The one piece that is not a rename: staff room assignment

`StaffTab.jsx` and `Register.jsx` currently render a **single** `<select>` for
"Assigned hostel" bound to `hostelId`. Replace each with a **multi-select** —
a checkbox list of active rooms is the simplest fit for this codebase — bound to
`form.roomIds` (an array of ids), because a caretaker can now hold several rooms
that operate as one unit.

- Submit `roomIds: []` for non-caretaker roles (the server rejects rooms on
  other roles), and require at least one room when the role is caretaker.
- In the staff list, the assignment column shows the caretaker's room codes.
  Render defensively: `(account.rooms || []).map((room) => room.code).join(' · ')`.
- Match the surrounding form styling; don't introduce a new component library.

---

## 5. Task 8 — frontend-parent and kiosk

Small and mechanical. The parent app **already displays** the concept as
"Room" / "Dorm room" in its copy — only the data key is wrong.

| File | Change |
|---|---|
| `frontend-parent/src/components/OrderCard.jsx:130` (+ comment :6) | `order.hostelNumber` → `order.roomNumber` |
| `frontend-parent/src/components/PendingApprovalCard.jsx:693,703` | `student.hostelNumber` → `roomNumber` |
| `frontend-parent/src/pages/Accounts.jsx:73` | `child.hostelNumber` → `roomNumber` |
| `frontend-parent/src/pages/ChildDetails.jsx:794` | `student.hostelNumber` → `roomNumber` |
| `frontend-parent/src/pages/SetPurchasePassword.jsx:265` | `student.hostelNumber` → `roomNumber` |
| `hungerhunt-kiosk/src/components/KioskResultScreen.jsx:4`, `src/pages/KioskBilling.jsx:862` | comments only |
| `theme.css:115` in both apps | comment only |

---

## 6. Do NOT change these (deliberate keeps)

- `frontend-parent/src/pages/PrivacyPolicy.jsx:25` — published legal copy
  ("class, hostel room and wallet balance"). Wording changes need the owner.
- `frontend-parent/ios/App/App/public/assets/*.js` — built bundles; they
  regenerate from source. Never hand-edit.
- Anything under `android/`, `node_modules/`, `dist/`, or `package-lock.json`.
- `docs/store-listing.md` and any file under `docs/`.
- The `'Hostel Essentials'` product subcategory (it lives in the backend, which
  you aren't touching anyway) — it is live catalogue data on real products.

---

## 7. Verification before you report done

The backend is mid-rename in this tree, so **do not try to run the apps against
it end to end** — a broken API call proves nothing right now. Verify statically:

1. `cd frontend-admin && npm run build` — must succeed. Run its tests if the
   package defines them (`npm test`).
2. `cd frontend-parent && npm run build` and `cd hungerhunt-kiosk && npm run build`
   — both must succeed.
3. Sweep your own directories only:
   ```
   grep -rni hostel frontend-admin/src frontend-admin/tests frontend-parent/src hungerhunt-kiosk/src | grep -v node_modules | grep -v ios/App
   ```
   The only acceptable remaining hit is `PrivacyPolicy.jsx`.
4. Confirm you changed nothing outside your three directories:
   `git status --porcelain` should show your files plus other people's — verify
   none of *your* edits landed in `backend/` or `hungerhunt-warehouse/`.

Report: files changed, the build results verbatim, the grep output, and any
decision you had to make (especially anything about the multi-select UI).

---

## 8. Coordination notes

- The other session is doing the same work in `backend/` and
  `hungerhunt-warehouse/` concurrently. Stay in your lane and there is no
  conflict — the directories are disjoint.
- The **final repo-wide sweep and the end-to-end smoke test belong to the other
  session**, after both halves land. Don't attempt them.
- If something in this brief contradicts what you find in the code, the code
  wins for shapes and this brief wins for intent — say so in your report rather
  than guessing silently.
