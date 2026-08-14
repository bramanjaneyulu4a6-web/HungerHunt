// Manual stock movements — spoilage, breakage, stocktake, opening stock —
// with the same discipline as goods receipts: the Inventory number stays
// derivable, and every movement has a row saying who and why. No movement
// without a row, in either direction.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
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

  test('a rollback guards its decrement the same way a real write-down does', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));
    mock.method(Inventory, 'findOneAndUpdate', async () => ({ productId: PRODUCT_ID, stock: 15 }));
    mock.method(StockAdjustment, 'create', async () => { throw new Error('db down'); });
    let filter;
    mock.method(Inventory, 'updateOne', async (f) => { filter = f; return { matchedCount: 1 }; });

    const res = await adjust({ delta: 5, reason: 'opening stock' });

    assert.equal(res.status, 500);
    assert.deepEqual(filter, { productId: PRODUCT_ID, stock: { $gte: 5 } });
  });

  // Concurrent sales can drain the shelf in the window between a write-up
  // landing and its ledger row failing to write. Letting the compensation
  // through anyway would push stock negative — this is what stops it, and
  // it must not do so silently.
  test('a rollback the guard refuses is logged, not swallowed', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));
    mock.method(Inventory, 'findOneAndUpdate', async () => ({ productId: PRODUCT_ID, stock: 15 }));
    mock.method(StockAdjustment, 'create', async () => { throw new Error('db down'); });
    mock.method(Inventory, 'updateOne', async () => ({ matchedCount: 0 }));

    let logged = false;
    mock.method(console, 'error', (...args) => {
      if (String(args[0]).includes('Adjustment rollback refused')) logged = true;
    });

    const res = await adjust({ delta: 5, reason: 'opening stock' });

    assert.equal(res.status, 500);
    assert.ok(logged, 'a rollback the guard blocked must still be on record');
  });

  test('a write-down\'s rollback compensation is an increment and carries no guard', async () => {
    accountIs('admin');
    mock.method(Inventory, 'findOne', async () => ({ productId: PRODUCT_ID, stock: 10 }));
    mock.method(Inventory, 'findOneAndUpdate', async () => ({ productId: PRODUCT_ID, stock: 5 }));
    mock.method(StockAdjustment, 'create', async () => { throw new Error('db down'); });
    let filter;
    mock.method(Inventory, 'updateOne', async (f) => { filter = f; return { matchedCount: 1 }; });

    const res = await adjust({ delta: -5, reason: 'stocktake' });

    assert.equal(res.status, 500);
    assert.deepEqual(filter, { productId: PRODUCT_ID });
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
