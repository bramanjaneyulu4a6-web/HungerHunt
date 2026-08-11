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
