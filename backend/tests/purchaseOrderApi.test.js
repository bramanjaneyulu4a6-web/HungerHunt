import test, { afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';
// Set before app.js is imported: the flag is read once at module scope.
process.env.FEATURE_V1_PROCUREMENT = 'true';

const Admin = (await import('../models/Admin.js')).default;
const Purchase = (await import('../models/Purchase.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

const STAFF_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f191e810c19729de860ec';
const PURCHASE_ID = '507f191e810c19729de860ed';
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const adminToken = signStaffToken(STAFF_ID, 'admin');
const accountIs = accountMatcher(Admin, STAFF_ID);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const request = (path, token, body) => fetch(base + path, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body),
});

describe('v1 Warehouse–Accounts purchase-order contract', () => {
  test('warehouse submits a validated request in PENDING_REVIEW', async () => {
    accountIs('warehouse');
    let stored;
    mock.method(Purchase, 'create', async ([document]) => {
      stored = document;
      return [{ _id: PURCHASE_ID, createdAt: new Date(), ...document }];
    });

    const response = await request('/api/v1/purchase-orders', warehouseToken, {
      reason: 'Below threshold',
      items: [{ productId: PRODUCT_ID, quantity: 12, estimatedUnitCost: 5 }],
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(stored.status, 'PENDING_REVIEW');
    assert.equal(String(stored.raisedBy), STAFF_ID);
    assert.equal(body.data.items[0].estimatedUnitCost, 5);
    assert.ok(response.headers.get('x-request-id'));
  });

  test('invalid DTOs return stable field-level validation errors', async () => {
    accountIs('warehouse');
    const response = await request('/api/v1/purchase-orders', warehouseToken, {
      items: [{ productId: 'bad', quantity: 1.5 }],
    });
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.error.code, 'VALIDATION_ERROR');
    assert.deepEqual(body.error.details.map((detail) => detail.field), [
      'items[0].productId',
      'items[0].quantity',
    ]);
  });

  test('only Accounts admin can decide, using an expected-state update', async () => {
    accountIs('warehouse');
    const denied = await request(
      `/api/v1/purchase-orders/${PURCHASE_ID}/decision`,
      warehouseToken,
      { decision: 'APPROVED' }
    );
    assert.equal(denied.status, 403);

    mock.restoreAll();
    accountIs('admin');
    let filter;
    mock.method(Purchase, 'findOneAndUpdate', async (requestedFilter, update) => {
      filter = requestedFilter;
      return {
        _id: PURCHASE_ID,
        status: update.$set.status,
        items: [{ productId: PRODUCT_ID, quantity: 12, received: 0, purchasePrice: 5 }],
        createdAt: new Date(),
      };
    });

    const approved = await request(
      `/api/v1/purchase-orders/${PURCHASE_ID}/decision`,
      adminToken,
      { decision: 'APPROVED', reason: 'Within budget' }
    );

    assert.equal(approved.status, 200);
    assert.deepEqual(filter, { _id: PURCHASE_ID, status: 'PENDING_REVIEW' });
    assert.equal((await approved.json()).data.status, 'APPROVED');
  });
});

