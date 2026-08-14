import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';
process.env.BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken } = await import('../utils/tokens.js');
const { fulfillmentSchedule, createFulfillmentOrder } = await import('../utils/fulfillment.js');
const {
  OrderStatus,
  canTransitionOrder,
} = await import('../src/domain/fulfillment/orderState.js');
const {
  partitionAlerts,
} = await import('../src/domain/fulfillment/overdue.js');
const {
  proofOfDeliveryProblem,
} = await import('../src/domain/fulfillment/proofOfDelivery.js');
const {
  buildDeliveryReport,
} = await import('../src/domain/fulfillment/deliveryReport.js');
const app = (await import('../app.js')).default;

const STAFF_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const TRANSACTION_ID = '507f191e810c19729de860ee';
const ORDER_ID = '507f191e810c19729de860ef';
const token = signStaffToken(STAFF_ID, 'warehouse');
let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

describe('weekly dorm fulfilment policy', () => {
  test('uses the business week and a hard 48-hour delivery deadline', () => {
    const orderedAt = new Date('2026-08-13T10:00:00.000Z');
    const schedule = fulfillmentSchedule(orderedAt, 'Asia/Kolkata');
    assert.equal(schedule.businessWeekStart.toISOString(), '2026-08-08T18:30:00.000Z');
    assert.equal(schedule.deliverBy.toISOString(), '2026-08-15T10:00:00.000Z');
  });

  test('snapshots the dorm, student, items, and payment link', async () => {
    let stored;
    mock.method(FulfillmentOrder, 'create', async (document) => {
      stored = document;
      return { _id: ORDER_ID, ...document };
    });

    await createFulfillmentOrder({
      transaction: {
        _id: TRANSACTION_ID,
        totalAmount: 40,
        items: [{ productId: PRODUCT_ID, name: 'Package', quantity: 1, price: 40 }],
      },
      student: {
        _id: STUDENT_ID,
        name: 'Asha',
        admissionNumber: 'A-10',
        hostelNumber: 'D-4',
      },
      orderedAt: new Date('2026-08-13T10:00:00.000Z'),
    });

    assert.equal(String(stored.transactionId), TRANSACTION_ID);
    assert.deepEqual(stored.studentSnapshot, {
      name: 'Asha', admissionNumber: 'A-10', hostelNumber: 'D-4',
    });
    assert.equal(stored.status, OrderStatus.PENDING);
  });

  test('turns a simultaneous weekly insert into a stable conflict', async () => {
    const duplicate = Object.assign(new Error('duplicate key'), { code: 11000 });
    mock.method(FulfillmentOrder, 'create', async () => { throw duplicate; });

    await assert.rejects(
      () => createFulfillmentOrder({
        transaction: { _id: TRANSACTION_ID, totalAmount: 40, items: [] },
        student: { _id: STUDENT_ID, name: 'Asha', hostelNumber: 'D-4' },
      }),
      (error) => error.status === 409 && error.code === 'WEEKLY_ORDER_LIMIT'
    );
  });

  test('requires a reason and idempotency key for cancellation refunds', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
    const response = await fetch(`${base}/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'CANCELLED' }),
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.deepEqual(body.error.details.map((detail) => detail.field), ['Idempotency-Key', 'reason']);
  });

  test('domain policy allows only the explicit operational sequence', () => {
    assert.equal(canTransitionOrder('PENDING', 'PACKED'), true);
    assert.equal(canTransitionOrder('PACKED', 'OUT_FOR_DELIVERY'), true);
    assert.equal(canTransitionOrder('OUT_FOR_DELIVERY', 'DELIVERED'), true);
    assert.equal(canTransitionOrder('PENDING', 'DELIVERED'), false);
    assert.equal(canTransitionOrder('DELIVERED', 'PACKED'), false);
  });

  test('records an atomic expected-state transition and staff audit entry', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
    mock.method(FulfillmentOrder, 'findById', () => ({
      lean: async () => ({ _id: ORDER_ID, status: 'PENDING' }),
    }));
    let filter;
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (requestedFilter, requestedUpdate) => {
      filter = requestedFilter;
      update = requestedUpdate;
      return {
        lean: async () => ({
          _id: ORDER_ID,
          transactionId: TRANSACTION_ID,
          studentId: STUDENT_ID,
          studentSnapshot: { name: 'Asha', hostelNumber: 'D-4' },
          items: [],
          totalAmount: 40,
          status: 'PACKED',
          businessWeekStart: new Date(),
          orderedAt: new Date(),
          deliverBy: new Date(),
          transitions: [requestedUpdate.$push.transitions],
        }),
      };
    });

    const response = await fetch(`${base}/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'PACKED' }),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(filter, { _id: ORDER_ID, status: 'PENDING' });
    assert.equal(update.$push.transitions.actorId, STAFF_ID);
    assert.equal((await response.json()).data.status, 'PACKED');
  });

  test('requires minimal receiver proof before delivery can be recorded', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
    mock.method(FulfillmentOrder, 'findById', () => ({
      lean: async () => ({ _id: ORDER_ID, status: 'OUT_FOR_DELIVERY' }),
    }));

    const response = await fetch(`${base}/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    assert.equal(response.status, 400);
    assert.equal((await response.json()).error.details[0].field, 'receivedBy');
    assert.match(proofOfDeliveryProblem('Call 9876543210'), /Do not enter/);
    assert.equal(proofOfDeliveryProblem('Asha, dorm warden'), null);
  });

  test('stores receiver, authenticated staff, and server time as proof of delivery', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
    mock.method(FulfillmentOrder, 'findById', () => ({
      lean: async () => ({ _id: ORDER_ID, status: 'OUT_FOR_DELIVERY' }),
    }));
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (_filter, requestedUpdate) => {
      update = requestedUpdate;
      return {
        lean: async () => ({
          _id: ORDER_ID,
          transactionId: TRANSACTION_ID,
          studentId: STUDENT_ID,
          studentSnapshot: { name: 'Asha', hostelNumber: 'D-4' },
          items: [],
          totalAmount: 40,
          status: 'DELIVERED',
          businessWeekStart: new Date(),
          orderedAt: new Date(),
          deliverBy: new Date(),
          deliveredAt: requestedUpdate.$set.deliveredAt,
          proofOfDelivery: requestedUpdate.$set.proofOfDelivery,
        }),
      };
    });

    const response = await fetch(`${base}/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status: 'DELIVERED', receivedBy: 'Asha, dorm warden' }),
    });

    assert.equal(response.status, 200);
    assert.equal(update.$set.proofOfDelivery.receivedBy, 'Asha, dorm warden');
    assert.equal(String(update.$set.proofOfDelivery.recordedBy), STAFF_ID);
    assert.ok(update.$set.proofOfDelivery.recordedAt instanceof Date);
  });

  test('acknowledged overdue alerts are suppressed until their snooze expires', () => {
    const now = new Date('2026-08-13T12:00:00.000Z');
    const orders = [
      { status: 'PENDING', deliverBy: '2026-08-13T10:00:00.000Z' },
      {
        status: 'PACKED',
        deliverBy: '2026-08-13T09:00:00.000Z',
        alertSnoozedUntil: '2026-08-13T18:00:00.000Z',
      },
      { status: 'DELIVERED', deliverBy: '2026-08-13T08:00:00.000Z' },
    ];

    const result = partitionAlerts(orders, now);
    assert.equal(result.raised.length, 1);
    assert.equal(result.mutedCount, 1);
  });

  test('delivery reports are aggregate-only and distinguish on-time from late delivery', () => {
    const report = buildDeliveryReport({
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-09-01T00:00:00.000Z'),
      now: new Date('2026-08-13T12:00:00.000Z'),
      timeZone: 'Asia/Kolkata',
      orders: [
        {
          status: 'DELIVERED',
          orderedAt: '2026-08-10T10:00:00.000Z',
          deliverBy: '2026-08-12T10:00:00.000Z',
          deliveredAt: '2026-08-12T09:00:00.000Z',
          proofOfDelivery: { receivedBy: 'Asha' },
        },
        {
          status: 'DELIVERED',
          orderedAt: '2026-08-09T10:00:00.000Z',
          deliverBy: '2026-08-11T10:00:00.000Z',
          deliveredAt: '2026-08-11T12:00:00.000Z',
        },
      ],
    });

    assert.equal(report.delivery.delivered, 2);
    assert.equal(report.delivery.onTime, 1);
    assert.equal(report.delivery.late, 1);
    assert.equal(report.delivery.onTimeRate, 0.5);
    assert.deepEqual(report.proofOfDelivery, { recorded: 1, missing: 1 });
    assert.equal(JSON.stringify(report).includes('Asha'), false);
  });
});
