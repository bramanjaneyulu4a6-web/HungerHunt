import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const StaffReport = (await import('../models/StaffReport.js')).default;
const Counter = (await import('../models/Counter.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const ROOM_ID = '507f191e810c19729de860e1';
const SECOND_ROOM_ID = '507f191e810c19729de860e2';
const ORDER_ID = '507f191e810c19729de860e3';
const REPORT_ID = '507f191e810c19729de860e9';
const JUICE_ID = '507f191e810c19729de860a1';
const CHIPS_ID = '507f191e810c19729de860a2';
const STRANGER_PRODUCT_ID = '507f191e810c19729de860a9';

const caretakerToken = signStaffToken(STAFF_ID, 'caretaker');

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const asCaretaker = (roomIds = [ROOM_ID]) => {
  mock.method(Admin, 'exists', async (filter) => {
    const allowed = filter.$or?.find((branch) => branch.role?.$in)?.role.$in || [];
    return String(filter._id) === STAFF_ID && allowed.includes('caretaker') ? { _id: STAFF_ID } : null;
  });
  mock.method(Admin, 'findById', () => ({
    select: () => ({
      lean: async () => ({
        _id: STAFF_ID,
        name: 'Meena Rao',
        email: 'd4.caretaker@example.com',
        roomIds,
      }),
    }),
  }));
};

const send = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { Authorization: `Bearer ${caretakerToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${caretakerToken}` } });

const report = (body) => send(`/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/student-report`, body);

const noOpenReports = () => mock.method(StaffReport, 'countDocuments', async () => 0);

const deliveredPackage = (overrides = {}) => {
  let filter;
  mock.method(FulfillmentOrder, 'findOne', (requested) => {
    filter = requested;
    return {
      select: () => ({
        lean: async () => ({
          _id: ORDER_ID,
          studentSnapshot: {
            name: 'Asha Verma', roomNumber: 'D-4', roomId: ROOM_ID, admissionNumber: 'ADM-113',
          },
          status: 'DELIVERED',
          items: [
            { productId: JUICE_ID, name: 'Apple Juice', quantity: 2 },
            { productId: CHIPS_ID, name: 'Banana Chips', quantity: 1 },
          ],
          ...overrides,
        }),
      }),
    };
  });
  return () => filter;
};

const missingPackage = () =>
  mock.method(FulfillmentOrder, 'findOne', () => ({
    select: () => ({ lean: async () => null }),
  }));

const capturingCreate = () => {
  const captured = {};
  mock.method(StaffReport, 'create', async (document) => {
    Object.assign(captured, document);
    return {
      toObject: () => ({ _id: REPORT_ID, createdAt: new Date(), handling: [], ...document }),
    };
  });
  return captured;
};

const nextNumber = (value = 42) => mock.method(Counter, 'nextSequence', async () => value);

describe('what a student may report at handover', () => {
  test('files the report as the student, with the affected items snapshotted', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();
    nextNumber(42);
    const captured = capturingCreate();

    const response = await report({
      category: 'WRONG_ITEM',
      note: 'I ordered apple juice but the bottles in the box are mango.',
      items: [{ productId: JUICE_ID, quantity: 2 }],
      // Ignored: the session and the order decide who is speaking.
      raiser: { name: 'Somebody else', role: 'admin' },
      status: 'RESOLVED',
    });

    assert.equal(response.status, 201);
    assert.equal(captured.kind, 'ORDER_ISSUE');
    assert.equal(captured.category, 'WRONG_ITEM');
    assert.equal(String(captured.raisedBy), STAFF_ID);
    assert.equal(captured.raiser.name, 'Asha Verma');
    assert.equal(captured.raiser.role, 'student');
    assert.equal(captured.raiser.roomNumbers, 'D-4');
    assert.equal(captured.status, 'OPEN');
    assert.equal(captured.order.statusAtReport, 'DELIVERED');
    assert.equal(captured.reportNumber, 42);
    // The client sends ids and counts; the names come from the order itself.
    assert.deepEqual(
      captured.affectedItems.map(({ productId, name, quantity }) => ({
        productId: String(productId),
        name,
        quantity,
      })),
      [{ productId: JUICE_ID, name: 'Apple Juice', quantity: 2 }]
    );

    const body = await response.json();
    assert.equal(body.data.reportNumber, 42);
    assert.equal(body.data.status, 'OPEN');
  });

  /* A student stands in one room. Stamping the caretaker's whole set would let
     a colleague who shares only one of those rooms read this student's name and
     complaint about a room they do not hold, because the read-back filter
     matches on any overlap. */
  test("is stamped with the order's own room, not the caretaker's whole set", async () => {
    asCaretaker([ROOM_ID, SECOND_ROOM_ID]);
    noOpenReports();
    deliveredPackage();
    nextNumber(43);
    const captured = capturingCreate();

    const response = await report({
      category: 'OTHER',
      note: 'The box was left open on the shelf before I arrived.',
    });

    assert.equal(response.status, 201);
    assert.deepEqual(captured.roomIds.map(String), [ROOM_ID]);
    assert.equal(captured.raiser.roomNumbers, 'D-4');
  });

  test('an item category with no items selected is refused', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();

    const response = await report({
      category: 'MISSING_ITEM',
      note: 'The chips were not in the box when I opened it.',
      items: [],
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.some((detail) => detail.field === 'items'));
  });

  test('an item that is not in the package is refused', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();

    const response = await report({
      category: 'QUALITY_ISSUE',
      note: 'The biscuits taste stale and past their date.',
      items: [{ productId: STRANGER_PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.some((detail) => detail.field === 'items'));
  });

  test('a count above what was ordered is refused', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();

    const response = await report({
      category: 'MISSING_ITEM',
      note: 'Both packets of chips are missing from my package.',
      items: [{ productId: CHIPS_ID, quantity: 5 }],
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.some((detail) => detail.field === 'items'));
  });

  test('OTHER needs no item list', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();
    nextNumber(7);
    const captured = capturingCreate();

    const response = await report({
      category: 'OTHER',
      note: 'The box was left open on the shelf before I arrived.',
    });

    assert.equal(response.status, 201);
    assert.equal(captured.affectedItems, undefined);
  });

  test('a package the warehouse still holds cannot be reported on this screen', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage({ status: 'PACKED' });

    const response = await report({
      category: 'WRONG_ITEM',
      note: 'These are not the items I ordered at the kiosk.',
      items: [{ productId: JUICE_ID, quantity: 1 }],
    });

    assert.equal(response.status, 409);
  });

  test("another room's package is a 404, not a refusal", async () => {
    asCaretaker();
    noOpenReports();
    missingPackage();

    const response = await report({
      category: 'WRONG_ITEM',
      note: 'These are not the items I ordered at the kiosk.',
      items: [{ productId: JUICE_ID, quantity: 1 }],
    });

    assert.equal(response.status, 404);
  });

  test('a note that says nothing is refused', async () => {
    asCaretaker();
    noOpenReports();
    deliveredPackage();

    const response = await report({
      category: 'WRONG_ITEM',
      note: 'bad',
      items: [{ productId: JUICE_ID, quantity: 1 }],
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.ok(body.error.details.some((detail) => detail.field === 'note'));
  });
});

describe('what the handover screen shows back', () => {
  test("lists only this order's student-raised reports, for the student to see", async () => {
    asCaretaker();
    let filter;
    mock.method(StaffReport, 'find', (requested) => {
      filter = requested;
      return {
        sort: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: REPORT_ID,
                kind: 'ORDER_ISSUE',
                category: 'MISSING_ITEM',
                note: 'The chips were not in the box when I opened it.',
                status: 'OPEN',
                reportNumber: 42,
                affectedItems: [{ productId: CHIPS_ID, name: 'Banana Chips', quantity: 1 }],
                raisedBy: STAFF_ID,
                raiser: { name: 'Asha Verma', role: 'student', roomNumbers: 'D-4' },
                createdAt: new Date('2026-08-25T09:00:00Z'),
              },
            ],
          }),
        }),
      };
    });

    const response = await get(
      `/api/v1/caretaker/fulfillment-orders/${ORDER_ID}/student-reports`
    );

    assert.equal(response.status, 200);
    // The three walls of the query: this order, this caretaker's rooms, and
    // only what a student raised — the caretaker's own channel stays theirs.
    assert.equal(String(filter['order.orderId']), ORDER_ID);
    assert.deepEqual(filter.roomIds, { $in: [ROOM_ID] });
    assert.equal(filter['raiser.role'], 'student');

    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].reportNumber, 42);
    assert.equal(body.data[0].status, 'OPEN');
    assert.deepEqual(body.data[0].affectedItems, [
      { productId: CHIPS_ID, name: 'Banana Chips', quantity: 1 },
    ]);
    // Serialized for the raiser: no handling trail, no account internals.
    assert.equal(body.data[0].handling, undefined);
    assert.equal(body.data[0].raisedBy, undefined);
  });

  test('an unusable order id is refused', async () => {
    asCaretaker();

    const response = await get('/api/v1/caretaker/fulfillment-orders/not-an-id/student-reports');

    assert.equal(response.status, 400);
  });
});
