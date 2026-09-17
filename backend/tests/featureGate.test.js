/* The switches that move money or stock are refused by the server when a
 * super admin has hidden them, not only hidden in the app. No database. */
import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const FeatureVisibility = (await import('../models/FeatureVisibility.js')).default;
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

const STAFF_ID = '507f1f77bcf86cd799439011';
const ID = '507f191e810c19729de860ee';
const accountIs = accountMatcher(Admin, STAFF_ID);
const query = (value) => ({ select() { return this; }, lean: async () => value });

// The account row and its role's stored list, as the gate reads them.
const settings = ({ role = 'admin', hidden = null, featureOverrides = [], isSuperAdmin = false }) => {
  accountIs(role);
  mock.method(Admin, 'findById', () => query({ _id: STAFF_ID, role, featureOverrides, isSuperAdmin }));
  mock.method(FeatureVisibility, 'findOne', () => query(hidden ? { role, hidden } : null));
};

let base;
before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});
afterEach(() => mock.restoreAll());

const call = (method, path, body, token = signAdminToken(STAFF_ID)) =>
  fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', 'Idempotency-Key': 'k-1' },
    body: JSON.stringify(body),
  });

const refused = async (response) => {
  assert.equal(response.status, 403);
  assert.equal((await response.json()).code, 'FEATURE_HIDDEN');
};

describe('switched-off money and stock actions', () => {
  test('a recharge is refused', async () => {
    settings({ hidden: ['students.recharge'] });
    await refused(await call('PUT', `/api/students/${ID}/topup`, { amount: 100 }));
  });

  test('a stock adjustment is refused', async () => {
    settings({ featureOverrides: [{ key: 'inventory.adjustStock', value: 'hidden' }] });
    await refused(await call('POST', `/api/inventory/${ID}/adjust`, { quantity: 1, reason: 'x' }));
  });

  test('a cancellation is refused, but other status changes are not judged by that switch', async () => {
    settings({ hidden: ['orders.cancelRefund'] });
    await refused(await call('POST', `/api/v1/fulfillment-orders/${ID}/transition`, { status: 'CANCELLED', reason: 'x' }));

    settings({ hidden: ['orders.cancelRefund'] });
    const packing = await call('POST', `/api/v1/fulfillment-orders/${ID}/transition`, { status: 'NOT_A_STATUS' });
    assert.notEqual(packing.status, 403);
  });

  test("a warehouse account's delivery receipt is refused", async () => {
    settings({ role: 'warehouse', hidden: ['warehouse.receive'] });
    await refused(await call('POST', `/api/purchases/${ID}/receipts`, { lines: [] }, signStaffToken(STAFF_ID, 'warehouse')));
  });

  test('a super admin is never refused', async () => {
    settings({ hidden: ['students.recharge'], isSuperAdmin: true });
    const response = await call('PUT', `/api/students/${ID}/topup`, { amount: 0 });
    assert.notEqual(response.status, 403);
  });
});
