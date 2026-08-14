import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const HOSTEL_ID = '507f191e810c19729de860e1';
const ORDER_ID = '507f191e810c19729de860e3';
const token = signStaffToken(STAFF_ID, 'caretaker');
const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const authenticateCaretaker = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('caretaker') ? { _id: STAFF_ID } : null;
  });
  mock.method(Admin, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: STAFF_ID, email: 'd4.caretaker@example.com', hostelId: HOSTEL_ID }),
    }),
  }));
};

const authenticateWarehouse = () => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('warehouse') ? { _id: STAFF_ID } : null;
  });
};

const send = (method, path, body, authToken = token) => fetch(base + path, {
  method,
  headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
  body: body === undefined ? undefined : JSON.stringify(body),
});

const order = (hostelId = HOSTEL_ID) => ({
  _id: ORDER_ID,
  transactionId: '507f191e810c19729de860e4',
  studentId: '507f191e810c19729de860e5',
  studentSnapshot: { name: 'Asha', admissionNumber: 'A-10', hostelNumber: 'D-4', hostelId },
  items: [{ productId: '507f191e810c19729de860e6', name: 'Juice', quantity: 2, price: 10 }],
  totalAmount: 20,
  status: 'OUT_FOR_DELIVERY',
  transitions: [],
});

describe('caretaker fulfillment scope', () => {
  test('lists every live order in the assigned hostel from the moment it is created', async () => {
    authenticateCaretaker();
    let filter;
    mock.method(FulfillmentOrder, 'find', (value) => {
      filter = value;
      const chain = {
        sort: () => chain,
        limit: () => chain,
        lean: async () => [{ ...order(), status: 'PENDING' }],
      };
      return chain;
    });
    mock.method(FulfillmentOrder, 'countDocuments', async (value) => {
      assert.deepEqual(value, {
        status: 'OUT_FOR_DELIVERY',
        'studentSnapshot.hostelId': HOSTEL_ID,
      });
      return 2;
    });

    const response = await send('GET', '/api/v1/caretaker/fulfillment-orders');
    assert.equal(response.status, 200);
    assert.deepEqual(filter, {
      status: { $in: ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY'] },
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    const body = await response.json();
    assert.equal(body.data[0].status, 'PENDING');
    assert.equal(body.data[0].totalAmount, undefined);
    assert.equal(body.data[0].items[0].price, undefined);
    assert.equal(body.meta.receivableCount, 2);
  });

  test('pages delivered history for only the assigned hostel without prices', async () => {
    authenticateCaretaker();
    let filter;
    let sort;
    mock.method(FulfillmentOrder, 'find', (value) => {
      filter = value;
      const chain = {
        sort: (value) => { sort = value; return chain; },
        skip: () => chain,
        limit: () => chain,
        lean: async () => [{
          ...order(),
          status: 'DELIVERED',
          deliveredAt: new Date('2026-08-14T10:00:00.000Z'),
        }],
      };
      return chain;
    });
    mock.method(FulfillmentOrder, 'countDocuments', async (value) => {
      assert.deepEqual(value, filter);
      return 26;
    });

    const response = await send('GET', '/api/v1/caretaker/fulfillment-orders/history?page=1&limit=25');
    assert.equal(response.status, 200);
    assert.deepEqual(filter, {
      status: 'DELIVERED',
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    assert.deepEqual(sort, { deliveredAt: -1, _id: -1 });
    const body = await response.json();
    assert.equal(body.data[0].totalAmount, undefined);
    assert.equal(body.data[0].items[0].price, undefined);
    assert.equal(body.meta.hasMore, true);
    assert.equal(body.meta.total, 26);
  });

  test('receives every out-for-delivery package in the assigned hostel', async () => {
    authenticateCaretaker();
    let filter;
    let update;
    mock.method(FulfillmentOrder, 'updateMany', async (value, changes) => {
      filter = value;
      update = changes;
      return { modifiedCount: 3 };
    });

    const response = await send('POST', '/api/v1/caretaker/fulfillment-orders/receive-all');
    assert.equal(response.status, 200);
    assert.deepEqual(filter, {
      status: 'OUT_FOR_DELIVERY',
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    assert.equal(update.$set.status, 'DELIVERED');
    assert.equal(update.$set.proofOfDelivery.receivedBy, 'd4.caretaker@example.com');
    assert.equal(String(update.$set.deliveredBy), STAFF_ID);
    assert.equal(update.$push.transitions.from, 'OUT_FOR_DELIVERY');
    assert.equal(update.$push.transitions.to, 'DELIVERED');
    const body = await response.json();
    assert.equal(body.data.receivedCount, 3);
    assert.equal(typeof body.meta.requestId, 'string');
  });

  test('refuses every other transition before looking up the order', async () => {
    authenticateCaretaker();
    const find = mock.method(FulfillmentOrder, 'findOne', () => { throw new Error('must not run'); });
    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`, { status: 'PACKED' });
    assert.equal(response.status, 403);
    assert.equal(find.mock.callCount(), 0);
  });

  test('answers 404 for an order outside the assigned hostel', async () => {
    authenticateCaretaker();
    let filter;
    mock.method(FulfillmentOrder, 'findOne', (value) => {
      filter = value;
      return { lean: async () => null };
    });
    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`, { status: 'DELIVERED' });
    assert.equal(response.status, 404);
    assert.deepEqual(filter, { _id: ORDER_ID, 'studentSnapshot.hostelId': HOSTEL_ID });
  });

  test('cannot receive an order before warehouse dispatch', async () => {
    authenticateCaretaker();
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'PENDING' }),
    }));
    const update = mock.method(FulfillmentOrder, 'findOneAndUpdate', () => {
      throw new Error('must not update');
    });

    const response = await send(
      'POST',
      `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`,
      { status: 'DELIVERED' }
    );
    assert.equal(response.status, 409);
    assert.equal(update.mock.callCount(), 0);
  });

  test('records the authenticated account and ignores receivedBy in the body', async () => {
    authenticateCaretaker();
    mock.method(FulfillmentOrder, 'findOne', () => ({ lean: async () => order() }));
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (_filter, value) => {
      update = value;
      return { lean: async () => ({ ...order(), status: 'DELIVERED', ...value.$set }) };
    });

    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`, {
      status: 'DELIVERED',
      receivedBy: 'Untrusted body value',
    });
    assert.equal(response.status, 200);
    assert.equal(update.$set.proofOfDelivery.receivedBy, 'd4.caretaker@example.com');
    assert.equal(String(update.$set.proofOfDelivery.recordedBy), STAFF_ID);
  });
});

describe('caretakers do not inherit warehouse access', () => {
  for (const path of [
    '/api/inventory',
    '/api/products',
    '/api/suppliers',
    '/api/receipts',
    '/api/purchases/open',
    '/api/v1/fulfillment-orders',
    '/api/v1/fulfillment-orders/alerts',
  ]) {
    test(`GET ${path} is forbidden`, async () => {
      authenticateCaretaker();
      assert.equal((await send('GET', path)).status, 403);
    });
  }
});

describe('warehouse accounts do not inherit caretaker access', () => {
  test('warehouse cannot mark an order delivered through its own route', async () => {
    authenticateWarehouse();
    const find = mock.method(FulfillmentOrder, 'findById', () => { throw new Error('must not run'); });
    const response = await send(
      'POST',
      `/api/v1/fulfillment-orders/${ORDER_ID}/transition`,
      { status: 'DELIVERED', receivedBy: 'Warehouse' },
      warehouseToken
    );
    assert.equal(response.status, 403);
    assert.equal(find.mock.callCount(), 0);
  });

  test('the caretaker list is forbidden', async () => {
    authenticateWarehouse();
    assert.equal(
      (await send('GET', '/api/v1/caretaker/fulfillment-orders', undefined, warehouseToken)).status,
      403
    );
  });

  test('the caretaker delivery transition is forbidden', async () => {
    authenticateWarehouse();
    assert.equal(
      (await send(
        'POST',
        `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`,
        { status: 'DELIVERED' },
        warehouseToken
      )).status,
      403
    );
  });

  for (const [method, path] of [
    ['GET', '/api/v1/caretaker/fulfillment-orders/history'],
    ['POST', '/api/v1/caretaker/fulfillment-orders/receive-all'],
  ]) {
    test(`${method} ${path} is forbidden`, async () => {
      authenticateWarehouse();
      assert.equal((await send(method, path, undefined, warehouseToken)).status, 403);
    });
  }
});
