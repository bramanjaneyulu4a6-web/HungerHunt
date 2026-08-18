// The storeroom's account: a warehouse account opens exactly the storeroom
// surface, and nothing else — no students, no wallets, no billing, no
// catalogue writes.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.LEGACY_TOKEN_GRACE_UNTIL = '2999-01-01T00:00:00Z';

const jwt = (await import('jsonwebtoken')).default;
const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Supplier = (await import('../models/Supplier.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const GoodsReceipt = (await import('../models/GoodsReceipt.js')).default;
const Product = (await import('../models/Product.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';

const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

// Signed by hand because signStaffToken will not mint one any more. Stands in
// for a token issued before the till went self-serve and the role was withdrawn.
const retiredCashierToken = jwt.sign(
  { id: STAFF_ID, role: 'cashier' },
  process.env.JWT_SECRET
);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Models the one account row the gate looks up.
const accountIs = accountMatcher(Admin, STAFF_ID);

beforeEach(() => {
  accountIs('warehouse');
  // Shared by two callers: getInventory chains .populate(), getProducts now
  // joins the shelf with a projected .find().lean() — both have to resolve.
  mock.method(Inventory, 'find', () => ({ populate: async () => [], lean: async () => [] }));
  mock.method(Supplier, 'find', () => ({ sort: async () => [] }));
  mock.method(Purchase, 'find', () => {
    const chain = { populate: () => chain, sort: async () => [] };
    return chain;
  });
  mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));
  // receiveDelivery looks the {purchaseId, clientToken} pair up before it
  // judges anything, so the reach check needs an answer for it.
  mock.method(GoodsReceipt, 'findOne', async () => null);
  // Two different callers terminate this chain differently:
  // getReceiptsForPurchase ends on .sort(), getRecentReceipts ends on
  // .limit(). Both — and a bare await of the chain itself — have to resolve.
  mock.method(GoodsReceipt, 'find', () => {
    const chain = {
      populate: () => chain,
      sort: () => chain,
      limit: async () => [],
      then: (resolve) => resolve([]),
    };
    return chain;
  });
  // findById's chain is awaited directly (no terminal .sort()/.exec()), unlike
  // find's above, so this is a separate stub rather than a shared one.
  mock.method(Purchase, 'findById', () => {
    const chain = {
      populate: () => chain,
      then: (resolve) => resolve({ _id: 'x', items: [] }),
    };
    return chain;
  });
  // getProducts awaits
  // Product.find().collation().sort().populate("stockGroup").populate("unit"),
  // so the chain has to be thenable at every link.
  mock.method(Product, 'find', () => {
    const chain = {
      collation: () => chain,
      sort: () => chain,
      populate: () => chain,
      then: (resolve) => resolve([]),
    };
    return chain;
  });
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

// Routes the storeroom needs.
const WAREHOUSE_ROUTES = [
  ['GET', '/api/inventory'],
  ['GET', '/api/suppliers'],
  ['GET', '/api/purchases/open'],
  ['POST', '/api/purchases', { items: [{ productId: '507f191e810c19729de860ec', quantity: 1 }] }],
  ['GET', '/api/purchases/507f191e810c19729de860ed'],
  ['GET', '/api/purchases/507f191e810c19729de860ed/receipts'],
  ['GET', '/api/products'],
  ['GET', '/api/receipts'],
  // The one the whole app exists for. The body only has to get past the
  // payload checks far enough to prove the gate opened.
  ['POST', '/api/purchases/507f191e810c19729de860ed/receipts', {
    clientToken: 'reach-check',
    lines: [{ productId: '507f191e810c19729de860ec', received: 1 }],
  }],
];

// A sample of everything else, which no storeroom has ever needed.
const CLOSED_ROUTES = [
  ['GET', '/api/students', 'This action needs a full admin account.'],
  ['GET', '/api/transactions/history', 'This action needs a full admin account.'],
  ['POST', '/api/transactions/bill', 'This action needs a till account.'],
  ['GET', '/api/students/search?q=as', 'This action needs a till account.'],
  ['POST', '/api/admin/register', 'This action needs a full admin account.'],
  ['POST', '/api/suppliers', 'This action needs a full admin account.'],
  ['GET', '/api/purchases/completed', 'This action needs a full admin account.'],
  ['PUT', '/api/purchases/complete/507f191e810c19729de860ed', 'This action needs a full admin account.'],
];

describe('a warehouse account works the storeroom', () => {
  for (const route of WAREHOUSE_ROUTES) {
    const [method, path] = route;

    test(`${method} ${path} is open to a warehouse account`, async () => {
      const res = await send(method, path, warehouseToken, route[2]);
      assert.ok(res.status !== 401 && res.status !== 403,
        `${method} ${path} refused the warehouse token with ${res.status}`);
    });

    test(`${method} ${path} is open to an admin`, async () => {
      accountIs('admin');
      const res = await send(method, path, adminToken, route[2]);
      assert.ok(res.status !== 401 && res.status !== 403);
    });
  }
});

describe('and nothing else', () => {
  for (const [method, path, message] of CLOSED_ROUTES) {
    // fetch refuses a body on GET/HEAD, so only attach one where the method
    // can carry it — the point under test is the gate, not the payload.
    const body = method === 'GET' ? undefined : {};

    test(`${method} ${path} is closed to a warehouse account`, async () => {
      const res = await send(method, path, warehouseToken, body);
      assert.equal(res.status, 403, `${method} ${path} let a warehouse account through`);
      assert.equal((await res.json()).message, message);
      assert.equal((await send(method, path, warehouseToken, body).then(r => r.json())).code, undefined,
        'a permission refusal must not sign the app out');
    });
  }

  /* This used to check that a cashier was kept out of the storeroom while
     still being let into the shared stock read. There is no cashier now, and
     no staff role left that the storeroom excludes — admin reaches everything.

     So what is worth pinning is the removal itself, at the HTTP layer: a token
     from before the role was withdrawn opens nothing at all, shared surface
     included. The legacy grace window is wide open in this file, which makes
     it the sharper version of the test — the leniency that carries roleless
     tokens across a deploy must not carry a withdrawn role with it. */
  test('a token from the retired cashier role opens nothing', async () => {
    accountIs('cashier');

    const shared = await send('GET', '/api/inventory', retiredCashierToken);
    assert.equal(shared.status, 401, 'a withdrawn role still read the shared surface');

    const ledger = await send('GET', '/api/receipts', retiredCashierToken);
    assert.equal(ledger.status, 401, 'a withdrawn role still reached the ledger');
  });
});
