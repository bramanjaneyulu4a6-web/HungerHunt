import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Room = (await import('../models/Room.js')).default;
const StaffReport = (await import('../models/StaffReport.js')).default;
const Student = (await import('../models/Student.js')).default;
const bcrypt = (await import('bcryptjs')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f191e810c19729de860e1';
// The caretaker's second room, and one they do not hold at all.
const SECOND_ROOM_ID = '507f191e810c19729de860e2';
const OTHER_ROOM_ID = '507f191e810c19729de860e7';
const OTHER_CARETAKER_ID = '507f1f77bcf86cd799439022';
const ORDER_ID = '507f191e810c19729de860e3';
const SECOND_ORDER_ID = '507f191e810c19729de860f0';
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

/* A caretaker may hold more than one room, so the rooms are a parameter here:
   every scoped read and write is expected to ask for all of them at once. */
const authenticateCaretaker = (roomIds = [ROOM_ID]) => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('caretaker') ? { _id: STAFF_ID } : null;
  });
  mock.method(Admin, 'findById', () => ({
    select: () => ({
      lean: async () => ({ _id: STAFF_ID, email: 'd4.caretaker@example.com', roomIds }),
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

const order = (roomId = ROOM_ID, roomNumber = 'D-4') => ({
  _id: ORDER_ID,
  transactionId: '507f191e810c19729de860e4',
  studentId: STUDENT_ID,
  studentSnapshot: { name: 'Asha', admissionNumber: 'A-10', roomNumber, roomId },
  items: [{ productId: '507f191e810c19729de860e6', name: 'Juice', quantity: 2, price: 10 }],
  totalAmount: 20,
  status: 'OUT_FOR_DELIVERY',
  transitions: [],
});

describe('caretaker fulfillment scope', () => {
  test('lists every live order in the assigned room from the moment it is created', async () => {
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
        'studentSnapshot.roomId': { $in: [ROOM_ID] },
      });
      return 2;
    });

    const response = await send('GET', '/api/v1/caretaker/fulfillment-orders');
    assert.equal(response.status, 200);
    /* DELIVERED belongs on this list: the warehouse has finished with the
       package but the student has not taken it yet. */
    assert.deepEqual(filter, {
      status: { $in: ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      'studentSnapshot.roomId': { $in: [ROOM_ID] },
    });
    const body = await response.json();
    assert.equal(body.data[0].status, 'PENDING');
    assert.equal(body.data[0].totalAmount, undefined);
    assert.equal(body.data[0].items[0].price, undefined);
    assert.equal(body.meta.awaitingCollection, 2);
    /* The unit map is the warehouse's picture of which rooms travel together.
       A caretaker already knows their own rooms, and everybody else's grouping
       is not theirs to read. */
    assert.equal(body.meta.roomUnits, undefined);
  });

  test('pages collected history for only the assigned room without prices', async () => {
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
      'studentSnapshot.roomId': { $in: [ROOM_ID] },
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
    // Still scoped to the rooms at the moment of the write, not only at read.
    assert.deepEqual(filter, {
      _id: ORDER_ID,
      status: 'DELIVERED',
      'studentSnapshot.roomId': { $in: [ROOM_ID] },
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
    assert.match((await response.json()).message, /handed it to your room/i);
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

  test('answers 404 for an order outside the assigned rooms', async () => {
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
    assert.deepEqual(filter, { _id: ORDER_ID, 'studentSnapshot.roomId': { $in: [ROOM_ID] } });
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

/* One caretaker, more than one room. The rooms are held together — one queue,
   one count, one round of handovers — so every scoped read and write has to ask
   for all of them at once. An equality filter left anywhere in this path does
   not fail loudly: it quietly hides half the packages, or shows somebody
   else's. These tests are what makes that failure loud. */
describe('a caretaker holding two rooms', () => {
  const BOTH_ROOMS = [ROOM_ID, SECOND_ROOM_ID];

  test('lists live orders from both rooms and counts both rooms as awaiting collection', async () => {
    authenticateCaretaker(BOTH_ROOMS);
    let filter;
    let countFilter;
    mock.method(FulfillmentOrder, 'find', (value) => {
      filter = value;
      const chain = {
        sort: () => chain,
        limit: () => chain,
        lean: async () => [
          { ...order(), status: 'PENDING' },
          { ...order(SECOND_ROOM_ID, 'D-5'), _id: SECOND_ORDER_ID, status: 'DELIVERED' },
        ],
      };
      return chain;
    });
    mock.method(FulfillmentOrder, 'countDocuments', async (value) => {
      countFilter = value;
      return 3;
    });

    const response = await send('GET', '/api/v1/caretaker/fulfillment-orders');
    assert.equal(response.status, 200);
    assert.deepEqual(filter, {
      status: { $in: ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'] },
      'studentSnapshot.roomId': { $in: BOTH_ROOMS },
    });
    /* One count over both rooms. Counting only the first would understate the
       handovers still to be made, on the number the caretaker works from. */
    assert.deepEqual(countFilter, {
      status: 'DELIVERED',
      'studentSnapshot.roomId': { $in: BOTH_ROOMS },
    });
    const body = await response.json();
    assert.deepEqual(body.data.map((row) => row.student.roomNumber), ['D-4', 'D-5']);
    assert.equal(body.meta.awaitingCollection, 3);
  });

  test('collects a package in the second room, and 404s for a room they do not hold', async () => {
    authenticateCaretaker(BOTH_ROOMS);
    await studentWithCode();

    /* The stub answers the filter honestly rather than always handing back the
       fixture: what is under test is which rooms the query reaches, so the
       room in the filter has to be the thing that decides. */
    const stored = { ...order(SECOND_ROOM_ID, 'D-5'), status: 'DELIVERED' };
    const matches = (filter) =>
      (filter['studentSnapshot.roomId']?.$in || []).includes(String(stored.studentSnapshot.roomId));
    mock.method(FulfillmentOrder, 'findOne', (filter) => ({
      lean: async () => (matches(filter) ? stored : null),
    }));
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, requested) => ({
      lean: async () => (matches(filter) ? { ...stored, status: 'COLLECTED', ...requested.$set } : null),
    }));

    const collected = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });
    assert.equal(collected.status, 200);
    assert.equal((await collected.json()).data.status, 'COLLECTED');

    // Same package, a caretaker who holds neither of its rooms: nothing to find.
    mock.restoreAll();
    authenticateCaretaker([OTHER_ROOM_ID]);
    await studentWithCode();
    let refusedFilter;
    mock.method(FulfillmentOrder, 'findOne', (filter) => {
      refusedFilter = filter;
      return { lean: async () => (matches(filter) ? stored : null) };
    });
    const update = mock.method(FulfillmentOrder, 'findOneAndUpdate', () => {
      throw new Error('must not update');
    });

    const refused = await send('POST', `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/collect`, {
      code: CODE,
    });
    assert.equal(refused.status, 404);
    assert.deepEqual(refusedFilter, {
      _id: ORDER_ID,
      'studentSnapshot.roomId': { $in: [OTHER_ROOM_ID] },
    });
    assert.equal(update.mock.callCount(), 0);
  });
});

/* The storeroom files one report per trolley, and a trolley is a unit: the set
   of rooms one caretaker takes in a single round. Two rooms held by the same
   person are one report; two rooms held by different people are two problems,
   and a group spanning both is refused rather than filed against whichever room
   happened to sort first. */
describe('a grouped warehouse report follows the caretaker unit, not the room', () => {
  const chain = (result) => {
    const query = {
      sort: () => query,
      skip: () => query,
      limit: () => query,
      select: () => query,
      lean: async () => result,
    };
    return query;
  };

  // Rooms D-4 and D-5 are one caretaker's round; E-1 is somebody else's.
  const twoUnits = () => {
    mock.method(Room, 'find', () => chain([
      { _id: ROOM_ID, code: 'D-4' },
      { _id: SECOND_ROOM_ID, code: 'D-5' },
      { _id: OTHER_ROOM_ID, code: 'E-1' },
    ]));
    mock.method(Admin, 'find', () => chain([
      { _id: STAFF_ID, roomIds: [ROOM_ID, SECOND_ROOM_ID] },
      { _id: OTHER_CARETAKER_ID, roomIds: [OTHER_ROOM_ID] },
    ]));
  };

  const pendingOrders = (rooms) => mock.method(FulfillmentOrder, 'find', () => chain(
    rooms.map((roomId, index) => ({
      _id: index === 0 ? ORDER_ID : SECOND_ORDER_ID,
      studentSnapshot: { roomId },
    }))
  ));

  const capturingCreate = () => {
    const captured = {};
    mock.method(StaffReport, 'countDocuments', async () => 0);
    mock.method(Admin, 'findById', () => ({
      select: () => ({ lean: async () => ({ name: 'Warehouse One', email: 'wh@example.test' }) }),
    }));
    mock.method(StaffReport, 'create', async (document) => {
      Object.assign(captured, document);
      return { toObject: () => ({ _id: '507f191e810c19729de860f1', createdAt: new Date(), handling: [], ...document }) };
    });
    return captured;
  };

  const file = (orderIds) => send('POST', '/api/v1/fulfillment-orders/warehouse-reports', {
    orderIds,
    category: 'MISSING_ITEM',
    note: 'Two bottles are unavailable on the shelf.',
  }, warehouseToken);

  test('accepts a group spanning both rooms of one unit', async () => {
    authenticateWarehouse();
    twoUnits();
    pendingOrders([ROOM_ID, SECOND_ROOM_ID]);
    const stored = capturingCreate();

    const response = await file([ORDER_ID, SECOND_ORDER_ID]);

    assert.equal(response.status, 201);
    // Stamped with the whole round, not only the rooms these two orders touched.
    assert.deepEqual(stored.roomIds, [ROOM_ID, SECOND_ROOM_ID]);
    assert.equal(stored.raiser.roomNumbers, 'D-4 · D-5');
    const body = await response.json();
    assert.equal(body.meta.groupedOrders, 2);
    assert.equal(body.meta.roomNumbers, 'D-4 · D-5');
  });

  test('refuses a group spanning two different units', async () => {
    authenticateWarehouse();
    twoUnits();
    pendingOrders([ROOM_ID, OTHER_ROOM_ID]);
    const create = mock.method(StaffReport, 'create', () => {
      throw new Error('must not file');
    });
    mock.method(StaffReport, 'countDocuments', async () => 0);

    const response = await file([ORDER_ID, SECOND_ORDER_ID]);

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body.error.details, [
      { field: 'orderIds', message: 'All orders in a grouped report must belong to one caretaker unit.' },
    ]);
    assert.equal(create.mock.callCount(), 0);
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
