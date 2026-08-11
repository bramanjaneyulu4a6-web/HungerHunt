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
