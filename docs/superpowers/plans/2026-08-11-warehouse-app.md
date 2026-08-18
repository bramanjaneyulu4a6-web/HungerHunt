# Warehouse App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A fourth app, `hungerhunt-warehouse` — phone-first, its own login, warehouse-role accounts — that receives supplier deliveries against purchase orders without ever overwriting what was ordered, plus the backend to support it: a `warehouse` staff role, a `Supplier` entity, and a `GoodsReceipt` ledger with partial deliveries and per-receipt audit trail.

**Architecture:** Purchase orders stay immutable (what was *ordered*); every delivery becomes a `GoodsReceipt` row (what *arrived*, who received it, against which invoice). A denormalized `received` counter per PO line makes remaining-quantity math cheap; the receipts are the audit ledger. The app follows the `hungerhunt-kiosk` pattern exactly: separate Vite app, shared files, role-scoped staff token.

**Tech Stack:** Node 22 + Express 4 + Mongoose 8 (ESM, `"type": "module"`), React 19 + Vite + react-router 7 + axios + react-hot-toast, `node:test` with `mock.method` for backend tests (no DB, no Firebase).

## Global Constraints

- **NEVER run anything against the `.env` MongoDB URI — it is production Atlas.** Backend tests are DB-less by design (every model call stubbed); keep it that way.
- All backend tests: `node:test`, stubs via `mock.method(Model, 'fn', ...)`, app mounted from `app.js` (which owns no DB connection and nothing that ticks). Follow `backend/tests/cashierRole.test.js` as the style reference.
- **401 vs 403 rule:** 401 + `code: 'AUTH_REQUIRED'` means "session dead" and signs the client out. A signed-in account reaching past its role gets **403 with no `code`** — never 401.
- Legacy compatibility rules that must survive every change: an `Admin` row with **no `role` field** is a full admin; a staff JWT with **no `role` claim** is a full admin (until `LEGACY_TOKEN_GRACE_UNTIL`); existing `Purchase` rows have no `supplierId`, no `items[].received`, and status `NEW`/`COMPLETED` only — all must stay readable and workable.
- Shared files (`src/theme.css`, `src/ui.css`, `src/components/ui/index.jsx`, `src/utils/format.js`, `src/components/RefreshButton.jsx`) must be byte-identical across apps — `node scripts/check-shared-files.mjs` enforces it and runs in CI.
- Frontend verification is lint + build (there are no frontend unit tests in this repo): `npm run lint -- --max-warnings 0` and `npx vite build` per app.
- Commit style: imperative, human, story-first subjects (see `git log`); every commit ends with `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`. Run the full backend suite + shared-files check before each commit.
- Full verification command (run before every commit):
  `cd backend && JWT_SECRET=ci-test-secret npm test` then `cd .. && node scripts/check-shared-files.mjs`

## Codebase Orientation (read once before Task 1)

- `backend/utils/tokens.js` — `STAFF_ROLES = ['admin', 'cashier']`, `signStaffToken(id, role)`, `verifyToken(token, role)` where `role` may be `'staff'` (any staff role). Parent tokens carry `tokenVersion`.
- `backend/middleware/authMiddleware.js` — `staffGate(required)` currently takes `'admin' | 'staff'`; exports `protectAdmin`, `protectStaff`, `protectParent`, `protectAdminUnlessBootstrap`. The account **row** decides access (DB lookup per request), not the token.
- `backend/models/Admin.js` — `role` enum `['admin','cashier']`, exports `FULL_ADMIN` filter (`$or` role admin / missing).
- `backend/controllers/adminController.js` — `registerAdmin` (role picker, per-role limits), `loginAdmin` (returns `{token, email, role}`).
- `backend/controllers/purchaseController.js` — `createPurchase`, `getNewPurchases`, `getCompletedPurchases`, `completePurchase` (atomic NEW→COMPLETED claim + stock apply + rollback).
- `backend/models/Purchase.js` — `items: [{productId, quantity, purchasePrice}]`, `status: NEW|COMPLETED`.
- `backend/app.js` — route mounts around lines 127–136; CORS allowlist array around lines 88–97 (localhost 5173/5174/5175/3000 + Vercel origins).
- `hungerhunt-kiosk/` — the pattern to clone for the new app: `src/utils/api.js` (token interceptor + 401 eject), `src/pages/Login.jsx`, `src/components/ProtectedRoute.jsx`, `vite.config.js`, `eslint.config.js`.
- `frontend-admin/src/pages/Register.jsx` — role select (admin/cashier) shown only when signed in; `Login.jsx` turns cashier accounts away.
- `.github/workflows/ci.yml` — lint matrix `[frontend-parent, hungerhunt-kiosk]`, build matrix all three apps.

---

### Task 1: The `warehouse` role across the staff machinery

**Files:**
- Modify: `backend/utils/tokens.js` (STAFF_ROLES)
- Modify: `backend/models/Admin.js` (role enum)
- Modify: `backend/middleware/authMiddleware.js` (staffGate → allow-lists, new `protectWarehouse`, `protectAnyStaff`)
- Modify: `backend/controllers/adminController.js` (per-role limits incl. warehouse)
- Modify: `backend/.env.example` (MAX_WAREHOUSE_ACCOUNTS)
- Modify: `backend/tests/cashierRole.test.js` (accountIs mock learns the new filter shape)
- Test: `backend/tests/warehouseRole.test.js` (new)
- Modify: `frontend-admin/src/pages/Register.jsx` (third option), `frontend-admin/src/pages/Login.jsx` (generic non-admin turn-away), `hungerhunt-kiosk/src/pages/Login.jsx` (turn warehouse away)

**Interfaces:**
- Produces: `protectWarehouse` (admin+warehouse), `protectAnyStaff` (admin+cashier+warehouse), both `(req,res,next)` middlewares setting `req.adminId` and `req.staff = {id, role}`. 403 messages, verbatim: protectAdmin `'This action needs a full admin account.'`, protectStaff `'This action needs a till account.'`, protectWarehouse `'This action needs a warehouse account.'`, protectAnyStaff `'This action needs a staff account.'`. Login response `role` may now be `'warehouse'`.

- [ ] **Step 1: Extend STAFF_ROLES and the Admin enum**

In `backend/utils/tokens.js` change:

```js
export const STAFF_ROLES = ['admin', 'cashier'];
```
to
```js
export const STAFF_ROLES = ['admin', 'cashier', 'warehouse'];
```

In `backend/models/Admin.js` change the role field's enum to:

```js
  role: {
    type: String,
    enum: ['admin', 'cashier', 'warehouse'],
    default: 'admin',
  },
```
and extend its comment: the warehouse role receives deliveries and raises purchase orders — no students, no wallets, no prices, no till.

- [ ] **Step 2: Refactor staffGate to named allow-lists**

In `backend/middleware/authMiddleware.js`, replace the `staffGate` definition and the two gate exports with:

```js
// One row filter per gate: the account's stored role must be in the gate's
// allow-list. A row with no role at all predates roles entirely and is a full
// admin, which outranks every gate — so the missing field is accepted
// everywhere, spelled out because Mongo will not infer it.
const roleFilter = (allowed) => ({
  $or: [{ role: { $in: allowed } }, { role: { $exists: false } }],
});

const staffGate = (allowed, needsMessage) => async (req, res, next) => {
  if (authBypassEnabled) {
    const adminId = await resolveBypassAdmin();
    if (!adminId) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no admin account to impersonate'
      });
    }

    req.adminId = adminId;
    req.staff = { id: adminId, role: 'admin' };
    return next();
  }

  const token = readToken(req);
  if (!token) return denied(res, 'Not authorized, no token');

  try {
    const payload = verifyToken(token, 'staff');
    if (!payload) return denied(res, 'Not authorized');

    const role = payload.role || 'admin';

    if (!allowed.includes(role)) {
      return forbidden(res, needsMessage);
    }

    if (!(await Admin.exists({ _id: payload.id, ...roleFilter(allowed) }))) {
      return denied(res, 'Not authorized');
    }

    req.adminId = payload.id;
    req.staff = { id: payload.id, role };
    next();
  } catch (error) {
    denied(res, 'Token failed, invalid authorization');
  }
};

// The back office: everything that changes the shop, the money supply, or who
// may sign in. Strict on purpose — a route nobody thought about keeps the
// narrower audience rather than quietly gaining a wider one.
export const protectAdmin = staffGate(['admin'], 'This action needs a full admin account.');

// The till's routes: look a student up, verify their code, take the payment,
// raise an approval request.
export const protectStaff = staffGate(['admin', 'cashier'], 'This action needs a till account.');

// The storeroom's routes: see and raise purchase orders, receive deliveries,
// read stock and suppliers.
export const protectWarehouse = staffGate(['admin', 'warehouse'], 'This action needs a warehouse account.');

// Read-only surfaces every kind of staff needs (live stock).
export const protectAnyStaff = staffGate(
  ['admin', 'cashier', 'warehouse'],
  'This action needs a staff account.'
);
```

Delete the old `staffGate`/`protectAdmin`/`protectStaff` definitions and the now-unused `FULL_ADMIN` import if nothing else in the file uses it (`protectAdminUnlessBootstrap` does not; it calls `protectAdmin`). Keep `FULL_ADMIN` exported from `Admin.js` — `adminController.js` still uses it.

- [ ] **Step 3: Per-role account limits in registerAdmin**

In `backend/controllers/adminController.js`, replace the `wantsCashier`/limit block inside `registerAdmin` with:

```js
    const adminCount = await Admin.countDocuments(FULL_ADMIN);

    // Who may call this is settled by protectAdminUnlessBootstrap on the route:
    // open while no account exists, signed-in full admins only thereafter.
    //
    // The bootstrap call is the exception that has to be forced rather than
    // trusted: it is the one unauthenticated path in here, and a deployment
    // cannot be founded on a cashier or a storekeeper — there would be nobody
    // left who could create the admin.
    const LIMITS = {
      admin: parseInt(process.env.MAX_ADMIN_ACCOUNTS) || 3,
      cashier: parseInt(process.env.MAX_CASHIER_ACCOUNTS) || 10,
      warehouse: parseInt(process.env.MAX_WAREHOUSE_ACCOUNTS) || 5,
    };

    const requested = req.body?.role;
    const role = adminCount > 0 && LIMITS[requested] ? requested : 'admin';

    const existing = role === 'admin'
      ? adminCount
      : await Admin.countDocuments({ role });

    if (existing >= LIMITS[role]) {
      return res.status(400).json({
        message: `Registration limited. Max ${LIMITS[role]} ${role} accounts allowed.`
      });
    }
```

And the success response's message ternary becomes:

```js
    return res.status(201).json({
      message: role === 'admin'
        ? "Admin registered successfully"
        : `${role[0].toUpperCase()}${role.slice(1)} account created successfully`,
      role,
    });
```

- [ ] **Step 4: Env documentation**

In `backend/.env.example`, after the `MAX_CASHIER_ACCOUNTS` block add:

```
# Storeroom accounts. A warehouse account can see and raise purchase orders,
# receive deliveries, and read stock and suppliers — no students, no wallets,
# no prices, no till.
MAX_WAREHOUSE_ACCOUNTS=5
```

- [ ] **Step 5: Fix the accountIs mock in cashierRole.test.js**

The refactor changes the `Admin.exists` filter shape: every gate now sends `$or`, so the old `mustBeFullAdmin = Boolean(filter.$or)` heuristic is wrong. Replace the `accountIs` helper in `backend/tests/cashierRole.test.js` with a faithful mini-matcher:

```js
// Models the one account row the gate looks up, answering the way Mongo would.
// The gate's filter carries {$or: [{role: {$in: [...]}}, {role: {$exists: false}}]};
// `role` here is the row's stored value — pass undefined for a row that
// predates roles entirely.
const accountIs = (role) => {
  mock.method(Admin, 'exists', async (filter) => {
    if (String(filter._id) !== STAFF_ID) return null;

    const branches = filter.$or ?? [];
    const allowed = branches.find((b) => b.role?.$in)?.role.$in ?? [];
    const acceptsMissing = branches.some((b) => b.role?.$exists === false);

    const matches = role === undefined ? acceptsMissing : allowed.includes(role);
    return matches ? { _id: STAFF_ID } : null;
  });

  mock.method(Admin, 'countDocuments', async () => 1);
};
```

In the `'a row with no role at all is a full admin'` test, replace its bespoke `Admin.exists` mock with `accountIs(undefined);` (keep the `countDocuments` line it needs — `accountIs` provides it).

- [ ] **Step 6: Run the existing suite — cashierRole must be green again**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all tests pass (was 174; count unchanged). If cashierRole fails, the mock or the gate refactor is wrong — fix before continuing.

- [ ] **Step 7: Write the warehouse reach tests**

Create `backend/tests/warehouseRole.test.js`. Note: the routes it references (`/api/suppliers`, `/api/purchases/open`, receipts) do not exist yet — they arrive in Tasks 2–4. Write the file now with only the reach cases for routes that already exist, plus the login/turn-away tests; later tasks append their routes to the tables. Initial content:

```js
// The storeroom's account, mirrored on cashierRole.test.js: a warehouse
// account opens exactly the storeroom surface, and nothing else — no students,
// no wallets, no till, no catalogue writes. Tasks 2–4 append their routes to
// the two tables as they build them.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';
process.env.LEGACY_TOKEN_GRACE_UNTIL = '2999-01-01T00:00:00Z';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';

const adminToken = signStaffToken(STAFF_ID, 'admin');
const cashierToken = signStaffToken(STAFF_ID, 'cashier');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = (role) => {
  mock.method(Admin, 'exists', async (filter) => {
    if (String(filter._id) !== STAFF_ID) return null;
    const branches = filter.$or ?? [];
    const allowed = branches.find((b) => b.role?.$in)?.role.$in ?? [];
    const acceptsMissing = branches.some((b) => b.role?.$exists === false);
    const matches = role === undefined ? acceptsMissing : allowed.includes(role);
    return matches ? { _id: STAFF_ID } : null;
  });
  mock.method(Admin, 'countDocuments', async () => 1);
};

beforeEach(() => {
  accountIs('warehouse');
  mock.method(Inventory, 'find', () => ({ populate: async () => [] }));
});

const send = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

// Routes the storeroom needs. Tasks 2–4 append theirs.
const WAREHOUSE_ROUTES = [
  ['GET', '/api/inventory'],
];

// A sample of everything else, which no storeroom has ever needed.
const CLOSED_ROUTES = [
  ['GET', '/api/students', 'This action needs a full admin account.'],
  ['GET', '/api/transactions/history', 'This action needs a full admin account.'],
  ['POST', '/api/transactions/bill', 'This action needs a till account.'],
  ['GET', '/api/students/search?q=as', 'This action needs a till account.'],
  ['POST', '/api/admin/register', 'This action needs a full admin account.'],
];

describe('a warehouse account works the storeroom', () => {
  for (const [method, path] of WAREHOUSE_ROUTES) {
    test(`${method} ${path} is open to a warehouse account`, async () => {
      const res = await send(method, path, warehouseToken);
      assert.ok(res.status !== 401 && res.status !== 403,
        `${method} ${path} refused the warehouse token with ${res.status}`);
    });

    test(`${method} ${path} is open to an admin`, async () => {
      accountIs('admin');
      const res = await send(method, path, adminToken);
      assert.ok(res.status !== 401 && res.status !== 403);
    });
  }
});

describe('and nothing else', () => {
  for (const [method, path, message] of CLOSED_ROUTES) {
    test(`${method} ${path} is closed to a warehouse account`, async () => {
      const res = await send(method, path, warehouseToken, {});
      assert.equal(res.status, 403, `${method} ${path} let a warehouse account through`);
      assert.equal((await res.json()).message, message);
      assert.equal((await send(method, path, warehouseToken, {}).then(r => r.json())).code, undefined,
        'a permission refusal must not sign the app out');
    });
  }

  test('a cashier cannot reach the storeroom-only surface either', async () => {
    accountIs('cashier');
    // /api/inventory is deliberately open to every staff role; the
    // storeroom-only routes from Tasks 2–4 assert cashier exclusion when
    // they append themselves here.
    const res = await send('GET', '/api/inventory', cashierToken);
    assert.ok(res.status !== 401 && res.status !== 403, 'inventory is any-staff');
  });
});
```

- [ ] **Step 8: Run it — fails on `/api/inventory` (still gated to protectStaff)**

Run: `cd backend && node --test tests/warehouseRole.test.js`
Expected: FAIL — `GET /api/inventory` answers 403 to the warehouse token, because the route still uses `protectStaff`.

- [ ] **Step 9: Open inventory to all staff**

In `backend/routes/inventoryRoutes.js` replace the import and gate:

```js
import { protectAnyStaff } from "../middleware/authMiddleware.js";

const router = express.Router();

// The menu the till sells from and the shelf the storeroom counts onto — every
// kind of staff reads it. Changing stock is done through products and
// purchases, which keep their own narrower gates.
router.get("/", protectAnyStaff, getInventory);
```

- [ ] **Step 10: Run both role test files**

Run: `cd backend && node --test tests/warehouseRole.test.js tests/cashierRole.test.js`
Expected: PASS. (cashierRole's till table includes `GET /api/inventory` — the any-staff gate still answers a cashier identically to an admin, so it stays green.)

- [ ] **Step 11: Console + kiosk logins learn the third role**

`frontend-admin/src/pages/Login.jsx` — replace the cashier turn-away block with a general one:

```js
      /* A non-admin's credentials are good — just good for a different
         terminal. Saying so at the door beats a dashboard of empty panels. */
      if (response.data.role && response.data.role !== 'admin') {
        const home = response.data.role === 'cashier' ? 'the kiosk' : 'the warehouse app';
        setError(`This is a ${response.data.role} account. Sign in on ${home} instead.`);
        setSubmitting(false);
        return;
      }
```

`frontend-admin/src/pages/Register.jsx` — in the role `<select>`, add:

```jsx
              <option value="warehouse">Warehouse — goods in only</option>
```

and extend the hint ternary:

```jsx
            <p className="auth-hint">
              {formData.role === 'cashier'
                ? 'Can look up students and take payments on the kiosk. Cannot change prices, stock, student records or wallets.'
                : formData.role === 'warehouse'
                ? 'Can raise purchase orders and receive deliveries in the warehouse app. Cannot touch students, wallets, prices or the till.'
                : 'Full access, including student records, wallet top-ups and creating other accounts.'}
            </p>
```

`hungerhunt-kiosk/src/pages/Login.jsx` — after the login POST succeeds, before storing the token:

```js
      // A warehouse account's credentials are good — for the other app.
      if (res.data.role === "warehouse") {
        setError("This is a warehouse account. Sign in on the warehouse app instead.");
        setLoading(false);
        return;
      }
```

- [ ] **Step 12: Full verification and commit**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test && cd .. && node scripts/check-shared-files.mjs`
Then: `cd frontend-admin && npx vite build && cd ../hungerhunt-kiosk && npm run lint -- --max-warnings 0 && npx vite build`
Expected: all green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Teach the staff gates a third trade

The storeroom joins admin and cashier as a kind of staff. Gates now carry
named allow-lists instead of two hardcoded levels, so the next role is a
line, not a refactor; the account row still decides, refusals past one's
reach still say 403 so no terminal signs itself out, and a roleless row or
token is still the full admin it always was.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: The Supplier entity

**Files:**
- Create: `backend/models/Supplier.js`
- Create: `backend/routes/supplierRoutes.js`
- Modify: `backend/app.js` (mount `/api/suppliers`)
- Test: `backend/tests/suppliers.test.js`
- Modify: `backend/tests/warehouseRole.test.js` (append routes to tables)

**Interfaces:**
- Produces: `Supplier` model `{name (required, unique, trim), phone, contactPerson, notes, active (default true)}` with timestamps. Routes: `GET /api/suppliers` (warehouse+admin; `?all=1` includes inactive), `POST /api/suppliers` (admin), `PUT /api/suppliers/:id` (admin; `active: false` is the soft delete). No hard delete — purchase orders will reference suppliers forever.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/suppliers.test.js`:

```js
// Suppliers are a name the money remembers: purchase orders point at them
// forever, so they deactivate rather than delete, and only the back office
// may change them — the storeroom reads.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Supplier = (await import('../models/Supplier.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const SUPPLIER_ID = '507f191e810c19729de860ea';

const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = (role) => {
  mock.method(Admin, 'exists', async (filter) => {
    if (String(filter._id) !== STAFF_ID) return null;
    const branches = filter.$or ?? [];
    const allowed = branches.find((b) => b.role?.$in)?.role.$in ?? [];
    return allowed.includes(role) ? { _id: STAFF_ID } : null;
  });
};

const send = (method, path, token, body) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

describe('reading suppliers', () => {
  test('the storeroom sees active suppliers only, by default', async () => {
    accountIs('warehouse');
    let asked;
    mock.method(Supplier, 'find', (filter) => {
      asked = filter;
      return { sort: async () => [] };
    });

    const res = await send('GET', '/api/suppliers', warehouseToken);

    assert.equal(res.status, 200);
    assert.deepEqual(asked, { active: true });
  });

  test('?all=1 includes the deactivated, for the back office ledger', async () => {
    accountIs('admin');
    let asked;
    mock.method(Supplier, 'find', (filter) => {
      asked = filter;
      return { sort: async () => [] };
    });

    await send('GET', '/api/suppliers?all=1', adminToken);

    assert.deepEqual(asked, {});
  });
});

describe('writing suppliers', () => {
  test('creating one is admin work', async () => {
    accountIs('warehouse');
    const res = await send('POST', '/api/suppliers', warehouseToken, { name: 'Fresh Farm Co' });
    assert.equal(res.status, 403);
  });

  test('an admin can create one', async () => {
    accountIs('admin');
    mock.method(Supplier, 'create', async (doc) => ({ _id: SUPPLIER_ID, ...doc }));

    const res = await send('POST', '/api/suppliers', adminToken, {
      name: '  Fresh Farm Co  ', phone: '9111111111', contactPerson: 'Ravi',
    });

    assert.equal(res.status, 201);
    assert.equal((await res.json()).name, 'Fresh Farm Co');
  });

  test('a nameless supplier is refused', async () => {
    accountIs('admin');
    const res = await send('POST', '/api/suppliers', adminToken, { phone: '9' });
    assert.equal(res.status, 400);
  });

  test('deactivating is the delete', async () => {
    accountIs('admin');
    mock.method(Supplier, 'findByIdAndUpdate', async (id, update) => ({
      _id: id, name: 'Fresh Farm Co', ...update.$set ?? update,
    }));

    const res = await send('PUT', `/api/suppliers/${SUPPLIER_ID}`, adminToken, { active: false });

    assert.equal(res.status, 200);
    assert.equal((await res.json()).active, false);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/suppliers.test.js`
Expected: FAIL — cannot import `../models/Supplier.js`.

- [ ] **Step 3: Model and routes**

Create `backend/models/Supplier.js`:

```js
import mongoose from 'mongoose';

// A supplier is a name the money remembers. Purchase orders reference these
// rows forever, which is why there is no delete anywhere — a supplier the
// school stops using is deactivated, and its history stays attached.
const supplierSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    phone: { type: String, trim: true },
    contactPerson: { type: String, trim: true },
    notes: { type: String },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model('Supplier', supplierSchema);
```

Create `backend/routes/supplierRoutes.js` (inline handlers, matching `stockGroupRoutes.js`):

```js
import express from "express";
import Supplier from "../models/Supplier.js";
import { protectAdmin, protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

/* The storeroom reads suppliers to raise an order against one; only the back
   office changes them. Deactivation is the only removal — orders keep
   pointing at the row. */

router.get("/", protectWarehouse, async (req, res) => {
  try {
    const filter = req.query.all ? {} : { active: true };
    const suppliers = await Supplier.find(filter).sort({ name: 1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", protectAdmin, async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) return res.status(400).json({ message: "Supplier name is required" });

    const supplier = await Supplier.create({
      name,
      phone: req.body.phone,
      contactPerson: req.body.contactPerson,
      notes: req.body.notes,
    });

    res.status(201).json(supplier);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", protectAdmin, async (req, res) => {
  try {
    const { name, phone, contactPerson, notes, active } = req.body;
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { name, phone, contactPerson, notes, active },
      { new: true, runValidators: true }
    );
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    res.json(supplier);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

export default router;
```

In `backend/app.js`, import and mount alongside the other routers:

```js
import supplierRoutes from './routes/supplierRoutes.js';
// ...with the other app.use mounts:
app.use('/api/suppliers', supplierRoutes);
```

- [ ] **Step 4: Run to verify pass**

Run: `cd backend && node --test tests/suppliers.test.js`
Expected: PASS.

- [ ] **Step 5: Append to the warehouse reach tables**

In `backend/tests/warehouseRole.test.js`: add to `WAREHOUSE_ROUTES`:

```js
  ['GET', '/api/suppliers'],
```

add to `CLOSED_ROUTES`:

```js
  ['POST', '/api/suppliers', 'This action needs a full admin account.'],
```

and add a `Supplier.find` stub to the shared `beforeEach`:

```js
  mock.method(Supplier, 'find', () => ({ sort: async () => [] }));
```

with the import `const Supplier = (await import('../models/Supplier.js')).default;` near the other imports.

- [ ] **Step 6: Full verification and commit**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Give purchase orders somebody to be from

A Supplier is a name the money remembers: orders will reference these rows
forever, so there is no delete — only deactivation. The back office writes
them, the storeroom reads them.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Purchase orders learn suppliers, partials, and who raised them

**Files:**
- Modify: `backend/models/Purchase.js`
- Modify: `backend/controllers/purchaseController.js` (createPurchase gains supplierId/raisedBy; new `getOpenPurchases`, `getPurchase`)
- Modify: `backend/routes/purchaseRoutes.js` (gates + new routes)
- Test: `backend/tests/purchaseOrders.test.js` (new)
- Modify: `backend/tests/warehouseRole.test.js`, `backend/tests/cashierRole.test.js`

**Interfaces:**
- Produces: `Purchase.items[].received` (Number, default 0 — units covered by receipts, damaged included), `Purchase.supplierId` (optional ObjectId ref Supplier), `Purchase.raisedBy` (optional ObjectId ref Admin), `status` enum `['NEW','PARTIAL','COMPLETED']`. Routes: `POST /api/purchases` (now `protectWarehouse`; body may carry `supplierId`), `GET /api/purchases/open` (`protectWarehouse`; NEW+PARTIAL, populated items+supplier, newest first), `GET /api/purchases/:id` (`protectWarehouse`; single populated PO). Task 4 consumes `items[].received` and the status enum.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/purchaseOrders.test.js`:

```js
// The order half of goods-inwards: what was asked for, from whom, by whom.
// The received counts live on the order for cheap remaining-math, but they are
// only ever moved by receipts (Task 4) — nothing here writes them.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f191e810c19729de860ec';
const SUPPLIER_ID = '507f191e810c19729de860ea';

const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const signedInAsWarehouse = () => {
  mock.method(Admin, 'exists', async (filter) => {
    if (String(filter._id) !== STAFF_ID) return null;
    const allowed = (filter.$or ?? []).find((b) => b.role?.$in)?.role.$in ?? [];
    return allowed.includes('warehouse') ? { _id: STAFF_ID } : null;
  });
};

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${warehouseToken}`,
    },
    body: JSON.stringify(body),
  });

describe('raising an order', () => {
  test('the storeroom can raise one, stamped with who and from whom', async () => {
    signedInAsWarehouse();
    let created;
    mock.method(Purchase, 'create', async (doc) => { created = doc; return { _id: 'x', ...doc }; });

    const res = await post('/api/purchases', {
      supplierId: SUPPLIER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });

    assert.equal(res.status, 201);
    assert.equal(String(created.supplierId), SUPPLIER_ID);
    assert.equal(String(created.raisedBy), STAFF_ID);
    assert.equal(created.status, 'NEW');
  });

  test('a garbage supplierId is refused rather than stored', async () => {
    signedInAsWarehouse();
    const res = await post('/api/purchases', {
      supplierId: 'not-an-id',
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    assert.equal(res.status, 400);
  });

  test('no supplier is still allowed — legacy orders never had one', async () => {
    signedInAsWarehouse();
    mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));
    const res = await post('/api/purchases', {
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    assert.equal(res.status, 201);
  });
});

describe('the open-orders list', () => {
  test('asks for NEW and PARTIAL, newest first', async () => {
    signedInAsWarehouse();
    let asked;
    mock.method(Purchase, 'find', (filter) => {
      asked = filter;
      const chain = { populate: () => chain, sort: async () => [] };
      return chain;
    });

    const res = await fetch(base + '/api/purchases/open', {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(asked, { status: { $in: ['NEW', 'PARTIAL'] } });
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/purchaseOrders.test.js`
Expected: FAIL — `POST /api/purchases` answers 403 (still `protectAdmin`), `/open` is 404.

- [ ] **Step 3: Model changes**

In `backend/models/Purchase.js`:

Add to `purchaseItemSchema` after `purchasePrice`:

```js
  // Units covered by goods receipts so far — received plus damaged, because a
  // damaged unit arrived and counts against the order even though it never
  // reaches the shelf. `quantity` above is what was ordered and is never
  // edited after creation; this is the only field receipts move.
  received: {
    type: Number,
    default: 0
  }
```

Change the status enum and add the two provenance fields to `purchaseSchema`:

```js
  status: {
    type: String,
    enum: ["NEW", "PARTIAL", "COMPLETED"],
    default: "NEW"
  },

  // Optional on both ends: rows from before suppliers existed have neither,
  // and both are provenance, not behaviour.
  supplierId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Supplier"
  },

  raisedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  },
```

- [ ] **Step 4: Controller changes**

In `backend/controllers/purchaseController.js`, replace the body of `createPurchase`'s purchase construction:

```js
    const supplierId = req.body.supplierId;
    if (supplierId !== undefined && supplierId !== null && supplierId !== "" &&
        !mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Unknown supplier" });
    }

    const purchase = await Purchase.create({
      status: "NEW",
      items,
      ...(supplierId ? { supplierId } : {}),
      raisedBy: req.adminId,
    });

    res.status(201).json(purchase);
```

(Remove the `new Purchase(...)` + `.save()` pair in favour of `create` — same semantics, and the tests stub `create`.)

Add two new exports at the end of the file:

```js
// NEW and PARTIAL together are "the storeroom's inbox": everything a delivery
// could still arrive against. Remaining per line is derivable client-side as
// quantity - received.
export const getOpenPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find({ status: { $in: ["NEW", "PARTIAL"] } })
      .populate("items.productId")
      .populate("supplierId")
      .sort({ createdAt: -1 });

    res.json(purchases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPurchase = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const purchase = await Purchase.findById(req.params.id)
      .populate("items.productId")
      .populate("supplierId");

    if (!purchase) return res.status(404).json({ message: "Purchase not found" });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

- [ ] **Step 5: Route changes**

Replace `backend/routes/purchaseRoutes.js` with:

```js
import express from "express";

import {
  createPurchase,
  getNewPurchases,
  getCompletedPurchases,
  getOpenPurchases,
  getPurchase,
  completePurchase
} from "../controllers/purchaseController.js";

import { protectAdmin, protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

/* The storeroom raises orders and looks at what is still open; the back
   office keeps the completed ledger and the legacy complete-in-one-step
   endpoint its old screen still calls. /:id goes last so the named routes
   above it are not swallowed. */

router.post("/", protectWarehouse, createPurchase);
router.get("/open", protectWarehouse, getOpenPurchases);

router.get("/new", protectAdmin, getNewPurchases);
router.get("/completed", protectAdmin, getCompletedPurchases);
router.put("/complete/:id", protectAdmin, completePurchase);

router.get("/:id", protectWarehouse, getPurchase);

export default router;
```

- [ ] **Step 6: Run to verify pass**

Run: `cd backend && node --test tests/purchaseOrders.test.js`
Expected: PASS.

- [ ] **Step 7: Update the two role-reach test files**

`backend/tests/cashierRole.test.js`: in `BACK_OFFICE_ROUTES`, the `['POST', '/api/purchases', {}]` entry's gate message changed (it is now warehouse-gated, not admin-gated). Update that entry's test expectation by moving it out of `BACK_OFFICE_ROUTES` and into a standalone test at the bottom of the `'and nothing else'` describe:

```js
  test('POST /api/purchases is closed to a cashier — storeroom work', async () => {
    accountIs('cashier');
    const res = await send('POST', '/api/purchases', cashierToken, {});
    assert.equal(res.status, 403);
    assert.equal((await res.json()).message, 'This action needs a warehouse account.');
  });
```

Also remove `['GET', '/api/purchases/new']` from `BACK_OFFICE_ROUTES`? No — it stays admin-gated; leave it.

`backend/tests/warehouseRole.test.js`: append to `WAREHOUSE_ROUTES`:

```js
  ['GET', '/api/purchases/open'],
  ['POST', '/api/purchases', { items: [{ productId: '507f191e810c19729de860ec', quantity: 1 }] }],
```

and to the shared `beforeEach`, stubs so the open list and create answer from memory:

```js
  mock.method(Purchase, 'find', () => {
    const chain = { populate: () => chain, sort: async () => [] };
    return chain;
  });
  mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));
```

with `const Purchase = (await import('../models/Purchase.js')).default;` added to the imports. Extend the `send`-loop in the `WAREHOUSE_ROUTES` describe to pass the third element as the body: change `send(method, path, warehouseToken)` to `send(method, path, warehouseToken, route[2])` (where `route` is the loop variable).

And append to `CLOSED_ROUTES`:

```js
  ['GET', '/api/purchases/completed', 'This action needs a full admin account.'],
```

- [ ] **Step 8: Full verification and commit**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Let an order say who from, who by, and how much is still coming

Purchase orders gain a supplier, the raiser's stamp, and a PARTIAL state
between NEW and COMPLETED. The ordered quantity becomes immutable history;
a received counter beside it is moved only by receipts. The storeroom can
now raise orders and read what is still open — the completed ledger stays
with the back office.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Goods receipts — the delivery ledger

**Files:**
- Create: `backend/models/GoodsReceipt.js`
- Create: `backend/controllers/receiptController.js`
- Modify: `backend/routes/purchaseRoutes.js` (receipts routes)
- Modify: `backend/controllers/purchaseController.js` (completePurchase reworked over receipts)
- Test: `backend/tests/goodsReceipts.test.js`
- Modify: `backend/tests/warehouseRole.test.js`

**Interfaces:**
- Produces: `POST /api/purchases/:id/receipts` (`protectWarehouse`) with body `{clientToken, invoiceNumber?, note?, lines: [{productId, received, damaged?, reason?}]}` → 201 `{receipt, purchase}`; duplicate `clientToken` on the same purchase → 200 with the existing receipt (idempotent double-tap). `GET /api/purchases/:id/receipts` (`protectWarehouse`) → receipts newest first. `received` goes to stock; `damaged` counts against the order but never reaches stock. Over-receipt (`received + damaged > remaining`) → 400. Status recompute: every line covered → `COMPLETED`, else `PARTIAL`.
- Consumes: `Purchase.items[].received`, status enum from Task 3.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/goodsReceipts.test.js`:

```js
// The receiving half of goods-inwards. The old completePurchase overwrote the
// order with whatever arrived, destroying the evidence of every shortfall.
// Receipts are the fix: the order is never edited, each delivery is its own
// row with who/when/invoice, and the discrepancy is always derivable.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const GoodsReceipt = (await import('../models/GoodsReceipt.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PO_ID = '507f191e810c19729de860ed';
const PRODUCT_A = '507f191e810c19729de860ec';
const PRODUCT_B = '507f191e810c19729de860eb';

const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const signedIn = () => {
  mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
};

// An order for 10 A and 4 B, with `received` already at the given counts.
const orderWith = (receivedA = 0, receivedB = 0, status = 'NEW') => {
  const doc = {
    _id: PO_ID,
    status,
    items: [
      { productId: PRODUCT_A, quantity: 10, purchasePrice: 5, received: receivedA },
      { productId: PRODUCT_B, quantity: 4, purchasePrice: 9, received: receivedB },
    ],
    save: async function () { return this; },
  };
  mock.method(Purchase, 'findById', async () => doc);
  return doc;
};

const receive = (body) =>
  fetch(`${base}/api/purchases/${PO_ID}/receipts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${warehouseToken}`,
    },
    body: JSON.stringify({ clientToken: 'tap-1', ...body }),
  });

describe('booking a delivery', () => {
  test('a partial delivery moves stock, advances received, leaves the order open', async () => {
    signedIn();
    const order = orderWith();

    let receiptDoc;
    mock.method(GoodsReceipt, 'create', async (doc) => { receiptDoc = doc; return { _id: 'r1', ...doc }; });

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push([String(filter.productId), update.$inc.stock]);
      return { modifiedCount: 1 };
    });

    const orderMoves = [];
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      orderMoves.push([String(filter['items.productId']), update.$inc['items.$.received']]);
      // Mirror the write onto the in-memory doc so the recompute sees it.
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    const res = await receive({
      invoiceNumber: 'INV-77',
      lines: [{ productId: PRODUCT_A, received: 6, damaged: 1, reason: 'crushed box' }],
    });

    assert.equal(res.status, 201);
    assert.equal(receiptDoc.receivedBy.toString?.() ?? String(receiptDoc.receivedBy), STAFF_ID);
    assert.deepEqual(stockMoves, [[PRODUCT_A, 6]], 'damaged units never reach the shelf');
    assert.deepEqual(orderMoves, [[PRODUCT_A, 7]], 'damaged units count against the order');
    assert.equal(order.status, 'PARTIAL');
  });

  test('the delivery that covers everything completes the order', async () => {
    signedIn();
    const order = orderWith(7, 4, 'PARTIAL'); // A needs 3 more, B done

    mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r2', ...doc }));
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(Purchase, 'updateOne', async (filter, update) => {
      const item = order.items.find((i) => String(i.productId) === String(filter['items.productId']));
      item.received += update.$inc['items.$.received'];
      return { modifiedCount: 1 };
    });

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 3 }] });

    assert.equal(res.status, 201);
    assert.equal(order.status, 'COMPLETED');
    assert.ok(order.completedAt instanceof Date);
  });

  test('more than remains on the order is refused', async () => {
    signedIn();
    orderWith(7); // 3 of A remain

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 4 }] });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /more than remains/i);
  });

  test('a product the order never asked for is refused', async () => {
    signedIn();
    const order = orderWith();
    order.items = order.items.slice(0, 1); // only A on the order

    const res = await receive({ lines: [{ productId: PRODUCT_B, received: 1 }] });

    assert.equal(res.status, 400);
  });

  test('a completed order takes no more deliveries', async () => {
    signedIn();
    orderWith(10, 4, 'COMPLETED');

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 1 }] });

    assert.equal(res.status, 409);
  });

  test('the same tap twice books one delivery', async () => {
    signedIn();
    orderWith();

    const existing = { _id: 'r1', clientToken: 'tap-1' };
    mock.method(GoodsReceipt, 'create', async () => {
      const err = new Error('dup');
      err.code = 11000;
      throw err;
    });
    mock.method(GoodsReceipt, 'findOne', async () => existing);
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 200, 'the duplicate is answered, not errored');
    assert.equal(stock.mock.callCount(), 0, 'and it must not move stock again');
  });

  test('a failure mid-apply takes back the stock and the receipt', async () => {
    signedIn();
    orderWith();

    let deleted = false;
    mock.method(GoodsReceipt, 'create', async (doc) => ({ _id: 'r1', ...doc }));
    mock.method(GoodsReceipt, 'deleteOne', async () => { deleted = true; return {}; });

    const stockMoves = [];
    mock.method(Inventory, 'updateOne', async (filter, update) => {
      stockMoves.push(update.$inc.stock);
      return { modifiedCount: 1 };
    });
    mock.method(Purchase, 'updateOne', async () => { throw new Error('mongo hiccup'); });

    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 6 }] });

    assert.equal(res.status, 500);
    assert.deepEqual(stockMoves, [6, -6], 'applied stock must be taken back');
    assert.ok(deleted, 'the receipt row must not survive a failed booking');
  });
});

describe('nothing at all in a receipt', () => {
  test('is refused before any model is touched', async () => {
    signedIn();
    const res = await receive({ lines: [{ productId: PRODUCT_A, received: 0, damaged: 0 }] });
    assert.equal(res.status, 400);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `cd backend && node --test tests/goodsReceipts.test.js`
Expected: FAIL — `GoodsReceipt` model does not exist.

- [ ] **Step 3: Model**

Create `backend/models/GoodsReceipt.js`:

```js
import mongoose from 'mongoose';

// One row per physical delivery: who received it, against which supplier
// invoice, and what actually arrived line by line. The purchase order never
// changes; these rows are why a shortfall stays visible — the discrepancy is
// always ordered minus the sum of these.
const receiptLineSchema = new mongoose.Schema({
  _id: false,
  productId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Product',
    required: true,
  },
  // Usable units — these reach the shelf.
  received: { type: Number, default: 0 },
  // Arrived but unusable — counts against the order, never against stock.
  damaged: { type: Number, default: 0 },
  reason: { type: String, default: '' },
});

const goodsReceiptSchema = new mongoose.Schema(
  {
    purchaseId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Purchase',
      required: true,
      index: true,
    },

    receivedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
    },

    invoiceNumber: { type: String, default: '' },
    note: { type: String, default: '' },

    // Minted by the client per confirm attempt. The unique index below is what
    // makes a double-tap or a retried request book one delivery, not two.
    clientToken: { type: String, required: true },

    lines: [receiptLineSchema],
  },
  { timestamps: true }
);

goodsReceiptSchema.index({ purchaseId: 1, clientToken: 1 }, { unique: true });

export default mongoose.model('GoodsReceipt', goodsReceiptSchema);
```

- [ ] **Step 4: Controller**

Create `backend/controllers/receiptController.js`:

```js
import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import GoodsReceipt from "../models/GoodsReceipt.js";
import Inventory from "../models/Inventory.js";

const isWholeNonNegative = (v) => Number.isInteger(Number(v)) && Number(v) >= 0;

// Returns cleaned lines, or null when anything is unusable. A receipt where
// nothing arrived and nothing was damaged is not a receipt.
const normalizeLines = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) return null;

  const normalized = [];

  for (const line of lines) {
    const { productId, received = 0, damaged = 0, reason = "" } = line ?? {};

    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    if (!isWholeNonNegative(received) || !isWholeNonNegative(damaged)) return null;

    normalized.push({
      productId,
      received: Number(received),
      damaged: Number(damaged),
      reason: String(reason).slice(0, 200),
    });
  }

  if (!normalized.some((l) => l.received > 0 || l.damaged > 0)) return null;

  return normalized;
};

/* Books one physical delivery against an order.

   received goes to the shelf; damaged counts against the order but never
   against stock — the unit arrived, so the supplier owes nothing more, but
   nobody can sell it.

   The clientToken plus the unique {purchaseId, clientToken} index is the
   double-tap guard: a retry of the same confirm finds the row already there
   and is answered with it instead of booking the delivery twice.

   Failure anywhere after the receipt row exists takes back the stock already
   applied, the received counts already advanced, and the row itself — the
   same compensation shape completePurchase has always used. */
export const receiveDelivery = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  const lines = normalizeLines(req.body.lines);
  if (!lines) {
    return res.status(400).json({
      message: "Every line needs a product and a whole received or damaged count, and something must have arrived.",
    });
  }

  const clientToken =
    typeof req.body.clientToken === "string" && req.body.clientToken.length > 0
      ? req.body.clientToken.slice(0, 100)
      : null;

  if (!clientToken) {
    return res.status(400).json({ message: "clientToken is required, so a retry cannot book a delivery twice." });
  }

  try {
    const purchase = await Purchase.findById(id);

    if (!purchase) return res.status(404).json({ message: "Purchase not found" });

    if (purchase.status === "COMPLETED") {
      return res.status(409).json({ message: "This order is already fully received." });
    }

    // Every line must be on the order, and fit inside what remains.
    for (const line of lines) {
      const item = purchase.items.find(
        (i) => String(i.productId) === String(line.productId)
      );

      if (!item) {
        return res.status(400).json({ message: "That product is not on this order." });
      }

      const remaining = item.quantity - (item.received || 0);

      if (line.received + line.damaged > remaining) {
        return res.status(400).json({
          message: "That is more than remains on the order. Raise a new order for extras.",
        });
      }
    }

    let receipt = null;

    try {
      receipt = await GoodsReceipt.create({
        purchaseId: purchase._id,
        receivedBy: req.adminId,
        invoiceNumber: String(req.body.invoiceNumber ?? "").slice(0, 100),
        note: String(req.body.note ?? "").slice(0, 500),
        clientToken,
        lines,
      });
    } catch (err) {
      if (err.code === 11000) {
        // The double-tap: this delivery is already booked. Answer with it.
        const existing = await GoodsReceipt.findOne({ purchaseId: purchase._id, clientToken });
        return res.json({ receipt: existing, purchase });
      }
      throw err;
    }

    const appliedStock = [];
    const appliedOrder = [];

    try {
      for (const line of lines) {
        if (line.received > 0) {
          await Inventory.updateOne(
            { productId: line.productId },
            { $inc: { stock: line.received } },
            { upsert: true }
          );
          appliedStock.push(line);
        }

        const coverage = line.received + line.damaged;
        await Purchase.updateOne(
          { _id: purchase._id, "items.productId": line.productId },
          { $inc: { "items.$.received": coverage } }
        );
        appliedOrder.push({ productId: line.productId, coverage });
      }

      const fresh = await Purchase.findById(purchase._id);
      const done = fresh.items.every((i) => (i.received || 0) >= i.quantity);

      fresh.status = done ? "COMPLETED" : "PARTIAL";
      if (done) fresh.completedAt = new Date();
      await fresh.save();

      return res.status(201).json({ receipt, purchase: fresh });
    } catch (err) {
      console.error(err);

      for (const line of appliedStock) {
        try {
          await Inventory.updateOne(
            { productId: line.productId },
            { $inc: { stock: -line.received } }
          );
        } catch (rollbackErr) {
          console.error("Stock rollback failed for product", line.productId, rollbackErr);
        }
      }

      for (const { productId, coverage } of appliedOrder) {
        try {
          await Purchase.updateOne(
            { _id: purchase._id, "items.productId": productId },
            { $inc: { "items.$.received": -coverage } }
          );
        } catch (rollbackErr) {
          console.error("Order rollback failed for product", productId, rollbackErr);
        }
      }

      try {
        await GoodsReceipt.deleteOne({ _id: receipt._id });
      } catch (rollbackErr) {
        console.error("Receipt rollback failed", rollbackErr);
      }

      return res.status(500).json({ message: err.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getReceiptsForPurchase = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const receipts = await GoodsReceipt.find({ purchaseId: req.params.id })
      .populate("lines.productId")
      .populate("receivedBy", "email role")
      .sort({ createdAt: -1 });

    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

- [ ] **Step 5: Routes**

In `backend/routes/purchaseRoutes.js`, add the import and, **above** the `/:id` route:

```js
import { receiveDelivery, getReceiptsForPurchase } from "../controllers/receiptController.js";
// ...
router.post("/:id/receipts", protectWarehouse, receiveDelivery);
router.get("/:id/receipts", protectWarehouse, getReceiptsForPurchase);
```

- [ ] **Step 6: Run to verify pass**

Run: `cd backend && node --test tests/goodsReceipts.test.js`
Expected: PASS.

- [ ] **Step 7: Rework legacy completePurchase over receipts**

The old admin screen (`frontend-admin/src/pages/Purchased.jsx`) sends `PUT /api/purchases/complete/:id` with `{items: [{productId, quantity, purchasePrice}]}` where `quantity` is the *received* count, and expects the order to close whatever arrived. Keep that contract, but write the truth down: in `backend/controllers/purchaseController.js`, replace the entire `completePurchase` function body's claim-and-apply with a synthetic receipt + forced close:

```js
import GoodsReceipt from "../models/GoodsReceipt.js";
// (add to the imports at the top)

/* The one-step close the old back-office screen still calls. Reimplemented
   over receipts so even legacy closes leave an audit row: what arrived is
   booked as a receipt (stamped with who), and the order is then closed
   whatever remains — which is exactly what the old overwrite did, except the
   shortfall now stays visible instead of being edited away. Retired once the
   screen moves to receipts in a later task. */
export const completePurchase = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  const items = normalizeItems(req.body.items);

  if (!items) {
    return res.status(400).json({ message: ITEMS_REJECTED });
  }

  let claimed = null;
  const applied = [];

  try {
    // Only a still-open order transitions, so a double-click or second tab
    // cannot add the same delivery to inventory twice.
    claimed = await Purchase.findOneAndUpdate(
      { _id: id, status: { $in: ["NEW", "PARTIAL"] } },
      { status: "COMPLETED", completedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!claimed) {
      const exists = await Purchase.exists({ _id: id });

      return exists
        ? res.status(409).json({
            message: "This purchase order has already been completed."
          })
        : res.status(404).json({ message: "Purchase not found" });
    }

    for (const item of items) {
      await Inventory.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
        { upsert: true }
      );

      await Purchase.updateOne(
        { _id: id, "items.productId": item.productId },
        {
          $inc: { "items.$.received": item.quantity },
          $set: { "items.$.purchasePrice": item.purchasePrice }
        }
      );

      applied.push({ productId: item.productId, quantity: item.quantity });
    }

    // The audit row a legacy close never had. Best-effort: the close itself
    // must not fail because the ledger write did.
    try {
      await GoodsReceipt.create({
        purchaseId: claimed._id,
        receivedBy: req.adminId,
        invoiceNumber: "",
        note: "Closed from the back office in one step.",
        clientToken: `legacy-${id}-${Date.now()}`,
        lines: items.map((i) => ({ productId: i.productId, received: i.quantity, damaged: 0 })),
      });
    } catch (ledgerErr) {
      console.error("Legacy close could not write its receipt:", ledgerErr);
    }

    res.json(claimed);
  } catch (err) {
    console.error(err);

    if (claimed) {
      await removeStock(applied);

      try {
        await Purchase.updateOne(
          { _id: id },
          { $set: { status: "NEW" }, $unset: { completedAt: 1 } }
        );
      } catch (reopenErr) {
        console.error("Could not reopen purchase", id, reopenErr);
      }
    }

    res.status(500).json({
      message: err.message
    });
  }
};
```

Note `Date.now()` here is server runtime code, which is fine — the no-`Date.now()` rule applies only to Workflow scripts.

- [ ] **Step 8: Append receipts to the warehouse reach tables**

In `backend/tests/warehouseRole.test.js`, append to `WAREHOUSE_ROUTES`:

```js
  ['GET', `/api/purchases/507f191e810c19729de860ed/receipts`],
```

and to the shared `beforeEach`:

```js
  mock.method(GoodsReceipt, 'find', () => {
    const chain = { populate: () => chain, sort: async () => [] };
    return chain;
  });
```

with `const GoodsReceipt = (await import('../models/GoodsReceipt.js')).default;` in the imports. Append to `CLOSED_ROUTES`:

```js
  ['PUT', '/api/purchases/complete/507f191e810c19729de860ed', 'This action needs a full admin account.'],
```

- [ ] **Step 9: Full verification, mutation check, commit**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green.

Mutation check (each must make at least one test fail, then restore):
1. In `receiptController.js`, change `{ $inc: { stock: line.received } }` to `{ $inc: { stock: line.received + line.damaged } }` → the "damaged units never reach the shelf" assertion fails.
2. Remove the `err.code === 11000` branch (rethrow always) → the double-tap test fails.
3. Skip the stock rollback loop → the mid-apply failure test fails.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Book every delivery instead of overwriting the order

A GoodsReceipt is one physical delivery: who received it, against which
invoice, what arrived and what arrived broken. The order itself is never
edited again — remaining is ordered minus receipts, damaged counts against
the supplier but never reaches the shelf, a double-tap books one delivery,
and a failed booking takes everything back. The old one-step close still
works and now leaves a receipt behind it.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Scaffold `hungerhunt-warehouse` — app shell, auth, CI

**Files:**
- Create: `hungerhunt-warehouse/package.json`, `vite.config.js`, `eslint.config.js`, `index.html`, `.env`, `.gitignore`
- Create: `hungerhunt-warehouse/src/main.jsx`, `src/App.jsx`, `src/warehouse.css`
- Create: `hungerhunt-warehouse/src/utils/api.js`
- Copy from kiosk (byte-identical shared files): `src/theme.css`, `src/ui.css`, `src/index.css`, `src/components/ui/index.jsx`, `src/utils/format.js`, `src/components/RefreshButton.jsx`, `src/utils/authBypass.js`, `src/components/ProtectedRoute.jsx`
- Create: `hungerhunt-warehouse/src/pages/Login.jsx`
- Modify: `backend/app.js` (CORS: add `http://localhost:5176`)
- Modify: `scripts/check-shared-files.mjs` (add the fourth app)
- Modify: `.github/workflows/ci.yml` (lint + build matrices)

**Interfaces:**
- Produces: token in `localStorage['warehouseToken']`, role in `localStorage['staffRole']`; axios instance at `src/utils/api.js` (default export) with 401-eject to `/login`; routes `/login` (public) and `/` behind `ProtectedRoute`. Dev server pinned to port **5176** (the CORS allowlist is hardcoded, so the port must be deterministic).

- [ ] **Step 1: Scaffold by cloning the kiosk's config**

```bash
mkdir -p hungerhunt-warehouse/src/{pages,components/ui,utils}
cp hungerhunt-kiosk/eslint.config.js hungerhunt-warehouse/
cp hungerhunt-kiosk/.gitignore hungerhunt-warehouse/ 2>/dev/null || true
cp hungerhunt-kiosk/src/theme.css hungerhunt-warehouse/src/
cp hungerhunt-kiosk/src/ui.css hungerhunt-warehouse/src/
cp hungerhunt-kiosk/src/index.css hungerhunt-warehouse/src/
cp hungerhunt-kiosk/src/components/ui/index.jsx hungerhunt-warehouse/src/components/ui/
cp hungerhunt-kiosk/src/utils/format.js hungerhunt-warehouse/src/utils/
cp hungerhunt-kiosk/src/components/RefreshButton.jsx hungerhunt-warehouse/src/components/
cp hungerhunt-kiosk/src/utils/authBypass.js hungerhunt-warehouse/src/utils/
cp hungerhunt-kiosk/src/components/ProtectedRoute.jsx hungerhunt-warehouse/src/components/
```

Then open the copied `ProtectedRoute.jsx` — if it reads `localStorage.getItem("adminToken")`, change that string to `"warehouseToken"` (this file is NOT in the shared-files list, so diverging is fine; verify with `grep -n adminToken hungerhunt-warehouse/src/components/ProtectedRoute.jsx`).

Create `hungerhunt-warehouse/package.json` by copying `hungerhunt-kiosk/package.json` and changing only the `"name"` field to `"hungerhunt-warehouse"`. Then `cd hungerhunt-warehouse && npm install`.

Create `hungerhunt-warehouse/vite.config.js` — copy the kiosk's, then add a pinned port inside `defineConfig({...})`:

```js
  // Pinned: the backend's CORS allowlist is a hardcoded list of origins, and
  // 5176 is the warehouse app's entry in it. Vite's default port-increment
  // would land wherever the other three apps left off.
  server: { port: 5176, strictPort: true },
```

Create `hungerhunt-warehouse/index.html` (copy the kiosk's, set `<title>Hunger Hunt — Warehouse</title>`).

Create `hungerhunt-warehouse/.env`:

```
VITE_API_BASE_URL=http://localhost:5000/api
```

- [ ] **Step 2: The visual identity — warehouse.css**

The kiosk is a warm canteen counter; the warehouse is an industrial clipboard: dark slate ground, safety-amber accent, quantities in tabular figures, controls sized for a standing thumb. Create `hungerhunt-warehouse/src/warehouse.css`:

```css
/* The storeroom's own skin, loaded after the shared ui.css. Identity:
   industrial clipboard — slate ground, safety-amber accent, big tap targets
   for a standing thumb, tabular figures wherever counts align. */

:root {
  --wh-bg: #171a1e;
  --wh-panel: #1f242a;
  --wh-panel-raised: #262c33;
  --wh-line: #333a42;
  --wh-ink: #e8eaed;
  --wh-muted: #98a2ad;
  --wh-amber: #f5a623;
  --wh-amber-ink: #1a1206;
  --wh-green: #3fb27f;
  --wh-red: #e5604c;
}

.wh-app {
  min-height: 100vh;
  background: var(--wh-bg);
  color: var(--wh-ink);
  padding-bottom: 84px; /* room for the tab bar */
}

.wh-page { padding: 16px; max-width: 720px; margin: 0 auto; }

.wh-title { font-size: 22px; font-weight: 700; margin: 4px 0 2px; }
.wh-subtitle { color: var(--wh-muted); font-size: 14px; margin: 0 0 16px; }

.wh-card {
  background: var(--wh-panel);
  border: 1px solid var(--wh-line);
  border-radius: 14px;
  padding: 16px;
  margin-bottom: 12px;
}

.wh-card--tappable { cursor: pointer; transition: background 0.12s ease; }
.wh-card--tappable:active { background: var(--wh-panel-raised); }

.wh-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }

.wh-badge {
  display: inline-block;
  padding: 3px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.04em;
}
.wh-badge--new { background: rgba(245, 166, 35, 0.16); color: var(--wh-amber); }
.wh-badge--partial { background: rgba(63, 178, 127, 0.16); color: var(--wh-green); }
.wh-badge--short { background: rgba(229, 96, 76, 0.16); color: var(--wh-red); }

.wh-num { font-variant-numeric: tabular-nums; }

.wh-line-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 10px 12px;
  padding: 14px 0;
  border-bottom: 1px solid var(--wh-line);
}
.wh-line-item:last-child { border-bottom: none; }

.wh-product { font-weight: 600; font-size: 16px; }
.wh-remaining { color: var(--wh-muted); font-size: 13px; }

.wh-stepper { display: flex; align-items: center; gap: 0; }
.wh-stepper button {
  width: 52px; height: 52px;
  font-size: 24px; font-weight: 700;
  background: var(--wh-panel-raised);
  color: var(--wh-ink);
  border: 1px solid var(--wh-line);
  cursor: pointer;
}
.wh-stepper button:first-child { border-radius: 12px 0 0 12px; }
.wh-stepper button:last-child { border-radius: 0 12px 12px 0; }
.wh-stepper button:disabled { opacity: 0.35; cursor: default; }
.wh-stepper input {
  width: 64px; height: 52px;
  text-align: center;
  font-size: 18px; font-weight: 700;
  font-variant-numeric: tabular-nums;
  background: var(--wh-bg);
  color: var(--wh-ink);
  border: 1px solid var(--wh-line);
  border-left: none; border-right: none;
}

.wh-field-label {
  display: block;
  font-size: 12px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.08em;
  color: var(--wh-muted);
  margin: 14px 0 6px;
}

.wh-input {
  width: 100%;
  padding: 14px;
  font-size: 16px;
  background: var(--wh-panel);
  color: var(--wh-ink);
  border: 1px solid var(--wh-line);
  border-radius: 12px;
}

.wh-cta {
  display: block;
  width: 100%;
  padding: 18px;
  margin-top: 16px;
  font-size: 17px; font-weight: 800;
  background: var(--wh-amber);
  color: var(--wh-amber-ink);
  border: none; border-radius: 14px;
  cursor: pointer;
}
.wh-cta:disabled { opacity: 0.45; cursor: default; }

.wh-summary {
  background: var(--wh-panel-raised);
  border: 1px solid var(--wh-line);
  border-radius: 12px;
  padding: 12px 14px;
  margin-top: 14px;
  font-size: 14px;
  color: var(--wh-muted);
}
.wh-summary strong { color: var(--wh-ink); }

.wh-tabbar {
  position: fixed;
  bottom: 0; left: 0; right: 0;
  display: flex;
  background: var(--wh-panel);
  border-top: 1px solid var(--wh-line);
  padding: 6px 0 max(6px, env(safe-area-inset-bottom));
}
.wh-tab {
  flex: 1;
  display: flex; flex-direction: column; align-items: center; gap: 2px;
  padding: 8px 0;
  font-size: 11px; font-weight: 700;
  color: var(--wh-muted);
  text-decoration: none;
}
.wh-tab.active { color: var(--wh-amber); }
.wh-tab .wh-tab-icon { font-size: 20px; line-height: 1; }
```

- [ ] **Step 3: Entry, shell, login**

`hungerhunt-warehouse/src/main.jsx`:

```jsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./theme.css";
import "./index.css";
import "./ui.css";
import "./warehouse.css";
import App from "./App.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
);
```

`hungerhunt-warehouse/src/utils/api.js`:

```js
import axios from "axios";

import { authBypassEnabled } from "./authBypass";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("warehouseToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only a dead session (401) ejects. A 403 is this account reaching past
    // the storeroom, which its own screens never do — but it must not sign
    // anyone out. With the bypass on there is no login to return to.
    if (error.response?.status === 401 && !authBypassEnabled) {
      localStorage.removeItem("warehouseToken");
      localStorage.removeItem("staffRole");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
```

`hungerhunt-warehouse/src/pages/Login.jsx` (adapted from the kiosk's):

```jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import { AuthField, AuthLayout, Banner, Button } from "../components/ui";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      const res = await api.post("/admin/login", { email, password });

      // A cashier's credentials are good — for the till. Admins outrank the
      // storeroom and may sign in here.
      if (res.data.role === "cashier") {
        setError("This is a till account. Sign in on the kiosk instead.");
        setLoading(false);
        return;
      }

      localStorage.setItem("warehouseToken", res.data.token);
      localStorage.setItem("staffRole", res.data.role || "admin");
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Invalid email or password."
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Warehouse" subtitle="Sign in to receive stock">
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          placeholder="store@hungerhunt.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button type="submit" variant="brand" block className="auth-submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
```

`hungerhunt-warehouse/src/App.jsx` (Home/Receive/NewOrder/Stock/History arrive in Tasks 6–7; placeholders here are plain functions in this same file so the app builds — they are replaced, not kept):

```jsx
import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";

// Replaced by real pages in the next two tasks.
const Placeholder = ({ name }) => <div className="wh-page"><h1 className="wh-title">{name}</h1></div>;

const TABS = [
  { to: "/", icon: "📥", label: "Orders" },
  { to: "/new-order", icon: "➕", label: "New order" },
  { to: "/stock", icon: "📦", label: "Stock" },
  { to: "/history", icon: "🧾", label: "History" },
];

const TabBar = () => (
  <nav className="wh-tabbar">
    {TABS.map((tab) => (
      <NavLink
        key={tab.to}
        to={tab.to}
        end={tab.to === "/"}
        className={({ isActive }) => `wh-tab${isActive ? " active" : ""}`}
      >
        <span className="wh-tab-icon" aria-hidden="true">{tab.icon}</span>
        {tab.label}
      </NavLink>
    ))}
  </nav>
);

const Shell = ({ children }) => (
  <div className="wh-app">
    {children}
    <TabBar />
  </div>
);

const App = () => (
  <BrowserRouter>
    <Toaster position="top-center" />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Shell><Placeholder name="Open orders" /></Shell></ProtectedRoute>} />
      <Route path="/receive/:id" element={<ProtectedRoute><Shell><Placeholder name="Receive" /></Shell></ProtectedRoute>} />
      <Route path="/new-order" element={<ProtectedRoute><Shell><Placeholder name="New order" /></Shell></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><Shell><Placeholder name="Stock" /></Shell></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><Shell><Placeholder name="History" /></Shell></ProtectedRoute>} />
    </Routes>
  </BrowserRouter>
);

export default App;
```

- [ ] **Step 4: CORS, shared-files, CI**

`backend/app.js` — find the CORS allowlist array (around lines 88–97) and add `'http://localhost:5176'` beside the other localhost entries, with a trailing comment `// hungerhunt-warehouse (port pinned in its vite.config)`.

`scripts/check-shared-files.mjs` — read the file; it declares which apps share which files. Add `'hungerhunt-warehouse'` to the app list for each of: `src/theme.css`, `src/ui.css`, `src/components/ui/index.jsx`, `src/utils/format.js`, and `src/components/RefreshButton.jsx`. Run `node scripts/check-shared-files.mjs` — it must report all in sync (if it flags a file, re-copy that file from the kiosk).

`.github/workflows/ci.yml` — add `hungerhunt-warehouse` to BOTH the lint matrix (`app: [frontend-parent, hungerhunt-kiosk, hungerhunt-warehouse]`) and the build matrix (`app: [frontend-parent, frontend-admin, hungerhunt-kiosk, hungerhunt-warehouse]`).

- [ ] **Step 5: Verify and commit**

Run: `cd hungerhunt-warehouse && npm run lint -- --max-warnings 0 && npx vite build`
Run: `node ../scripts/check-shared-files.mjs` (from repo root: `node scripts/check-shared-files.mjs`)
Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Give the storeroom a door of its own

A fourth app, hungerhunt-warehouse, on the kiosk's pattern: its own login
and token, the shared file set, port pinned to 5176 because the CORS list
is a list. Slate and safety-amber — a clipboard, not a canteen counter.
Screens arrive next; this is the shell that holds them.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The Home and Receive screens

**Files:**
- Create: `hungerhunt-warehouse/src/pages/Home.jsx`
- Create: `hungerhunt-warehouse/src/pages/Receive.jsx`
- Modify: `hungerhunt-warehouse/src/App.jsx` (swap placeholders for the two pages)

**Interfaces:**
- Consumes: `GET /api/purchases/open` (array of POs with `items[{productId: populated product, quantity, received}]`, `supplierId` populated or null, `status`, `createdAt`), `GET /api/purchases/:id`, `POST /api/purchases/:id/receipts` `{clientToken, invoiceNumber, note, lines:[{productId, received, damaged, reason}]}` → `{receipt, purchase}`; shared `formatINR` from `src/utils/format.js`.

- [ ] **Step 1: Home — the open-orders inbox**

Create `hungerhunt-warehouse/src/pages/Home.jsx`:

```jsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const remainingUnits = (po) =>
  po.items.reduce((sum, item) => sum + Math.max(0, item.quantity - (item.received || 0)), 0);

const Home = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/purchases/open");
      setOrders(res.data);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Open orders</h1>
          <p className="wh-subtitle">Tap an order when its delivery arrives</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {loadError && (
        <Banner variant="alert" icon="⚠️">Could not load orders. Pull refresh to retry.</Banner>
      )}

      {loading ? (
        <>
          <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
          <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
        </>
      ) : orders.length === 0 && !loadError ? (
        <EmptyState icon="📥" title="Nothing on the way">
          Every order has been fully received. Raise a new one from the New order tab.
        </EmptyState>
      ) : (
        orders.map((po) => (
          <div
            key={po._id}
            className="wh-card wh-card--tappable"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/receive/${po._id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/receive/${po._id}`)}
          >
            <div className="wh-row">
              <span className="wh-product">
                {po.supplierId?.name || "No supplier recorded"}
              </span>
              <span className={`wh-badge wh-badge--${po.status === "PARTIAL" ? "partial" : "new"}`}>
                {po.status === "PARTIAL" ? "PARTLY RECEIVED" : "NEW"}
              </span>
            </div>
            <p className="wh-remaining" style={{ margin: "6px 0 0" }}>
              {po.items.length} line{po.items.length === 1 ? "" : "s"} ·{" "}
              <span className="wh-num">{remainingUnits(po)}</span> units still to come ·
              raised {new Date(po.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))
      )}
    </div>
  );
};

export default Home;
```

- [ ] **Step 2: Receive — the centerpiece**

Create `hungerhunt-warehouse/src/pages/Receive.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { Banner, Skeleton } from "../components/ui";

/* One order, one delivery. Each line starts prefilled with everything still
   outstanding — the common case is "it all arrived" and should be one tap.
   Counting down from there records a shortfall without a single extra screen.

   The clientToken is minted per confirm attempt: if the confirm succeeds the
   screen leaves, and if the network eats the response a retry carries the
   same token, which the server answers with the already-booked receipt
   instead of booking the delivery twice. */
const Receive = () => {
  const { id } = useParams();
  const navigate = useNavigate();

  const [po, setPo] = useState(null);
  const [lines, setLines] = useState({});      // productId -> {received, damaged, reason}
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [loadError, setLoadError] = useState(false);
  const [saving, setSaving] = useState(false);
  const clientTokenRef = useRef(crypto.randomUUID());
  const savingRef = useRef(false);             // double-tap guard on top of the token

  const load = useCallback(async () => {
    setLoadError(false);
    try {
      const res = await api.get(`/purchases/${id}`);
      setPo(res.data);
      const initial = {};
      for (const item of res.data.items) {
        const remaining = Math.max(0, item.quantity - (item.received || 0));
        initial[item.productId._id] = { received: remaining, damaged: 0, reason: "" };
      }
      setLines(initial);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    }
  }, [id]);

  useEffect(() => { load(); }, [load]);

  const setLine = (productId, key, value) =>
    setLines((prev) => ({ ...prev, [productId]: { ...prev[productId], [key]: value } }));

  const clamp = (item, line) => {
    const remaining = Math.max(0, item.quantity - (item.received || 0));
    const received = Math.max(0, Math.min(Number(line.received) || 0, remaining));
    const damaged = Math.max(0, Math.min(Number(line.damaged) || 0, remaining - received));
    return { ...line, received, damaged };
  };

  const summary = useMemo(() => {
    if (!po) return null;
    let toShelf = 0, damaged = 0, short = 0;
    for (const item of po.items) {
      const remaining = Math.max(0, item.quantity - (item.received || 0));
      const line = clamp(item, lines[item.productId._id] || { received: 0, damaged: 0 });
      toShelf += line.received;
      damaged += line.damaged;
      short += remaining - line.received - line.damaged;
    }
    return { toShelf, damaged, short };
  }, [po, lines]);

  const confirm = async () => {
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);

    const body = {
      clientToken: clientTokenRef.current,
      invoiceNumber,
      lines: po.items
        .map((item) => {
          const line = clamp(item, lines[item.productId._id] || { received: 0, damaged: 0 });
          return {
            productId: item.productId._id,
            received: line.received,
            damaged: line.damaged,
            reason: line.reason || "",
          };
        })
        .filter((l) => l.received > 0 || l.damaged > 0),
    };

    try {
      const res = await api.post(`/purchases/${id}/receipts`, body);
      const closed = res.data.purchase?.status === "COMPLETED";
      toast.success(closed ? "Delivery booked — order complete" : "Delivery booked — order stays open for the rest");
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Could not book the delivery");
      // A fresh token for the next attempt only if this one is truly dead —
      // a 4xx settled the answer; anything else may have landed, so keep the
      // token and let the server dedupe.
      if (err.response?.status >= 400 && err.response?.status < 500) {
        clientTokenRef.current = crypto.randomUUID();
      }
      savingRef.current = false;
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="wh-page">
        <Banner variant="alert" icon="⚠️">Could not load this order.</Banner>
      </div>
    );
  }

  if (!po) {
    return (
      <div className="wh-page">
        <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
        <Skeleton height={300} radius={14} />
      </div>
    );
  }

  const nothingToBook = summary && summary.toShelf === 0 && summary.damaged === 0;

  return (
    <div className="wh-page">
      <h1 className="wh-title">{po.supplierId?.name || "Delivery"}</h1>
      <p className="wh-subtitle">
        Count what arrived. Anything short stays on the order.
      </p>

      <div className="wh-card">
        {po.items.map((item) => {
          const remaining = Math.max(0, item.quantity - (item.received || 0));
          const line = clamp(item, lines[item.productId._id] || { received: 0, damaged: 0 });

          return (
            <div key={item.productId._id} className="wh-line-item">
              <div>
                <div className="wh-product">{item.productId?.name || "Deleted product"}</div>
                <div className="wh-remaining">
                  ordered <span className="wh-num">{item.quantity}</span>
                  {item.received > 0 && (
                    <> · already in <span className="wh-num">{item.received}</span></>
                  )}
                  {" "}· expecting <span className="wh-num">{remaining}</span>
                </div>

                {line.damaged > 0 && (
                  <input
                    className="wh-input"
                    style={{ marginTop: 8 }}
                    placeholder="What was wrong with the damaged units?"
                    value={line.reason}
                    onChange={(e) => setLine(item.productId._id, "reason", e.target.value)}
                  />
                )}
              </div>

              <div>
                <div className="wh-stepper" aria-label={`Received ${item.productId?.name}`}>
                  <button
                    type="button"
                    disabled={line.received <= 0}
                    onClick={() => setLine(item.productId._id, "received", line.received - 1)}
                  >−</button>
                  <input
                    inputMode="numeric"
                    value={line.received}
                    onChange={(e) => setLine(item.productId._id, "received", e.target.value)}
                  />
                  <button
                    type="button"
                    disabled={line.received + line.damaged >= remaining}
                    onClick={() => setLine(item.productId._id, "received", line.received + 1)}
                  >+</button>
                </div>
                <button
                  type="button"
                  className="wh-remaining"
                  style={{ background: "none", border: "none", padding: "8px 0 0", cursor: "pointer", color: "var(--wh-red)" }}
                  onClick={() => setLine(item.productId._id, "damaged", line.damaged > 0 ? 0 : 1)}
                >
                  {line.damaged > 0 ? `damaged: ${line.damaged} (tap to clear)` : "+ mark damaged"}
                </button>
                {line.damaged > 0 && (
                  <div className="wh-stepper" aria-label={`Damaged ${item.productId?.name}`}>
                    <button type="button" onClick={() => setLine(item.productId._id, "damaged", Math.max(0, line.damaged - 1))}>−</button>
                    <input
                      inputMode="numeric"
                      value={line.damaged}
                      onChange={(e) => setLine(item.productId._id, "damaged", e.target.value)}
                    />
                    <button
                      type="button"
                      disabled={line.received + line.damaged >= remaining}
                      onClick={() => setLine(item.productId._id, "damaged", line.damaged + 1)}
                    >+</button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <label className="wh-field-label" htmlFor="invoice">Supplier invoice no.</label>
      <input
        id="invoice"
        className="wh-input"
        placeholder="e.g. INV-2041"
        value={invoiceNumber}
        onChange={(e) => setInvoiceNumber(e.target.value)}
      />

      {summary && (
        <div className="wh-summary">
          <strong className="wh-num">{summary.toShelf}</strong> to the shelf
          {summary.damaged > 0 && <> · <strong className="wh-num">{summary.damaged}</strong> damaged</>}
          {summary.short > 0
            ? <> · <strong className="wh-num">{summary.short}</strong> short — the order stays open for them</>
            : <> · order will be complete</>}
        </div>
      )}

      <button type="button" className="wh-cta" disabled={saving || nothingToBook} onClick={confirm}>
        {saving ? "Booking…" : "Book this delivery"}
      </button>
    </div>
  );
};

export default Receive;
```

- [ ] **Step 3: Wire into App.jsx**

In `hungerhunt-warehouse/src/App.jsx`: add `import Home from "./pages/Home";` and `import Receive from "./pages/Receive";`, and replace the two placeholder route elements:

```jsx
      <Route path="/" element={<ProtectedRoute><Shell><Home /></Shell></ProtectedRoute>} />
      <Route path="/receive/:id" element={<ProtectedRoute><Shell><Receive /></Shell></ProtectedRoute>} />
```

- [ ] **Step 4: Verify and commit**

Run: `cd hungerhunt-warehouse && npm run lint -- --max-warnings 0 && npx vite build`
Expected: clean.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Count the boxes where they land

Home is the storeroom's inbox — every order a delivery could still arrive
against, remaining units up front. Receive is the count itself: each line
prefilled with what is expected so the common case is one tap, damaged
kept apart from received, the shortfall named before it is booked, and a
double-tap or eaten response books one delivery, not two.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: New order, Stock, and History screens

**Files:**
- Create: `hungerhunt-warehouse/src/pages/NewOrder.jsx`, `src/pages/Stock.jsx`, `src/pages/History.jsx`
- Modify: `hungerhunt-warehouse/src/App.jsx` (swap remaining placeholders; delete the `Placeholder` component)
- Modify: `backend/routes/productRoutes.js` (GET list opens to warehouse)
- Modify: `backend/tests/cashierRole.test.js`, `backend/tests/warehouseRole.test.js`

**Interfaces:**
- Consumes: `GET /api/products` (id, name, price, stockGroup), `GET /api/suppliers`, `POST /api/purchases`, `GET /api/inventory` (rows `{productId: populated product, stock}`), `GET /api/purchases/completed` — **no**: completed is admin-only; History uses `GET /api/purchases/open` + per-PO `GET /api/purchases/:id/receipts`? Too chatty. Produce instead: `GET /api/receipts/recent` — **no new endpoint**; History lists receipts via a purchase picker is over-built. **Decision:** History = `GET /api/purchases/recent-receipts` is YAGNI; instead History shows receipts for orders still in `/open` plus a note. **Final decision (locked):** add one endpoint `GET /api/receipts` (`protectWarehouse`, last 50 receipts, populated) in this task — it is 15 lines and makes History honest.

- [ ] **Step 1: The receipts-list endpoint**

Append to `backend/controllers/receiptController.js`:

```js
// The storeroom's logbook: the latest deliveries across every order, newest
// first. Capped — the full ledger lives in the back office.
export const getRecentReceipts = async (req, res) => {
  try {
    const receipts = await GoodsReceipt.find()
      .populate("lines.productId")
      .populate("receivedBy", "email role")
      .populate({ path: "purchaseId", populate: { path: "supplierId" } })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

Create `backend/routes/receiptRoutes.js`:

```js
import express from "express";
import { getRecentReceipts } from "../controllers/receiptController.js";
import { protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protectWarehouse, getRecentReceipts);

export default router;
```

Mount in `backend/app.js`: `import receiptRoutes from './routes/receiptRoutes.js';` and `app.use('/api/receipts', receiptRoutes);`

In `backend/routes/productRoutes.js`, change the list route's gate:

```js
import { protectAdmin, protectWarehouse } from '../middleware/authMiddleware.js';
// ...
// The storeroom reads the catalogue to raise an order from it; only the back
// office changes it.
router.get('/', protectWarehouse, getProducts);
```

Test updates:
- `backend/tests/cashierRole.test.js`: move `['GET', '/api/products']` out of `BACK_OFFICE_ROUTES` and into a standalone test (same shape as the POST /api/purchases one from Task 3, expecting message `'This action needs a warehouse account.'`).
- `backend/tests/warehouseRole.test.js`: append `['GET', '/api/products']` and `['GET', '/api/receipts']` to `WAREHOUSE_ROUTES`; add stubs to `beforeEach`:

```js
  // getProducts awaits Product.find().populate("stockGroup").populate("unit"),
  // so the chain has to be thenable at every link.
  mock.method(Product, 'find', () => {
    const chain = { populate: () => chain, then: (resolve) => resolve([]) };
    return chain;
  });
```

with `const Product = (await import('../models/Product.js')).default;` imported. The `GoodsReceipt.find` stub from Task 4 already returns a chain; extend it so `.limit` also works:

```js
  mock.method(GoodsReceipt, 'find', () => {
    const chain = { populate: () => chain, sort: () => chain, limit: async () => [] };
    return chain;
  });
```

Run: `cd backend && JWT_SECRET=ci-test-secret npm test` — all green before moving on.

- [ ] **Step 2: NewOrder.jsx**

Create `hungerhunt-warehouse/src/pages/NewOrder.jsx`:

```jsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { Banner, Skeleton } from "../components/ui";

/* Raising an order from the storeroom: the person staring at the empty shelf
   acts on it. Stock is shown per product so "running low" is visible at the
   moment of ordering; the back office still pays the invoice. */
const NewOrder = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [stockByProduct, setStockByProduct] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [productsRes, suppliersRes, inventoryRes] = await Promise.all([
          api.get("/products"),
          api.get("/suppliers"),
          api.get("/inventory"),
        ]);
        setProducts(productsRes.data);
        setSuppliers(suppliersRes.data);
        const stock = {};
        for (const row of inventoryRes.data) {
          if (row.productId?._id) stock[row.productId._id] = row.stock;
        }
        setStockByProduct(stock);
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(q));
  }, [products, search]);

  const lineCount = Object.values(quantities).filter((q) => Number(q) > 0).length;

  const submit = async () => {
    const items = products
      .filter((p) => Number(quantities[p._id]) > 0)
      .map((p) => ({ productId: p._id, quantity: Number(quantities[p._id]) }));

    if (items.length === 0) {
      toast.error("Add a quantity to at least one product");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/purchases", { items, ...(supplierId ? { supplierId } : {}) });
      toast.success("Order raised — the office will see it too");
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Could not raise the order");
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="wh-page">
        <Banner variant="alert" icon="⚠️">Could not load the catalogue.</Banner>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <h1 className="wh-title">New order</h1>
      <p className="wh-subtitle">Current shelf count shown per product</p>

      <label className="wh-field-label" htmlFor="supplier">Supplier</label>
      <select
        id="supplier"
        className="wh-input"
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
      >
        <option value="">— not chosen yet —</option>
        {suppliers.map((s) => (
          <option key={s._id} value={s._id}>{s.name}</option>
        ))}
      </select>

      <label className="wh-field-label" htmlFor="search">Find a product</label>
      <input
        id="search"
        className="wh-input"
        placeholder="Search the catalogue"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <Skeleton height={220} radius={14} style={{ marginTop: 12 }} />
      ) : (
        <div className="wh-card" style={{ marginTop: 12 }}>
          {visible.map((product) => (
            <div key={product._id} className="wh-line-item">
              <div>
                <div className="wh-product">{product.name}</div>
                <div className="wh-remaining">
                  on shelf: <span className="wh-num">{stockByProduct[product._id] ?? 0}</span>
                </div>
              </div>
              <div className="wh-stepper" aria-label={`Order ${product.name}`}>
                <button
                  type="button"
                  disabled={!quantities[product._id]}
                  onClick={() =>
                    setQuantities((q) => ({ ...q, [product._id]: Math.max(0, Number(q[product._id] || 0) - 1) }))
                  }
                >−</button>
                <input
                  inputMode="numeric"
                  value={quantities[product._id] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [product._id]: e.target.value.replace(/\D/g, "") }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setQuantities((q) => ({ ...q, [product._id]: Number(q[product._id] || 0) + 1 }))
                  }
                >+</button>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="wh-remaining" style={{ padding: 12 }}>Nothing matches that search.</p>
          )}
        </div>
      )}

      <button type="button" className="wh-cta" disabled={submitting || lineCount === 0} onClick={submit}>
        {submitting ? "Raising…" : `Raise order${lineCount ? ` · ${lineCount} line${lineCount === 1 ? "" : "s"}` : ""}`}
      </button>
    </div>
  );
};

export default NewOrder;
```

- [ ] **Step 3: Stock.jsx and History.jsx**

Create `hungerhunt-warehouse/src/pages/Stock.jsx`:

```jsx
import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const Stock = () => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/inventory");
      setRows(res.data.filter((row) => row.productId));
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((row) => row.productId.name?.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Stock</h1>
          <p className="wh-subtitle">What is on the shelf right now — read-only</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      <input
        className="wh-input"
        placeholder="Search stock"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loadError && <Banner variant="alert" icon="⚠️">Could not load stock.</Banner>}

      {loading ? (
        <Skeleton height={260} radius={14} style={{ marginTop: 12 }} />
      ) : visible.length === 0 && !loadError ? (
        <EmptyState icon="📦" title="Nothing found">No stock rows match.</EmptyState>
      ) : (
        <div className="wh-card" style={{ marginTop: 12 }}>
          {visible.map((row) => (
            <div key={row._id} className="wh-line-item">
              <div className="wh-product">{row.productId.name}</div>
              <div
                className="wh-num"
                style={{ fontSize: 18, fontWeight: 800, color: row.stock === 0 ? "var(--wh-red)" : "var(--wh-ink)" }}
              >
                {row.stock}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stock;
```

Create `hungerhunt-warehouse/src/pages/History.jsx`:

```jsx
import { useCallback, useEffect, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const unitsIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.received || 0), 0);

const damagedIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.damaged || 0), 0);

const History = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/receipts");
      setReceipts(res.data);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">History</h1>
          <p className="wh-subtitle">The last deliveries booked, newest first</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {loadError && <Banner variant="alert" icon="⚠️">Could not load the logbook.</Banner>}

      {loading ? (
        <Skeleton height={260} radius={14} />
      ) : receipts.length === 0 && !loadError ? (
        <EmptyState icon="🧾" title="No deliveries yet">
          Booked deliveries appear here with who received them.
        </EmptyState>
      ) : (
        receipts.map((receipt) => (
          <div key={receipt._id} className="wh-card">
            <div className="wh-row">
              <span className="wh-product">
                {receipt.purchaseId?.supplierId?.name || "No supplier recorded"}
              </span>
              {damagedIn(receipt) > 0 && (
                <span className="wh-badge wh-badge--short">
                  {damagedIn(receipt)} damaged
                </span>
              )}
            </div>
            <p className="wh-remaining" style={{ margin: "6px 0 0" }}>
              <span className="wh-num">{unitsIn(receipt)}</span> units to the shelf
              {receipt.invoiceNumber && <> · inv {receipt.invoiceNumber}</>}
              {" "}· {new Date(receipt.createdAt).toLocaleString()}
              {" "}· by {receipt.receivedBy?.email || "unknown"}
            </p>
          </div>
        ))
      )}
    </div>
  );
};

export default History;
```

- [ ] **Step 4: Wire into App.jsx and delete the placeholder**

In `hungerhunt-warehouse/src/App.jsx`: import the three pages, replace the three remaining placeholder routes, and delete the `Placeholder` component entirely.

- [ ] **Step 5: Verify and commit**

Run: `cd hungerhunt-warehouse && npm run lint -- --max-warnings 0 && npx vite build && cd ../backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green.

```bash
git add -A
git commit -m "$(cat <<'EOF'
Let the storeroom order, look, and remember

New order raises a purchase from the person staring at the empty shelf,
current count beside every product. Stock is the shelf, read-only. History
is the logbook: each delivery with its units, its damage, its invoice and
its receiver's name.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Back-office alignment — supplier picker and the receipts ledger

**Files:**
- Modify: `frontend-admin/src/pages/Purchase.jsx` (supplier select on order creation)
- Modify: `frontend-admin/src/pages/Purchased.jsx` (discrepancy column; receipts summary)

**Interfaces:**
- Consumes: `GET /api/suppliers?all=1`, existing `POST /api/purchases` (now accepting `supplierId`), PO rows now carrying `items[].received`, `status: PARTIAL`, populated `supplierId` on `GET /api/purchases/new|completed` — **check first**: `getNewPurchases`/`getCompletedPurchases` don't populate `supplierId`; add `.populate("supplierId")` to both in `backend/controllers/purchaseController.js` as part of this task.

- [ ] **Step 1: Populate supplier on the two legacy lists**

In `backend/controllers/purchaseController.js`, add `.populate("supplierId")` to the query chains in both `getNewPurchases` and `getCompletedPurchases` (after the existing `.populate("items.productId")`).

- [ ] **Step 2: Supplier picker on the Purchase page**

In `frontend-admin/src/pages/Purchase.jsx`:

Add state and load (inside the component, alongside existing state):

```jsx
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
```

In `fetchProducts` (or a parallel effect), load suppliers too — extend the existing `useEffect` to also run:

```jsx
  useEffect(() => {
    api.get("/suppliers")
      .then((res) => setSuppliers(res.data))
      .catch((err) => console.error(err));
  }, []);
```

In `createPurchase`, include the supplier in the POST body:

```jsx
      await api.post("/purchases", {
        items: selectedItems,
        ...(supplierId ? { supplierId } : {}),
      });
```

And render the picker above the product list (inside the page, before the product grid/table — match surrounding markup style):

```jsx
      <div style={{ maxWidth: 420, marginBottom: 20 }}>
        <label className="auth-label" htmlFor="po-supplier" style={{ display: "block", marginBottom: 6 }}>
          Supplier
        </label>
        <select
          id="po-supplier"
          className="auth-input"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">— no supplier —</option>
          {suppliers.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      </div>
```

- [ ] **Step 3: Discrepancy on the Purchased page**

In `frontend-admin/src/pages/Purchased.jsx`, on the **completed** tab's per-purchase rendering, add a shortfall line. Where each completed purchase's items are rendered, compute and show:

```jsx
  // ordered - received across the whole order; > 0 means the supplier
  // short-shipped and the gap is now permanent record, not edited history.
  const shortfall = (purchase) =>
    purchase.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity - (item.received ?? item.quantity)),
      0
    );
```

(`item.received ?? item.quantity` — orders completed before receipts existed have no `received`; treating them as fully received keeps history clean rather than flagging every old order as short.)

Render beside each completed order's header (match the existing Badge usage):

```jsx
  {shortfall(purchase) > 0 && (
    <Badge variant="danger">{shortfall(purchase)} short</Badge>
  )}
```

Also show the supplier name where each order renders its title/date: `purchase.supplierId?.name` with a fallback of nothing (legacy orders).

- [ ] **Step 4: Verify and commit**

Run: `cd frontend-admin && npx vite build && cd ../backend && JWT_SECRET=ci-test-secret npm test && cd .. && node scripts/check-shared-files.mjs`
Expected: all green. (frontend-admin is not in the lint matrix — build is its gate.)

```bash
git add -A
git commit -m "$(cat <<'EOF'
Show the back office who shipped short

Orders raised from the office can name their supplier, and the completed
ledger now shows the gap between ordered and received instead of having
edited it away — the supplier scorecard the overwrite used to destroy.
Orders from before receipts existed read as fully received rather than
retroactively short.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Final verification sweep and docs

**Files:**
- Modify: `README.md` (root — add the fourth app to the app list/ports table if one exists)
- Modify: `RELEASE-CHECKLIST.md` (add: create warehouse accounts, sign the storeroom device in)

**Interfaces:** none — this task ships no behaviour.

- [ ] **Step 1: The full CI-equivalent, everything at once**

```bash
cd backend && JWT_SECRET=ci-test-secret npm test
cd .. && node scripts/check-shared-files.mjs
cd frontend-parent && npm run lint -- --max-warnings 0 && npx vite build
cd ../hungerhunt-kiosk && npm run lint -- --max-warnings 0 && npx vite build
cd ../hungerhunt-warehouse && npm run lint -- --max-warnings 0 && npx vite build
cd ../frontend-admin && npx vite build
```
Expected: every command green. Fix anything red before the docs step.

- [ ] **Step 2: Boot smoke test (no DB, no Firebase)**

```bash
cd backend && JWT_SECRET=smoke PARENT_JWT_SECRET=smoke2 NODE_ENV=test node -e "
const app = (await import('./app.js')).default;
const s = app.listen(0, async () => {
  const p = s.address().port;
  for (const path of ['/api/suppliers', '/api/purchases/open', '/api/receipts']) {
    const r = await fetch('http://127.0.0.1:'+p+path);
    console.log(path, '->', r.status); // 401 = mounted and guarded
  }
  s.close();
});
" --input-type=module
```
Expected: every route answers 401 (mounted, guarded, not 404).

- [ ] **Step 3: Docs**

- Root `README.md`: add `hungerhunt-warehouse` wherever the other three apps are listed; note its dev port is pinned to 5176.
- `RELEASE-CHECKLIST.md`: add two lines under the appropriate section: "Create warehouse account(s) in the admin console (Account type → Warehouse)" and "Sign the storeroom device into hungerhunt-warehouse".

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "$(cat <<'EOF'
Write the storeroom into the manuals

The fourth app joins the README's map and the release checklist grows the
two steps a school actually performs: create the warehouse account, sign
the storeroom device in.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes (already applied)

- Every route referenced by a frontend page exists by the task that page ships in (History's `/api/receipts` is created in the same task that consumes it).
- Gate messages are exact strings, asserted in tests — changing one is a test change, deliberately.
- Legacy invariants each have a covering test: roleless rows/tokens (Task 1), supplier-less orders (Task 3), `received`-less completed orders rendering as not-short (Task 8, by construction).
- The kiosk (`protectStaff`) surface is untouched throughout — cashierRole.test.js runs unmodified except where routes deliberately changed gates (products GET, purchases POST), each with an explicit replacement test.
- Ports: 5176 pinned + CORS entry land in the same task (5) — the app is never runnable against the backend in a broken state.
