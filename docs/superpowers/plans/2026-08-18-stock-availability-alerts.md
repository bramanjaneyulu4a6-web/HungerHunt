# Stock Availability & Out-of-Stock Alerts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A product at zero stock is automatically disabled in the product catalogue (as a derived state, never by writing `active`), and the admin warehouse workspace shows a persistent, undismissable notification listing out-of-stock and low-stock items until they are replenished.

**Architecture:** One pure function, `availabilityOf(product, stock)`, becomes the single definition of ARCHIVED / OUT_OF_STOCK / LOW / AVAILABLE. The backend computes it and attaches an `availability` field to every `/api/inventory` and `/api/products` row, plus a new `GET /api/inventory/alerts` endpoint returning the out-of-stock and low lists. No new collections and no new writes: availability is derived on read, so it can never go stale, never fights an admin's Archive/Restore, and clears itself the moment a receipt or adjustment lands. Each frontend carries an identical copy of the function only as a fallback for a stale backend; screens always prefer the server-sent field.

**Tech Stack:** Express 4 + Mongoose 8 (backend, `node --test` with `mock.method` model stubs), React 19 + Vite (frontend-admin `node --test`, kiosk `vitest`, warehouse gains a `node --test` script).

**Spec:** No written spec (skipped at user request). The design was approved in-conversation; its decisions are restated in Global Constraints below, which stands in for the spec.

## Global Constraints

- **`active` is never written by automation.** It remains the manual archive flag. Availability is always derived; there is no `autoDisabled` flag and no auto-toggling of `active`.
- **The availability rule, verbatim, everywhere:** `ARCHIVED` when `product` is null/undefined or `product.active === false`; else `OUT_OF_STOCK` when `stock <= 0`; else `LOW` when `reorderLevel > 0 && stock < reorderLevel` (strict `<` — "the level *below* which", per the schema comment; `reorderLevel` 0 means "never flag"); else `AVAILABLE`. `reorderLevel` defaults to 5 when absent (matching the model default). Non-numeric stock coerces to 0.
- **LOW items stay sellable.** Only `OUT_OF_STOCK` and `ARCHIVED` are off sale. The kiosk must keep offering LOW items.
- **No dismiss control on the alert banner.** It disappears only when the lists empty.
- **Frontend fallback rule:** every screen reads `row.availability` first and computes locally only when the field is absent (stale backend). When stock itself is unknown (stale `/products` response), the fallback returns `null` and the screen renders no availability state — it must never show "Out of stock" because a field was missing.
- **All work on a feature branch** `feature/stock-availability` cut from `main`. Never commit to `main` directly.
- **String/label copy:** the states render as "Out of stock" and "Low stock" (badges), and the banner tiers as "out of stock and off sale" / "below reorder level".
- **Route order:** `/alerts` is registered before the `/:productId/*` routes in `inventoryRoutes.js`.
- Backend tests follow the existing `stockAdjustments.test.js` pattern: env vars first, dynamic imports, `app.listen(0)`, `accountMatcher`, `mock.method` on models, `afterEach(() => mock.restoreAll())`.

## File Structure

| File | Responsibility |
|---|---|
| `backend/utils/availability.js` (create) | The one availability rule, pure function |
| `backend/tests/availability.test.js` (create) | Table test over the rule |
| `backend/controllers/inventoryController.js` (modify) | `getInventory` attaches `availability`; new `getStockAlerts` |
| `backend/controllers/productController.js` (modify) | `getProducts` attaches `stock` + `availability` |
| `backend/routes/inventoryRoutes.js` (modify) | Mount `GET /alerts` under `protectWarehouse` |
| `backend/tests/stockAlerts.test.js` (create) | Alerts endpoint + availability fields on both list endpoints |
| `frontend-admin/src/utils/availability.js` (create) | Fallback copy of the rule + `resolveAvailability(row)` |
| `frontend-admin/tests/availability.test.js` (create) | Mirror table test |
| `frontend-admin/src/components/StockAlertBanner.jsx` (create) | The persistent two-tier banner, polls `/inventory/alerts` |
| `frontend-admin/src/components/Layout.jsx` (modify) | Render the banner across the whole `/warehouse` workspace |
| `frontend-admin/src/pages/Inventory.jsx` (modify) | Availability badges, reorder column, filter (URL-synced), refresh, price validation |
| `frontend-admin/src/pages/Products.jsx` (modify) | "Out of stock" state in table and card views |
| `frontend-admin/src/pages/WarehouseOverview.jsx` (modify) | Out-of-stock tile, availability-based counts, tiles link to filtered inventory |
| `hungerhunt-kiosk/src/utils/availability.js` (create) | Fallback copy + `sellable(row)` |
| `hungerhunt-kiosk/src/utils/availability.test.js` (create) | Vitest mirror test |
| `hungerhunt-kiosk/src/pages/KioskBilling.jsx` (modify) | Menu filter reads availability |
| `hungerhunt-warehouse/src/utils/availability.js` (create) | Fallback copy of the rule |
| `hungerhunt-warehouse/src/utils/availability.test.js` (create) | node:test mirror test |
| `hungerhunt-warehouse/src/pages/Inventory.jsx` (modify) | `low`/`empty` flags from availability (fixes the `<=` disagreement) |
| `hungerhunt-warehouse/package.json` (modify) | Add `"test": "node --test src/utils/"` |

---

### Task 1: Backend availability rule

**Files:**
- Create: `backend/utils/availability.js`
- Test: `backend/tests/availability.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `availabilityOf(product, stock) => "ARCHIVED" | "OUT_OF_STOCK" | "LOW" | "AVAILABLE"`, where `product` is a Product doc/POJO (may be null) and `stock` a number. Every later backend task imports exactly this.

- [ ] **Step 1: Create the branch**

```bash
cd /Users/gayani/HungerHunt
git checkout main && git pull && git checkout -b feature/stock-availability
```

- [ ] **Step 2: Write the failing test**

Create `backend/tests/availability.test.js`:

```js
// The one definition of "can this be sold, and should the office worry" —
// every screen and endpoint derives from this function so no two surfaces
// can disagree about a threshold again.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf } = await import('../utils/availability.js');

describe('availabilityOf', () => {
  const cases = [
    // [description, product, stock, expected]
    ['a missing product row is off sale, not an alert', null, 10, 'ARCHIVED'],
    ['archived wins over everything, even zero stock', { active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    ['absent active means active (rows predate the flag)', { reorderLevel: 5 }, 10, 'AVAILABLE'],
    ['zero stock is out of stock', { active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    ['negative stock is out of stock, not an error', { active: true, reorderLevel: 5 }, -2, 'OUT_OF_STOCK'],
    ['below the reorder level is low', { active: true, reorderLevel: 5 }, 4, 'LOW'],
    ['at the reorder level is not low — the level *below* which', { active: true, reorderLevel: 5 }, 5, 'AVAILABLE'],
    ['reorder level 0 never flags', { active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    ['absent reorder level reads as the model default of 5', { active: true }, 4, 'LOW'],
    ['non-numeric stock coerces to 0', { active: true, reorderLevel: 5 }, undefined, 'OUT_OF_STOCK'],
    ['healthy shelf is available', { active: true, reorderLevel: 5 }, 20, 'AVAILABLE'],
  ];

  for (const [name, product, stock, expected] of cases) {
    test(name, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd backend && node --test tests/availability.test.js`
Expected: FAIL — `Cannot find module '../utils/availability.js'`.

- [ ] **Step 4: Write the implementation**

Create `backend/utils/availability.js`:

```js
/* The single definition of what a stock number means for sale.
 *
 * Derived on read, everywhere, on purpose: `active` stays the office's
 * manual archive flag and is never written by automation, so a delivery
 * cannot un-archive a product and a sale cannot archive one. A product at
 * zero simply *is* out of stock until a receipt or adjustment says
 * otherwise — no flag to maintain, no repair job when a write path forgets.
 *
 * ARCHIVED      active === false (or no product row at all) — manual, wins
 * OUT_OF_STOCK  nothing on the shelf — off sale automatically
 * LOW           below the reorder level (strictly: "the level below which")
 * AVAILABLE     otherwise
 *
 * The frontends carry an identical copy as a fallback for a backend that
 * predates the `availability` field. Change one, change all of them.
 */
export const availabilityOf = (product, stock) => {
  if (!product || product.active === false) return "ARCHIVED";

  const onShelf = Number(stock) || 0;
  if (onShelf <= 0) return "OUT_OF_STOCK";

  // 5 is the model default; 0 means "never flag".
  const reorderLevel = Number(product.reorderLevel ?? 5);
  if (reorderLevel > 0 && onShelf < reorderLevel) return "LOW";

  return "AVAILABLE";
};
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd backend && node --test tests/availability.test.js`
Expected: PASS, 11 tests.

- [ ] **Step 6: Commit**

```bash
git add backend/utils/availability.js backend/tests/availability.test.js
git commit -m "Define availability as one derived rule on the backend"
```

---

### Task 2: `/api/inventory` and `/api/products` carry `availability`

**Files:**
- Modify: `backend/controllers/inventoryController.js` (the `getInventory` function, lines 6–46)
- Modify: `backend/controllers/productController.js` (the `getProducts` function, near line 270)
- Test: `backend/tests/stockAlerts.test.js` (create; this task writes its first two tests)

**Interfaces:**
- Consumes: `availabilityOf(product, stock)` from Task 1.
- Produces: every `/api/inventory` row gains `availability: string`; every `/api/products` row gains `stock: number` (0 when no shelf row) and `availability: string`. Frontends in Tasks 5–11 rely on exactly these field names.

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/stockAlerts.test.js`:

```js
// Availability rides on every list the screens draw from, so no screen
// computes a threshold again — and the alerts endpoint is the persistent
// banner's source of truth, derived from live stock on every read.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
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
const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const caretakerToken = signStaffToken(STAFF_ID, 'caretaker');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

const get = (path, token = adminToken) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${token}` } });

// An inventory row the way getInventory's populate returns one.
const invRow = (id, name, stock, extra = {}) => ({
  _id: `row-${id}`,
  productId: { _id: id, name, reorderLevel: 5, active: true, ...extra },
  stock,
  toObject() {
    return { _id: this._id, productId: this.productId, stock: this.stock };
  },
});

const mockInventoryList = (rows) =>
  mock.method(Inventory, 'find', () => ({ populate: () => Promise.resolve(rows) }));

describe('availability on the list endpoints', () => {
  test('every inventory row carries a derived availability', async () => {
    accountIs('warehouse');
    mockInventoryList([
      invRow('p1', 'Frooti', 0),
      invRow('p2', 'Good Day', 3),
      invRow('p3', 'Lays', 20),
      invRow('p4', 'Old Bar', 0, { active: false }),
    ]);

    const res = await get('/api/inventory', warehouseToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    const byName = Object.fromEntries(body.map((r) => [r.productId.name, r.availability]));
    assert.deepEqual(byName, {
      Frooti: 'OUT_OF_STOCK',
      'Good Day': 'LOW',
      Lays: 'AVAILABLE',
      'Old Bar': 'ARCHIVED',
    });
  });

  test('every product row carries its shelf count and availability', async () => {
    accountIs('warehouse');
    const products = [
      { _id: 'p1', name: 'Frooti', reorderLevel: 5, active: true,
        toObject() { return { _id: 'p1', name: 'Frooti', reorderLevel: 5, active: true }; } },
      { _id: 'p9', name: 'Never Received', reorderLevel: 5, active: true,
        toObject() { return { _id: 'p9', name: 'Never Received', reorderLevel: 5, active: true }; } },
    ];
    const query = {
      collation() { return query; },
      sort() { return query; },
      populate() { return query; },
      then(resolve) { resolve(products); },
    };
    mock.method(Product, 'find', () => query);
    mock.method(Inventory, 'find', () => ({ lean: async () => [{ productId: 'p1', stock: 12 }] }));

    const res = await get('/api/products', warehouseToken);
    assert.equal(res.status, 200);
    const body = await res.json();
    const frooti = body.find((p) => p._id === 'p1');
    const orphan = body.find((p) => p._id === 'p9');
    assert.equal(frooti.stock, 12);
    assert.equal(frooti.availability, 'AVAILABLE');
    assert.equal(orphan.stock, 0);
    assert.equal(orphan.availability, 'OUT_OF_STOCK');
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && node --test tests/stockAlerts.test.js`
Expected: FAIL — both tests, on the missing `availability` assertions (the endpoints themselves return 200 today).

- [ ] **Step 3: Attach availability in `getInventory`**

In `backend/controllers/inventoryController.js`, add to the imports:

```js
import { availabilityOf } from "../utils/availability.js";
```

Replace the staff-branch early return (`if (!req.student?.id) return res.json(inventory);`) with:

```js
    if (!req.student?.id) {
      return res.json(inventory.map((row) => ({
        ...row.toObject(),
        availability: availabilityOf(row.productId, row.stock),
      })));
    }
```

And in the student branch's final `res.json(...)` mapper, add `availability` beside `purchaseAllowance`:

```js
    res.json(inventory.map((row) => {
      const item = row.toObject();
      const productId = item.productId?._id;

      return {
        ...item,
        availability: availabilityOf(row.productId, row.stock),
        purchaseAllowance: productId
          ? allowances.get(String(productId)) ?? null
          : null,
      };
    }));
```

- [ ] **Step 4: Attach stock + availability in `getProducts`**

In `backend/controllers/productController.js`, `Inventory` is already imported at the top; add:

```js
import { availabilityOf } from '../utils/availability.js';
```

In `getProducts`, replace `res.json(products);` with:

```js
    // The shelf count and its meaning ride along so no screen has to join
    // the two lists or reinvent a threshold. A product with no shelf row
    // (only possible for rows older than the backfill) reads as empty.
    const shelves = await Inventory.find({}, { productId: 1, stock: 1 }).lean();
    const stockByProduct = new Map(
      shelves.map((row) => [String(row.productId), row.stock])
    );

    res.json(products.map((product) => {
      const stock = stockByProduct.get(String(product._id)) ?? 0;
      return {
        ...product.toObject(),
        stock,
        availability: availabilityOf(product, stock),
      };
    }));
```

- [ ] **Step 5: Run the new tests, then the whole backend suite**

Run: `cd backend && node --test tests/stockAlerts.test.js` — expected: PASS.
Run: `cd backend && npm test` — expected: PASS with no regressions (the kiosk, checkout, and catalogue tests all exercise these endpoints).

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/inventoryController.js backend/controllers/productController.js backend/tests/stockAlerts.test.js
git commit -m "Send availability with every inventory and product row"
```

---

### Task 3: `GET /api/inventory/alerts`

**Files:**
- Modify: `backend/controllers/inventoryController.js` (append `getStockAlerts`)
- Modify: `backend/routes/inventoryRoutes.js`
- Test: `backend/tests/stockAlerts.test.js` (append a describe block)

**Interfaces:**
- Consumes: `availabilityOf` from Task 1.
- Produces: `GET /api/inventory/alerts` (auth: `protectWarehouse` — admin + warehouse roles) returning `{ outOfStock: Entry[], low: Entry[] }` where `Entry = { productId, name, stock, reorderLevel }`, each list name-sorted, archived products excluded. The banner (Task 6) and any future warehouse-app use rely on exactly this shape.

- [ ] **Step 1: Write the failing tests**

Append to `backend/tests/stockAlerts.test.js`:

```js
describe('the stock alerts feed', () => {
  const shelf = [
    invRow('p1', 'frooti', 0),
    invRow('p2', 'Dairy Milk', 0),
    invRow('p3', 'Good Day', 3),
    invRow('p4', 'Lays', 20),
    invRow('p5', 'Old Bar', 0, { active: false }),   // archived: never an alert
    { _id: 'row-x', productId: null, stock: 0, toObject() { return this; } }, // unlinked: never an alert
  ];

  test('splits the shelf into out-of-stock and low, name-sorted, archived excluded', async () => {
    accountIs('admin');
    mockInventoryList(shelf);

    const res = await get('/api/inventory/alerts');
    assert.equal(res.status, 200);
    const body = await res.json();

    assert.deepEqual(body.outOfStock.map((e) => e.name), ['Dairy Milk', 'frooti']);
    assert.deepEqual(body.low.map((e) => e.name), ['Good Day']);
    assert.deepEqual(body.outOfStock[1], {
      productId: 'p1', name: 'frooti', stock: 0, reorderLevel: 5,
    });
  });

  test('a healthy shelf answers with two empty lists', async () => {
    accountIs('warehouse');
    mockInventoryList([invRow('p4', 'Lays', 20)]);

    const res = await get('/api/inventory/alerts', warehouseToken);
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { outOfStock: [], low: [] });
  });

  test('a caretaker cannot read the feed', async () => {
    accountIs('caretaker');
    const res = await get('/api/inventory/alerts', caretakerToken);
    assert.equal(res.status, 403);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `cd backend && node --test tests/stockAlerts.test.js`
Expected: the three new tests FAIL with 404s (route doesn't exist); the Task 2 tests still pass.

- [ ] **Step 3: Implement the controller**

Append to `backend/controllers/inventoryController.js`:

```js
/* The feed behind the warehouse workspace's persistent banner: what is off
 * sale for want of stock, and what is heading there. Derived from live
 * Inventory on every read — no alert rows to open, close, or drift out of
 * sync — so it clears itself the moment a receipt or adjustment lands, and
 * there is deliberately nothing here to dismiss. Archived products are
 * excluded: they are off sale because somebody said so, not for want of
 * stock, and an alert nobody can act on trains people to ignore the banner.
 */
export const getStockAlerts = async (req, res) => {
  try {
    const rows = await Inventory.find().populate("productId");

    const entry = (row) => ({
      productId: row.productId._id,
      name: row.productId.name,
      stock: row.stock,
      reorderLevel: row.productId.reorderLevel ?? 5,
    });

    const byName = (a, b) =>
      a.name.localeCompare(b.name, "en", { sensitivity: "base" });

    const outOfStock = [];
    const low = [];

    for (const row of rows) {
      const availability = availabilityOf(row.productId, row.stock);
      if (availability === "OUT_OF_STOCK") outOfStock.push(entry(row));
      else if (availability === "LOW") low.push(entry(row));
    }

    res.json({
      outOfStock: outOfStock.sort(byName),
      low: low.sort(byName),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
```

- [ ] **Step 4: Mount the route**

In `backend/routes/inventoryRoutes.js`, change the controller import to include `getStockAlerts`, add `protectWarehouse` to the middleware import, and register the route **above** the `/:productId` routes:

```js
import express from "express";
import { getInventory, adjustStock, getAdjustments, getStockAlerts } from "../controllers/inventoryController.js";
import { orStudent, protectAdmin, protectAnyStaff, protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

// The menu the till sells from and the shelf the storeroom counts onto — every
// kind of staff reads it, and so does a student at the kiosk, who is drawing
// the same tiles from it. Changing stock is done through products and
// purchases, which keep their own narrower gates.
router.get("/", orStudent(protectAnyStaff), getInventory);

// What is out of stock (and so off sale) and what is running low — the feed
// behind the admin warehouse banner. Warehouse staff may read it too; they
// are the ones who fix it. Registered before the parameterised routes.
router.get("/alerts", protectWarehouse, getStockAlerts);

// Manual movements are the office's alone — the storeroom's stock changes
// arrive as goods receipts, and a student obviously never writes the shelf.
router.post("/:productId/adjust", protectAdmin, adjustStock);
router.get("/:productId/adjustments", protectAdmin, getAdjustments);

export default router;
```

- [ ] **Step 5: Run the tests, then the whole backend suite**

Run: `cd backend && node --test tests/stockAlerts.test.js` — expected: PASS, all describe blocks.
Run: `cd backend && npm test` — expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add backend/controllers/inventoryController.js backend/routes/inventoryRoutes.js backend/tests/stockAlerts.test.js
git commit -m "Add the stock alerts feed the warehouse banner reads"
```

---

### Task 4: Admin frontend availability util

**Files:**
- Create: `frontend-admin/src/utils/availability.js`
- Test: `frontend-admin/tests/availability.test.js`

**Interfaces:**
- Consumes: nothing (pure JS, mirrors Task 1).
- Produces: `availabilityOf(product, stock)` — identical to the backend's — and `resolveAvailability(row) => "ARCHIVED" | "OUT_OF_STOCK" | "LOW" | "AVAILABLE" | null`, which prefers `row.availability`, falls back to computing from `row.stock`, and returns `null` when stock is unknown. `row` may be an inventory row (`{ productId, stock }`) or a product row (`{ ...product, stock }`). Tasks 5–8 import these.

- [ ] **Step 1: Write the failing test**

Create `frontend-admin/tests/availability.test.js`:

```js
// Mirror of backend/utils/availability.js — the fallback for a backend
// that predates the availability field. Change one, change both.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf, resolveAvailability } = await import('../src/utils/availability.js');

describe('availabilityOf (mirror of the backend rule)', () => {
  const cases = [
    [null, 10, 'ARCHIVED'],
    [{ active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    [{ reorderLevel: 5 }, 10, 'AVAILABLE'],
    [{ active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    [{ active: true, reorderLevel: 5 }, 4, 'LOW'],
    [{ active: true, reorderLevel: 5 }, 5, 'AVAILABLE'],
    [{ active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    [{ active: true }, 4, 'LOW'],
  ];

  for (const [product, stock, expected] of cases) {
    test(`${JSON.stringify(product)} at ${stock} → ${expected}`, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});

describe('resolveAvailability', () => {
  test('prefers what the server said', () => {
    assert.equal(
      resolveAvailability({ availability: 'LOW', productId: { active: true }, stock: 100 }),
      'LOW'
    );
  });

  test('falls back to computing from an inventory row', () => {
    assert.equal(
      resolveAvailability({ productId: { active: true, reorderLevel: 5 }, stock: 0 }),
      'OUT_OF_STOCK'
    );
  });

  test('falls back to computing from a product row carrying stock', () => {
    assert.equal(
      resolveAvailability({ active: true, reorderLevel: 5, stock: 3 }),
      'LOW'
    );
  });

  test('unknown stock resolves to null, never to OUT_OF_STOCK', () => {
    assert.equal(resolveAvailability({ active: true, reorderLevel: 5 }), null);
  });

  test('an inventory row whose product is gone is archived, not available', () => {
    // productId is present but null — `?? row` would hand the row itself to
    // the rule and call an unlinked shelf AVAILABLE.
    assert.equal(resolveAvailability({ productId: null, stock: 9 }), 'ARCHIVED');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd frontend-admin && npm test`
Expected: FAIL — cannot find `../src/utils/availability.js` (the existing `readStudentSheet` test keeps passing).

- [ ] **Step 3: Write the implementation**

Create `frontend-admin/src/utils/availability.js`:

```js
/* Mirror of backend/utils/availability.js — the one availability rule.
 *
 * The backend sends `availability` on every inventory and product row;
 * screens read that. This local copy exists only as a fallback for a
 * deployed backend that predates the field. Change one, change both.
 */
export const availabilityOf = (product, stock) => {
  if (!product || product.active === false) return "ARCHIVED";

  const onShelf = Number(stock) || 0;
  if (onShelf <= 0) return "OUT_OF_STOCK";

  // 5 is the model default; 0 means "never flag".
  const reorderLevel = Number(product.reorderLevel ?? 5);
  if (reorderLevel > 0 && onShelf < reorderLevel) return "LOW";

  return "AVAILABLE";
};

/* Availability for a row from either list endpoint: an inventory row
 * ({ productId, stock }) or a product row (the product itself, carrying
 * stock). Prefers the server's word; computes only when it can. When stock
 * itself is unknown — a stale /products response — the answer is null, and
 * a screen must render no availability state rather than guess "out of
 * stock" off a missing field.
 *
 * Which shape a row is, is decided by whether it *has* a productId key, not
 * by whether that key is truthy: an inventory row whose product was deleted
 * carries productId: null, and `row.productId ?? row` would hand the row
 * itself to the rule and call an unlinked shelf AVAILABLE. */
export const resolveAvailability = (row) => {
  if (!row) return null;
  if (row.availability) return row.availability;
  if (typeof row.stock !== "number") return null;

  const isInventoryRow = Object.prototype.hasOwnProperty.call(row, "productId");
  return availabilityOf(isInventoryRow ? row.productId : row, row.stock);
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend-admin && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend-admin/src/utils/availability.js frontend-admin/tests/availability.test.js
git commit -m "Mirror the availability rule in the admin app as a fallback"
```

---

### Task 5: Admin Inventory page — availability states, filter, refresh, price validation

**Files:**
- Modify: `frontend-admin/src/pages/Inventory.jsx`

**Interfaces:**
- Consumes: `resolveAvailability` from Task 4; `availability` field from Task 2; `RefreshButton` from `../components/RefreshButton`.
- Produces: URL contract `/warehouse/inventory?filter=out|low|archived` (absent = all) that Tasks 6 and 7 link to.

- [ ] **Step 1: Add imports and filter state**

In `frontend-admin/src/pages/Inventory.jsx`, extend the react-router and component imports (the file currently imports none from react-router):

```js
import { useSearchParams } from "react-router-dom";
import RefreshButton from "../components/RefreshButton";
import { resolveAvailability } from "../utils/availability";
```

Inside the component, replace the `searchQuery` state line with:

```js
  const [searchQuery, setSearchQuery] = useState("");
  // The availability filter lives in the URL so the overview tiles and the
  // stock banner can link straight to "what is out" / "what is low".
  const [searchParams, setSearchParams] = useSearchParams();
  const filter = ["out", "low", "archived"].includes(searchParams.get("filter"))
    ? searchParams.get("filter")
    : "all";
  const setFilter = (value) =>
    setSearchParams(value === "all" ? {} : { filter: value }, { replace: true });
```

- [ ] **Step 2: Filter the rows by availability**

At module scope (above the `const Inventory = () => {` line — it closes over
nothing and is pure data), add:

```js
const FILTER_MATCHES = {
  all: () => true,
  out: (a) => a === "OUT_OF_STOCK",
  low: (a) => a === "LOW",
  archived: (a) => a === "ARCHIVED",
};
```

Then replace the `filteredInventory` definition inside the component:

```js
  const filteredInventory = inventory.filter((item) => {
    if (!FILTER_MATCHES[filter](resolveAvailability(item))) return false;
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return item.productId?.name?.toLowerCase().includes(query);
  });
```

- [ ] **Step 3: Refresh button and the filter control**

Change the `PageHeader` to carry the refresh action:

```jsx
      <PageHeader
        title="Inventory Control"
        subtitle="Monitor on-hand stock, thresholds, pricing, and audited manual adjustments."
        actions={<RefreshButton onRefresh={fetchInventory} loading={loading} />}
      />
```

Replace the search-box wrapper `<div style={{ marginBottom: 24 }}>…</div>` with a search-plus-filter row:

```jsx
      <div style={{ display: "flex", gap: 12, marginBottom: 24, flexWrap: "wrap" }}>
        <input
          type="search"
          className="input"
          style={{ flex: "1 1 260px" }}
          aria-label="Search inventory"
          placeholder="🔍 Search inventory by product name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <select
          className="input"
          style={{ flex: "0 1 200px" }}
          aria-label="Filter by availability"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="all">All items</option>
          <option value="out">Out of stock</option>
          <option value="low">Low stock</option>
          <option value="archived">Archived</option>
        </select>
      </div>
```

- [ ] **Step 4: Availability badges and the reorder column**

In the table `<thead>`, add a threshold column between Stock and Actions:

```jsx
                <th style={{ width: 180 }}>Stock</th>
                <th style={{ width: 140 }}>Reorder at</th>
                <th style={{ width: 220 }}>Actions</th>
```

In the row mapper, replace the `reorderLevel`/`archived`/`isLowStock` block (and its comment) with:

```js
                const reorderLevel = item.productId?.reorderLevel ?? 5;
                const availability = resolveAvailability(item);
                const archived = availability === "ARCHIVED";
```

Replace the Stock `<td>` and add the new column after it. A row that is out of stock is off sale automatically, and says so; low is a warning; archived rows alert for nothing (nobody can act on a reorder for a product no longer sold):

```jsx
                    <td data-label="Stock">
                      {availability === "OUT_OF_STOCK" ? (
                        <Badge variant="alert">
                          <span aria-hidden="true">⛔︎</span> Out of stock
                        </Badge>
                      ) : availability === "LOW" ? (
                        <Badge variant="warn">
                          <span aria-hidden="true">⚠︎</span> {item.stock || 0} units — low
                        </Badge>
                      ) : (
                        <Badge variant="neutral">{item.stock || 0} units</Badge>
                      )}
                    </td>
                    <td data-label="Reorder at" style={{ color: "var(--muted-soft)" }}>
                      {reorderLevel === 0 ? "Never flags" : `${reorderLevel} units`}
                    </td>
```

(The `#`, Product, Price, and Actions cells are untouched; `archived` keeps driving the Archived badge and the Restore button exactly as before.)

- [ ] **Step 5: Stop a blank price from posting as ₹0**

In `saveEdit`, after the name check and before `setSaving(true)`, add — and simplify the payload line it guards:

```js
    const updatedPrice = parseFloat(editPrice);
    if (isNaN(updatedPrice) || updatedPrice <= 0) {
      toast.error("Enter a selling price above zero.");
      return;
    }

    setSaving(true);
```

…and inside the `try`, remove the old `const updatedPrice = parseFloat(editPrice);` line and change the payload's price line to plain `price: updatedPrice,` (deleting the `isNaN(updatedPrice) ? 0 : updatedPrice` expression). Also change the price input's `min="0"` to `min="0.01"` so the browser hints at the rule too.

- [ ] **Step 6: Verify by lint and build**

Run: `cd frontend-admin && npm run lint && npm run build`
Expected: both succeed. Then run `npm test` — the util tests still pass.

- [ ] **Step 7: Commit**

```bash
git add frontend-admin/src/pages/Inventory.jsx
git commit -m "Show availability states on the Inventory page, with filter, refresh, and a priced-edit guard"
```

---

### Task 6: The persistent StockAlertBanner across the warehouse workspace

**Files:**
- Create: `frontend-admin/src/components/StockAlertBanner.jsx`
- Modify: `frontend-admin/src/components/Layout.jsx:149-152` (the `<main>` block)

**Interfaces:**
- Consumes: `GET /inventory/alerts` (Task 3 shape: `{ outOfStock: [{productId, name, stock, reorderLevel}], low: [...] }`); `Banner` from `./ui`; the `?filter=` URL contract from Task 5.
- Produces: `<StockAlertBanner />`, self-contained, safe to render anywhere inside the router.

- [ ] **Step 1: Write the component**

Create `frontend-admin/src/components/StockAlertBanner.jsx`:

```jsx
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../utils/api";
import { Banner } from "./ui";

/* The notification that cannot be dismissed, because dismissing it would not
 * put stock on the shelf. Rendered by Layout across the whole /warehouse
 * workspace, it polls the alerts feed and names every product that is out
 * of stock (and therefore off sale) or below its reorder level. There is no
 * close button on purpose: the banner *is* the state of the shelf, and it
 * disappears the moment a receipt or adjustment refills the last empty item.
 *
 * A failed poll keeps the last good answer on screen — a network blip must
 * not blink a real stock-out away. */

const POLL_MS = 60_000;
const NAMED_LIMIT = 8;

const nameList = (entries) => {
  const named = entries.slice(0, NAMED_LIMIT).map((e) => e.name);
  const more = entries.length - named.length;
  return named.join(" · ") + (more > 0 ? ` · and ${more} more` : "");
};

export default function StockAlertBanner() {
  const [alerts, setAlerts] = useState(null); // null = not loaded yet

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const res = await api.get("/inventory/alerts");
        if (cancelled) return;
        if (res.data && Array.isArray(res.data.outOfStock) && Array.isArray(res.data.low)) {
          setAlerts(res.data);
        }
      } catch (err) {
        // Keep showing the last known state; a stock-out doesn't clear
        // because the network hiccuped.
        console.error(err);
      }
    };

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (!alerts || (alerts.outOfStock.length === 0 && alerts.low.length === 0)) {
    return null;
  }

  return (
    <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
      {alerts.outOfStock.length > 0 && (
        <Banner variant="alert" icon="⛔️">
          <strong>
            {alerts.outOfStock.length === 1
              ? "1 product is out of stock and off sale"
              : `${alerts.outOfStock.length} products are out of stock and off sale`}
            :
          </strong>{" "}
          {nameList(alerts.outOfStock)} —{" "}
          <Link to="/warehouse/inventory?filter=out">view and replenish</Link>
        </Banner>
      )}
      {alerts.low.length > 0 && (
        <Banner variant="warn" icon="⚠️">
          <strong>
            {alerts.low.length === 1
              ? "1 product is below its reorder level"
              : `${alerts.low.length} products are below their reorder level`}
            :
          </strong>{" "}
          {alerts.low.map((e) => `${e.name} (${e.stock}/${e.reorderLevel})`).slice(0, NAMED_LIMIT).join(" · ")}
          {alerts.low.length > NAMED_LIMIT ? ` · and ${alerts.low.length - NAMED_LIMIT} more` : ""} —{" "}
          <Link to="/warehouse/inventory?filter=low">view</Link>
        </Banner>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Mount it across the warehouse workspace**

In `frontend-admin/src/components/Layout.jsx`, add the import:

```js
import StockAlertBanner from "./StockAlertBanner";
```

and change the `<main>` block so the banner follows the user onto every warehouse screen, not just the overview:

```jsx
      <main className="layout-main">
        {inWarehouse && <WarehouseContextBar />}
        {inWarehouse && <StockAlertBanner />}
        <Outlet />
      </main>
```

- [ ] **Step 3: Verify by lint and build**

Run: `cd frontend-admin && npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend-admin/src/components/StockAlertBanner.jsx frontend-admin/src/components/Layout.jsx
git commit -m "Keep an undismissable stock banner over the whole warehouse workspace"
```

---

### Task 7: Warehouse overview — out-of-stock tile, counts from the one rule, tiles that go somewhere

**Files:**
- Modify: `frontend-admin/src/pages/WarehouseOverview.jsx`

**Interfaces:**
- Consumes: `resolveAvailability` from Task 4; the `?filter=` URL contract from Task 5.
- Produces: nothing later tasks use.

- [ ] **Step 1: Count from availability instead of a local threshold**

Add the import:

```js
import { resolveAvailability } from '../utils/availability';
```

Replace the `metrics` memo's `lowStock` computation so both stock numbers come from the one rule (deleting the local `row.stock < (product?.reorderLevel ?? 5)` expression — the last place in the admin app that computed a threshold):

```js
  const metrics = useMemo(() => {
    const availabilities = inventory.map(resolveAvailability);
    return {
      review: orders.filter((order) => order.status === 'PENDING_REVIEW').length,
      inbound: orders.filter((order) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)).length,
      outOfStock: availabilities.filter((a) => a === 'OUT_OF_STOCK').length,
      lowStock: availabilities.filter((a) => a === 'LOW').length,
      received: orders.filter((order) => order.status === 'RECEIVED').length,
    };
  }, [inventory, orders]);
```

- [ ] **Step 2: Add the out-of-stock tile and link both stock tiles**

The loading skeleton row becomes five: change `[1, 2, 3, 4].map` to `[1, 2, 3, 4, 5].map`.

In the metrics grid, insert an out-of-stock card before the low-stock one, and give both a destination (they were dead numbers — a count that names nothing and links nowhere):

```jsx
          <Card className="warehouse-metric warehouse-metric--attention">
            <span className="warehouse-metric__icon" aria-hidden="true">⛔</span>
            <div>
              <span>Out of stock</span>
              <strong>{metrics.outOfStock}</strong>
              <small>Off sale until replenished</small>
              <Button to="/warehouse/inventory?filter=out" variant="ghost" className="btn--sm">View items</Button>
            </div>
          </Card>
          <Card className="warehouse-metric warehouse-metric--warning">
            <span className="warehouse-metric__icon" aria-hidden="true">!</span>
            <div>
              <span>Low-stock items</span>
              <strong>{metrics.lowStock}</strong>
              <small>Below configured threshold</small>
              <Button to="/warehouse/inventory?filter=low" variant="ghost" className="btn--sm">View items</Button>
            </div>
          </Card>
```

(The existing "Awaiting review", "Inbound orders", and "Orders received" cards are untouched; the old low-stock card is replaced by the pair above.)

- [ ] **Step 3: Verify by lint and build**

Run: `cd frontend-admin && npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend-admin/src/pages/WarehouseOverview.jsx
git commit -m "Count stock tiles from the availability rule and link them to the filtered list"
```

---

### Task 8: Admin product catalogue shows the disabled state

**Files:**
- Modify: `frontend-admin/src/pages/Products.jsx` (table row ~line 640, card view ~line 755)

**Interfaces:**
- Consumes: `resolveAvailability` from Task 4; `stock` + `availability` on `/products?all=1` rows from Task 2.
- Produces: nothing later tasks use.

- [ ] **Step 1: Badge and grey the table rows**

Add the import:

```js
import { resolveAvailability } from '../utils/availability';
```

In the list-view row mapper, compute availability at the top of the map callback:

```jsx
              {filteredProducts.map((p) => {
                const availability = resolveAvailability(p);
                return (
                  <tr key={p._id} style={availability === 'OUT_OF_STOCK' ? { opacity: 0.55 } : undefined}>
```

(convert the arrow body to a block returning the `<tr>`, and close with `);})}` accordingly). In the Product name cell, after the existing Archived badge, add:

```jsx
                    {availability === 'OUT_OF_STOCK' && (
                      <Badge variant="alert" style={{ marginLeft: 8 }}>
                        Out of stock
                      </Badge>
                    )}
```

The row reads greyed with a red badge: visibly disabled in the catalogue, while Edit/Archive stay clickable — out of stock disables *sale*, not administration.

- [ ] **Step 2: Badge the kiosk-view cards**

In the card view, compute availability the same way at the top of the product map callback, add the modifier to the article's className, and the badge beside Archived:

```jsx
                      const availability = resolveAvailability(product);
                      return (
                        <article
                          className={`catalogue-product-card${product.active === false ? ' catalogue-product-card--archived' : ''}`}
                          style={availability === 'OUT_OF_STOCK' ? { opacity: 0.55 } : undefined}
                          key={product._id}
                        >
```

and inside `.catalogue-product-image`, after the Archived badge line:

```jsx
                          {availability === 'OUT_OF_STOCK' && <Badge variant="alert">Out of stock</Badge>}
```

(Again convert that map's arrow body to a block with an explicit `return`.)

- [ ] **Step 3: Verify by lint and build**

Run: `cd frontend-admin && npm run lint && npm run build`
Expected: both succeed.

- [ ] **Step 4: Commit**

```bash
git add frontend-admin/src/pages/Products.jsx
git commit -m "Show out-of-stock products as disabled in the catalogue"
```

---

### Task 9: Kiosk reads availability

**Files:**
- Create: `hungerhunt-kiosk/src/utils/availability.js`
- Test: `hungerhunt-kiosk/src/utils/availability.test.js` (vitest)
- Modify: `hungerhunt-kiosk/src/pages/KioskBilling.jsx:218-226` (the menu filter)

**Interfaces:**
- Consumes: `availability` on `/inventory` rows from Task 2.
- Produces: `sellable(row) => boolean` for inventory rows.

- [ ] **Step 1: Write the failing test**

Create `hungerhunt-kiosk/src/utils/availability.test.js`:

```js
// The kiosk's side of the availability rule: LOW is still sellable —
// low is the office's problem, not the student's — and only OUT_OF_STOCK
// and ARCHIVED come off the menu. Falls back to the legacy stock>0 check
// against a backend that predates the availability field.
import { describe, expect, test } from 'vitest';
import { sellable } from './availability';

describe('sellable', () => {
  test('available and low items stay on the menu', () => {
    expect(sellable({ availability: 'AVAILABLE', stock: 20, productId: { _id: 'p' } })).toBe(true);
    expect(sellable({ availability: 'LOW', stock: 2, productId: { _id: 'p' } })).toBe(true);
  });

  test('out of stock and archived items come off it', () => {
    expect(sellable({ availability: 'OUT_OF_STOCK', stock: 0, productId: { _id: 'p' } })).toBe(false);
    expect(sellable({ availability: 'ARCHIVED', stock: 9, productId: { _id: 'p' } })).toBe(false);
  });

  test('without the field, the legacy check decides', () => {
    expect(sellable({ stock: 3, productId: { _id: 'p', active: true } })).toBe(true);
    expect(sellable({ stock: 0, productId: { _id: 'p', active: true } })).toBe(false);
    expect(sellable({ stock: 3, productId: { _id: 'p', active: false } })).toBe(false);
    // Absent active means the row predates the flag.
    expect(sellable({ stock: 3, productId: { _id: 'p' } })).toBe(true);
  });

  test('a row with no product is never sellable', () => {
    expect(sellable({ stock: 3, productId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/availability.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

Create `hungerhunt-kiosk/src/utils/availability.js`:

```js
/* Whether an inventory row belongs on the kiosk menu.
 *
 * The backend now says so itself via `availability` — LOW is deliberately
 * still sellable; only OUT_OF_STOCK and ARCHIVED are off sale. The legacy
 * stock>0 && not-archived check remains as the fallback for a deployed
 * backend that predates the field, and is the same rule by construction. */
export const sellable = (row) => {
  if (!row?.productId) return false;

  if (row.availability) {
    return row.availability === "AVAILABLE" || row.availability === "LOW";
  }

  // Archived is off sale; absent means the row predates the flag.
  return row.stock > 0 && row.productId.active !== false;
};
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd hungerhunt-kiosk && npx vitest run src/utils/availability.test.js`
Expected: PASS.

- [ ] **Step 5: Switch the menu filter to it**

In `hungerhunt-kiosk/src/pages/KioskBilling.jsx`, add the import:

```js
import { sellable } from "../utils/availability";
```

and in `loadInventory`, replace the filter callback

```js
          .filter(
            (item) =>
              item.stock > 0 &&
              item.productId &&
              // Archived is off sale; absent means the row predates the flag.
              item.productId.active !== false
          )
```

with:

```js
          .filter(sellable)
```

Leave the cart-reconciliation filter (`item && item.stock > 0 && item.quantity > 0`) and the `addToCart` `stock < 1` guard untouched — those judge quantities on already-listed items, not menu membership.

- [ ] **Step 6: Run the kiosk suite and build**

Run: `cd hungerhunt-kiosk && npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add hungerhunt-kiosk/src/utils/availability.js hungerhunt-kiosk/src/utils/availability.test.js hungerhunt-kiosk/src/pages/KioskBilling.jsx
git commit -m "Let the backend's availability decide the kiosk menu"
```

---

### Task 10: Warehouse app agrees with everyone else

**Files:**
- Create: `hungerhunt-warehouse/src/utils/availability.js`
- Test: `hungerhunt-warehouse/src/utils/availability.test.js`
- Modify: `hungerhunt-warehouse/package.json` (add test script)
- Modify: `hungerhunt-warehouse/src/pages/Inventory.jsx:92-110` (the row mapper)

**Interfaces:**
- Consumes: `stock` + `availability` on `/products` rows from Task 2.
- Produces: `availabilityOf(product, stock)` mirror (this app resolves inline because its rows merge two endpoints).

- [ ] **Step 1: Add the test script**

In `hungerhunt-warehouse/package.json`, add to `"scripts"`:

```json
    "test": "node --test src/utils/",
```

- [ ] **Step 2: Write the failing test**

Create `hungerhunt-warehouse/src/utils/availability.test.js`:

```js
// Mirror of backend/utils/availability.js. This app used to say "low" at
// stock <= reorderLevel while the admin said "<" — with 5 on a shelf whose
// level is 5, the two screens disagreed. The shared rule ends that.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf } = await import('./availability.js');

describe('availabilityOf (mirror of the backend rule)', () => {
  const cases = [
    [null, 10, 'ARCHIVED'],
    [{ active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    [{ active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    [{ active: true, reorderLevel: 5 }, 4, 'LOW'],
    [{ active: true, reorderLevel: 5 }, 5, 'AVAILABLE'], // the old disagreement
    [{ active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    [{ active: true }, 4, 'LOW'],
  ];

  for (const [product, stock, expected] of cases) {
    test(`${JSON.stringify(product)} at ${stock} → ${expected}`, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `cd hungerhunt-warehouse && npm test`
Expected: FAIL — module not found.

- [ ] **Step 4: Write the implementation**

Create `hungerhunt-warehouse/src/utils/availability.js` with **exactly the same content** as `frontend-admin/src/utils/availability.js` from Task 4 Step 3 — both exports, `availabilityOf` and `resolveAvailability`, comments included. (Three apps, no shared package; the mirrors are the price, and each file's header says so.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `cd hungerhunt-warehouse && npm test`
Expected: PASS.

- [ ] **Step 6: Fix the row flags**

In `hungerhunt-warehouse/src/pages/Inventory.jsx`, add the import:

```js
import { availabilityOf } from "../utils/availability";
```

In the `load` callback's `setRows` mapper, replace

```js
          const id = String(product._id);
          const onShelf = stock.get(id) ?? 0;
          const reorderLevel = Number(product.reorderLevel) || 0;
          return {
            ...
            low: reorderLevel > 0 && onShelf <= reorderLevel && onShelf > 0,
            empty: onShelf === 0,
          };
```

with:

```js
          const id = String(product._id);
          // The backend now sends the shelf count on the product row itself;
          // the inventory merge stays as the fallback for a stale backend.
          const onShelf = typeof product.stock === "number" ? product.stock : (stock.get(id) ?? 0);
          const availability = product.availability ?? availabilityOf(product, onShelf);
          return {
            id,
            name: product.name,
            image: product.image || "",
            unit: product.unit?.name || "",
            group: product.stockGroup?.name || "",
            stock: onShelf,
            low: availability === "LOW",
            empty: availability === "OUT_OF_STOCK",
          };
```

Note the deliberate behaviour change this carries, beyond the `<=` → `<` fix: this screen's old `reorderLevel` coercion (`Number(product.reorderLevel) || 0`) read an *absent* level as 0 ("never flag") while every other surface read it as 5 — the shared rule ends that too.

- [ ] **Step 7: Lint, build, commit**

Run: `cd hungerhunt-warehouse && npm run lint && npm run build`
Expected: both succeed.

```bash
git add hungerhunt-warehouse/package.json hungerhunt-warehouse/src/utils/availability.js hungerhunt-warehouse/src/utils/availability.test.js hungerhunt-warehouse/src/pages/Inventory.jsx
git commit -m "End the warehouse app's private low-stock arithmetic"
```

---

### Task 11: Full verification sweep

**Files:** none created or modified (fix-forward only if something fails).

- [ ] **Step 1: Backend**

Run: `cd backend && npm test`
Expected: every suite passes, including the two new files.

- [ ] **Step 2: Admin app**

Run: `cd frontend-admin && npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 3: Kiosk**

Run: `cd hungerhunt-kiosk && npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 4: Warehouse app**

Run: `cd hungerhunt-warehouse && npm test && npm run lint && npm run build`
Expected: all pass.

- [ ] **Step 5: Live smoke test (local Mongo)**

Start the backend against the local database (the `.env` still points at prod — the override is mandatory):

```bash
cd backend && MONGO_URI="mongodb://127.0.0.1:27017/hungerhunt" npm run dev
```

In a second terminal, `cd frontend-admin && npm run dev`, log in, and verify:

1. `/warehouse/inventory` shows availability badges and the filter dropdown; `?filter=out` in the URL preselects "Out of stock".
2. Adjust some product's stock down to 0 (Adjust, negative delta, any reason) — the row flips to "Out of stock", and the red banner appears naming it, on Overview *and* on the other warehouse screens.
3. The banner has no dismiss control.
4. `/warehouse/products` shows the same product greyed with an "Out of stock" badge in both views.
5. Adjust the stock back up — after the next poll (≤60s) or a reload, the banner is gone and the badge cleared. **This is the replenish-clears-alert acceptance test.**
6. Editing a product's price to blank on the Inventory page is refused with a toast, not saved as ₹0.

- [ ] **Step 6: Final commit if the smoke test forced any fixes; otherwise nothing to commit.**

---

## Self-Review (completed)

- **Coverage:** every approved design point maps to a task — availability util (1), fields on both endpoints (2), alerts feed (3), admin fallback util (4), Inventory page states/filter/refresh/price guard (5), persistent banner (6), overview tiles (7), catalogue disabled state (8), kiosk (9), warehouse-app threshold unification (10), verification (11).
- **Type consistency:** `availabilityOf(product, stock)` and the four state strings are identical across Tasks 1, 4, 9, 10; `resolveAvailability` appears in Tasks 4–8; the alerts shape `{ outOfStock, low }` with `{ productId, name, stock, reorderLevel }` matches between Tasks 3 and 6; the `?filter=out|low|archived` contract matches between Tasks 5, 6, and 7.
- **No placeholders:** every code step carries the actual code.
