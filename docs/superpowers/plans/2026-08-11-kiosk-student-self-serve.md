# Kiosk Student Self-Serve + Admin Billing Rework Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The kiosk serves students directly — admission number to enter, 4-digit purchase code to pay, self-ending sessions — while the admin console stops asking for the code and instead routes every admin-billed order through parent approval. The cashier role is removed; roles become admin, student, warehouse, parent.

**Architecture:** A third token identity (`student`, 450-second expiry) joins the staff/parent pattern in `backend/utils/tokens.js`, issued by an open, rate-limited `POST /students/kiosk-session`. Till routes gain a guard accepting admin *or* student tokens; for student callers `studentId` comes from the token, never the body. `createPendingOrder` gains an admin branch: no purchase token, blocked when no parent is registered, always awaiting approval. The kiosk frontend swaps its staff login for an admission-number pad and gains two timers whose ceiling the token's own expiry enforces.

**Tech Stack:** Express 4 + Mongoose 8, `node --test` with `mock.method` model stubs (no DB in tests), React 19 + Vite kiosk, vitest (new dev-dep, kiosk only) for timer-hook tests.

**Specs:** `docs/superpowers/specs/2026-08-11-kiosk-student-self-serve-design.md` and `docs/superpowers/specs/2026-08-11-admin-billing-parent-approval-design.md` (the latter wins where they touch).

## Global Constraints

- **Warehouse work is live on this branch concurrently.** `STAFF_ROLES` already carries `'warehouse'`, `tests/warehouseRole.test.js` exists, and `models/Admin.js` / `middleware/authMiddleware.js` / `controllers/adminController.js` carry warehouse changes. **Do not revert, rename, or restructure anything warehouse.** Before editing any of those files, re-read them — they may have moved since this plan was written. The one sanctioned touch is Task 2's update to `warehouseRole.test.js`, which otherwise crashes.
- Backend tests run with `npm test` (`node --test`) from `backend/`; they stub models and never touch a database.
- The 4-digit rule, bcrypt compare, `purchaseCodeIsPin` bookkeeping and the single-use 2-minute cart-bound purchase token in `verify-payment` stay exactly as built — they now serve the kiosk path only.
- `verify-payment` and `bill` remain admin-capable through the transition (a pre-deploy admin console still calls them); the new admin UI never does.
- Session numbers, verbatim from the spec: token expiry **450 s**; warning banner at **7:00**; idle prompt after **30 s** of no pointer/key event, with a **10 s** countdown; result screen holds **5 s** (tap to skip); lockout after **5** consecutive wrong codes for **15 minutes**, counter reset on a correct code.
- `admissionNumber` is school-issued: unique, sparse (existing rows lack it), trimmed. The bulk import of real numbers is a launch prerequisite, not code.
- User-facing copy says "purchase code", never "password". Numeric inputs use `inputMode="numeric"`.
- `authBypassEnabled` (kiosk `utils/authBypass.js`) stays — its removal is a separate release-checklist item.
- Commit after every task; messages in the repo's style (imperative, saying why).

---

### Task 1: `admissionNumber` and lockout fields on the Student model

**Files:**
- Modify: `backend/models/Student.js`
- Modify: `backend/controllers/studentController.js` (`WRITABLE_FIELDS`, `SEARCH_FIELDS`)
- Test: `backend/tests/kioskSession.test.js` (created here, grown in later tasks)

**Interfaces:**
- Produces: `Student.admissionNumber` (String, unique+sparse, trimmed), `Student.purchaseCodeAttempts` (Number, default 0), `Student.purchaseCodeLockedUntil` (Date, default null). Admin add/edit/bulk-import accept `admissionNumber` via `pickWritable`. Search results carry `admissionNumber` and `isParentRegistered` (Task 12's Billing screen needs the latter to block unregistered-parent students).

- [ ] **Step 1: Write the failing test**

Create `backend/tests/kioskSession.test.js` with the suite scaffold used across this repo (see `tests/purchaseAuthorization.test.js` for the idiom):

```js
// The kiosk's open front door: a session from an admission number, and the
// model fields that carry it. No database — model calls are stubbed.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

describe('the Student schema carries the kiosk fields', () => {
  test('admissionNumber is a unique, sparse, trimmed string', () => {
    const path = Student.schema.path('admissionNumber');
    assert.ok(path, 'admissionNumber must exist on the schema');
    assert.equal(path.instance, 'String');
    assert.equal(path.options.unique, true);
    assert.equal(path.options.sparse, true, 'sparse: existing rows have no number and must not collide on null');
    assert.equal(path.options.trim, true);
  });

  test('lockout fields default to unlocked', () => {
    const doc = new Student({});
    assert.equal(doc.purchaseCodeAttempts, 0);
    assert.equal(doc.purchaseCodeLockedUntil, null);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: FAIL — "admissionNumber must exist on the schema".

- [ ] **Step 3: Add the fields to the schema**

In `backend/models/Student.js`, after the `parentPhoneNumber` field:

```js
  // The school's own ID for the student, imported from its roll. It is what a
  // student types to open a kiosk session, so it is unique — and sparse,
  // because every row from before the field exists has none, and two nulls
  // must not collide. A student without one cannot use the kiosk.
  admissionNumber: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
    default: undefined
  },
```

and after the `purchaseCodeIsPin` block:

```js
  /* Five consecutive wrong codes at checkout lock this student's checkout for
     15 minutes on every kiosk at once. The count and the deadline live on the
     row rather than in memory so the lock holds across terminals and restarts.
     A correct code resets the count. */
  purchaseCodeAttempts: {
    type: Number,
    default: 0
  },

  purchaseCodeLockedUntil: {
    type: Date,
    default: null
  },
```

- [ ] **Step 4: Let the admin routes write and show it**

In `backend/controllers/studentController.js`:

```js
const WRITABLE_FIELDS = ['name', 'fatherName', 'hostelNumber', 'grade', 'parentPhoneNumber', 'admissionNumber'];
```

and extend `SEARCH_FIELDS` — `admissionNumber` for display, `isParentRegistered` because the admin billing screen (Task 12) refuses students whose parent has not registered:

```js
const SEARCH_FIELDS =
  "_id name fatherName hostelNumber grade parentPhoneNumber pocketMoney walletControl purchaseCodeIsPin admissionNumber isParentRegistered";
```

Bulk import goes through `pickWritable`, so the sheet column starts working with the `WRITABLE_FIELDS` change alone.

- [ ] **Step 5: Run the tests and make sure they pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS. Then `npm test` — everything green (the fields are additive).

- [ ] **Step 6: Commit**

```bash
git add backend/models/Student.js backend/controllers/studentController.js backend/tests/kioskSession.test.js
git commit -m "Give the student roll an admission number and a checkout lock"
```

---

### Task 2: Retire the cashier role

**Files:**
- Modify: `backend/utils/tokens.js`, `backend/models/Admin.js`, `backend/middleware/authMiddleware.js`, `backend/controllers/adminController.js`, `backend/.env.example`
- Modify: `frontend-admin/src/pages/Login.jsx`, `frontend-admin/src/pages/Register.jsx`
- Modify: `backend/tests/warehouseRole.test.js`, `backend/tests/tokenRoles.test.js`
- Delete: `backend/tests/cashierRole.test.js`

**Interfaces:**
- Produces: `STAFF_ROLES` without `'cashier'`; `signStaffToken(id, 'cashier')` throws; a token already claiming `role: 'cashier'` verifies against no accepted list and is refused. `protectStaff` (whatever its current role list) accepts admin only among till roles. Warehouse entries in every list are **untouched**.

**⚠ Concurrency warning:** these exact files are being edited by the warehouse work in this same working tree. Re-read each file immediately before editing; make the smallest possible diff — remove `'cashier'` entries and cashier branches, change nothing else. If a file looks structurally different from what this task describes, adapt to what is there rather than restoring what was.

- [ ] **Step 1: Write the failing tests**

In `backend/tests/tokenRoles.test.js`, add:

```js
describe('cashier is no longer a role', () => {
  test('a cashier token cannot be signed', () => {
    assert.throws(() => signStaffToken('507f1f77bcf86cd799439012', 'cashier'), /Unknown staff role/);
  });

  test('a token already claiming cashier opens nothing', () => {
    // Signed directly, standing in for a token minted before the removal.
    const stale = jwt.sign(
      { id: '507f1f77bcf86cd799439012', role: 'cashier' },
      process.env.JWT_SECRET
    );
    assert.equal(verifyToken(stale, 'staff'), null);
    assert.equal(verifyToken(stale, 'admin'), null);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/tokenRoles.test.js`
Expected: the new tests FAIL — cashier is currently a valid staff role.

- [ ] **Step 3: Remove cashier from the backend**

Each edit is a deletion of a `'cashier'` entry or branch — nothing more:

- `backend/utils/tokens.js`: `STAFF_ROLES` loses `'cashier'` (keep `'warehouse'`). Update the comment above it — the till no longer has staff of any kind; the admin console's till is an admin. The legacy-tail comment about roleless tokens ("cashiers did not exist…") still reads correctly; leave it.
- `backend/models/Admin.js`: the `role` enum loses `'cashier'`; trim its comment's cashier sentence. `FULL_ADMIN` stays exactly as is — it guards pre-role rows.
- `backend/middleware/authMiddleware.js`: remove `'cashier'` from every role list handed to `staffGate` (currently `protectStaff` and one wider list that includes warehouse). Do not collapse `protectStaff` into `protectAdmin` even if their lists converge — routes and the warehouse work both reference the names.
- `backend/controllers/adminController.js`: remove the `cashier:` entry from the account-limits object (`MAX_CASHIER_ACCOUNTS`), any cashier branch in register/login validation, and cashier mentions in comments. Warehouse entries stay.
- `backend/.env.example`: remove `MAX_CASHIER_ACCOUNTS`.

- [ ] **Step 4: Update the tests that reference cashier**

- Delete `backend/tests/cashierRole.test.js` (`git rm`).
- `backend/tests/warehouseRole.test.js` — **the sanctioned touch to the warehouse work:** it signs `signStaffToken(STAFF_ID, 'cashier')` at import time, which now throws. Delete the `cashierToken` line and the cashier-exclusion tests that use it (e.g. "a cashier cannot reach the storeroom-only surface either"). Change nothing else in the file.
- Sweep the rest: `grep -rn "cashier" backend/tests/ backend/controllers backend/models backend/utils backend/middleware` — remaining hits should be comments only; judge each.

- [ ] **Step 5: Remove cashier from the admin console UI**

In `frontend-admin/src/pages/Login.jsx` and `Register.jsx` (both modified on this branch to add role handling): remove the cashier option from any role picker and any `staffRole === 'cashier'` branches. **Keep warehouse options untouched.** If `staffRole` storage exists only to distinguish cashier from admin, leave the storage mechanism alone — warehouse may use it.

- [ ] **Step 6: Run to verify pass**

Run: `cd backend && npm test` — full suite green with `cashierRole.test.js` gone. Then `cd ../frontend-admin && npm run build` — clean.

- [ ] **Step 7: Commit**

```bash
git add -A backend frontend-admin/src/pages/Login.jsx frontend-admin/src/pages/Register.jsx
git commit -m "Retire the cashier role: the till belongs to students and admins now"
```

---

### Task 3: A student token in `tokens.js`

**Files:**
- Modify: `backend/utils/tokens.js`
- Test: `backend/tests/tokenRoles.test.js` (append)

**Interfaces:**
- Consumes: existing `verifyToken(token, role)`, `adminSecret`, legacy-grace machinery.
- Produces: `signStudentToken(id, admissionNumber)` → JWT `{ id, admissionNumber, role: 'student' }`, `expiresIn: 450`, signed with `STUDENT_JWT_SECRET || JWT_SECRET`. `verifyToken(token, 'student')` accepts exactly these. `STUDENT_SESSION_SECONDS = 450` exported.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/tokenRoles.test.js`:

```js
describe('student tokens', () => {
  const STUDENT_ID = '507f191e810c19729de860ff';

  test('a student token opens the student role and nothing else', () => {
    const token = signStudentToken(STUDENT_ID, 'ADM-1042');
    const payload = verifyToken(token, 'student');
    assert.equal(payload?.id, STUDENT_ID);
    assert.equal(payload?.admissionNumber, 'ADM-1042');
    assert.equal(verifyToken(token, 'staff'), null);
    assert.equal(verifyToken(token, 'parent'), null);
  });

  test('staff and parent tokens do not open the student role', () => {
    assert.equal(verifyToken(signStaffToken(STUDENT_ID, 'admin'), 'student'), null);
    assert.equal(verifyToken(signParentToken(STUDENT_ID, '9876543210'), 'student'), null);
  });

  test('expires in 450 seconds', () => {
    const token = signStudentToken(STUDENT_ID, 'ADM-1042');
    const { exp, iat } = jwt.decode(token);
    assert.equal(exp - iat, 450);
  });

  // The legacy grace window carries pre-role staff and parent tokens across a
  // deploy. No student token predates the role claim, so a roleless token must
  // never be read as a student — even while the window is open and the student
  // secret still falls back to the admin one.
  test('a roleless legacy token is not a student', () => {
    const legacy = jwt.sign({ id: STUDENT_ID }, process.env.JWT_SECRET);
    assert.equal(verifyToken(legacy, 'student'), null);
  });
});
```

Import `signStudentToken` alongside the file's existing token imports.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/tokenRoles.test.js`
Expected: FAIL — `signStudentToken` is not exported.

- [ ] **Step 3: Implement**

In `backend/utils/tokens.js`, beside `parentSecret`:

```js
// The kiosk's student session. Third instance of the per-identity-secret
// pattern, same fallback and for the same reason: a deploy that has not set
// STUDENT_JWT_SECRET should keep working, with the role claim still holding.
const studentSecret = () => process.env.STUDENT_JWT_SECRET || adminSecret();

// 7 minutes 30 seconds — the kiosk session's hard cap. The client shows the
// countdown, but this number is what enforces it: a page reload gets no new
// token, so it cannot extend the session.
export const STUDENT_SESSION_SECONDS = 450;

export const signStudentToken = (id, admissionNumber) =>
  jwt.sign({ id, admissionNumber, role: 'student' }, studentSecret(), {
    expiresIn: STUDENT_SESSION_SECONDS,
  });
```

In `verifyToken`, the secret pick becomes three-way (adapt to the file's current shape — the warehouse work may have touched it):

```js
  const wantsStaff = role === 'staff' || isStaffRole(role);
  const secrets = [
    wantsStaff ? adminSecret() : role === 'student' ? studentSecret() : parentSecret(),
  ];
```

and the legacy tail must never hand a roleless token to the student role:

```js
    return payload.role === undefined && role !== 'student' && legacyAccepted()
      ? payload
      : null;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/tokenRoles.test.js` — PASS, including the pre-existing blocks.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/tokens.js backend/tests/tokenRoles.test.js
git commit -m "Mint a third token identity for the student at the kiosk"
```

---

### Task 4: `protectStudent` and the admin-or-student guard

**Files:**
- Modify: `backend/middleware/authMiddleware.js`, `backend/routes/inventoryRoutes.js`
- Test: `backend/tests/kioskSession.test.js` (append)

**Interfaces:**
- Consumes: `verifyToken` from Task 3; `denied`, `readToken`, `authBypassEnabled` already in the file.
- Produces: `protectStudent` — verifies a student token, confirms the row still exists, sets `req.student = { id, admissionNumber }`. `protectAdminOrStudent` — routes a student-signed token to `protectStudent`, anything else to `protectStaff` (which, after Task 2, admits admins); bypass mode goes to the staff path. Downstream controllers distinguish callers by `req.student` vs `req.staff`.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/kioskSession.test.js`:

```js
const { signStudentToken, signAdminToken } = await import('../utils/tokens.js');
const Admin = (await import('../models/Admin.js')).default;

const STUDENT_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f1f77bcf86cd799439012';

const asStudent = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${signStudentToken(STUDENT_ID, 'ADM-1042')}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

const asAdmin = (path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${signAdminToken(ADMIN_ID)}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

// The inventory stub — read backend/controllers/inventoryController.js first
// and stub exactly the calls getInventory makes.
const stubInventory = async () => {
  const Inventory = (await import('../models/Inventory.js')).default;
  mock.method(Inventory, 'find', () => {
    const query = Promise.resolve([]);
    query.select = () => query;
    query.populate = () => query;
    return query;
  });
};

describe('the dual guard on /inventory', () => {
  test('a live student token is let through', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    await stubInventory();

    const res = await asStudent('/api/inventory');
    assert.equal(res.status, 200);
  });

  test("a deleted student's unexpired token is refused", async () => {
    mock.method(Student, 'exists', async () => null);
    const res = await asStudent('/api/inventory');
    assert.equal(res.status, 401);
  });

  test('an admin token still works — the admin console must not break', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    await stubInventory();

    const res = await asAdmin('/api/inventory');
    assert.equal(res.status, 200);
  });

  test('no token is still no entry', async () => {
    const res = await fetch(base + '/api/inventory');
    assert.equal(res.status, 401);
  });
});
```

(If the account check in the current `staffGate` uses something other than `Admin.exists`, mirror what `tests/warehouseRole.test.js` stubs.)

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: the student-token tests FAIL with 401. The admin test PASSES already — it must stay passing throughout.

- [ ] **Step 3: Implement**

In `backend/middleware/authMiddleware.js`, add `import Student from '../models/Student.js';` and:

```js
// The kiosk's student session. The token settles who it is for; the lookup
// settles that the row still exists, which is the only thing that retires a
// deleted student's unexpired token — the same price protectParent pays for
// the same reason.
export const protectStudent = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return denied(res, 'Not authorized, no token');

  const payload = verifyToken(token, 'student');
  if (!payload) return denied(res, 'Not authorized');

  try {
    if (!(await Student.exists({ _id: payload.id }))) {
      return denied(res, 'Not authorized');
    }
  } catch (error) {
    return denied(res, 'Token failed, invalid authorization');
  }

  req.student = { id: payload.id, admissionNumber: payload.admissionNumber };
  next();
};

// The till routes serve two audiences: the admin console and the kiosk's
// student session. The token says which — a student-signed token takes the
// student path, anything else falls through to the staff gate, whose errors
// and bypass behavior stay exactly as they were.
export const protectAdminOrStudent = (req, res, next) => {
  if (authBypassEnabled) return protectStaff(req, res, next);

  const token = readToken(req);
  if (token && verifyToken(token, 'student')) {
    return protectStudent(req, res, next);
  }

  return protectStaff(req, res, next);
};
```

Then in `backend/routes/inventoryRoutes.js`:

```js
import { protectAdminOrStudent } from "../middleware/authMiddleware.js";

// The menu the till draws its tiles from. Two kinds of till now: the admin
// console's, holding an admin token, and the kiosk, holding a student session.
// Reading stock is as far as either goes.
router.get("/", protectAdminOrStudent, getInventory);
```

(If the warehouse work has meanwhile changed this route's guard to admit warehouse accounts, compose rather than replace: the student check wraps whatever staff gate the route currently has.)

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS. Then `npm test` — full suite green.

- [ ] **Step 5: Commit**

```bash
git add backend/middleware/authMiddleware.js backend/routes/inventoryRoutes.js backend/tests/kioskSession.test.js
git commit -m "Let a student session through the till's read gate"
```

---

### Task 5: `POST /students/kiosk-session`

**Files:**
- Modify: `backend/controllers/studentController.js`, `backend/routes/studentRoutes.js`, `backend/middleware/rateLimit.js`
- Test: `backend/tests/kioskSession.test.js` (append)

**Interfaces:**
- Consumes: `signStudentToken`, `STUDENT_SESSION_SECONDS` (Task 3); `Student.findOne`.
- Produces: `POST /api/students/kiosk-session` — open, rate-limited. Body `{ admissionNumber }`. 200 → `{ token, expiresInSeconds: 450, student: { id, name, admissionNumber, pocketMoney, requiresParentApproval } }`. 400 missing number, 404 unknown, 403 no purchase code set. The kiosk Login screen (Task 9) consumes this exact shape.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/kioskSession.test.js`:

```js
const postSession = (body) =>
  fetch(base + '/api/students/kiosk-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// Mongoose queries are thenable and chainable (see purchaseAuthorization.test.js).
const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  return query;
};

describe('opening a kiosk session', () => {
  const onRoll = {
    _id: STUDENT_ID,
    name: 'Asha Rao',
    admissionNumber: 'ADM-1042',
    pocketMoney: 350,
    requiresParentApproval: false,
    purchasePassword: 'some-bcrypt-hash',
    parentPhoneNumber: '9876543210',
    hostelNumber: 'H-4',
  };

  test('a known admission number gets a token and only the fields the screen needs', async () => {
    mock.method(Student, 'findOne', () => queryFor(onRoll));

    const res = await postSession({ admissionNumber: ' ADM-1042 ' });
    assert.equal(res.status, 200);

    const body = await res.json();
    assert.ok(body.token);
    assert.equal(body.expiresInSeconds, 450);
    assert.deepEqual(body.student, {
      id: STUDENT_ID,
      name: 'Asha Rao',
      admissionNumber: 'ADM-1042',
      pocketMoney: 350,
      requiresParentApproval: false,
    });
    // The open route must not leak what it was not asked for.
    assert.equal(JSON.stringify(body).includes('9876543210'), false);
    assert.equal(JSON.stringify(body).includes('bcrypt'), false);
  });

  test('an unknown admission number is refused', async () => {
    mock.method(Student, 'findOne', () => queryFor(null));
    const res = await postSession({ admissionNumber: 'ADM-9999' });
    assert.equal(res.status, 404);
  });

  test('a student with no purchase code is turned away at the door', async () => {
    mock.method(Student, 'findOne', () => queryFor({ ...onRoll, purchasePassword: null }));
    const res = await postSession({ admissionNumber: 'ADM-1042' });
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /purchase code/i);
  });

  test('a missing admission number is a 400, not a query', async () => {
    const findOne = mock.method(Student, 'findOne', () => queryFor(null));
    const res = await postSession({});
    assert.equal(res.status, 400);
    assert.equal(findOne.mock.callCount(), 0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: FAIL — 404s from Express (route does not exist).

- [ ] **Step 3: Implement**

In `backend/middleware/rateLimit.js`:

```js
// The kiosk's front door takes an admission number and no secret, which makes
// it the one place the roll could be walked from outside. The money is still
// behind the purchase code; this limiter is what makes enumeration slow enough
// to show up in logs first. Generous enough for several kiosks behind one
// school NAT at break time.
export const kioskSessionLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many attempts. Please wait a moment and try again." },
});
```

In `backend/controllers/studentController.js`, import `signStudentToken, STUDENT_SESSION_SECONDS` from `../utils/tokens.js` and add:

```js
/* The kiosk's login. Open by decision, recorded in the spec: the admission
   number identifies, and the 4-digit code — asked for at checkout, not here —
   authenticates. So this returns the minimum the ordering screen needs and
   nothing that is not already on the student's own ID card, plus a token that
   scopes every later request to this one student and expires with the session's
   hard cap.

   A student whose parent has never set a purchase code is refused here, at the
   door, rather than after they have built a cart they cannot pay for. */
export const createKioskSession = async (req, res) => {
  const admissionNumber = String(req.body?.admissionNumber ?? '').trim();

  if (!admissionNumber) {
    return res.status(400).json({ message: 'An admission number is required.' });
  }

  try {
    const student = await Student.findOne({ admissionNumber })
      .select('name admissionNumber pocketMoney requiresParentApproval +purchasePassword');

    if (!student) {
      return res.status(404).json({ message: 'No student found with that admission number.' });
    }

    if (!student.purchasePassword) {
      return res.status(403).json({
        message: 'No purchase code has been set for this student yet. A parent can set one in the app.',
      });
    }

    res.json({
      token: signStudentToken(student._id.toString(), student.admissionNumber),
      expiresInSeconds: STUDENT_SESSION_SECONDS,
      student: {
        id: student._id.toString(),
        name: student.name,
        admissionNumber: student.admissionNumber,
        pocketMoney: student.pocketMoney,
        requiresParentApproval: Boolean(student.requiresParentApproval),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
```

In `backend/routes/studentRoutes.js`, import `createKioskSession` and `kioskSessionLimiter`, and add above the search route:

```js
/* The kiosk's login: open on purpose — the decision and its cost are recorded
   in the spec. The limiter is the only thing between this route and the
   internet, so it stays tight. */
router.post('/kiosk-session', kioskSessionLimiter, createKioskSession);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS. `npm test` — green.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/studentController.js backend/routes/studentRoutes.js backend/middleware/rateLimit.js backend/tests/kioskSession.test.js
git commit -m "Open a kiosk session from an admission number"
```

---

### Task 6: `verify-payment` — token-scoped student, no phone, lockout

**Files:**
- Modify: `backend/controllers/transactionController.js` (`verifyPayment`), `backend/routes/transactionRoutes.js`
- Test: `backend/tests/kioskSession.test.js` (append) — existing suites `purchaseAuthorization.test.js` and `parentSurface.test.js` must stay green

**Interfaces:**
- Consumes: `req.student` from `protectAdminOrStudent` (Task 4); lockout fields (Task 1).
- Produces: `verifyPayment` reads `studentId` from `req.student?.id ?? req.body.studentId` (the body path serves pre-deploy admin consoles through the transition); ignores `phone` entirely; refuses a locked student with **423** `{ message, code: 'CODE_LOCKED' }`; increments `purchaseCodeAttempts` on a wrong code, locks at 5, resets on a correct one. Response shape unchanged: `{ success, purchaseToken, requiresApproval }`.

- [ ] **Step 1: Check what the existing suites assert about the phone**

Run: `cd backend && grep -n "phone" tests/purchaseAuthorization.test.js tests/parentSurface.test.js`

They *send* a phone — harmless once ignored. If any test asserts a wrong-phone 400 ("Wrong mobile number"), delete that test in this task and say so in the commit message: the check is gone by design; identity comes from the session.

- [ ] **Step 2: Write the failing tests**

Append to `backend/tests/kioskSession.test.js` (copy the small stub helpers from `purchaseAuthorization.test.js` rather than importing across test files — repo convention):

```js
const bcrypt = (await import('bcryptjs')).default;
const PurchaseAuthorization = (await import('../models/PurchaseAuthorization.js')).default;

const OTHER_STUDENT = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const CART = [{ productId: PRODUCT_ID, quantity: 2 }];
const CODE = '4321';

let codeHash;
before(async () => { codeHash = await bcrypt.hash(CODE, 4); });

const studentRow = (overrides = {}) => ({
  _id: STUDENT_ID,
  purchasePassword: codeHash,
  purchaseCodeIsPin: true,
  purchaseCodeAttempts: 0,
  purchaseCodeLockedUntil: null,
  requiresParentApproval: false,
  ...overrides,
});

describe('verify-payment under a student session', () => {
  test('the token names the student; a body studentId for someone else is ignored', async () => {
    const findById = mock.method(Student, 'findById', (id) => queryFor(studentRow()));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'updateOne', async () => ({}));
    mock.method(PurchaseAuthorization, 'create', async (doc) => doc);

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ studentId: OTHER_STUDENT, password: CODE, items: CART }),
    });

    assert.equal(res.status, 200);
    // The lookup used the token's id, not the body's.
    assert.equal(String(findById.mock.calls[0].arguments[0]), STUDENT_ID);
  });

  test('no phone is required and none is checked', async () => {
    mock.method(Student, 'findById', () => queryFor(studentRow()));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'updateOne', async () => ({}));
    mock.method(PurchaseAuthorization, 'create', async (doc) => doc);

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    assert.equal(res.status, 200);
  });
});

describe('the checkout lock', () => {
  test('a locked student is refused before bcrypt', async () => {
    mock.method(Student, 'findById', () =>
      queryFor(studentRow({ purchaseCodeLockedUntil: new Date(Date.now() + 10 * 60 * 1000) })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    assert.equal(res.status, 423);
    assert.equal((await res.json()).code, 'CODE_LOCKED');
  });

  test('an expired lock no longer locks', async () => {
    mock.method(Student, 'findById', () =>
      queryFor(studentRow({ purchaseCodeLockedUntil: new Date(Date.now() - 1000) })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'updateOne', async () => ({}));
    mock.method(PurchaseAuthorization, 'create', async (doc) => doc);

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    assert.equal(res.status, 200);
  });

  test('the fifth consecutive wrong code sets the lock', async () => {
    mock.method(Student, 'findById', () => queryFor(studentRow({ purchaseCodeAttempts: 4 })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    const writes = [];
    mock.method(Student, 'updateOne', async (filter, update) => { writes.push(update); return {}; });

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: '0000', items: CART }),
    });
    assert.equal(res.status, 423);

    const lockWrite = writes.find((w) => w.$set?.purchaseCodeLockedUntil);
    assert.ok(lockWrite, 'the fifth miss must write a lock');
    const minutes = (lockWrite.$set.purchaseCodeLockedUntil - Date.now()) / 60000;
    assert.ok(minutes > 14 && minutes <= 15, `lock should be ~15 minutes, was ${minutes}`);
  });

  test('a wrong code below the limit counts but does not lock', async () => {
    mock.method(Student, 'findById', () => queryFor(studentRow({ purchaseCodeAttempts: 1 })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    const writes = [];
    mock.method(Student, 'updateOne', async (filter, update) => { writes.push(update); return {}; });

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: '0000', items: CART }),
    });
    assert.equal(res.status, 400);
    assert.ok(writes.some((w) => w.$inc?.purchaseCodeAttempts === 1));
    assert.ok(!writes.some((w) => w.$set?.purchaseCodeLockedUntil));
  });

  test('a correct code resets the count', async () => {
    mock.method(Student, 'findById', () => queryFor(studentRow({ purchaseCodeAttempts: 3 })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    const writes = [];
    mock.method(Student, 'updateOne', async (filter, update) => { writes.push(update); return {}; });
    mock.method(PurchaseAuthorization, 'create', async (doc) => doc);

    const res = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    assert.equal(res.status, 200);
    assert.ok(writes.some((w) => w.$set?.purchaseCodeAttempts === 0));
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: FAIL — 401 for the student token until the guard swaps, and the lock logic doesn't exist.

- [ ] **Step 4: Implement**

`backend/routes/transactionRoutes.js` — swap the two till routes (`/history` stays `protectAdmin`):

```js
import { protectAdmin, protectAdminOrStudent } from "../middleware/authMiddleware.js";

router.post("/verify-payment", protectAdminOrStudent, verifyPayment);
router.post("/bill", protectAdminOrStudent, generateBill);
```

In `verifyPayment` (`backend/controllers/transactionController.js`):

```js
export const verifyPayment = async (req, res) => {
  try {
    /* Who is paying is settled by whoever cleared the guard. A student session
       names its own student — the body's studentId is never read, which is what
       stops a session for one student charging another. The admin path keeps
       the body's studentId only for consoles cached from before the deploy;
       the new admin UI does not call this route at all. */
    const studentId = req.student?.id ?? req.body.studentId;
    const { password, items } = req.body;

    if (!studentId) {
      return res.status(400).json({ message: "A student is required." });
    }
```

The 4-digit `purchaseCodeProblem` check stays where it is. **Delete** the phone check entirely:

```js
    // DELETE:
    if (student.parentPhoneNumber !== phone) {
      return res.status(400).json({ message: "Wrong mobile number" });
    }
```

After the not-found / no-code checks, add the lock gate:

```js
    /* Five wrong codes lock this student's checkout for 15 minutes on every
       kiosk at once. Checked before bcrypt: a locked student's correct code is
       still refused, or the lock would be a hint that the last guess was right. */
    if (student.purchaseCodeLockedUntil && student.purchaseCodeLockedUntil > new Date()) {
      return res.status(423).json({
        code: 'CODE_LOCKED',
        message: 'Too many wrong codes. Checkout is locked for a few minutes — or a parent can reset the code in the app.',
      });
    }
```

Replace the wrong-code branch so it counts (keeping its message logic):

```js
    if (!matched) {
      const attempts = (student.purchaseCodeAttempts ?? 0) + 1;

      const MAX_ATTEMPTS = 5;
      const LOCK_MINUTES = 15;

      if (attempts >= MAX_ATTEMPTS) {
        await Student.updateOne(
          { _id: student._id },
          {
            $set: {
              purchaseCodeAttempts: 0,
              purchaseCodeLockedUntil: new Date(Date.now() + LOCK_MINUTES * 60 * 1000),
            },
          }
        );

        return res.status(423).json({
          code: 'CODE_LOCKED',
          message: 'Too many wrong codes. Checkout is locked for 15 minutes — or a parent can reset the code in the app.',
        });
      }

      await Student.updateOne(
        { _id: student._id },
        { $inc: { purchaseCodeAttempts: 1 } }
      );

      return res.status(400).json({
        message: student.purchaseCodeIsPin
          ? "Wrong purchase code"
          : "Wrong purchase code. If this student's code was set before codes" +
            " became 4 digits, their parent needs to set a new one in the app.",
      });
    }

    // The code was right: the miss count starts over.
    if (student.purchaseCodeAttempts > 0 || student.purchaseCodeLockedUntil) {
      Student.updateOne(
        { _id: student._id },
        { $set: { purchaseCodeAttempts: 0, purchaseCodeLockedUntil: null } }
      ).catch((err) => console.error('Could not reset the code attempt count:', err));
    }
```

On the `.select`: `.select('+purchasePassword')` with a leading `+` *adds* to the default selection, so the lock fields (not marked `select: false`) already come back. Verify with the failing test before widening the select — prefer the smaller diff.

- [ ] **Step 5: Run to verify pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS.
Then `npm test` — `purchaseAuthorization.test.js` and `parentSurface.test.js` stay green (any wrong-phone assertion was handled in Step 1).

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/transactionController.js backend/routes/transactionRoutes.js backend/tests/kioskSession.test.js
git commit -m "Scope verify-payment to the session's student and lock guessed codes"
```

---

### Task 7: `bill` and `pending-orders` under a student session

**Files:**
- Modify: `backend/controllers/transactionController.js` (`generateBill`), `backend/controllers/pendingOrderController.js` (`createPendingOrder`), `backend/routes/pendingOrderRoutes.js`
- Test: `backend/tests/kioskSession.test.js` (append)

**Interfaces:**
- Consumes: purchase tokens from `verify-payment` (unchanged); `req.student` from the guard.
- Produces: both controllers resolve `const studentId = req.student?.id ?? req.body.studentId;`. `POST /pending-orders` and `GET /pending-orders/:id/status` take `protectAdminOrStudent`. Cross-student spending is impossible under a student token because `consumeAuthorization` matches the token-derived `studentId` against the authorization row. Task 8 builds its admin branch on top of this exact resolution.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/kioskSession.test.js`:

```js
describe('a student session cannot spend for another student', () => {
  test("a bill under student A's token naming student B charges A or nothing", async () => {
    const store = new Map();
    mock.method(PurchaseAuthorization, 'create', async (doc) => { store.set(doc.token, { ...doc }); return doc; });
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async ({ token }) => {
      const found = store.get(token); if (!found) return null; store.delete(token); return found;
    });
    mock.method(Student, 'findById', () => queryFor(studentRow()));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'updateOne', async () => ({}));

    const verified = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    const { purchaseToken } = await verified.json();

    const debited = [];
    mock.method(Student, 'findOneAndUpdate', async (filter) => { debited.push(String(filter._id)); return { pocketMoney: 480 }; });

    await asStudent('/api/transactions/bill', {
      method: 'POST',
      body: JSON.stringify({ studentId: OTHER_STUDENT, items: CART, totalAmount: 20, purchaseToken }),
    });

    // Either the bill succeeds against A (the token's student) or the
    // authorization mismatch refuses it — both are safe. What must never
    // happen is a debit to B.
    assert.ok(!debited.includes(OTHER_STUDENT), "student B must never be debited from A's session");
  });
});

describe('pending orders from a student session', () => {
  test('createPendingOrder takes the student from the token', async () => {
    const store = new Map();
    mock.method(PurchaseAuthorization, 'create', async (doc) => { store.set(doc.token, { ...doc }); return doc; });
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async ({ token }) => {
      const found = store.get(token); if (!found) return null; store.delete(token); return found;
    });
    mock.method(Student, 'findById', () => queryFor(studentRow({ requiresParentApproval: true })));
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'updateOne', async () => ({}));

    const verified = await asStudent('/api/transactions/verify-payment', {
      method: 'POST',
      body: JSON.stringify({ password: CODE, items: CART }),
    });
    const { purchaseToken } = await verified.json();

    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    const created = [];
    mock.method(PendingOrder, 'create', async (doc) => { created.push(doc); return { _id: '507f191e810c19729de860ed', ...doc }; });

    const res = await asStudent('/api/pending-orders', {
      method: 'POST',
      body: JSON.stringify({ studentId: OTHER_STUDENT, items: CART, purchaseToken }),
    });

    if (created.length) {
      assert.equal(String(created[0].studentId ?? created[0].student), STUDENT_ID,
        "the pending order must belong to the token's student, not the body's");
    } else {
      assert.ok(res.status >= 400); // authorization mismatch refused it — also safe
    }
  });
});
```

Before finalizing the `PendingOrder.create` assertion, read `backend/controllers/pendingOrderController.js` for the created document's field names and any calls (`sendToParent` etc.) that need stubbing — mirror what `tests/pendingOrders.test.js` stubs.

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: FAIL — 401 on `/api/pending-orders` for the student token, and the bill path reads the body's `studentId`.

- [ ] **Step 3: Implement**

`backend/routes/pendingOrderRoutes.js`:

```js
import { protectParent, protectAdminOrStudent } from "../middleware/authMiddleware.js";

router.post("/", protectAdminOrStudent, createPendingOrder);
router.get("/:id/status", protectAdminOrStudent, getPendingOrderStatus);
```

`generateBill` — first lines become:

```js
export const generateBill = async (req, res) => {
  // A student session names its own student; an admin console says which one
  // it is serving. Same rule as verify-payment, for the same reason.
  const studentId = req.student?.id ?? req.body.studentId;
  const { items, purchaseToken } = req.body;
```

`createPendingOrder` — same substitution (remove `studentId` from the `req.body` destructuring):

```js
export const createPendingOrder = async (req, res) => {
  try {
    const studentId = req.student?.id ?? req.body.studentId;
    const { purchaseToken } = req.body;
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS. `npm test` — full suite green, especially `pendingOrders.test.js` (admin path unchanged: `req.student` is undefined there, so the body still rules).

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/transactionController.js backend/controllers/pendingOrderController.js backend/routes/pendingOrderRoutes.js backend/tests/kioskSession.test.js
git commit -m "Bill and pending orders answer to the session's own student"
```

---

### Task 8: Admin-billed orders always go to the parent

**Files:**
- Modify: `backend/controllers/pendingOrderController.js` (`createPendingOrder`), `backend/models/PendingOrder.js`
- Test: `backend/tests/kioskSession.test.js` (append)

**Interfaces:**
- Consumes: Task 7's `studentId` resolution; `req.staff` set by the staff gate; `Student.isParentRegistered` (existing field).
- Produces: an admin caller (`req.staff` set, `req.student` not) raises a pending order with **no purchase token**, for **any** student regardless of `requiresParentApproval`, **unless** `isParentRegistered` is false → **409** `{ code: 'NO_PARENT', message }`. The order records `raisedBy: req.staff.id`. The student path is byte-for-byte the Task 7 behavior. Task 12's Billing screen consumes the 201 and the 409.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/kioskSession.test.js`. First read `tests/pendingOrders.test.js` and copy its stub set for the admin path (account stub, `sendToParent`-adjacent mocks); then:

```js
describe('an admin raises orders without a code', () => {
  const adminStubs = async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    // plus whatever account-row stub the staff gate needs — mirror pendingOrders.test.js
  };

  test('no purchase token needed; the order records who rang it up', async () => {
    await adminStubs();
    mock.method(Student, 'findById', () =>
      queryFor(studentRow({ isParentRegistered: true, requiresParentApproval: false })));

    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    const created = [];
    mock.method(PendingOrder, 'create', async (doc) => { created.push(doc); return { _id: '507f191e810c19729de860ed', ...doc }; });

    const consumed = mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);

    const res = await asAdmin('/api/pending-orders', {
      method: 'POST',
      body: JSON.stringify({ studentId: STUDENT_ID, items: CART }),
    });

    assert.equal(res.status, 201);
    assert.equal(created.length, 1, 'requiresParentApproval:false must still become a pending order, never a charge');
    assert.equal(String(created[0].raisedBy), ADMIN_ID);
    assert.equal(consumed.mock.callCount(), 0, 'the admin path must not touch purchase tokens');
  });

  test('a student whose parent has not registered cannot be admin-billed', async () => {
    await adminStubs();
    mock.method(Student, 'findById', () =>
      queryFor(studentRow({ isParentRegistered: false })));

    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    const create = mock.method(PendingOrder, 'create', async (doc) => doc);

    const res = await asAdmin('/api/pending-orders', {
      method: 'POST',
      body: JSON.stringify({ studentId: STUDENT_ID, items: CART }),
    });

    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'NO_PARENT');
    assert.equal(create.mock.callCount(), 0);
  });

  test('the admin exemption does not leak to student sessions', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'findById', () => queryFor(studentRow()));
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);

    const res = await asStudent('/api/pending-orders', {
      method: 'POST',
      body: JSON.stringify({ items: CART }),  // no purchaseToken
    });
    assert.ok(res.status >= 400, 'a student without a purchase token must still be refused');
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/kioskSession.test.js`
Expected: FAIL — the admin call is refused for lacking a purchase token, and `raisedBy` doesn't exist.

- [ ] **Step 3: Implement**

`backend/models/PendingOrder.js` — add (read the file for style; it's a plain schema):

```js
  // Set when an admin rang the order up at the console. The parent's approval
  // is what spends the money either way; this is who asked.
  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Admin',
    default: null,
  },
```

`createPendingOrder` — after Task 7's `studentId` resolution and the items validation, branch on the caller:

```js
    const items = asItems(req.body.items);

    if (req.staff && !req.student) {
      /* The admin path. No purchase token: the admin's own signed-in identity
         is what authorizes *raising* the order, and the parent approving it in
         the app is what spends the money — always, regardless of the student's
         requiresParentApproval setting. That is the deal that let the code
         requirement go from the console.

         Which is also why a student with no registered parent is refused: an
         order nobody can approve is not an order, and finding that out here
         beats a cart that sits pending forever. */
      const student = await Student.findById(studentId).select('isParentRegistered');

      if (!student) {
        return res.status(404).json({ message: 'Student not found' });
      }

      if (!student.isParentRegistered) {
        return res.status(409).json({
          code: 'NO_PARENT',
          message:
            "This student's parent has not registered in the app, so there is " +
            'nobody to approve the order. Invite the parent to register — or ' +
            'the student can buy at the kiosk with their purchase code.',
        });
      }
    } else {
      const authorization = await consumeAuthorization({
        token: purchaseToken,
        studentId,
        items,
      });

      if (!authorization.ok) {
        // ... existing refusal, unchanged ...
      }
    }
```

and where the order is created, add `raisedBy: req.staff?.id ?? null` to the document. (Import `Student` if the controller does not already.)

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/kioskSession.test.js` — PASS. `npm test` — green; `pendingOrders.test.js` exercises the old staff path, which now takes the admin branch — if any of its tests assert a purchase-token refusal *for staff callers*, update them to the new contract (admin needs no token) and say so in the commit message.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/pendingOrderController.js backend/models/PendingOrder.js backend/tests/kioskSession.test.js
git commit -m "Admin-billed orders always wait for the parent, code not asked"
```

---

### Task 9: Kiosk login becomes an admission-number pad

**Files:**
- Modify: `hungerhunt-kiosk/src/utils/api.js`, `hungerhunt-kiosk/src/pages/Login.jsx`, `hungerhunt-kiosk/src/components/ProtectedRoute.jsx`, `hungerhunt-kiosk/src/App.jsx`, `hungerhunt-kiosk/src/kiosk.css`

**Interfaces:**
- Consumes: `POST /api/students/kiosk-session` (Task 5's exact response shape).
- Produces: localStorage keys `kioskToken` (the JWT) and `kioskStudent` (JSON of the `student` object) — Task 10 reads both. `KioskScreen` passes `student` and `onLogout` props to `KioskBilling`. The `adminToken`/`staffRole` keys are gone from the kiosk app.

- [ ] **Step 1: Rewire `api.js`**

```js
import axios from "axios";

import { authBypassEnabled } from "./authBypass";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kioskToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 out here is the session's token expiring at the hard cap or a
    // student deleted mid-session — either way the session is over. With the
    // bypass on there is no token to clear, so a stray 401 must not eject the
    // kiosk.
    if (error.response?.status === 401 && !authBypassEnabled) {
      localStorage.removeItem("kioskToken");
      localStorage.removeItem("kioskStudent");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

- [ ] **Step 2: Rewrite `Login.jsx`**

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import { Banner } from "../components/ui";

/* The kiosk's resting state: a pad, a prompt, no secret. The admission number
   identifies; the 4-digit purchase code authenticates later, at checkout. */
const Login = () => {
  const navigate = useNavigate();
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e?.preventDefault();
    if (!admissionNumber.trim() || loading) return;
    setError("");

    try {
      setLoading(true);
      const { data } = await api.post("/students/kiosk-session", {
        admissionNumber: admissionNumber.trim(),
      });

      localStorage.setItem("kioskToken", data.token);
      localStorage.setItem("kioskStudent", JSON.stringify(data.student));

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message || "Could not start a session. Try again."
      );
      setLoading(false);
    }
  };

  return (
    <div className="kiosk-gate">
      <img className="kiosk-gate-logo" src={hungerLogo} alt="Hunger Hunt" />
      <h1 className="kiosk-gate-title">Enter your admission number</h1>

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="kiosk-gate-form">
        <input
          className="kiosk-gate-input"
          inputMode="numeric"
          autoComplete="off"
          autoFocus
          aria-label="Admission number"
          placeholder="Admission number"
          value={admissionNumber}
          onChange={(e) => setAdmissionNumber(e.target.value.trim())}
        />

        <button
          type="submit"
          className="kiosk-start"
          disabled={loading || !admissionNumber.trim()}
        >
          {loading ? "Starting…" : "START ORDER"}
        </button>
      </form>
    </div>
  );
};

export default Login;
```

The admission number is deliberately not forced to digits — school IDs can carry letters (`ADM-1042`); `inputMode="numeric"` only suggests the pad.

- [ ] **Step 3: Gate on the student session**

`ProtectedRoute.jsx`:

```jsx
import { Navigate } from "react-router-dom";

import { authBypassEnabled } from "../utils/authBypass";

const ProtectedRoute = ({ children }) => {
  if (authBypassEnabled) return children;

  const token = localStorage.getItem("kioskToken");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
```

`App.jsx` — `KioskScreen` becomes (add `Navigate` to the existing `react-router-dom` import if not present):

```jsx
// The kiosk owns the session's ending: every way out — Done, the timers, the
// result screen, a dead token — funnels through this one cleanup.
function KioskScreen() {
  const navigate = useNavigate();

  const student = (() => {
    try {
      return JSON.parse(localStorage.getItem("kioskStudent")) ?? null;
    } catch {
      return null;
    }
  })();

  const handleLogout = () => {
    localStorage.removeItem("kioskToken");
    localStorage.removeItem("kioskStudent");
    navigate("/login", { replace: true });
  };

  if (!student) {
    return <Navigate to="/login" replace />;
  }

  return <KioskBilling student={student} onLogout={handleLogout} />;
}
```

- [ ] **Step 4: Style the gate**

In `hungerhunt-kiosk/src/kiosk.css`, next to the existing `.kiosk-welcome` block (which Task 10 deletes), add:

```css
/* ---- the gate ----------------------------------------------------------- */

/* The kiosk's resting state. Same ground as the till so the transition into
   the wall is a change of content, not of place. */
.kiosk-gate {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 22px;
  min-height: 100svh;
  padding: 32px;
  background: #ffffff;
}

.kiosk-gate-logo {
  height: 72px;
  width: auto;
}

.kiosk-gate-title {
  margin: 0;
  font-size: 24px;
  font-weight: 800;
  color: #17110a;
}

.kiosk-gate-form {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  width: min(360px, 100%);
}

.kiosk-gate-input {
  width: 100%;
  min-height: 64px;
  padding: 0 22px;
  border: 1px solid #eae3d8;
  border-radius: 16px;
  background: #fffcf5;
  font-size: 26px;
  font-weight: 700;
  text-align: center;
  letter-spacing: 0.08em;
  color: #17110a;
  outline: none;
}

.kiosk-gate-input:focus {
  border-color: #b8a68e;
}
```

- [ ] **Step 5: Verify**

Run: `cd hungerhunt-kiosk && npm run lint && npm run build` — clean. Live with the backend up: a seeded student with an `admissionNumber` and a code logs in and lands on the (still search-bar-bearing) till; an unknown number shows the 404 message; a code-less student shows the 403 message.

- [ ] **Step 6: Commit**

```bash
git add hungerhunt-kiosk/src/utils/api.js hungerhunt-kiosk/src/pages/Login.jsx hungerhunt-kiosk/src/components/ProtectedRoute.jsx hungerhunt-kiosk/src/App.jsx hungerhunt-kiosk/src/kiosk.css
git commit -m "Open the kiosk with an admission number instead of a staff account"
```

---

### Task 10: The till serves the session's student

**Files:**
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, `hungerhunt-kiosk/src/kiosk.css`

**Interfaces:**
- Consumes: `student` and `onLogout` props from Task 9; backend routes from Tasks 5–7 (no `studentId`/`phone` in bodies).
- Produces: a till with no student search and no welcome splash; a session header; a result-screen state `result: null | 'paid' | 'pending'` that Task 11's timers treat as session-over; `payingRef` semantics unchanged for Task 11's in-flight-bill exception.

**Caution:** the admin console mounts its own separate copy of an older KioskBilling — this file is kiosk-only (`scripts/check-shared-files.mjs` lists it as red by design). Nothing here touches `frontend-admin`.

- [ ] **Step 1: Take the student from the session**

In `KioskBilling.jsx`:

- Signature: `const KioskBilling = ({ student: sessionStudent, onLogout }) => {`
- Delete state: `searchQuery`, `searchResults`, `selectedStudent`, `showWelcome`.
- Add state:

```jsx
  // The session's student, seeded from login. Balance is the login snapshot —
  // the till never looks a student up; the server re-checks at charge time.
  const [student] = useState(sessionStudent);

  // null | 'paid' | 'pending' — set when the sale ends, drives the result
  // screen. Once set, the session is over and only the exit timer runs.
  const [result, setResult] = useState(null);
```

- Delete functions: `selectStudent`, `handleStudentSearch`.
- Replace every `selectedStudent` read with `student` (checkout guard, wallet math, verify modal, ticket header). `remaining`, `short`, `canPay` keep their logic.
- Delete the `showWelcome` early-return block and the `.kiosk-welcome`-specific CSS in `kiosk.css`, **keeping** the `.kiosk-start` button class — the gate and prompts reuse it.

- [ ] **Step 2: Replace the lookup bar with the session header**

In the `wall-top` JSX, delete the `selectedStudent ? … : <form className="wall-lookup …">` conditional and the `searchResults` block, and render unconditionally:

```jsx
          <div className="wall-top">
            <div className="serving glass">
              <span className="serving-avatar" aria-hidden="true">
                {student.name?.charAt(0).toUpperCase()}
              </span>

              <div className="serving-who">
                <div className="serving-name">{student.name}</div>
                <div className="serving-meta">№ {student.admissionNumber}</div>
              </div>

              <span className="serving-wallet money">
                {formatINR(student.pocketMoney)}
              </span>

              <Button className="btn--switch" onClick={onLogout}>
                Done
              </Button>
            </div>
          </div>
```

The `inventoryError` banner stays. The separate Sign out button goes — **Done** is the session's exit.

- [ ] **Step 3: Stop sending what the server now derives**

- `handleVerifyAndPay`: body `{ password: purchasePassword, items }` — no `studentId`, no `phone`.
- `handleCheckout`: body `{ items, totalAmount: invoiceTotal, purchaseToken }`; drop the "search and select a student" guard; keep the balance guard.
- `requestApproval`: body `{ items, purchaseToken }`.
- Success paths: replace `toast.success(...)` / `applyInventory(...)` / `resetTerminal()` with `setResult("paid")` (checkout) and `setResult("pending")` (approval). Delete `resetTerminal`.
- Lock handling in `handleVerifyAndPay`'s catch, before the generic toast:

```jsx
      if (err.response?.status === 423) {
        toast.error(err.response.data?.message || "Too many wrong codes.", { duration: 6000 });
        onLogout();
        return;
      }
```

- [ ] **Step 4: The result screen**

Above the main `return`:

```jsx
  // The sale has ended; hold the answer for 5 seconds, or a tap. The timers
  // (Task 11) do not run here — the session is already over.
  useEffect(() => {
    if (!result) return;
    const exit = setTimeout(onLogout, 5000);
    return () => clearTimeout(exit);
  }, [result, onLogout]);

  if (result) {
    return (
      <div className="kiosk-result" onClick={onLogout} role="status">
        <div className={`kiosk-result-mark kiosk-result-mark--${result}`} aria-hidden="true">
          {result === "paid" ? "✓" : "⏳"}
        </div>
        <h1>{result === "paid" ? "Order confirmed" : "Waiting for a parent to approve"}</h1>
        <p>
          {result === "paid"
            ? "Enjoy! Collect your items at the counter."
            : "Nothing has been charged yet. Your parent has been asked."}
        </p>
      </div>
    );
  }
```

`kiosk.css` (`rise-in` already exists in the file):

```css
/* ---- the ending --------------------------------------------------------- */

.kiosk-result {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 14px;
  min-height: 100svh;
  padding: 32px;
  text-align: center;
  background: #ffffff;
  color: #17110a;
  cursor: pointer;
}

.kiosk-result h1 {
  margin: 0;
  font-size: 30px;
  font-weight: 800;
}

.kiosk-result p {
  margin: 0;
  font-size: 16px;
  color: #6d6152;
}

.kiosk-result-mark {
  display: grid;
  place-items: center;
  width: 96px;
  height: 96px;
  border-radius: 999px;
  font-size: 44px;
  animation: rise-in 420ms cubic-bezier(0.22, 0.7, 0.3, 1) both;
}

.kiosk-result-mark--paid {
  background: #e8f6ec;
  color: #1d7a3e;
}

.kiosk-result-mark--pending {
  background: #fff3e2;
  color: #b06a10;
}

@media (prefers-reduced-motion: reduce) {
  .kiosk-result-mark {
    animation: none;
  }
}
```

- [ ] **Step 5: Verify**

Run: `cd hungerhunt-kiosk && npm run lint && npm run build` — clean (lint catches orphaned references to the deleted state). Live: log in, order, pay with the right code → "Order confirmed" → gate after 5 s; five wrong codes → lock toast → gate.

- [ ] **Step 6: Commit**

```bash
git add hungerhunt-kiosk/src/pages/KioskBilling.jsx hungerhunt-kiosk/src/kiosk.css
git commit -m "Serve the session's student and end the sale on a result screen"
```

---

### Task 11: Session timers

**Files:**
- Create: `hungerhunt-kiosk/src/hooks/useSessionTimers.js`, `hungerhunt-kiosk/src/hooks/useSessionTimers.test.js`, `hungerhunt-kiosk/vitest.config.js`
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, `hungerhunt-kiosk/src/kiosk.css`, `hungerhunt-kiosk/package.json`

**Interfaces:**
- Consumes: `onLogout` and `payingRef` from KioskBilling; `result` state (timers stop when set).
- Produces: `useSessionTimers({ active, onExpire, isBusy })` → `{ capRemaining, capWarning, idlePrompt, idleRemaining, dismissIdle }`. Seconds throughout. `capWarning` true in the final 30 s; `idlePrompt` true while "Still there?" shows.

- [ ] **Step 1: Add vitest**

```bash
cd hungerhunt-kiosk && npm install -D vitest jsdom @testing-library/react
```

Add `"test": "vitest run"` to scripts. Create `vitest.config.js`:

```js
import { defineConfig } from 'vite';

export default defineConfig({
  test: {
    environment: 'jsdom',
  },
});
```

- [ ] **Step 2: Write the failing tests**

`hungerhunt-kiosk/src/hooks/useSessionTimers.test.js`:

```jsx
// The timers are the piece most likely to break quietly: nothing looks wrong
// until a session refuses to die on a counter after school. Fake clocks only.
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

import { useSessionTimers, HARD_CAP_SECONDS, WARNING_SECONDS, IDLE_SECONDS, PROMPT_SECONDS } from './useSessionTimers';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const tick = (seconds) => act(() => vi.advanceTimersByTime(seconds * 1000));
const touch = () => act(() => { window.dispatchEvent(new Event('pointerdown')); });

// Advance the clock while keeping the student "present" — a touch every 10
// seconds — so the idle prompt stays out of a test that is about the cap.
const tickTouching = (seconds) => {
  for (let left = seconds; left > 0; left -= 10) {
    tick(Math.min(10, left));
    touch();
  }
};

describe('the hard cap', () => {
  test('is 7 minutes 30 seconds, warns for the last 30', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useSessionTimers({ active: true, onExpire, isBusy: () => false }));

    expect(HARD_CAP_SECONDS).toBe(450);
    expect(WARNING_SECONDS).toBe(30);

    tickTouching(419);
    expect(result.current.capWarning).toBe(false);

    tickTouching(2); // 7:01
    expect(result.current.capWarning).toBe(true);
    expect(onExpire).not.toHaveBeenCalled();

    tickTouching(29); // 7:30
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('activity does not extend it', () => {
    const onExpire = vi.fn();
    renderHook(() => useSessionTimers({ active: true, onExpire, isBusy: () => false }));

    tickTouching(450);
    expect(onExpire).toHaveBeenCalled();
  });

  test('waits for an in-flight bill, then ends', () => {
    const onExpire = vi.fn();
    let busy = true;
    renderHook(() => useSessionTimers({ active: true, onExpire, isBusy: () => busy }));

    tick(450);
    expect(onExpire).not.toHaveBeenCalled(); // money is moving; wait for the answer

    busy = false;
    tick(1);
    expect(onExpire).toHaveBeenCalledTimes(1); // and not a second longer
  });
});

describe('the idle prompt', () => {
  test('fires after 30 quiet seconds and a touch dismisses it', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useSessionTimers({ active: true, onExpire, isBusy: () => false }));

    tick(29);
    expect(result.current.idlePrompt).toBe(false);
    tick(1);
    expect(result.current.idlePrompt).toBe(true);

    touch();
    expect(result.current.idlePrompt).toBe(false);
    expect(onExpire).not.toHaveBeenCalled();
  });

  test('ignored for 10 seconds, it ends the session', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useSessionTimers({ active: true, onExpire, isBusy: () => false }));

    tick(30);
    expect(result.current.idlePrompt).toBe(true);
    tick(9);
    expect(onExpire).not.toHaveBeenCalled();
    tick(1);
    expect(onExpire).toHaveBeenCalledTimes(1);
  });

  test('keystrokes count as touches', () => {
    const onExpire = vi.fn();
    const { result } = renderHook(() =>
      useSessionTimers({ active: true, onExpire, isBusy: () => false }));

    tick(25);
    act(() => { window.dispatchEvent(new Event('keydown')); });
    tick(25);
    expect(result.current.idlePrompt).toBe(false);
  });

  test('inactive (result screen), nothing runs', () => {
    const onExpire = vi.fn();
    renderHook(() => useSessionTimers({ active: false, onExpire, isBusy: () => false }));
    tick(500);
    expect(onExpire).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run to verify failure**

Run: `cd hungerhunt-kiosk && npm test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement the hook**

`hungerhunt-kiosk/src/hooks/useSessionTimers.js`:

```jsx
import { useEffect, useRef, useState } from "react";

/* The session's two clocks.

   The hard cap runs from login and nothing the student does moves it — the
   token expires at the same moment server-side, so extending it here would
   only manufacture 401s. The idle clock is the opposite: every touch resets
   it, and it exists to free a walked-away terminal long before the cap does.

   One exception, for correctness rather than convenience: if the cap fires
   while a bill is in flight (isBusy), the expiry waits for the answer.
   Otherwise money moves and nobody is told. The session still ends the
   moment the answer lands — the cap is not extended, the confirmation is
   simply not thrown away. */

export const HARD_CAP_SECONDS = 450;
export const WARNING_SECONDS = 30;
export const IDLE_SECONDS = 30;
export const PROMPT_SECONDS = 10;

export const useSessionTimers = ({ active, onExpire, isBusy }) => {
  const [capRemaining, setCapRemaining] = useState(HARD_CAP_SECONDS);
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [idleRemaining, setIdleRemaining] = useState(PROMPT_SECONDS);

  // The countdowns live in refs and surface through state once a second; the
  // interval is the single writer, so the two cannot disagree.
  const idleQuietRef = useRef(0);
  const promptLeftRef = useRef(PROMPT_SECONDS);
  const expiredRef = useRef(false);

  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const isBusyRef = useRef(isBusy);
  isBusyRef.current = isBusy;

  useEffect(() => {
    if (!active) return undefined;

    expiredRef.current = false;
    idleQuietRef.current = 0;
    promptLeftRef.current = PROMPT_SECONDS;

    const expire = () => {
      if (expiredRef.current) return;
      if (isBusyRef.current()) return; // wait for the in-flight answer
      expiredRef.current = true;
      onExpireRef.current();
    };

    let capLeft = HARD_CAP_SECONDS;
    let showingPrompt = false;

    const second = setInterval(() => {
      capLeft -= 1;
      setCapRemaining(capLeft);

      if (capLeft <= 0) {
        expire();
        return; // expiry may be waiting on isBusy; keep ticking until it lands
      }

      if (showingPrompt) {
        promptLeftRef.current -= 1;
        setIdleRemaining(promptLeftRef.current);
        if (promptLeftRef.current <= 0) expire();
        return;
      }

      idleQuietRef.current += 1;
      if (idleQuietRef.current >= IDLE_SECONDS) {
        showingPrompt = true;
        promptLeftRef.current = PROMPT_SECONDS;
        setIdleRemaining(PROMPT_SECONDS);
        setIdlePrompt(true);
      }
    }, 1000);

    const touched = () => {
      idleQuietRef.current = 0;
      if (showingPrompt) {
        showingPrompt = false;
        promptLeftRef.current = PROMPT_SECONDS;
        setIdlePrompt(false);
      }
    };

    window.addEventListener("pointerdown", touched);
    window.addEventListener("keydown", touched);

    return () => {
      clearInterval(second);
      window.removeEventListener("pointerdown", touched);
      window.removeEventListener("keydown", touched);
    };
  }, [active]);

  return {
    capRemaining,
    capWarning: capRemaining <= WARNING_SECONDS && capRemaining > 0,
    idlePrompt,
    idleRemaining,
    dismissIdle: () => {
      // The prompt's own button; window pointerdown usually beats it, but a
      // programmatic dismiss must work too.
      idleQuietRef.current = 0;
      setIdlePrompt(false);
    },
  };
};
```

`touched` and the interval share `showingPrompt` inside one effect closure — deliberate, not a stale-props hazard. If tests and implementation disagree, trust the tests' described behavior.

- [ ] **Step 5: Run to verify pass**

Run: `cd hungerhunt-kiosk && npm test` — all timer tests PASS.

- [ ] **Step 6: Wire into KioskBilling**

```jsx
import { useSessionTimers } from "../hooks/useSessionTimers";
```

```jsx
  const { capRemaining, capWarning, idlePrompt, idleRemaining, dismissIdle } =
    useSessionTimers({
      active: !result,
      onExpire: onLogout,
      isBusy: () => payingRef.current,
    });
```

In the JSX, alongside the verify modal:

```jsx
      {capWarning && !idlePrompt && (
        <div className="kiosk-cap-banner" role="status">
          Session ending in {capRemaining}s — finish up or start again later.
        </div>
      )}

      {idlePrompt && (
        <div className="kiosk-idle-veil" role="alertdialog" aria-label="Still there?">
          <div className="kiosk-idle-card">
            <h2>Still there?</h2>
            <p>Your session ends in {idleRemaining}s.</p>
            <button type="button" className="kiosk-start" onClick={dismissIdle}>
              I'm here
            </button>
          </div>
        </div>
      )}
```

Styles:

```css
/* ---- session clocks ----------------------------------------------------- */

.kiosk-cap-banner {
  position: fixed;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  padding: 10px 22px;
  border-radius: 999px;
  background: #fff3e2;
  border: 1px solid #f0ddc0;
  color: #b06a10;
  font-size: 14px;
  font-weight: 700;
  box-shadow: 0 1px 2px rgba(90, 70, 45, 0.06);
}

.kiosk-idle-veil {
  position: fixed;
  inset: 0;
  z-index: 50;
  display: grid;
  place-items: center;
  background: rgba(23, 17, 10, 0.45);
}

.kiosk-idle-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  padding: 34px 44px;
  border-radius: 22px;
  background: #ffffff;
  text-align: center;
}

.kiosk-idle-card h2 {
  margin: 0;
  font-size: 26px;
  font-weight: 800;
  color: #17110a;
}

.kiosk-idle-card p {
  margin: 0 0 8px;
  color: #6d6152;
  font-variant-numeric: tabular-nums;
}
```

The veil's backdrop click is itself a window `pointerdown`, which resets the idle clock and dismisses the prompt — exactly "any touch dismisses it". No extra handler.

- [ ] **Step 7: Verify in the app**

`npm run lint && npm run build && npm test` — clean. Live: untouched 30 s → prompt with countdown; touch → gone; ignored → gate. (For the cap, temporarily lower `HARD_CAP_SECONDS` in the dev session if desired, but **commit it at 450**.)

- [ ] **Step 8: Commit**

```bash
git add hungerhunt-kiosk/src/hooks/ hungerhunt-kiosk/src/pages/KioskBilling.jsx hungerhunt-kiosk/src/kiosk.css hungerhunt-kiosk/package.json hungerhunt-kiosk/package-lock.json hungerhunt-kiosk/vitest.config.js
git commit -m "Give the session two clocks and a way to say still-there"
```

---

### Task 12: Admin Billing — no code, always parent approval

**Files:**
- Modify: `frontend-admin/src/pages/Billing.jsx`

**Interfaces:**
- Consumes: Task 8's admin branch — `POST /pending-orders { studentId, items }` → 201, or 409 `{ code: 'NO_PARENT' }`; `isParentRegistered` in search results (Task 1).
- Produces: a billing screen with no verify modal, no code entry, no `verify-payment`/`bill` calls.

- [ ] **Step 1: Rework the checkout flow**

Read `frontend-admin/src/pages/Billing.jsx` in full first — it is the admin console's own till and shares idioms, not code, with the kiosk. Then:

- Delete the verify modal JSX, `purchasePassword` state, the `PURCHASE_CODE_LENGTH` gating, and the handlers calling `/transactions/verify-payment` and `/transactions/bill`.
- The pay button becomes **"Send for approval"** and posts directly:

```jsx
  const sendForApproval = async () => {
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);

    try {
      await api.post("/pending-orders", {
        studentId: selectedStudent._id,
        items: billedItems(),
      });

      toast.success(
        `Order sent to ${selectedStudent.name}'s parent for approval — nothing has been charged yet.`,
        { duration: 8000 }
      );

      resetTerminal();
    } catch (err) {
      toast.error(
        err.response?.data?.message || "Could not send the order for approval",
        { duration: 8000 }
      );
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };
```

(Keep the existing `payingRef` double-tap guard and `resetTerminal` if the file has them; adapt names to the file's own.)

- [ ] **Step 2: Refuse unregistered-parent students visibly**

Where the pay button renders:

```jsx
  const parentMissing = selectedStudent && !selectedStudent.isParentRegistered;
```

- Disable the button when `parentMissing`.
- Beside it, when `parentMissing`, show the reason (use the file's existing banner/hint idiom):
  "This student's parent hasn't registered in the app, so there's nobody to approve an order. The student can buy at the kiosk with their purchase code."

The server refuses anyway (409 `NO_PARENT`); the UI check just says it before the round trip.

- [ ] **Step 3: Sweep the copy**

Any remaining "verify", "purchase code", or phone-related copy on this screen goes. The screen's promise is now: *build the cart, send it, the parent decides.*

- [ ] **Step 4: Verify**

Run: `cd frontend-admin && npm run build` — clean. Live: bill a registered-parent student → pending order appears in the parent app, nothing charged; an unregistered-parent student → button disabled with the reason; approve in the parent app → charge lands (existing flow).

- [ ] **Step 5: Commit**

```bash
git add frontend-admin/src/pages/Billing.jsx
git commit -m "The admin till raises orders for parents to approve, code not asked"
```

---

### Task 13: Admission number in the admin console roster

**Files:**
- Modify: `frontend-admin/src/pages/Students.jsx`

**Interfaces:**
- Consumes: Task 1's `WRITABLE_FIELDS` (backend already accepts the field on add/edit/bulk).
- Produces: the field on the add/edit form, the roster table, and available to bulk-import sheets by column name `admissionNumber`.

- [ ] **Step 1: Add the field everywhere `hostelNumber` appears as the pattern**

In `frontend-admin/src/pages/Students.jsx` (read first; approximate anchors):

- `emptyForm` (~line 18): `admissionNumber: '',`
- Columns list (~line 26): `{ key: 'admissionNumber', label: 'Admission No.' },`
- Edit-seeding object (~line 231): `admissionNumber: st.admissionNumber,`
- Form-fields list (~line 240): `{ key: 'admissionNumber', label: 'Admission Number', type: 'text' },`

If the submit handler picks fields explicitly rather than posting the whole form object, add `admissionNumber` there too.

- [ ] **Step 2: Verify**

Run: `cd frontend-admin && npm run build` — clean. Live: add a student with an admission number, edit it, see it in the roster. A duplicate surfaces the driver's E11000 through the existing error path — acceptable; the number is school-issued and a duplicate is a data error.

- [ ] **Step 3: Commit**

```bash
git add frontend-admin/src/pages/Students.jsx
git commit -m "Let the back office see and set admission numbers"
```

---

### Task 14: Full-suite sweep and release notes

**Files:**
- Modify: `backend/.env.example`, `RELEASE-CHECKLIST.md`

- [ ] **Step 1: Run everything**

```bash
cd backend && npm test
cd ../hungerhunt-kiosk && npm run lint && npm run build && npm test
cd ../frontend-admin && npm run build
```

All green before proceeding. Likeliest strays: tests still posting `phone`/`studentId` shapes (harmless — tidy to the new shape while there), lint catching dead imports in KioskBilling or Billing, and any cashier reference the Task 2 grep missed.

- [ ] **Step 2: Record the deploy surface**

- `backend/.env.example`: add `STUDENT_JWT_SECRET=` beside `PARENT_JWT_SECRET=` with: `# Signs kiosk student sessions. Falls back to JWT_SECRET when unset.`
- `RELEASE-CHECKLIST.md`, under the existing structure:
  - Set `STUDENT_JWT_SECRET` in production.
  - Import admission numbers via bulk import before enabling the kiosk — a student without one cannot log in.
  - The kiosk session route is open by design; the accepted risk and its upgrade path (device enrollment) are in `docs/superpowers/specs/2026-08-11-kiosk-student-self-serve-design.md`.
  - Cashier accounts no longer sign in; any `role: 'cashier'` row should be deleted or re-created as admin/warehouse.
  - Admin-billed orders now always await parent approval; students without a registered parent can buy only at the kiosk.

- [ ] **Step 3: Commit**

```bash
git add backend/.env.example RELEASE-CHECKLIST.md
git commit -m "Write down what the kiosk and billing deploys need"
```

---

## Self-Review (performed while writing)

**Spec coverage — kiosk spec:** screens → Tasks 9, 10; timers incl. in-flight exception → Task 11; data model → Task 1; token/middleware/session route → Tasks 3–5; verify-payment reshape + lockout → Task 6; bill/pending scoping → Task 7; admin form + bulk import → Tasks 1, 13; accepted-risk mitigations → Task 5; welcome-splash removal → Task 10; deploy notes → Task 14. **Admin-billing spec:** cashier removal → Task 2 (incl. the `warehouseRole.test.js` collision); admin branch + `NO_PARENT` + `raisedBy` → Task 8; Billing UI → Task 12; transition tolerance on `verify-payment`/`bill` → Tasks 6–7 keep the body-`studentId` path.

**Known judgment calls, made deliberately:**
- `protectAdminOrStudent` (not `protectStaffOrStudent`) — named for the post-cashier world; Task 2 lands before Task 4 so the name is honest when written.
- The lockout counts wrong codes wherever `verify-payment` is called — including a stale pre-deploy admin console. One rule, one counter.
- `pocketMoney` on the kiosk is a login snapshot; the server re-checks at charge time, so staleness at worst yields a clearly-messaged failed charge.
- Kiosk keeps `authBypassEnabled` plumbing; removal is an existing release-checklist item.
- `GET /pending-orders/:id/status` re-scoped for completeness per spec though the current kiosk build does not poll it.
- Task ordering puts all backend work (1–8) before any frontend task, so the UI is only ever written against routes that exist.
