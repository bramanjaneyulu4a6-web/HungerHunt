// The order half of goods-inwards: what was asked for, from whom, by whom.
// The received counts live on the order for cheap remaining-math, but they are
// only ever moved by receipts (Task 4) — nothing here writes them.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f191e810c19729de860ec';
const SUPPLIER_ID = '507f191e810c19729de860ea';
const PURCHASE_ID = '507f191e810c19729de860ed';

const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

// Models the one account row the gate looks up. Shared with the other role
// tests so the two stay in lockstep if a gate's filter shape ever changes.
const accountIs = accountMatcher(Admin, STAFF_ID);

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${warehouseToken}`,
    },
    body: JSON.stringify(body),
  });

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${warehouseToken}` } });

// Mongoose's findById(...).populate(...).populate(...) is a chainable query
// that is itself awaited — populate returns the same chain, and the chain
// resolves to the eventual document (or null) when awaited. This models that
// shape without a database: a thenable whose resolution is fixed up front.
const findByIdChain = (result) => {
  const chain = {
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('raising an order', () => {
  test('the storeroom can raise one, stamped with who and from whom', async () => {
    accountIs('warehouse');
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
    accountIs('warehouse');
    const res = await post('/api/purchases', {
      supplierId: 'not-an-id',
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    assert.equal(res.status, 400);
  });

  test('no supplier is still allowed — legacy orders never had one', async () => {
    accountIs('warehouse');
    mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));
    const res = await post('/api/purchases', {
      items: [{ productId: PRODUCT_ID, quantity: 10 }],
    });
    assert.equal(res.status, 201);
  });
});

/* Two ways to raise an order nothing downstream can ever finish. Both are
   about the same machinery: receipts are counted in whole units, and every
   write to items[].received uses the positional "items.$" operator, which
   touches only the first array element that matches. */
describe('an order that could never be received to the end', () => {
  test('a fractional quantity is refused at the door', async () => {
    accountIs('warehouse');
    const created = mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));

    // 2.5 kg reads perfectly well on a form and is unclosable forever after:
    // whole receipts never satisfy received >= 2.5, and the over-receipt guard
    // caps the last delivery at 2.
    const res = await post('/api/purchases', {
      items: [{ productId: PRODUCT_ID, quantity: 2.5 }],
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /whole quantity/i);
    assert.equal(created.mock.callCount(), 0);
  });

  test('two lines for one product become one line, not a line nothing can reach', async () => {
    accountIs('warehouse');
    let created;
    mock.method(Purchase, 'create', async (doc) => { created = doc; return { _id: 'x', ...doc }; });

    const res = await post('/api/purchases', {
      items: [
        { productId: PRODUCT_ID, quantity: 4 },
        { productId: PRODUCT_ID, quantity: 6, purchasePrice: 9 },
      ],
    });

    assert.equal(res.status, 201);
    assert.equal(created.items.length, 1, 'the second line is one no receipt could ever advance');
    assert.equal(created.items[0].quantity, 10);
    assert.equal(created.items[0].purchasePrice, 9, 'and a price that was given is not lost in the fold');
  });

  test('a count that is not a count is still refused', async () => {
    accountIs('warehouse');
    const created = mock.method(Purchase, 'create', async (doc) => ({ _id: 'x', ...doc }));

    for (const quantity of [null, '', true, [], 'six', -1]) {
      const res = await post('/api/purchases', { items: [{ productId: PRODUCT_ID, quantity }] });
      assert.equal(res.status, 400, `${JSON.stringify(quantity)} was accepted as a quantity`);
    }

    assert.equal(created.mock.callCount(), 0);
  });
});

describe('the open-orders list', () => {
  test('asks for NEW and PARTIAL, newest first', async () => {
    accountIs('warehouse');
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

/* The storeroom's inbox and the back office's pending list have to hold the
   same orders. While /new asked for NEW alone, a supplier who never shipped
   the last three units left an order the warehouse app could not receive to
   the end and the console could not see at all — nothing anywhere could close
   it. This widening is only safe alongside the over-receipt guard on the
   close, which is what stops the reappearing order being applied twice. */
describe('the back office pending list', () => {
  test('carries part-delivered orders too, so a short one can still be closed', async () => {
    accountIs('admin');
    let asked;
    mock.method(Purchase, 'find', (filter) => {
      asked = filter;
      const chain = { populate: () => chain, sort: async () => [] };
      return chain;
    });

    const res = await fetch(base + '/api/purchases/new', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);
    assert.deepEqual(asked, { status: { $in: ['NEW', 'PARTIAL'] } });
  });
});

/* The completed ledger is the only screen anyone reconciles the school's money
   against, and the whole of it rests on being able to tell two rows apart:
   one closed before receipts existed, which has no `received` field at all and
   whose ordered quantity *is* what arrived because the old close overwrote it;
   and one closed since, whose genuine `received: 0` means nothing came.

   Hydration erases that distinction. Mongoose applies the schema default, so
   the legacy row arrives carrying `received: 0` and the console's
   `item.received ?? item.quantity` never fires — every legacy order reports
   nothing arrived and ₹0.00 spent. Lean is what keeps absent absent. */
describe('the completed ledger', () => {
  // The console's rule, verbatim, so this test fails if the wire shape stops
  // being one the console can read.
  const receivedOf = (item) => item.received ?? item.quantity;

  const LEGACY = { productId: PRODUCT_ID, quantity: 10, purchasePrice: 5 };
  const SHORT_SHIPPED = { productId: PRODUCT_ID, quantity: 10, purchasePrice: 5, received: 0 };

  test('hands the rows back as they are stored, absent field and all', async () => {
    accountIs('admin');
    let leaned = false;

    const rows = [
      { _id: PURCHASE_ID, status: 'COMPLETED', items: [{ ...LEGACY }] },
      { _id: PURCHASE_ID, status: 'COMPLETED', items: [{ ...SHORT_SHIPPED }] },
    ];

    mock.method(Purchase, 'find', () => {
      const chain = {
        populate: () => chain,
        lean: async () => { leaned = true; return rows; },
        // Awaiting the chain without .lean() is what Mongoose does when it
        // hydrates, and hydration is what fills the schema default in.
        then: (resolve) => resolve(rows.map((row) => ({
          ...row,
          items: row.items.map((i) => ({ received: 0, ...i })),
        }))),
      };
      return chain;
    });

    const res = await fetch(base + '/api/purchases/completed', {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(res.status, 200);

    const [legacy, shortShipped] = await res.json();

    // The consequences first, because those are what somebody notices: the
    // ledger reporting nothing arrived and nothing spent on an order that was
    // delivered in full and paid for.
    assert.equal('received' in legacy.items[0], false,
      'a row that predates receipts must not gain a count it never had');
    assert.equal(receivedOf(legacy.items[0]), 10,
      'a legacy order reads as fully received — its quantity is what arrived');
    assert.equal(receivedOf(legacy.items[0]) * legacy.items[0].purchasePrice, 50,
      'and the money is priced off that, not off zero');

    assert.equal(receivedOf(shortShipped.items[0]), 0,
      'while a genuine received of 0 reads as fully short');

    assert.ok(leaned, 'and lean is the only thing keeping the two rows apart');
  });
});

describe('reading one order', () => {
  test('a valid id that exists returns the populated document', async () => {
    accountIs('warehouse');
    const doc = {
      _id: PURCHASE_ID,
      status: 'PARTIAL',
      supplierId: SUPPLIER_ID,
      items: [{ productId: PRODUCT_ID, quantity: 10, received: 4 }],
    };
    mock.method(Purchase, 'findById', (id) => {
      assert.equal(id, PURCHASE_ID);
      return findByIdChain(doc);
    });

    const res = await get(`/api/purchases/${PURCHASE_ID}`);

    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), doc);
  });

  test('an id that is not a valid ObjectId is refused, not looked up', async () => {
    accountIs('warehouse');
    let called = false;
    mock.method(Purchase, 'findById', () => { called = true; return findByIdChain(null); });

    const res = await get('/api/purchases/not-an-id');

    assert.equal(res.status, 404);
    assert.equal((await res.json()).message, 'Purchase not found');
    assert.equal(called, false, 'a malformed id reached the database');
  });

  test('a valid ObjectId that finds nothing is a 404', async () => {
    accountIs('warehouse');
    mock.method(Purchase, 'findById', () => findByIdChain(null));

    const res = await get(`/api/purchases/${PURCHASE_ID}`);

    assert.equal(res.status, 404);
    assert.equal((await res.json()).message, 'Purchase not found');
  });
});
