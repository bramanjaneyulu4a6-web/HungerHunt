/* The print-sheet endpoint: storeroom staff get a PDF of the active-orders
   board; nobody else gets anything. No database — model reads are stubbed,
   because what is under test is the gate and the shape of the response. */
import test, { before, beforeEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken, signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const STAFF_ID = '507f1f77bcf86cd799439011';
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const caretakerToken = signStaffToken(STAFF_ID, 'caretaker');
const parentToken = signParentToken('507f1f77bcf86cd799439013', '9876543210');

const query = (result) => {
  const chain = {
    sort: () => chain,
    limit: () => chain,
    select: () => chain,
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
  mock.method(Room, 'find', () => query([]));
  mock.method(Admin, 'find', () => query([]));
  mock.method(FulfillmentOrder, 'find', () =>
    query([
      {
        _id: '507f191e810c19729de860ef',
        status: 'PENDING',
        studentSnapshot: { name: 'Asha', roomNumber: 'D-4', roomId: '507f191e810c19729de860aa' },
        items: [{ productId: 'p1', name: 'Package', quantity: 2 }],
      },
    ])
  );
});

const printSheet = (token, search = '') =>
  fetch(`${base}/api/v1/fulfillment-orders/print${search}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

test('warehouse staff receive the board as a downloadable PDF', async () => {
  const response = await printSheet(warehouseToken);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  assert.match(
    response.headers.get('content-disposition'),
    /attachment; filename="orders-list-.+\.pdf"/
  );

  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 5).toString(), '%PDF-', 'the body is an actual PDF');
  assert.ok(body.length > 500, 'the document carries content, not just a header');
});

test('a sections query narrows the sheet and still returns a PDF', async () => {
  const response = await printSheet(warehouseToken, '?sections=PACKED,OUT_FOR_DELIVERY');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /application\/pdf/);
  const body = Buffer.from(await response.arrayBuffer());
  assert.equal(body.subarray(0, 5).toString(), '%PDF-');
});

test('a sections value the board does not have is refused, not guessed at', async () => {
  const response = await printSheet(warehouseToken, '?sections=DELIVERED');
  assert.equal(response.status, 400);
});

test('a caretaker token is turned away — the sheet is storeroom work', async () => {
  const response = await printSheet(caretakerToken);
  assert.equal(response.status, 403);
});

test('a parent token is turned away at the door', async () => {
  const response = await printSheet(parentToken);
  assert.equal(response.status, 401);
});
