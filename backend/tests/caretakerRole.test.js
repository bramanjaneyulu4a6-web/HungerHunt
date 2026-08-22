import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Student = (await import('../models/Student.js')).default;
const bcrypt = (await import('bcryptjs')).default;
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

const STUDENT_ID = '507f191e810c19729de860e5';
const CODE = '4821';

/* The collection route reads the student the order names and compares the
   typed code against the stored hash. Both are mocked here; what the tests
   are about is which packages the code is allowed to move, and what a wrong
   or locked code costs. */
const studentWithCode = async (overrides = {}) => {
  const hash = await bcrypt.hash(CODE, 4);
  mock.method(Student, 'findById', () => ({
    select: async () => ({
      _id: STUDENT_ID,
      active: true,
      purchasePassword: hash,
      purchaseCodeIsPin: true,
      purchaseCodeAttempts: 0,
      purchaseCodeLockedUntil: null,
      ...overrides,
    }),
  }));
  mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));
};

const order = (hostelId = HOSTEL_ID) => ({
  _id: ORDER_ID,
  transactionId: '507f191e810c19729de860e4',
  studentId: STUDENT_ID,
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
        status: 'DELIVERED',
        'studentSnapshot.hostelId': HOSTEL_ID,
      });
      return 2;
    });

    const response = await send('GET', '/api/v1/caretaker/fulfillment-orders');
    assert.equal(response.status, 200);
    /* DELIVERED belongs on this list: the warehouse has finished with the
       package but the student has not taken it yet. */
    assert.deepEqual(filter, {
      status: { $in: ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    const body = await response.json();
    assert.equal(body.data[0].status, 'PENDING');
    assert.equal(body.data[0].totalAmount, undefined);
    assert.equal(body.data[0].items[0].price, undefined);
    assert.equal(body.meta.awaitingCollection, 2);
  });

  test('pages collected history for only the assigned hostel without prices', async () => {
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
          status: 'COLLECTED',
          deliveredAt: new Date('2026-08-14T10:00:00.000Z'),
          collectedAt: new Date('2026-08-14T16:00:00.000Z'),
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
    /* A package the caretaker is still holding is work, not history. Only a
       package its student has taken leaves the queue for this log. */
    assert.deepEqual(filter, {
      status: 'COLLECTED',
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    assert.deepEqual(sort, { collectedAt: -1, _id: -1 });
    const body = await response.json();
    assert.equal(body.data[0].totalAmount, undefined);
    assert.equal(body.data[0].items[0].price, undefined);
    assert.equal(body.meta.hasMore, true);
    assert.equal(body.meta.total, 26);
  });

  test('the student\'s own code is what marks a package collected', async () => {
    authenticateCaretaker();
    await studentWithCode();
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'DELIVERED' }),
    }));
    let filter;
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (requestedFilter, requested) => {
      filter = requestedFilter;
      update = requested;
      return { lean: async () => ({ ...order(), status: 'COLLECTED', ...requested.$set }) };
    });

    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });

    assert.equal(response.status, 200);
    // Still scoped to the hostel at the moment of the write, not only at read.
    assert.deepEqual(filter, {
      _id: ORDER_ID,
      status: 'DELIVERED',
      'studentSnapshot.hostelId': HOSTEL_ID,
    });
    assert.equal(update.$set.status, 'COLLECTED');
    assert.equal(String(update.$set.collectedBy), STAFF_ID);
    assert.equal(update.$push.transitions.from, 'DELIVERED');
    assert.equal(update.$push.transitions.to, 'COLLECTED');
    const body = await response.json();
    assert.equal(body.data.status, 'COLLECTED');
    // A caretaker never sees what a package cost, on this route either.
    assert.equal(body.data.totalAmount, undefined);
  });

  test('a wrong code collects nothing and is counted against the student', async () => {
    authenticateCaretaker();
    await studentWithCode();
    let miss;
    mock.method(Student, 'updateOne', async (_filter, update) => {
      miss = update;
      return { modifiedCount: 1 };
    });
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'DELIVERED' }),
    }));
    const update = mock.method(FulfillmentOrder, 'findOneAndUpdate', () => {
      throw new Error('must not update');
    });

    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: '0000',
    });

    assert.equal(response.status, 400);
    assert.equal(update.mock.callCount(), 0);
    // The same counter the till reads — five misses lock both doors.
    assert.deepEqual(miss, { $inc: { purchaseCodeAttempts: 1 } });
  });

  test('a locked code is refused without reading the hash', async () => {
    authenticateCaretaker();
    await studentWithCode({
      purchaseCodeLockedUntil: new Date(Date.now() + 60_000),
    });
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'DELIVERED' }),
    }));
    const update = mock.method(FulfillmentOrder, 'findOneAndUpdate', () => {
      throw new Error('must not update');
    });

    // Even the right code: answering a locked student differently would tell
    // a guesser they had just found it.
    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });

    assert.equal(response.status, 423);
    assert.equal((await response.json()).error.code, 'CODE_LOCKED');
    assert.equal(update.mock.callCount(), 0);
  });

  test('a package the warehouse has not delivered yet costs no code attempt', async () => {
    authenticateCaretaker();
    const student = mock.method(Student, 'findById', () => { throw new Error('must not run'); });
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'OUT_FOR_DELIVERY' }),
    }));
    const update = mock.method(FulfillmentOrder, 'findOneAndUpdate', () => {
      throw new Error('must not update');
    });

    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /delivered it to your hostel/i);
    assert.equal(student.mock.callCount(), 0);
    assert.equal(update.mock.callCount(), 0);
  });

  test('a package already collected is not collected twice', async () => {
    authenticateCaretaker();
    mock.method(FulfillmentOrder, 'findOne', () => ({
      lean: async () => ({ ...order(), status: 'COLLECTED' }),
    }));

    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /already been collected/i);
  });

  test('answers 404 for an order outside the assigned hostel', async () => {
    authenticateCaretaker();
    let filter;
    mock.method(FulfillmentOrder, 'findOne', (value) => {
      filter = value;
      return { lean: async () => null };
    });
    const response = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });
    assert.equal(response.status, 404);
    assert.deepEqual(filter, { _id: ORDER_ID, 'studentSnapshot.hostelId': HOSTEL_ID });
  });

  test('a caretaker has no transition route left to reach for', async () => {
    authenticateCaretaker();
    const response = await send(
      'POST',
      `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/transition`,
      { status: 'DELIVERED' }
    );
    assert.equal(response.status, 404);
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
  test('warehouse cannot collect a package on the student\'s behalf', async () => {
    authenticateWarehouse();
    const find = mock.method(FulfillmentOrder, 'findById', () => { throw new Error('must not run'); });
    const response = await send(
      'POST',
      `/api/v1/fulfillment-orders/${ORDER_ID}/transition`,
      { status: 'COLLECTED' },
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

  test('the caretaker collection route is forbidden', async () => {
    authenticateWarehouse();
    assert.equal(
      (await send(
        'POST',
        `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`,
        { code: CODE },
        warehouseToken
      )).status,
      403
    );
  });

  for (const [method, path] of [
    ['GET', '/api/v1/caretaker/fulfillment-orders/history'],
  ]) {
    test(`${method} ${path} is forbidden`, async () => {
      authenticateWarehouse();
      assert.equal((await send(method, path, undefined, warehouseToken)).status, 403);
    });
  }
});
