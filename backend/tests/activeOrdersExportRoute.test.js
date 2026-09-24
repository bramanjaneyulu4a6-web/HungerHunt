import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const STAFF_ID = '507f1f77bcf86cd799439011';
const adminToken = signStaffToken(STAFF_ID, 'admin');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

const query = (result) => {
  const chain = {
    populate: () => chain,
    select: () => chain,
    sort: () => chain,
    limit: () => chain,
    lean: async () => result,
  };
  return chain;
};

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
  mock.method(Admin, 'find', () => query([
    { _id: 'caretaker-1', name: 'Anu', roomIds: ['507f191e810c19729de860aa'] },
  ]));
  mock.method(FulfillmentOrder, 'find', () => query([
    {
      _id: '507f191e810c19729de860ef',
      status: 'PENDING',
      orderedAt: new Date(),
      studentSnapshot: {
        name: 'Asha', roomNumber: 'D-4', roomId: '507f191e810c19729de860aa',
      },
      items: [{ productId: 'p1', name: 'Package', quantity: 2 }],
    },
  ]));
  mock.method(PendingOrder, 'find', () => query([]));
});

const exportSheet = (token) => fetch(`${base}/api/v1/fulfillment-orders/admin-export`, {
  headers: { Authorization: `Bearer ${token}` },
});

test('an admin receives the active orders grouped PDF', async () => {
  const response = await exportSheet(adminToken);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(
    response.headers.get('content-disposition'),
    /attachment; filename="active-orders-by-caretaker-.+\.pdf"/
  );
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 5).toString(), '%PDF-');
  assert.ok(body.length > 500);
});

test('warehouse staff cannot use the admin export', async () => {
  const response = await exportSheet(warehouseToken);
  assert.equal(response.status, 403);
});
