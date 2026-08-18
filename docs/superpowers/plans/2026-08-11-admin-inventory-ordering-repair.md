# Admin Inventory & Ordering Repair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the admin inventory/ordering path honest — products sellable from birth, stock adjustable on a ledger, products archivable instead of deletable, purchase orders cancellable — plus the reorder loop and the screens the spec names.

**Architecture:** Backend first (models → controllers → routes, each with DB-less `node:test` coverage), screens after. Every multi-write request either uses a guarded transition (`findOneAndUpdate` on expected status/stock) or compensates its partial writes, matching the house pattern in `purchaseController`/`receiptController`/`checkout.js`. Both sale paths (till bill, parent approval) charge through the single `chargeCart`, so the archived-product backstop is one check.

**Tech Stack:** Node/Express/Mongoose 8 (ESM), `node --test` with `mock.method` (no database in tests), React 19 + Vite frontends gated by build.

**Spec:** `docs/superpowers/specs/2026-08-11-admin-inventory-ordering-repair-design.md`

## Global Constraints

- **Never `git add -A` or `git add .`** — the working tree carries uncommitted kiosk changes (`hungerhunt-kiosk/src/kiosk.css`, `KioskBilling.jsx`, `Login.jsx`) from another session. Every commit step names its files. Before Task 11 (which edits `KioskBilling.jsx`), stop and ask the user how to handle those pre-existing edits.
- Missing `active` on a Product means active: every filter is written `active: { $ne: false }` (the roleless-admin pattern). Never `active: true`.
- `reorderLevel` default is **5** (today's hardcoded badge threshold). Low stock is `stock < reorderLevel`. 0 means "never flag".
- Blank prices are **absent, not 0** — "nobody said" (the receiving path's convention).
- Backend tests: DB-less, `node:test`, `mock.method` on models, app booted via `app.listen(0)`; follow `backend/tests/purchaseOrders.test.js` conventions exactly (env vars set before dynamic imports, `accountMatcher` for gate rows, `mock.restoreAll()` in `afterEach`).
- Run a single test file from `backend/`: `node --test tests/<file>.test.js`. Full suite: `JWT_SECRET=ci-test-secret npm test`.
- Frontends have no test runner; their gate is `npx vite build` in the app directory.
- Commit messages: narrative first line in the repo's voice (see `git log --oneline`), body optional, ending with `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.
- UI copy and furniture: reuse `PageHeader`, `Card`, `Badge`, `Banner`, `Button`, `EmptyState`, `Skeleton`, `RefreshButton` from `frontend-admin/src/components/ui`; toasts via `react-hot-toast`; INR via `formatINR` from `src/utils/format`.

## Codebase Orientation (read once before Task 1)

- `backend/app.js` mounts routers; `/api/products` → `productRoutes.js`, `/api/inventory` → `inventoryRoutes.js`, `/api/purchases` → `purchaseRoutes.js`.
- Gates (`backend/middleware/authMiddleware.js`): `protectAdmin` allows role `admin` (and roleless legacy rows); `protectWarehouse` allows `admin` + `warehouse`. A wrong-role staff token gets **403**, a bad/missing token **401**.
- `req.adminId` is set by every staff gate — use it for `adjustedBy`/`cancelledBy`.
- Quantity/money predicates live in `backend/utils/quantities.js`: `isNonNegativeNumber` (money, fractional ok), `isWholeNonNegative` (counts).
- `backend/utils/checkout.js` exports `chargeCart({ studentId, items })` → `{ ok: true, transaction, student }` or `{ ok: false, status, message }`. Both `transactionController.generateBill` and the pending-order approval call it.
- Test-side chainable-query mock (`findByIdChain` in `purchaseOrders.test.js`): a thenable whose `.populate()` returns itself. Copy it where needed.

---

### Task 1: A product is born with a shelf

**Files:**
- Modify: `backend/controllers/productController.js` (`addProduct`)
- Create: `backend/scripts/backfill-inventory-rows.mjs`
- Test: `backend/tests/productCatalog.test.js` (new file, grows in Task 2)

**Interfaces:**
- Consumes: existing `POST /api/products` (protectAdmin, multer `upload.single("image")` — JSON bodies pass through multer untouched, so tests may post JSON).
- Produces: the invariant later tasks assume — **every product has an Inventory row**; `POST /api/products` creates `{ productId, stock: 0 }` or fails whole.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/productCatalog.test.js`:

```js
// The catalogue's honesty: a product is created together with its shelf, or
// not at all — both sale screens draw the menu from Inventory, so a product
// without a row is invisible to every buyer with no admin action to fix it.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Product = (await import('../models/Product.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f191e810c19729de860ec';
const GROUP_ID = '507f191e810c19729de860e1';
const UNIT_ID = '507f191e810c19729de860e2';

const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const NEW_PRODUCT = {
  name: 'Samosa',
  stockGroup: GROUP_ID,
  unit: UNIT_ID,
  price: 12,
};

describe('creating a product', () => {
  test('creates its inventory row at stock 0 in the same request', async () => {
    accountIs('admin');
    mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));
    let shelf;
    mock.method(Inventory, 'create', async (doc) => { shelf = doc; return doc; });

    const res = await post('/api/products', NEW_PRODUCT);

    assert.equal(res.status, 201);
    assert.equal(String(shelf.productId), PRODUCT_ID);
    assert.equal(shelf.stock, 0);
  });

  test('a product whose shelf cannot be created is deleted again', async () => {
    accountIs('admin');
    mock.method(Product, 'create', async (doc) => ({ _id: PRODUCT_ID, ...doc }));
    mock.method(Inventory, 'create', async () => { throw new Error('db down'); });
    let deleted;
    mock.method(Product, 'findByIdAndDelete', async (id) => { deleted = id; return {}; });

    const res = await post('/api/products', NEW_PRODUCT);

    assert.equal(res.status, 400);
    assert.equal(String(deleted), PRODUCT_ID);
  });
});
```

- [ ] **Step 2: Run to verify both fail**

Run: `cd backend && node --test tests/productCatalog.test.js`
Expected: first test FAILS (`shelf` is undefined — nothing calls `Inventory.create`); second FAILS (`deleted` undefined). If the first *passes*, stop — the behaviour already exists and the task is misdrawn.

- [ ] **Step 3: Implement**

In `backend/controllers/productController.js`, inside `addProduct`, immediately after the `Product.create(...)` call and before `res.status(201)`:

```js
    // A product without a shelf is invisible to every sale screen and the
    // Inventory page alike, with nothing anywhere able to create the row
    // later except a goods receipt. So the catalogue row and its shelf are
    // created together or refused together.
    try {
      await Inventory.create({ productId: product._id, stock: 0 });
    } catch (err) {
      await Product.findByIdAndDelete(product._id).catch((rollbackErr) =>
        console.error("Product rollback failed", product._id, rollbackErr)
      );
      throw err;
    }
```

(`Inventory` is already imported at the top of the file.)

- [ ] **Step 4: Run to verify both pass**

Run: `cd backend && node --test tests/productCatalog.test.js`
Expected: PASS ×2.

- [ ] **Step 5: Write the backfill script**

Create `backend/scripts/backfill-inventory-rows.mjs` (create the `backend/scripts/` directory if absent):

```js
// One-off: give every existing product an Inventory row at stock 0.
// Products created before this repair only got a row on their first goods
// receipt, so anything added and never ordered against is invisible to the
// kiosk, the till, and the Inventory page. Idempotent — the upsert with
// $setOnInsert touches nothing that already has a shelf, so running it twice
// is safe and running it after the fix ships is a no-op.
//
// Run from backend/:  node scripts/backfill-inventory-rows.mjs
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set — run this from backend/ with its .env present.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const products = await Product.find().select('_id name').lean();
let created = 0;

for (const product of products) {
  const result = await Inventory.updateOne(
    { productId: product._id },
    { $setOnInsert: { stock: 0 } },
    { upsert: true }
  );

  if (result.upsertedCount) {
    created += 1;
    console.log(`shelved: ${product.name}`);
  }
}

console.log(`${created} inventory row(s) created; ${products.length - created} already had one.`);
await mongoose.disconnect();
```

Do **not** run it against any database as part of this plan — it is an operational step for the user (`RELEASE-CHECKLIST.md` gets a line in Task 12).

- [ ] **Step 6: Full suite, then commit**

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: all green (existing suites untouched by this change — `Product.create` callers in other tests will now also hit `Inventory.create`; if any existing product-creation test fails on an unmocked `Inventory.create`, add `mock.method(Inventory, 'create', async (d) => d)` to that test rather than weakening the controller).

```bash
git add backend/controllers/productController.js backend/scripts/backfill-inventory-rows.mjs backend/tests/productCatalog.test.js
git commit -m "$(cat <<'EOF'
Give every product a shelf from birth

Both sale screens draw the menu from Inventory, and a row only ever
appeared on the first goods receipt — so a new product was unsellable
until somebody ordered stock against it, with no shortcut. Creation now
makes the catalogue row and its zero-stock shelf together or not at all,
and a backfill script shelves everything from before.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Product honesty — archive flag, reorder level, a truthful updateProduct

**Files:**
- Modify: `backend/models/Product.js` (add `active`, `reorderLevel`)
- Modify: `backend/controllers/productController.js` (`getProducts`, `updateProduct`, remove `deleteProduct`)
- Modify: `backend/controllers/inventoryController.js` (sort by product name)
- Modify: `backend/routes/productRoutes.js` (retire DELETE)
- Test: `backend/tests/productCatalog.test.js` (extend)

**Interfaces:**
- Consumes: Task 1's test file scaffolding.
- Produces (later tasks rely on these exactly):
  - `Product.active: Boolean` (default true; absent = active), `Product.reorderLevel: Number` (default 5).
  - `GET /api/products` → active-only, name-sorted; `GET /api/products?all=1` → everything (both `protectWarehouse`, unchanged).
  - `PUT /api/products/:id` accepts any subset of `{ name, stockGroup, unit, price, reorderLevel, active }`; 404 unknown/garbage id; 400 bad values; only fields present are written.
  - `DELETE /api/products/:id` → 404 (route gone).
  - `GET /api/inventory` rows sorted by populated product name.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/productCatalog.test.js` (inside the file, after the existing describe; add `const put = ...` and `const del = ...` helpers beside `post`, and a `get` helper):

```js
const put = (path, body) =>
  fetch(base + path, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const del = (path) =>
  fetch(base + path, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  });

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${adminToken}` } });

// Models Product.find(filter).collation(...).sort(...).populate(...).populate(...)
// — a chain that resolves to its fixed result when awaited.
const findChain = (result) => {
  const chain = {
    collation: () => chain,
    sort: () => chain,
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('the catalogue list', () => {
  test('hides archived products by default and shows them under ?all=1', async () => {
    accountIs('admin');
    const filters = [];
    mock.method(Product, 'find', (filter) => { filters.push(filter); return findChain([]); });

    assert.equal((await get('/api/products')).status, 200);
    assert.equal((await get('/api/products?all=1')).status, 200);

    assert.deepEqual(filters[0], { active: { $ne: false } });
    assert.deepEqual(filters[1], {});
  });
});

describe('updating a product', () => {
  test('an id that matches nothing is 404, not 200 null', async () => {
    accountIs('admin');
    mock.method(Product, 'findByIdAndUpdate', async () => null);
    const res = await put(`/api/products/${PRODUCT_ID}`, { name: 'Kachori' });
    assert.equal(res.status, 404);
  });

  test('garbage ids are 404 without touching the database', async () => {
    accountIs('admin');
    const res = await put('/api/products/not-an-id', { name: 'Kachori' });
    assert.equal(res.status, 404);
  });

  test('writes only the fields the body actually carries', async () => {
    accountIs('admin');
    let written;
    mock.method(Product, 'findByIdAndUpdate', async (id, data) => { written = data; return { _id: id, ...data }; });

    const res = await put(`/api/products/${PRODUCT_ID}`, { active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(written, { active: false });
  });

  test('a fractional reorder level is refused', async () => {
    accountIs('admin');
    const res = await put(`/api/products/${PRODUCT_ID}`, { reorderLevel: 2.5 });
    assert.equal(res.status, 400);
  });

  test('a negative price is refused', async () => {
    accountIs('admin');
    const res = await put(`/api/products/${PRODUCT_ID}`, { price: -3 });
    assert.equal(res.status, 400);
  });
});

describe('deleting a product', () => {
  test('the route is gone — archive is the only removal', async () => {
    accountIs('admin');
    const res = await del(`/api/products/${PRODUCT_ID}`);
    assert.equal(res.status, 404);
  });
});
```

- [ ] **Step 2: Run to verify the new tests fail**

Run: `cd backend && node --test tests/productCatalog.test.js`
Expected: catalogue-list test fails (filter is `{}`... actually `Product.find()` is called with `undefined` — `filters[0]` is `undefined`); update tests fail (200 null → status 200; partial body writes undefined fields; 2.5 and -3 pass through as 200/500); delete test fails (200 "Product removed"). Task 1's tests still pass.

- [ ] **Step 3: Implement the model fields**

In `backend/models/Product.js`, after `image`:

```js
  // Money remembers products: orders, receipts and transactions reference
  // these rows forever, which is why there is no delete anywhere — the same
  // rule suppliers follow. Rows from before the field have no `active`;
  // absent means active, and every filter spells that out as
  // { active: { $ne: false } } because Mongo will not infer it.
  active: {
    type: Boolean,
    default: true
  },

  // The stock level below which the office should reorder. 5 was the
  // Inventory badge's hardcoded threshold before this field existed, so 5 is
  // the default that changes nothing. 0 means "never flag". Legacy rows read
  // as 5 through this default on hydration — the reads that use it are not
  // .lean().
  reorderLevel: {
    type: Number,
    default: 5
  }
```

- [ ] **Step 4: Implement the controller**

In `backend/controllers/productController.js`:

Add imports at the top:

```js
import mongoose from 'mongoose';
import { isNonNegativeNumber, isWholeNonNegative } from '../utils/quantities.js';
```

Replace `getProducts`:

```js
export const getProducts = async (req, res) => {
  try {
    // Active-only by default: both ordering screens build their lists here
    // and must not offer what is off sale. The admin catalogue asks for
    // everything so archived rows stay visible and restorable.
    const filter = req.query.all ? {} : { active: { $ne: false } };

    const products = await Product.find(filter)
      .collation({ locale: "en", strength: 2 })
      .sort({ name: 1 })
      .populate("stockGroup")
      .populate("unit");

    res.json(products);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};
```

Replace `updateProduct` entirely:

```js
export const updateProduct = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  try {
    // Only fields the body actually carries are written — an archive toggle
    // arrives alone, and must not drag undefined over the rest of the row.
    const updateData = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.stockGroup !== undefined) updateData.stockGroup = req.body.stockGroup;
    if (req.body.unit !== undefined) updateData.unit = req.body.unit;

    if (req.body.price !== undefined) {
      if (!isNonNegativeNumber(req.body.price)) {
        return res.status(400).json({ message: "Price must be a non-negative number." });
      }
      updateData.price = Number(req.body.price);
    }

    if (req.body.reorderLevel !== undefined) {
      if (!isWholeNonNegative(req.body.reorderLevel)) {
        return res.status(400).json({ message: "Reorder level must be a whole number of zero or more." });
      }
      updateData.reorderLevel = Number(req.body.reorderLevel);
    }

    // Forms send strings; both spellings of true mean true.
    if (req.body.active !== undefined) {
      updateData.active = req.body.active === true || req.body.active === "true";
    }

    if (req.file) {
      updateData.image = await uploadImage(req.file);
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    // A refusal the caller can fix is 400; only genuine failure is 500.
    const status =
      error.name === "ValidationError" || error.name === "CastError" ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
};
```

Delete the whole `deleteProduct` function.

In `backend/routes/productRoutes.js`: remove `deleteProduct` from the import and change the `/:id` route to PUT only:

```js
router.put(
  '/:id',
  protectAdmin,
  upload.single("image"),
  updateProduct
);
```

In `backend/controllers/inventoryController.js`, sort after populate (the query cannot sort by a populated field):

```js
export const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find().populate({
      path: "productId",
      populate: {
        path: "stockGroup"
      }
    });

    // Sorted here, by product name, so every screen that reads the shelf
    // agrees on the order — the query itself cannot sort a populated field.
    inventory.sort((a, b) =>
      (a.productId?.name || "").localeCompare(b.productId?.name || "", "en", {
        sensitivity: "base"
      })
    );

    res.json(inventory);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};
```

- [ ] **Step 5: Run the file, then the whole suite**

Run: `cd backend && node --test tests/productCatalog.test.js`
Expected: PASS ×9.

Run: `cd backend && JWT_SECRET=ci-test-secret npm test`
Expected: green. Watch `warehouseRole.test.js` in particular — it exercises `GET /api/products` under the warehouse gate; if it mocks `Product.find` with a differently-shaped chain (no `collation`/`sort`), extend that test's chain mock with `collation: () => chain, sort: () => chain` rather than changing the controller.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Product.js backend/controllers/productController.js backend/controllers/inventoryController.js backend/routes/productRoutes.js backend/tests/productCatalog.test.js
git commit -m "$(cat <<'EOF'
Products archive instead of vanishing

Same rule the suppliers already follow: money remembers products, so
DELETE is retired and removal is a flag the office can reverse. The
catalogue list hides archived rows unless asked for everything, orders by
name, and updateProduct stops answering a missing id with 200 null,
writing undefined over absent fields, or calling a validation failure a
500. Products also learn their reorder level, defaulting to the badge's
old hardcoded 5.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: The checkout backstop — archived means off sale, everywhere

**Files:**
- Modify: `backend/utils/checkout.js` (`chargeCart`)
- Test: `backend/tests/archivedCheckout.test.js` (new)

**Interfaces:**
- Consumes: `Product.active` from Task 2; `chargeCart({ studentId, items })` signature (unchanged).
- Produces: `chargeCart` refuses any line whose populated product has `active === false` with `{ ok: false, status: 400, message: "<name> is no longer sold." }`. Covers **both** callers (till bill and parent approval) because both charge through here.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/archivedCheckout.test.js`:

```js
// The server-side half of archiving: a till open since morning still shows
// yesterday's menu, so hiding an archived product client-side is not enough —
// the charge itself has to refuse it. Both sale paths (till bill, parent
// approval) go through chargeCart, so this is the one place.
import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { chargeCart } = await import('../utils/checkout.js');

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439021';
const PRODUCT_ID = '507f191e810c19729de860ec';

afterEach(() => mock.restoreAll());

// Inventory.findOne(...).populate(...) — a thenable chain fixed up front.
const findOneChain = (result) => {
  const chain = {
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('charging a cart with an archived product', () => {
  test('is refused by name before any stock or money moves', async () => {
    mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 500 }));
    mock.method(Inventory, 'findOne', () =>
      findOneChain({
        stock: 10,
        productId: { _id: PRODUCT_ID, name: 'Samosa', price: 12, active: false },
      })
    );
    let stockMoved = false;
    mock.method(Inventory, 'findOneAndUpdate', async () => { stockMoved = true; return null; });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /Samosa is no longer sold/);
    assert.equal(stockMoved, false);
  });

  test('a live product still charges normally past the check', async () => {
    mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 500 }));
    mock.method(Inventory, 'findOne', () =>
      findOneChain({
        stock: 10,
        productId: { _id: PRODUCT_ID, name: 'Samosa', price: 12, active: true },
      })
    );
    // Refuse at the stock decrement so the test ends before wallets and
    // transactions come into it — reaching this call is the assertion.
    let reachedDecrement = false;
    mock.method(Inventory, 'findOneAndUpdate', async () => { reachedDecrement = true; return null; });
    mock.method(Inventory, 'updateOne', async () => ({}));

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(reachedDecrement, true);
    assert.equal(result.status, 409);
  });
});
```

- [ ] **Step 2: Run to verify the first fails**

Run: `cd backend && node --test tests/archivedCheckout.test.js`
Expected: first test FAILS (result is a 409 stock-race refusal, not the 400 by name — and `stockMoved` is true). Second passes already; it pins the non-archived path so the fix can't overreach.

- [ ] **Step 3: Implement**

In `backend/utils/checkout.js`, inside the pricing loop, directly after the `if (!inventory || !inventory.productId)` block:

```js
    // Archived is off sale everywhere, including a till that loaded its menu
    // this morning and still shows the product. Absent means active — rows
    // from before the flag never carried one.
    if (inventory.productId.active === false) {
      return {
        ok: false,
        status: 400,
        message: `${inventory.productId.name} is no longer sold.`
      };
    }
```

- [ ] **Step 4: Run file, then suite**

Run: `cd backend && node --test tests/archivedCheckout.test.js` — PASS ×2.
Run: `cd backend && JWT_SECRET=ci-test-secret npm test` — green (existing checkout tests populate products without `active`, which reads as live).

- [ ] **Step 5: Commit**

```bash
git add backend/utils/checkout.js backend/tests/archivedCheckout.test.js
git commit -m "$(cat <<'EOF'
Refuse to sell an archived product at the charge itself

Hiding it from the menus is the client's half; this is the server's. Both
sale paths price through chargeCart, so one check covers the till and the
parent approval alike, and a screen open since morning cannot sell what
the office took off sale at lunch.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Stock adjustments, on a ledger

**Files:**
- Create: `backend/models/StockAdjustment.js`
- Modify: `backend/controllers/inventoryController.js` (add `adjustStock`, `getAdjustments`)
- Modify: `backend/routes/inventoryRoutes.js`
- Test: `backend/tests/stockAdjustments.test.js` (new)

**Interfaces:**
- Consumes: `protectAdmin`, `req.adminId`, `isWholeNonNegative`.
- Produces:
  - `POST /api/inventory/:productId/adjust` (protectAdmin) body `{ delta, reason }` → 201 `{ adjustment, stock }`; 400 bad delta/empty reason/below-zero; 404 unknown product/no row.
  - `GET /api/inventory/:productId/adjustments` (protectAdmin) → newest-first, `adjustedBy` populated `email role`, cap 100.
  - Model `StockAdjustment { productId, delta, reason, adjustedBy, stockAfter, timestamps }`.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/stockAdjustments.test.js`:

```js
// Manual stock movements — spoilage, breakage, stocktake, opening stock —
// with the same discipline as goods receipts: the Inventory number stays
// derivable, and every movement has a row saying who and why. No movement
// without a row, in either direction.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const StockAdjustment = (await import('../models/StockAdjustment.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f191e810c19729de860ec';

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

const accountIs = accountMatcher(Admin, STAFF_ID);

const adjust = (body, token = adminToken) =>
  fetch(`${base}/api/inventory/${PRODUCT_ID}/adjust`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

describe('adjusting stock', () => {
  test('a write-down books the movement and its ledger row together', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));
    let filter;
    mock.method(Inventory, 'findOneAndUpdate', async (f) => { filter = f; return { productId: PRODUCT_ID, stock: 7 }; });
    let row;
    mock.method(StockAdjustment, 'create', async (doc) => { row = doc; return { _id: 'a1', ...doc }; });

    const res = await adjust({ delta: -3, reason: 'stocktake: three tins rusted through' });

    assert.equal(res.status, 201);
    // The decrement is conditional — a stale screen cannot push stock negative.
    assert.deepEqual(filter, { productId: PRODUCT_ID, stock: { $gte: 3 } });
    assert.equal(row.delta, -3);
    assert.equal(row.stockAfter, 7);
    assert.equal(String(row.adjustedBy), STAFF_ID);
    assert.equal((await res.json()).stock, 7);
  });

  test('a write-down below what is on the shelf is refused with the real number', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 2 }));
    mock.method(Inventory, 'findOneAndUpdate', async () => null);

    const res = await adjust({ delta: -5, reason: 'oops' });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /Only 2 in stock/);
  });

  test('a ledger row that cannot be written takes the movement back with it', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));
    mock.method(Inventory, 'findOneAndUpdate', async () => ({ productId: PRODUCT_ID, stock: 15 }));
    mock.method(StockAdjustment, 'create', async () => { throw new Error('db down'); });
    let compensated;
    mock.method(Inventory, 'updateOne', async (f, update) => { compensated = update; return {}; });

    const res = await adjust({ delta: 5, reason: 'opening stock' });

    assert.equal(res.status, 500);
    assert.deepEqual(compensated, { $inc: { stock: -5 } });
  });

  test('zero, fractions, garbage, and empty reasons are refused', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));

    for (const body of [
      { delta: 0, reason: 'x' },
      { delta: 2.5, reason: 'x' },
      { delta: 'lots', reason: 'x' },
      { delta: true, reason: 'x' },
      { delta: 3, reason: '   ' },
      { reason: 'x' },
    ]) {
      const res = await adjust(body);
      assert.equal(res.status, 400, JSON.stringify(body));
    }
  });

  test('a warehouse account cannot adjust — 403, not a sign-out', async () => {
    accountIs('warehouse');
    const res = await adjust({ delta: 1, reason: 'x' }, warehouseToken);
    assert.equal(res.status, 403);
  });
});

describe('reading the ledger', () => {
  test('answers newest first with who, capped', async () => {
    accountIs('admin');
    const calls = {};
    const chain = {
      populate: (path, fields) => { calls.populate = [path, fields]; return chain; },
      sort: (s) => { calls.sort = s; return chain; },
      limit: (n) => { calls.limit = n; return chain; },
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    mock.method(StockAdjustment, 'find', (f) => { calls.filter = f; return chain; });

    const res = await fetch(`${base}/api/inventory/${PRODUCT_ID}/adjustments`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(calls.filter, { productId: PRODUCT_ID });
    assert.deepEqual(calls.populate, ['adjustedBy', 'email role']);
    assert.deepEqual(calls.sort, { createdAt: -1 });
    assert.equal(calls.limit, 100);
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && node --test tests/stockAdjustments.test.js`
Expected: FAIL at import (`../models/StockAdjustment.js` does not exist).

- [ ] **Step 3: Implement the model**

Create `backend/models/StockAdjustment.js`:

```js
import mongoose from "mongoose";

// The mirror of GoodsReceipt for movements that have no delivery behind
// them: spoilage, breakage, stocktake corrections, opening stock. The
// Inventory number stays derivable — receipts in, sales out, these rows for
// everything else — and every movement names who and why. stockAfter is
// recorded because sales do not write rows here, so without it the ledger
// would not read coherently beside them.
const stockAdjustmentSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
      index: true,
    },

    // Signed and whole: positive found stock, negative lost it. Never zero.
    delta: {
      type: Number,
      required: true,
    },

    reason: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },

    adjustedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      required: true,
    },

    // What the shelf read after this write landed.
    stockAfter: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("StockAdjustment", stockAdjustmentSchema);
```

- [ ] **Step 4: Implement the controller**

In `backend/controllers/inventoryController.js`, add imports and the two handlers:

```js
import mongoose from "mongoose";
import StockAdjustment from "../models/StockAdjustment.js";
```

```js
// What counts as an adjustment: a whole, signed, non-zero number — and typed,
// so a stray boolean or blank does not coerce its way onto the shelf (the
// quantities.js rationale, for a signed count).
const isWholeNonZero = (v) =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) &&
  Number.isInteger(Number(v)) &&
  Number(v) !== 0;

export const adjustStock = async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const { delta, reason } = req.body ?? {};
  const cleanReason = String(reason ?? "").trim().slice(0, 200);

  if (!isWholeNonZero(delta)) {
    return res.status(400).json({
      message: "The adjustment must be a whole number of units, positive or negative, and not zero."
    });
  }

  if (!cleanReason) {
    return res.status(400).json({
      message: "A reason is required — the ledger is the point of adjusting here."
    });
  }

  const d = Number(delta);

  try {
    // The row must already exist: products are born with one, and the
    // backfill shelved everything older. Its absence means the product id is
    // wrong, not that a shelf should be invented.
    const row = await Inventory.findOne({ productId });

    if (!row) {
      return res.status(404).json({ message: "No inventory row for this product." });
    }

    // A write-down is conditional the same way a sale is, so a stale screen
    // cannot push the shelf below zero. A write-up needs no guard.
    const updated = await Inventory.findOneAndUpdate(
      d < 0 ? { productId, stock: { $gte: -d } } : { productId },
      { $inc: { stock: d } },
      { new: true }
    );

    if (!updated) {
      const current = await Inventory.findOne({ productId });
      return res.status(400).json({
        message: `Only ${current?.stock ?? 0} in stock — that adjustment would take it below zero. Refresh and try again.`
      });
    }

    // No movement without a row, in either direction: if the ledger write
    // fails, the stock write is taken back and the whole request fails.
    try {
      const adjustment = await StockAdjustment.create({
        productId,
        delta: d,
        reason: cleanReason,
        adjustedBy: req.adminId,
        stockAfter: updated.stock,
      });

      return res.status(201).json({ adjustment, stock: updated.stock });
    } catch (err) {
      await Inventory.updateOne({ productId }, { $inc: { stock: -d } }).catch(
        (rollbackErr) =>
          console.error("Adjustment rollback failed for product", productId, rollbackErr)
      );
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getAdjustments = async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  try {
    const adjustments = await StockAdjustment.find({ productId })
      .populate("adjustedBy", "email role")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(adjustments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

In `backend/routes/inventoryRoutes.js`:

```js
import { getInventory, adjustStock, getAdjustments } from "../controllers/inventoryController.js";
import { orStudent, protectAdmin, protectAnyStaff } from "../middleware/authMiddleware.js";
```

and after the existing `router.get("/", ...)`:

```js
// Manual movements are the office's alone — the storeroom's stock changes
// arrive as goods receipts, and a student obviously never writes the shelf.
router.post("/:productId/adjust", protectAdmin, adjustStock);
router.get("/:productId/adjustments", protectAdmin, getAdjustments);
```

- [ ] **Step 5: Run file, then suite**

Run: `cd backend && node --test tests/stockAdjustments.test.js` — PASS ×7.
Run: `cd backend && JWT_SECRET=ci-test-secret npm test` — green.

- [ ] **Step 6: Commit**

```bash
git add backend/models/StockAdjustment.js backend/controllers/inventoryController.js backend/routes/inventoryRoutes.js backend/tests/stockAdjustments.test.js
git commit -m "$(cat <<'EOF'
Let the office move stock by hand, on a ledger

Spoilage, breakage, stocktakes and opening stock finally have a path that
is not a fake purchase order. Every movement is a signed whole number
with a required reason and who did it, written together with the stock or
not at all — the same no-movement-without-a-row discipline receipts keep,
and the same conditional floor that stops a stale screen selling below
zero stops it adjusting below zero.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Purchase orders can be cancelled

**Files:**
- Modify: `backend/models/Purchase.js` (status enum + `cancelledAt`, `cancelledBy`)
- Modify: `backend/controllers/purchaseController.js` (add `cancelPurchase`; widen `getCompletedPurchases`)
- Modify: `backend/routes/purchaseRoutes.js`
- Test: `backend/tests/purchaseCancellation.test.js` (new)

**Interfaces:**
- Consumes: `protectAdmin`, `req.adminId`.
- Produces:
  - `Purchase.status` enum: `["NEW", "PARTIAL", "COMPLETED", "CANCELLED"]`; fields `cancelledAt: Date`, `cancelledBy: ObjectId → Admin`.
  - `PUT /api/purchases/cancel/:id` (protectAdmin) → 200 with the cancelled order; 409 already closed; 404 unknown.
  - `GET /api/purchases/completed` now returns `status ∈ {COMPLETED, CANCELLED}` (still `.lean()`).

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/purchaseCancellation.test.js`:

```js
// The exit that is a statement about an order's future, not its past: a
// cancel voids what remains and touches nothing already booked — receipts
// stand, stock stands, received counts stand. Until now the only way out of
// a mistaken order was to close it as if a delivery arrived, which invents
// stock and files a receipt for a delivery that never came.
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
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PURCHASE_ID = '507f191e810c19729de860ed';

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

const accountIs = accountMatcher(Admin, STAFF_ID);

const cancel = (id, token = adminToken) =>
  fetch(`${base}/api/purchases/cancel/${id}`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}` },
  });

describe('cancelling an order', () => {
  test('only a still-open order transitions, stamped with who and when', async () => {
    accountIs('admin');
    let filter, update;
    mock.method(Purchase, 'findOneAndUpdate', async (f, u) => {
      filter = f; update = u;
      return { _id: PURCHASE_ID, status: 'CANCELLED' };
    });

    const res = await cancel(PURCHASE_ID);

    assert.equal(res.status, 200);
    assert.deepEqual(filter, { _id: PURCHASE_ID, status: { $in: ['NEW', 'PARTIAL'] } });
    assert.equal(update.status, 'CANCELLED');
    assert.equal(String(update.cancelledBy), STAFF_ID);
    assert.ok(update.cancelledAt instanceof Date);
  });

  test('an order already closed answers 409, not a second closing', async () => {
    accountIs('admin');
    mock.method(Purchase, 'findOneAndUpdate', async () => null);
    mock.method(Purchase, 'exists', async () => ({ _id: PURCHASE_ID }));

    const res = await cancel(PURCHASE_ID);
    assert.equal(res.status, 409);
  });

  test('an unknown order is 404', async () => {
    accountIs('admin');
    mock.method(Purchase, 'findOneAndUpdate', async () => null);
    mock.method(Purchase, 'exists', async () => null);

    assert.equal((await cancel(PURCHASE_ID)).status, 404);
    assert.equal((await cancel('not-an-id')).status, 404);
  });

  test('the storeroom cannot cancel — its exit is closing short', async () => {
    accountIs('warehouse');
    const res = await cancel(PURCHASE_ID, warehouseToken);
    assert.equal(res.status, 403);
  });
});

describe('the closed ledger', () => {
  test('lists completed and cancelled orders together', async () => {
    accountIs('admin');
    let filter;
    const chain = {
      populate: () => chain,
      lean: () => chain,
      then: (resolve, reject) => Promise.resolve([]).then(resolve, reject),
    };
    mock.method(Purchase, 'find', (f) => { filter = f; return chain; });

    const res = await fetch(`${base}/api/purchases/completed`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(filter, { status: { $in: ['COMPLETED', 'CANCELLED'] } });
  });
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `cd backend && node --test tests/purchaseCancellation.test.js`
Expected: cancel tests fail with 404 (route unmounted); ledger test fails on the filter (`{ status: "COMPLETED" }`).

- [ ] **Step 3: Implement the model**

In `backend/models/Purchase.js`:

```js
  status: {
    type: String,
    enum: ["NEW", "PARTIAL", "COMPLETED", "CANCELLED"],
    default: "NEW"
  },
```

and after `completedAt: Date`:

```js
  // A cancel is a statement about the order's future, not its past: receipts,
  // stock and received counts already booked all stand, and the remainder is
  // simply never coming. Admin-only — the storeroom's honest exit for an
  // abandoned order is closing it short at what actually arrived.
  cancelledAt: Date,

  cancelledBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Admin"
  }
```

- [ ] **Step 4: Implement controller + route**

In `backend/controllers/purchaseController.js`, change `getCompletedPurchases`'s filter:

```js
    const purchases = await Purchase.find({
      status: { $in: ["COMPLETED", "CANCELLED"] }
    })
```

(the surrounding lean/populate chain and its comment stay exactly as they are), and add at the end of the file:

```js
/* The exit for an order raised by mistake. Guarded the same way completion
   is — only a still-open order transitions, so two tabs cannot both cancel
   and a completed order cannot be un-completed by the back door. Nothing is
   compensated because nothing is undone: whatever receipts already booked
   stays booked, and the shortfall stays readable as ordered minus received. */
export const cancelPurchase = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  try {
    const cancelled = await Purchase.findOneAndUpdate(
      { _id: id, status: { $in: ["NEW", "PARTIAL"] } },
      { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: req.adminId },
      { new: true, runValidators: true }
    );

    if (!cancelled) {
      const exists = await Purchase.exists({ _id: id });

      return exists
        ? res.status(409).json({
            message: "This order is already closed — completed or cancelled elsewhere."
          })
        : res.status(404).json({ message: "Purchase not found" });
    }

    res.json(cancelled);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};
```

In `backend/routes/purchaseRoutes.js`, import `cancelPurchase` and add beside the other admin routes (above the `/:id` catch-alls):

```js
router.put("/cancel/:id", protectAdmin, cancelPurchase);
```

- [ ] **Step 5: Run file, then suite**

Run: `cd backend && node --test tests/purchaseCancellation.test.js` — PASS ×5.
Run: `cd backend && JWT_SECRET=ci-test-secret npm test` — green. `purchaseOrders.test.js` pins `getCompletedPurchases` behaviour in places; if it asserts the old `{ status: "COMPLETED" }` filter, update **that assertion** to the new `$in` — the widened ledger is the deliberate change here.

- [ ] **Step 6: Commit**

```bash
git add backend/models/Purchase.js backend/controllers/purchaseController.js backend/routes/purchaseRoutes.js backend/tests/purchaseCancellation.test.js
git commit -m "$(cat <<'EOF'
Give a mistaken purchase order a way out

CANCELLED joins the statuses: a guarded transition from NEW or PARTIAL,
stamped with who and when, that voids only what remains — receipts,
stock and received counts already booked all stand, and the shortfall
stays readable. Until now the only exit was closing the order as if a
delivery arrived, which invented stock and filed a receipt for a
delivery that never came. The closed ledger lists both endings.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: The Inventory page — adjust, history, archive badge, real reorder levels

**Files:**
- Modify: `frontend-admin/src/pages/Inventory.jsx`

**Interfaces:**
- Consumes: `POST /api/inventory/:productId/adjust` `{ delta, reason }` → 201 `{ adjustment, stock }` / 400 `{ message }`; `GET /api/inventory/:productId/adjustments` → `[{ delta, reason, stockAfter, createdAt, adjustedBy: { email } }]`; `PUT /api/products/:id` partial bodies (Task 2); inventory rows now carrying `productId.reorderLevel` and `productId.active`.
- Produces: nothing consumed later — leaf task.

- [ ] **Step 1: Implement**

All edits in `frontend-admin/src/pages/Inventory.jsx`.

**1a — state.** Alongside the existing state hooks:

```jsx
  const [editReorderLevel, setEditReorderLevel] = useState("");
  const [adjusting, setAdjusting] = useState(null); // inventory row being adjusted
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // product whose ledger is open
  const [history, setHistory] = useState(null); // null = loading
```

**1b — low stock uses the product's own level.** Replace `const isLowStock = (item.stock || 0) < 5;` with:

```jsx
                const reorderLevel = item.productId?.reorderLevel ?? 5;
                const isLowStock = (item.stock || 0) < reorderLevel;
                const archived = item.productId?.active === false;
```

**1c — reorder level in the edit modal.** `startEdit` also sets it:

```jsx
    setEditReorderLevel(product?.reorderLevel ?? 5);
```

`saveEdit` sends it (in the `api.put` body):

```jsx
      const level = parseInt(editReorderLevel, 10);
      await api.put(`/products/${editingProduct}`, {
        name: editName.trim(),
        price: isNaN(updatedPrice) ? 0 : updatedPrice,
        ...(isNaN(level) || level < 0 ? {} : { reorderLevel: level }),
      });
```

and the modal gains, after the price field:

```jsx
            <label className="field-label" htmlFor="edit-reorder">
              Reorder level (flag when stock falls below this; 0 never flags)
            </label>
            <input
              id="edit-reorder"
              type="number"
              min="0"
              step="1"
              className="input"
              value={editReorderLevel}
              onChange={(e) => setEditReorderLevel(e.target.value)}
            />
```

**1d — archive replaces delete.** Remove the `deleteProduct` function (its endpoint is gone). In its place:

```jsx
  const setArchived = async (product, archived) => {
    if (!product?._id) return;
    if (
      archived &&
      !window.confirm(
        `Archive ${product.name}? It disappears from sale everywhere; its stock and history stay, and you can restore it from here or the Products page.`
      )
    )
      return;

    try {
      await api.put(`/products/${product._id}`, { active: !archived });
      await fetchInventory();
      toast.success(archived ? "Product archived" : "Product restored");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to update product");
    }
  };
```

In the row's Actions cell, replace the Delete button with:

```jsx
                        <Button
                          variant={archived ? "success" : "danger"}
                          className="btn--sm"
                          onClick={() => setArchived(item.productId, !archived)}
                          disabled={!item.productId?._id}
                        >
                          {archived ? "Restore" : "Archive"}
                        </Button>
```

and add two more actions beside Edit:

```jsx
                        <Button
                          className="btn--sm"
                          onClick={() => {
                            setAdjusting(item);
                            setAdjustDelta("");
                            setAdjustReason("");
                          }}
                          disabled={!item.productId}
                        >
                          Adjust
                        </Button>
                        <Button
                          variant="ghost"
                          className="btn--sm"
                          onClick={() => openHistory(item.productId)}
                          disabled={!item.productId}
                        >
                          History
                        </Button>
```

**1e — badge the archived rows.** In the Product cell, after the name:

```jsx
                      {archived && (
                        <Badge variant="neutral" style={{ marginLeft: 8 }}>
                          Archived
                        </Badge>
                      )}
```

**1f — the adjust modal.** Add beside the edit modal:

```jsx
      {adjusting && (
        <div className="modal-backdrop" onClick={() => !savingAdjust && setAdjusting(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAdjustment}
          >
            <h3 className="modal-title">Adjust Stock — {adjusting.productId?.name}</h3>
            <p style={{ marginBottom: 14, color: "var(--muted-soft)" }}>
              Currently {adjusting.stock || 0} in stock. Positive adds units,
              negative removes them; every adjustment is recorded with your
              account and the reason.
            </p>

            <label className="field-label" htmlFor="adjust-delta">
              Adjustment (whole units, e.g. -3 or 12)
            </label>
            <input
              id="adjust-delta"
              type="number"
              step="1"
              className="input"
              style={{ marginBottom: 14 }}
              required
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
            />

            <label className="field-label" htmlFor="adjust-reason">
              Reason
            </label>
            <input
              id="adjust-reason"
              type="text"
              className="input"
              maxLength={200}
              required
              placeholder="e.g. stocktake correction, spoiled in storage"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="submit" variant="success" disabled={savingAdjust}>
                {savingAdjust ? "Saving…" : "Apply Adjustment"}
              </Button>
              <Button variant="ghost" onClick={() => setAdjusting(null)} disabled={savingAdjust}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
```

with its handler:

```jsx
  const submitAdjustment = async (e) => {
    e.preventDefault();

    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      toast.error("Enter a whole number of units, positive or negative.");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setSavingAdjust(true);

    try {
      await api.post(`/inventory/${adjusting.productId._id}/adjust`, {
        delta,
        reason: adjustReason.trim(),
      });
      await fetchInventory();
      setAdjusting(null);
      toast.success("Stock adjusted");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to adjust stock");
    } finally {
      setSavingAdjust(false);
    }
  };
```

**1g — the history modal.**

```jsx
  const openHistory = async (product) => {
    if (!product?._id) return;
    setHistoryFor(product);
    setHistory(null);

    try {
      const res = await api.get(`/inventory/${product._id}/adjustments`);
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setHistory([]);
      toast.error("Failed to load the adjustment history");
    }
  };
```

```jsx
      {historyFor && (
        <div className="modal-backdrop" onClick={() => setHistoryFor(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Adjustments — {historyFor.name}</h3>

            {history === null ? (
              <Skeleton height={16} style={{ marginTop: 10 }} />
            ) : history.length === 0 ? (
              <p style={{ color: "var(--muted-soft)" }}>
                No manual adjustments recorded. Receipts and sales move stock
                without appearing here.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Change</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th>Stock after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row._id}>
                        <td>{new Date(row.createdAt).toLocaleString()}</td>
                        <td style={{ fontWeight: 600, color: row.delta < 0 ? "var(--danger)" : "var(--success)" }}>
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </td>
                        <td>{row.reason}</td>
                        <td>{row.adjustedBy?.email || "—"}</td>
                        <td>{row.stockAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setHistoryFor(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 2: Build**

Run: `cd frontend-admin && npx vite build`
Expected: build succeeds. Fix any unused-import or reference errors it surfaces (e.g. `Badge` must be in the ui import — it already is).

- [ ] **Step 3: Commit**

```bash
git add frontend-admin/src/pages/Inventory.jsx
git commit -m "$(cat <<'EOF'
Teach the Inventory page to move stock and explain itself

Adjust with a required reason, a per-product ledger of who moved what and
why, archive/restore in place of the delete that no longer exists, and
the low-stock badge reads each product's own reorder level instead of a
hardcoded five.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: The Products page — archive, restore, and the columns that end screen-hopping

**Files:**
- Modify: `frontend-admin/src/pages/Products.jsx`

**Interfaces:**
- Consumes: `GET /api/products?all=1`, `PUT /api/products/:id` partial bodies, `Product.reorderLevel`/`active` (Task 2); `formatINR` from `../utils/format`.
- Produces: leaf task.

- [ ] **Step 1: Implement**

All edits in `frontend-admin/src/pages/Products.jsx`.

**1a —** `fetchProducts` asks for everything: `api.get('/products?all=1')`.

**1b —** `EMPTY_FORM` gains `reorderLevel: '5'`; import `formatINR`:

```jsx
import { formatINR } from '../utils/format';
```

**1c —** `handleSave` appends it (beside the other `data.append` calls):

```jsx
      data.append('reorderLevel', form.reorderLevel === '' ? '5' : form.reorderLevel);
```

**1d —** `handleEditInit` carries it:

```jsx
      reorderLevel: String(product.reorderLevel ?? 5),
```

(add to the `setForm({...})` object).

**1e —** the form modal gains the field after Selling Price:

```jsx
              <div>
                <label className="field-label" htmlFor="product-reorder">
                  Reorder Level (flag when stock falls below this; 0 never flags)
                </label>
                <input
                  id="product-reorder"
                  type="number"
                  min="0"
                  step="1"
                  className="input"
                  required
                  value={form.reorderLevel}
                  onChange={(e) => setForm({ ...form, reorderLevel: e.target.value })}
                />
              </div>
```

**1f —** replace `handleDelete` with archive/restore:

```jsx
  const setArchived = async (product, archived) => {
    if (
      archived &&
      !window.confirm(
        `Archive ${product.name}? It disappears from sale everywhere; its stock and history stay, and you can restore it any time.`
      )
    )
      return;

    try {
      await api.put(`/products/${product._id}`, { active: !archived });
      if (editingId === product._id) clearForm();
      toast.success(archived ? 'Product archived' : 'Product restored');
      fetchProducts();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Failed to update product');
    }
  };
```

**1g —** table head gains two columns between Unit and Actions:

```jsx
                <th style={{ width: 120 }}>Price</th>
                <th style={{ width: 130 }}>Reorder level</th>
```

and each row (before Actions):

```jsx
                  <td data-label="Price" style={{ fontWeight: 600, color: 'var(--primary)' }}>
                    {formatINR(p.price || 0)}
                  </td>
                  <td data-label="Reorder level">{p.reorderLevel ?? 5}</td>
```

**1h —** badge archived rows in the name cell and swap the Delete button:

```jsx
                  <td data-label="Product">
                    <strong>{p.name}</strong>
                    {p.active === false && (
                      <Badge variant="neutral" style={{ marginLeft: 8 }}>
                        Archived
                      </Badge>
                    )}
                  </td>
```

(add `Badge` to the ui import), and in Actions:

```jsx
                      <Button
                        variant={p.active === false ? 'success' : 'danger'}
                        className="btn--sm"
                        onClick={() => setArchived(p, p.active !== false)}
                      >
                        {p.active === false ? 'Restore' : 'Archive'}
                      </Button>
```

- [ ] **Step 2: Build**

Run: `cd frontend-admin && npx vite build` — succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend-admin/src/pages/Products.jsx
git commit -m "$(cat <<'EOF'
Let the catalogue archive, restore, and stop making you hop screens

Delete becomes Archive with a Restore beside it, archived rows stay
visible and badged under ?all=1, and the table finally shows price and
reorder level so managing one item is one screen's work.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Order with your eyes open — stock and unit cost on the Purchase page

**Files:**
- Modify: `frontend-admin/src/pages/Purchase.jsx`

**Interfaces:**
- Consumes: `GET /api/inventory` (rows `{ productId: { _id, reorderLevel }, stock }`), `POST /api/purchases` accepting `items[].purchasePrice` (already true — `normalizeItems` stores it); `Badge` and `formatINR`.
- Produces: leaf task.

- [ ] **Step 1: Implement**

All edits in `frontend-admin/src/pages/Purchase.jsx`.

**1a —** imports: add `Badge` to the ui import.

**1b —** load inventory alongside products. Replace `fetchProducts` body:

```jsx
  const fetchProducts = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [productsRes, inventoryRes] = await Promise.all([
        api.get("/products"),
        api.get("/inventory"),
      ]);

      // Stock keyed by product so each order line can show the shelf it is
      // reordering for. A product with no row yet reads as 0.
      const stockByProduct = {};
      (Array.isArray(inventoryRes.data) ? inventoryRes.data : []).forEach((row) => {
        if (row.productId?._id) stockByProduct[row.productId._id] = row.stock || 0;
      });

      setProducts(
        productsRes.data.map((product) => ({
          ...product,
          quantity: 0,
          purchasePrice: "",
          currentStock: stockByProduct[product._id] ?? 0,
        }))
      );
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };
```

**1c —** a second field updater beside `updateQuantity`:

```jsx
  const updatePurchasePrice = (id, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product._id === id ? { ...product, purchasePrice: value } : product
      )
    );
  };
```

**1d —** `createPurchase` sends the cost only when one was typed (blank means "nobody said", the receiving path's convention — never send 0 for silence):

```jsx
    const selectedItems = products
      .filter((p) => p.quantity > 0)
      .map((p) => {
        const cost = parseFloat(p.purchasePrice);
        return {
          productId: p._id,
          quantity: p.quantity,
          ...(p.purchasePrice !== "" && !isNaN(cost) && cost >= 0
            ? { purchasePrice: cost }
            : {}),
        };
      });
```

and the reset line becomes:

```jsx
      setProducts((prev) => prev.map((p) => ({ ...p, quantity: 0, purchasePrice: "" })));
```

**1e —** the table gains two columns. Head, after Unit:

```jsx
                <th style={{ width: 130 }}>Current Stock</th>
```

and after Purchase Quantity:

```jsx
                <th style={{ width: 160 }}>Expected Unit Cost (₹)</th>
```

Row cells — after the Unit cell:

```jsx
                  <td data-label="Current Stock">
                    {product.currentStock < (product.reorderLevel ?? 5) ? (
                      <Badge variant="alert">
                        <span aria-hidden="true">⚠︎</span>
                        {product.currentStock} left
                      </Badge>
                    ) : (
                      <span>{product.currentStock}</span>
                    )}
                  </td>
```

and after the Quantity cell:

```jsx
                  <td data-label="Unit Cost">
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="—"
                      className="input"
                      style={{ width: 120, textAlign: "center" }}
                      aria-label={`Expected unit cost for ${product.name}`}
                      value={product.purchasePrice}
                      onChange={(e) => updatePurchasePrice(product._id, e.target.value)}
                    />
                  </td>
```

(Archived products never appear here — `GET /products` is active-only since Task 2.)

- [ ] **Step 2: Build**

Run: `cd frontend-admin && npx vite build` — succeeds.

- [ ] **Step 3: Commit**

```bash
git add frontend-admin/src/pages/Purchase.jsx
git commit -m "$(cat <<'EOF'
Stop ordering blind from the back office

The Purchase page catches up with the storeroom's screen: current stock
beside every product with the low ones flagged at their own reorder
level, and an expected unit cost that actually gets sent — the endpoint
took one all along, this screen just never offered the box.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: The Purchased page — cancel, the Closed tab, and the delivery ledger

**Files:**
- Modify: `frontend-admin/src/pages/Purchased.jsx`

**Interfaces:**
- Consumes: `PUT /api/purchases/cancel/:id` (Task 5); `GET /api/purchases/completed` now including CANCELLED rows with `cancelledAt`; `GET /api/purchases/:id/receipts` → `[{ createdAt, invoiceNumber, note, receivedBy: { email }, lines: [{ productId: { name }, received, damaged, reason }] }]` (existing route, admits admin).
- Produces: leaf task.

- [ ] **Step 1: Implement**

All edits in `frontend-admin/src/pages/Purchased.jsx`.

**1a — state.**

```jsx
  const [cancellingId, setCancellingId] = useState(null);
  const [openReceipts, setOpenReceipts] = useState({}); // purchaseId -> rows | "loading"
```

**1b — the closed list sorts by whichever ending it had.** In `loadData`, replace the completed sort:

```jsx
      setCompletedPurchases(
        completedRes.data.sort(
          (a, b) =>
            new Date(b.completedAt ?? b.cancelledAt ?? 0) -
            new Date(a.completedAt ?? a.cancelledAt ?? 0)
        )
      );
```

**1c — cancel.**

```jsx
  const cancelOrder = async (purchase) => {
    const started = purchase.items.some((item) => (item.received || 0) > 0);

    if (
      !window.confirm(
        started
          ? "Cancel the rest of this order? Deliveries already booked stay booked — only what is still outstanding is voided."
          : "Cancel this order? Nothing has been received against it."
      )
    )
      return;

    setCancellingId(purchase._id);

    try {
      await api.put(`/purchases/cancel/${purchase._id}`);
      await loadData();
      toast.success("Order cancelled");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to cancel the order");
      // Closed elsewhere — this list is stale.
      if (err.response?.status === 409) await loadData();
    } finally {
      setCancellingId(null);
    }
  };
```

**1d — the receipts expander**, usable from both tabs:

```jsx
  const toggleReceipts = async (purchaseId) => {
    if (openReceipts[purchaseId]) {
      setOpenReceipts((prev) => {
        const next = { ...prev };
        delete next[purchaseId];
        return next;
      });
      return;
    }

    setOpenReceipts((prev) => ({ ...prev, [purchaseId]: "loading" }));

    try {
      const res = await api.get(`/purchases/${purchaseId}/receipts`);
      setOpenReceipts((prev) => ({
        ...prev,
        [purchaseId]: Array.isArray(res.data) ? res.data : [],
      }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load the deliveries for this order");
      setOpenReceipts((prev) => {
        const next = { ...prev };
        delete next[purchaseId];
        return next;
      });
    }
  };
```

with one shared renderer, defined above the `return`:

```jsx
  const receiptsBlock = (purchase) => {
    const rows = openReceipts[purchase._id];

    return (
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" className="btn--sm" onClick={() => toggleReceipts(purchase._id)}>
          {rows ? "Hide deliveries" : "View deliveries"}
        </Button>

        {rows === "loading" ? (
          <Skeleton height={16} style={{ marginTop: 10 }} />
        ) : Array.isArray(rows) && rows.length === 0 ? (
          <p style={{ marginTop: 10, color: "var(--muted-soft)" }}>
            No deliveries have been booked against this order.
          </p>
        ) : Array.isArray(rows) ? (
          rows.map((receipt) => (
            <div key={receipt._id} className="card" style={{ marginTop: 10, padding: 14 }}>
              <p className="card-meta" style={{ marginBottom: 8 }}>
                {new Date(receipt.createdAt).toLocaleString()}
                {receipt.receivedBy?.email ? ` · received by ${receipt.receivedBy.email}` : ""}
                {receipt.invoiceNumber ? ` · invoice ${receipt.invoiceNumber}` : ""}
              </p>
              {receipt.note && (
                <p style={{ marginBottom: 8, color: "var(--muted-soft)" }}>{receipt.note}</p>
              )}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 110 }}>Received</th>
                      <th style={{ width: 110 }}>Damaged</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map((line, i) => (
                      <tr key={line.productId?._id || i}>
                        <td>{line.productId?.name || "Unlinked product"}</td>
                        <td>{line.received || 0}</td>
                        <td style={{ color: line.damaged > 0 ? "var(--danger)" : undefined }}>
                          {line.damaged || 0}
                        </td>
                        <td>{line.reason || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : null}
      </div>
    );
  };
```

**1e — wire it in.** On the pending tab, beside the Complete button (wrap both in a flex row) add Cancel, then the expander below:

```jsx
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    variant="success"
                    onClick={() => completePurchase(purchase)}
                    disabled={completingId !== null || cancellingId !== null}
                  >
                    {completing ? "Completing…" : "Complete & Apply Stock"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => cancelOrder(purchase)}
                    disabled={completingId !== null || cancellingId !== null}
                  >
                    {cancellingId === purchase._id ? "Cancelling…" : "Cancel order"}
                  </Button>
                </div>
                {receiptsBlock(purchase)}
```

On the closed tab, add `{receiptsBlock(purchase)}` as the last child of each Card.

**1f — the Closed tab.** Rename the tab label from `Completed` to `Closed`, and in each closed card:

```jsx
                const cancelled = purchase.status === "CANCELLED";
```

header meta line becomes:

```jsx
                  <p className="card-meta">
                    {cancelled
                      ? `Cancelled on ${new Date(purchase.cancelledAt).toLocaleString()}`
                      : `Closed on ${new Date(purchase.completedAt).toLocaleString()}`}
                    {purchase.supplierId?.name ? ` · ${purchase.supplierId.name}` : ""}
                  </p>
```

and the badges: show the shortfall badge only when `!cancelled` (a cancelled order's gap is voided, not owed), and add:

```jsx
                  {cancelled && <Badge variant="alert">Cancelled</Badge>}
```

(the empty-state copy for the tab changes from "Orders you complete will be archived here." to "Orders you complete or cancel are archived here.").

- [ ] **Step 2: Build**

Run: `cd frontend-admin && npx vite build` — succeeds (add `Skeleton` to the ui import if the build flags it; it is already imported in this file).

- [ ] **Step 3: Commit**

```bash
git add frontend-admin/src/pages/Purchased.jsx
git commit -m "$(cat <<'EOF'
Let the office cancel an order and read the deliveries behind it

A Cancel beside Complete that voids only what is still outstanding, a
Closed tab that shows both endings with cancelled orders badged instead
of shortfall-shamed, and View deliveries on every order — the receipts
ledger existed for months with no admin screen willing to look at it.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: A Suppliers screen

**Files:**
- Create: `frontend-admin/src/pages/Suppliers.jsx`
- Modify: `frontend-admin/src/App.jsx` (route)
- Modify: `frontend-admin/src/components/Layout.jsx` (sidebar entry)

**Interfaces:**
- Consumes: `GET /api/suppliers?all=1`, `POST /api/suppliers` `{ name, phone, contactPerson, notes }`, `PUT /api/suppliers/:id` (any subset incl. `active`) — all existing.
- Produces: leaf task.

- [ ] **Step 1: Create the page**

Create `frontend-admin/src/pages/Suppliers.jsx`:

```jsx
import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

const EMPTY_FORM = { name: "", phone: "", contactPerson: "", notes: "" };

const Suppliers = () => {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchSuppliers();
  }, []);

  const fetchSuppliers = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      // Everything, including deactivated — orders reference these rows
      // forever, so removal is a toggle and the history stays visible here.
      const res = await api.get("/suppliers?all=1");
      setSuppliers(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const openAdd = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setIsFormOpen(true);
  };

  const openEdit = (supplier) => {
    setForm({
      name: supplier.name || "",
      phone: supplier.phone || "",
      contactPerson: supplier.contactPerson || "",
      notes: supplier.notes || "",
    });
    setEditingId(supplier._id);
    setIsFormOpen(true);
  };

  const handleSave = async (e) => {
    e.preventDefault();

    if (!form.name.trim()) {
      toast.error("Supplier name is required");
      return;
    }

    setSaving(true);

    try {
      const body = {
        name: form.name.trim(),
        phone: form.phone.trim(),
        contactPerson: form.contactPerson.trim(),
        notes: form.notes.trim(),
      };

      if (editingId) {
        await api.put(`/suppliers/${editingId}`, body);
        toast.success("Supplier updated");
      } else {
        await api.post("/suppliers", body);
        toast.success("Supplier added");
      }

      setIsFormOpen(false);
      fetchSuppliers();
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to save supplier");
    } finally {
      setSaving(false);
    }
  };

  const setActive = async (supplier, active) => {
    try {
      await api.put(`/suppliers/${supplier._id}`, { active });
      fetchSuppliers();
      toast.success(active ? "Supplier reactivated" : "Supplier deactivated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update supplier");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Suppliers"
        subtitle="Who the school buys from. Deactivate rather than delete — orders keep their history."
        actions={<Button onClick={openAdd}>+ Add Supplier</Button>}
      />

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load suppliers. Check your connection and{" "}
          <button type="button" className="link-button" onClick={fetchSuppliers}>
            try again
          </button>
          .
        </Banner>
      ) : suppliers.length === 0 ? (
        <EmptyState
          icon="🚚"
          title="No suppliers yet"
          action={<Button onClick={openAdd}>+ Add Supplier</Button>}
        >
          Add the people you order from so purchase orders can name them.
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                <th>Name</th>
                <th>Contact Person</th>
                <th>Phone</th>
                <th>Notes</th>
                <th style={{ width: 200 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s._id}>
                  <td data-label="Name">
                    <strong>{s.name}</strong>
                    {s.active === false && (
                      <Badge variant="neutral" style={{ marginLeft: 8 }}>
                        Inactive
                      </Badge>
                    )}
                  </td>
                  <td data-label="Contact">{s.contactPerson || "—"}</td>
                  <td data-label="Phone">{s.phone || "—"}</td>
                  <td data-label="Notes">{s.notes || ""}</td>
                  <td data-label="Actions">
                    <div style={{ display: "flex", gap: 8 }}>
                      <Button className="btn--sm" onClick={() => openEdit(s)}>
                        Edit
                      </Button>
                      <Button
                        variant={s.active === false ? "success" : "danger"}
                        className="btn--sm"
                        onClick={() => setActive(s, s.active === false)}
                      >
                        {s.active === false ? "Reactivate" : "Deactivate"}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {isFormOpen && (
        <div className="modal-backdrop" onClick={() => !saving && setIsFormOpen(false)}>
          <form className="modal" onClick={(e) => e.stopPropagation()} onSubmit={handleSave}>
            <h3 className="modal-title">{editingId ? "Edit Supplier" : "Add Supplier"}</h3>

            <label className="field-label" htmlFor="supplier-name">
              Name
            </label>
            <input
              id="supplier-name"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-contact">
              Contact Person
            </label>
            <input
              id="supplier-contact"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              value={form.contactPerson}
              onChange={(e) => setForm({ ...form, contactPerson: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-phone">
              Phone
            </label>
            <input
              id="supplier-phone"
              type="tel"
              className="input"
              style={{ marginBottom: 14 }}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />

            <label className="field-label" htmlFor="supplier-notes">
              Notes
            </label>
            <input
              id="supplier-notes"
              type="text"
              className="input"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />

            <div className="modal-actions">
              <Button type="submit" variant="success" disabled={saving}>
                {saving ? "Saving…" : editingId ? "Save Changes" : "Add Supplier"}
              </Button>
              <Button variant="ghost" onClick={() => setIsFormOpen(false)} disabled={saving}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Suppliers;
```

- [ ] **Step 2: Route and sidebar**

In `frontend-admin/src/App.jsx`: `import Suppliers from './pages/Suppliers';` and inside the protected route block:

```jsx
  <Route path="/suppliers" element={<Suppliers />} />
```

In `frontend-admin/src/components/Layout.jsx`, in the nav items array after the `/purchase` entry:

```jsx
  { path: "/suppliers", label: "Suppliers", icon: "🚚" },
```

- [ ] **Step 3: Build**

Run: `cd frontend-admin && npx vite build` — succeeds.

- [ ] **Step 4: Commit**

```bash
git add frontend-admin/src/pages/Suppliers.jsx frontend-admin/src/App.jsx frontend-admin/src/components/Layout.jsx
git commit -m "$(cat <<'EOF'
Give suppliers a screen instead of a curl command

The routes existed with no UI at all — the order form asked you to pick
a supplier nobody could create. List, add, edit, deactivate and
reactivate; no delete, because the money remembers them.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: The sale screens stop showing archived products

⚠️ **Before touching anything:** `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (and `Login.jsx`, `kiosk.css`) carry uncommitted changes from another session. **Stop and ask the user** whether to commit or stash those first. Do not proceed until the working tree state of those files is resolved; never bundle their edits into this task's commit.

**Files:**
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (one filter)
- Modify: `frontend-admin/src/pages/Billing.jsx` (one filter)

**Interfaces:**
- Consumes: `productId.active` on `/inventory` rows (Task 2's model change; the populate already carries every product field).
- Produces: leaf task.

- [ ] **Step 1: Kiosk filter**

In `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, in `loadInventory`, extend the existing filter:

```jsx
          .filter(
            (item) =>
              item.stock > 0 &&
              item.productId &&
              // Archived is off sale; absent means the row predates the flag.
              item.productId.active !== false
          )
```

- [ ] **Step 2: Admin Billing filter**

In `frontend-admin/src/pages/Billing.jsx`, same change to its catalog filter:

```jsx
        .filter(
          (item) =>
            item.productId && item.stock > 0 && item.productId.active !== false
        )
```

- [ ] **Step 3: Build both**

Run: `cd hungerhunt-kiosk && npx vite build && cd ../frontend-admin && npx vite build`
Expected: both succeed.

- [ ] **Step 4: Commit**

Only if the pre-existing kiosk edits were resolved (committed/stashed by the user) — otherwise hand the diff back and let the user commit:

```bash
git add hungerhunt-kiosk/src/pages/KioskBilling.jsx frontend-admin/src/pages/Billing.jsx
git commit -m "$(cat <<'EOF'
Hide archived products from both menus

The client half of archiving: the kiosk and the admin till drop rows
whose product is off sale, alongside the server-side refusal that
already guards a screen that loaded before the archive happened.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Verification sweep and docs

**Files:**
- Modify: `RELEASE-CHECKLIST.md` (backfill line)
- Modify: `FIX-PLAN.md` (strike the now-done deferred items)

- [ ] **Step 1: The whole gate, in one run**

```bash
cd backend && JWT_SECRET=ci-test-secret npm test && cd ../frontend-admin && npx vite build && cd ../hungerhunt-kiosk && npx vite build && cd ../hungerhunt-warehouse && npx vite build && cd ..
```

Expected: tests green, three builds clean (warehouse built even though untouched — it consumes `GET /products`, whose default filter changed).

- [ ] **Step 2: Route sweep**

From `backend/` with the dev server bootable, confirm the new routes are mounted and guarded (401 without a token, not 404):

```bash
node -e "
import('./app.js').then(async ({ default: app }) => {
  const s = app.listen(0);
  await new Promise((r) => s.once('listening', r));
  const p = s.address().port;
  const checks = [
    ['POST', '/api/inventory/507f191e810c19729de860ec/adjust'],
    ['GET', '/api/inventory/507f191e810c19729de860ec/adjustments'],
    ['PUT', '/api/purchases/cancel/507f191e810c19729de860ed'],
    ['DELETE', '/api/products/507f191e810c19729de860ec'],
  ];
  for (const [method, path] of checks) {
    const r = await fetch('http://127.0.0.1:' + p + path, { method });
    console.log(method, path, '->', r.status);
  }
  s.close();
});
" --input-type=module
```

Expected: the first three answer **401** (mounted, guarded); the DELETE answers **404** (retired).

- [ ] **Step 3: Docs**

- `RELEASE-CHECKLIST.md`: add one line in the deploy steps: "Run `node scripts/backfill-inventory-rows.mjs` from `backend/` once after deploy — shelves every product that predates inventory-at-creation (idempotent)."
- `FIX-PLAN.md`: in the "Not done — deferred features" list, remove "manual inventory adjustments and low-stock alerts" (now done) and append a sentence noting product archiving and purchase-order cancellation shipped with this plan.

- [ ] **Step 4: Commit**

```bash
git add RELEASE-CHECKLIST.md FIX-PLAN.md
git commit -m "$(cat <<'EOF'
Write the inventory repair into the manuals

The release checklist gains the one-off backfill step, and the fix
plan's deferred list stops promising what this branch now delivers.

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Notes (already applied)

- **Spec coverage:** §1→Task 1, §2→Tasks 4+6, §3→Tasks 2+3+6+7+11, §4→Tasks 5+9, §5→Task 8, §6→Tasks 2+6+7+8, §7→Task 9, §8→Task 10, §9→Tasks 2+7 (+deferred items deliberately absent). The spec's "pending-order approval gains the same product-active check" is satisfied structurally: approval charges through `chargeCart` (Task 3), so no second check exists to drift.
- **Type consistency:** `active`/`reorderLevel` names match across model, controller, and all five screens; `PUT /purchases/cancel/:id` path identical in Task 5 route, tests, and Task 9's client; adjust endpoints identical in Task 4 routes/tests and Task 6's client; `{ adjustment, stock }` response shape used by Task 6's toast/refresh flow.
- **Existing-test collisions called out where they can happen** (Task 1 Step 6, Task 2 Step 5, Task 5 Step 5) with the resolution direction stated — fix the test's mock shape, never weaken the controller; except the deliberately widened completed-ledger filter, where the old assertion is the thing to update.
- **Working-tree hazard:** the uncommitted kiosk edits are quarantined — named in Global Constraints, and Task 11 (the only task touching those files) opens with a hard stop to ask the user.
