/* Fulfilment operations: what the parent may see, what the storeroom is warned
   about, what the reports say, and what a delivery is proved by.
 *
 * No database. Every model call is stubbed, because what is under test is the
 * policy applied before a query runs and the shape of what comes back — which
 * is exactly where the authorization, privacy, and state rules live.
 */
import test, { after, afterEach, before, beforeEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.FEATURE_V1_PROCUREMENT = 'true';
process.env.BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { signStaffToken, signParentToken } = await import('../utils/tokens.js');
const {
  ALERT_SNOOZE_MS,
  OPEN_STATUSES,
  alertMuted,
  isOverdue,
  overdueByMinutes,
  partitionAlerts,
} = await import('../src/domain/fulfillment/overdue.js');
const { proofOfDeliveryProblem } = await import('../src/domain/fulfillment/proofOfDelivery.js');
const { buildDeliveryReport } = await import('../src/domain/fulfillment/deliveryReport.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const STAFF_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f1f77bcf86cd799439013';
const STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const TRANSACTION_ID = '507f191e810c19729de860ee';
const ORDER_ID = '507f191e810c19729de860ef';

const warehouseToken = signStaffToken(STAFF_ID, 'warehouse');
const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

after(() => mock.restoreAll());
afterEach(() => mock.restoreAll());

beforeEach(() => {
  mock.method(Admin, 'exists', async () => ({ _id: STAFF_ID }));
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

// One stand-in for every chain these controllers build: find().sort().skip()
// .limit().lean(), and the .select() the report adds.
const query = (result) => {
  const chain = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    select: () => chain,
    lean: async () => result,
    session: () => chain,
  };
  return chain;
};

const asStaff = (path, init = {}) =>
  fetch(base + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${warehouseToken}`,
      ...(init.headers || {}),
    },
  });

const asParent = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

const ownsTheStudent = () =>
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));

const HOUR = 3_600_000;

const orderFixture = (overrides = {}) => ({
  _id: ORDER_ID,
  transactionId: TRANSACTION_ID,
  studentId: STUDENT_ID,
  studentSnapshot: { name: 'Asha', admissionNumber: 'A-10', hostelNumber: 'D-4' },
  items: [{ productId: PRODUCT_ID, name: 'Package', quantity: 1, price: 40 }],
  totalAmount: 40,
  status: 'PENDING',
  businessWeekStart: new Date('2026-08-08T18:30:00.000Z'),
  orderedAt: new Date('2026-08-10T10:00:00.000Z'),
  deliverBy: new Date('2026-08-12T10:00:00.000Z'),
  transitions: [],
  ...overrides,
});

describe('overdue policy', () => {
  const now = new Date('2026-08-13T10:00:00.000Z');

  test('counts every undelivered state as still owed', () => {
    assert.deepEqual([...OPEN_STATUSES].sort(), ['OUT_FOR_DELIVERY', 'PACKED', 'PENDING']);
  });

  test('a delivered or cancelled package is never late, however old', () => {
    assert.equal(isOverdue(orderFixture({ status: 'DELIVERED' }), now), false);
    assert.equal(isOverdue(orderFixture({ status: 'CANCELLED' }), now), false);
    assert.equal(isOverdue(orderFixture({ status: 'PACKED' }), now), true);
  });

  test('a package inside its window is not late', () => {
    const future = orderFixture({ deliverBy: new Date(now.getTime() + HOUR) });
    assert.equal(isOverdue(future, now), false);
  });

  test('acknowledging quiets one package without hiding that it is late', () => {
    const acknowledged = orderFixture({
      alertSnoozedUntil: new Date(now.getTime() + ALERT_SNOOZE_MS),
    });
    const expired = orderFixture({ alertSnoozedUntil: new Date(now.getTime() - 1) });

    assert.equal(alertMuted(acknowledged, now), true);
    assert.equal(alertMuted(expired, now), false);

    const { raised, mutedCount } = partitionAlerts([acknowledged, expired, orderFixture()], now);
    assert.equal(raised.length, 2);
    assert.equal(mutedCount, 1);
  });

  test('the snooze expires, so a package left late comes back', () => {
    const order = orderFixture({ alertSnoozedUntil: new Date(now.getTime() + ALERT_SNOOZE_MS) });
    const later = new Date(now.getTime() + ALERT_SNOOZE_MS + 1);
    assert.equal(alertMuted(order, later), false);
    assert.equal(partitionAlerts([order], later).raised.length, 1);
  });

  test('lateness is reported in whole minutes and never negative', () => {
    assert.equal(overdueByMinutes(orderFixture(), now), 24 * 60);
    assert.equal(
      overdueByMinutes(orderFixture({ deliverBy: new Date(now.getTime() + HOUR) }), now),
      0
    );
  });
});

describe('proof-of-delivery policy', () => {
  test('a receiver must be recorded', () => {
    assert.match(proofOfDeliveryProblem(''), /who received/i);
    assert.match(proofOfDeliveryProblem('   '), /who received/i);
    assert.match(proofOfDeliveryProblem(undefined), /who received/i);
  });

  test('a name is accepted, and a room number with it', () => {
    assert.equal(proofOfDeliveryProblem('Asha'), null);
    assert.equal(proofOfDeliveryProblem('Asha, room 214'), null);
    assert.equal(proofOfDeliveryProblem('Dorm warden'), null);
  });

  test('identity, admission, and phone numbers are refused', () => {
    assert.match(proofOfDeliveryProblem('Asha 9876543210'), /ID, admission, or phone/i);
    assert.match(proofOfDeliveryProblem('234567890123'), /ID, admission, or phone/i);
  });

  test('contact details are refused', () => {
    assert.match(proofOfDeliveryProblem('asha@example.com'), /contact details/i);
    assert.match(proofOfDeliveryProblem('see https://example.com'), /contact details/i);
  });

  test('the note stays short', () => {
    assert.match(proofOfDeliveryProblem('a'.repeat(61)), /60 characters/);
    assert.equal(proofOfDeliveryProblem('a'.repeat(60)), null);
  });
});

describe('delivery reporting', () => {
  const from = new Date('2026-08-01T00:00:00.000Z');
  const to = new Date('2026-08-14T00:00:00.000Z');
  const now = new Date('2026-08-13T10:00:00.000Z');

  const report = (orders) => buildDeliveryReport({ orders, from, to, now, timeZone: 'Asia/Kolkata' });

  test('separates deliveries that met the deadline from the ones that missed it', () => {
    const result = report([
      orderFixture({
        status: 'DELIVERED',
        packedAt: new Date('2026-08-10T16:00:00.000Z'),
        dispatchedAt: new Date('2026-08-11T04:00:00.000Z'),
        deliveredAt: new Date('2026-08-11T10:00:00.000Z'),
        proofOfDelivery: { receivedBy: 'Asha' },
      }),
      orderFixture({
        status: 'DELIVERED',
        deliveredAt: new Date('2026-08-13T09:00:00.000Z'),
      }),
    ]);

    assert.equal(result.delivery.delivered, 2);
    assert.equal(result.delivery.onTime, 1);
    assert.equal(result.delivery.late, 1);
    assert.equal(result.delivery.onTimeRate, 0.5);
    assert.equal(result.proofOfDelivery.recorded, 1);
    assert.equal(result.proofOfDelivery.missing, 1);
  });

  test('delivering exactly on the deadline counts as on time', () => {
    const result = report([
      orderFixture({
        status: 'DELIVERED',
        deliveredAt: new Date('2026-08-12T10:00:00.000Z'),
      }),
    ]);
    assert.equal(result.delivery.onTime, 1);
    assert.equal(result.delivery.late, 0);
  });

  test('an empty period reports no rate rather than a perfect one', () => {
    const result = report([]);
    assert.equal(result.delivery.onTimeRate, null);
    assert.equal(result.summary.packages, 0);
    assert.equal(result.durations.orderToPack.samples, 0);
    assert.equal(result.durations.orderToPack.medianHours, null);
  });

  test('reports both the average and the median, which one late package parts', () => {
    const packedAfter = (hours) =>
      orderFixture({
        status: 'PACKED',
        packedAt: new Date(new Date('2026-08-10T10:00:00.000Z').getTime() + hours * HOUR),
      });

    const result = report([packedAfter(1), packedAfter(2), packedAfter(45)]);
    assert.equal(result.durations.orderToPack.samples, 3);
    assert.equal(result.durations.orderToPack.medianHours, 2);
    assert.equal(result.durations.orderToPack.averageHours, 16);
  });

  test('counts open packages that are already past their deadline', () => {
    const result = report([
      orderFixture({ status: 'PENDING' }),
      orderFixture({ status: 'DELIVERED', deliveredAt: new Date('2026-08-11T10:00:00.000Z') }),
    ]);
    assert.equal(result.summary.openOverdue, 1);
    assert.equal(result.summary.byStatus.PENDING, 1);
    assert.equal(result.summary.byStatus.CANCELLED, 0);
  });

  test('carries no student, staff, item, or money detail out of the aggregate', () => {
    const body = JSON.stringify(report([orderFixture({ status: 'PENDING' })]));
    for (const leak of ['Asha', 'A-10', 'D-4', STUDENT_ID, TRANSACTION_ID, 'totalAmount', 'items']) {
      assert.equal(body.includes(leak), false, `report leaked ${leak}`);
    }
  });
});

describe('recording a delivery', () => {
  const expectDelivered = () => {
    mock.method(FulfillmentOrder, 'findById', () =>
      query({ _id: ORDER_ID, status: 'OUT_FOR_DELIVERY' })
    );
  };

  test('refuses a delivery with no receiver recorded', async () => {
    expectDelivered();
    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status: 'DELIVERED' }),
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.error.details[0].field, 'receivedBy');
  });

  test('refuses a receiver note carrying an identity number', async () => {
    expectDelivered();
    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status: 'DELIVERED', receivedBy: 'Asha 9876543210' }),
    });

    assert.equal(response.status, 400);
    assert.match((await response.json()).error.details[0].message, /ID, admission, or phone/i);
  });

  test('stores the receiver, the staff account, and the time — and nothing else', async () => {
    expectDelivered();
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, requested) => {
      update = requested;
      return query(
        orderFixture({
          status: 'DELIVERED',
          deliveredAt: new Date(),
          proofOfDelivery: requested.$set.proofOfDelivery,
        })
      );
    });

    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status: 'DELIVERED', receivedBy: '  Asha, room 214  ' }),
    });

    assert.equal(response.status, 200);

    const proof = update.$set.proofOfDelivery;
    assert.deepEqual(Object.keys(proof).sort(), ['receivedBy', 'recordedAt', 'recordedBy']);
    assert.equal(proof.receivedBy, 'Asha, room 214');
    // Taken from the session and the clock, never from the request body.
    assert.equal(proof.recordedBy, STAFF_ID);
    assert.ok(proof.recordedAt instanceof Date);

    assert.equal((await response.json()).data.proofOfDelivery.receivedBy, 'Asha, room 214');
  });

  test('still updates only from the state it read, so two staff cannot both deliver', async () => {
    expectDelivered();
    let filter;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (requestedFilter) => {
      filter = requestedFilter;
      return query(null);
    });

    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status: 'DELIVERED', receivedBy: 'Asha' }),
    });

    assert.deepEqual(filter, { _id: ORDER_ID, status: 'OUT_FOR_DELIVERY' });
    assert.equal(response.status, 409);
  });
});

describe('overdue alerts for staff', () => {
  test('asks the database only for late packages nobody has acknowledged yet', async () => {
    let filter;
    let countFilter;
    mock.method(FulfillmentOrder, 'find', (requested) => {
      filter = requested;
      return query([
        orderFixture({
          status: 'PENDING',
          overdueAcknowledgements: [{ at: new Date(), actorId: STAFF_ID, note: '' }],
        }),
      ]);
    });
    mock.method(FulfillmentOrder, 'countDocuments', async (requested) => {
      countFilter = requested;
      return 2;
    });

    const response = await asStaff('/api/v1/fulfillment-orders/alerts');
    assert.equal(response.status, 200);

    assert.deepEqual(filter.status, { $in: OPEN_STATUSES });
    assert.ok(filter.deliverBy.$lt instanceof Date);
    // Never acknowledged, or acknowledged and the snooze has since run out.
    assert.deepEqual(filter.$or, [
      { alertSnoozedUntil: { $exists: false } },
      { alertSnoozedUntil: null },
      { alertSnoozedUntil: { $lte: filter.deliverBy.$lt } },
    ]);
    // The same instant on both sides, so no package can be both raised and counted as hidden.
    assert.equal(countFilter.alertSnoozedUntil.$gt.getTime(), filter.deliverBy.$lt.getTime());

    const body = await response.json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].status, 'PENDING');
    assert.ok(body.data[0].overdueByMinutes > 0);
    assert.equal(body.data[0].acknowledgements, 1);
    assert.equal(body.meta.count, 1);
    assert.equal(body.meta.acknowledgedCount, 2);
    assert.equal(body.meta.snoozeHours, 12);
    assert.equal(body.meta.truncated, false);
  });

  test('a still-snoozed package the query let through is dropped anyway', async () => {
    mock.method(FulfillmentOrder, 'find', () =>
      query([
        orderFixture({ status: 'PENDING' }),
        orderFixture({
          status: 'PACKED',
          alertSnoozedUntil: new Date(Date.now() + ALERT_SNOOZE_MS),
        }),
      ])
    );
    mock.method(FulfillmentOrder, 'countDocuments', async () => 0);

    const body = await (await asStaff('/api/v1/fulfillment-orders/alerts')).json();
    assert.equal(body.data.length, 1);
    assert.equal(body.data[0].status, 'PENDING');
  });

  test('acknowledging appends an audit row and quiets it for the snooze window', async () => {
    const overdue = orderFixture({ status: 'PACKED' });
    mock.method(FulfillmentOrder, 'findById', () => query(overdue));

    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, requested) => {
      update = requested;
      return query(overdue);
    });

    const response = await asStaff(
      `/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`,
      { method: 'POST', body: JSON.stringify({ note: 'Dorm locked, retrying tonight' }) }
    );

    assert.equal(response.status, 200);

    const [entry] = update.$push.overdueAcknowledgements.$each;
    assert.equal(entry.actorId, STAFF_ID);
    assert.equal(entry.note, 'Dorm locked, retrying tonight');
    assert.equal(
      entry.snoozedUntil.getTime() - entry.at.getTime(),
      ALERT_SNOOZE_MS
    );
    assert.equal(update.$set.alertSnoozedUntil.getTime(), entry.snoozedUntil.getTime());
    // Bounded so a looping client cannot grow one document without limit.
    assert.equal(update.$push.overdueAcknowledgements.$slice, -50);
  });

  test('the transition history is never rewritten by an acknowledgement', async () => {
    mock.method(FulfillmentOrder, 'findById', () => query(orderFixture({ status: 'PACKED' })));
    let update;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, requested) => {
      update = requested;
      return query(orderFixture({ status: 'PACKED' }));
    });

    await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assert.equal('transitions' in update.$push, false);
    assert.deepEqual(Object.keys(update.$set), ['alertSnoozedUntil']);
  });

  test('a package inside its window cannot be acknowledged', async () => {
    mock.method(FulfillmentOrder, 'findById', () =>
      query(orderFixture({ deliverBy: new Date(Date.now() + HOUR) }))
    );

    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /has not missed its delivery deadline/i);
  });

  test('a delivered package cannot be acknowledged', async () => {
    mock.method(FulfillmentOrder, 'findById', () =>
      query(orderFixture({ status: 'DELIVERED' }))
    );

    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 409);
    assert.match((await response.json()).message, /only an undelivered package/i);
  });

  test('a missing package is a 404, not a silent success', async () => {
    mock.method(FulfillmentOrder, 'findById', () => query(null));
    const response = await asStaff(`/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`, {
      method: 'POST',
      body: JSON.stringify({}),
    });
    assert.equal(response.status, 404);
  });
});

describe('delivery history and operational reports', () => {
  test('reads date-only bounds in the business timezone, through-date inclusive', async () => {
    let filter;
    mock.method(FulfillmentOrder, 'find', (requested) => {
      filter = requested;
      return query([]);
    });
    mock.method(FulfillmentOrder, 'countDocuments', async () => 0);

    const response = await asStaff(
      '/api/v1/fulfillment-orders/history?from=2026-08-10&to=2026-08-12'
    );

    assert.equal(response.status, 200);
    // Midnight in Asia/Kolkata is 18:30 UTC the day before, and the 12th is
    // included in full — so the exclusive upper bound is the start of the 13th.
    assert.equal(filter.orderedAt.$gte.toISOString(), '2026-08-09T18:30:00.000Z');
    assert.equal(filter.orderedAt.$lt.toISOString(), '2026-08-12T18:30:00.000Z');
  });

  test('is bounded and paged, and says how much it did not send', async () => {
    mock.method(FulfillmentOrder, 'find', () => query([orderFixture()]));
    mock.method(FulfillmentOrder, 'countDocuments', async () => 140);

    const response = await asStaff(
      '/api/v1/fulfillment-orders/history?from=2026-08-01&to=2026-08-12&limit=999'
    );

    const { meta } = await response.json();
    assert.equal(meta.total, 140);
    assert.equal(meta.hasMore, true);
    assert.equal(meta.pages, 2); // limit clamped to 100, not the 999 asked for
  });

  test('refuses an unbounded period rather than scanning it', async () => {
    const response = await asStaff(
      '/api/v1/fulfillment-orders/history?from=2026-01-01&to=2026-08-31'
    );
    assert.equal(response.status, 400);
    assert.match((await response.json()).error.details[0].message, /no longer than 93 days/);
  });

  test('refuses a history request with no period at all', async () => {
    const response = await asStaff('/api/v1/fulfillment-orders/history');
    assert.equal(response.status, 400);
  });

  test('rejects an unknown status filter', async () => {
    const response = await asStaff(
      '/api/v1/fulfillment-orders/history?from=2026-08-01&to=2026-08-12&status=LOST'
    );
    assert.equal(response.status, 400);
  });

  test('the report is deterministic and aggregate-only', async () => {
    mock.method(FulfillmentOrder, 'find', () =>
      query([
        orderFixture({ status: 'DELIVERED', deliveredAt: new Date('2026-08-11T10:00:00.000Z') }),
        orderFixture({ status: 'PENDING' }),
      ])
    );

    const response = await asStaff(
      '/api/v1/fulfillment-orders/report?from=2026-08-01&to=2026-08-12'
    );

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.meta.deterministic, true);
    assert.equal(body.data.schemaVersion, '1.0');
    assert.equal(body.data.range.timeZone, 'Asia/Kolkata');
    assert.equal(body.data.delivery.delivered, 1);
    assert.equal(JSON.stringify(body.data).includes('Asha'), false);
  });
});

describe('who may reach fulfilment operations', () => {
  const closedToParents = [
    '/api/v1/fulfillment-orders',
    '/api/v1/fulfillment-orders/alerts',
    '/api/v1/fulfillment-orders/history?from=2026-08-01&to=2026-08-12',
    '/api/v1/fulfillment-orders/report?from=2026-08-01&to=2026-08-12',
  ];

  for (const path of closedToParents) {
    test(`${path.split('?')[0]} refuses a parent token`, async () => {
      const response = await asParent(path);
      assert.equal(response.status, 401);
    });
  }

  test('acknowledging is closed to a parent token', async () => {
    const response = await fetch(
      `${base}/api/v1/fulfillment-orders/${ORDER_ID}/alerts/acknowledge`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${parentToken}` },
        body: JSON.stringify({}),
      }
    );
    assert.equal(response.status, 401);
  });

  test('a parent cannot read another parent\'s child packages', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: [] }),
    }));

    const response = await asParent(`/api/parent/child/${STUDENT_ID}/packages`);
    assert.equal(response.status, 403);
  });

  test('the parent package list is closed to a warehouse token', async () => {
    const response = await asStaff(`/api/parent/child/${STUDENT_ID}/packages`);
    assert.equal(response.status, 401);
  });
});

describe('what the parent is shown about a package', () => {
  const listOneOrder = (overrides) => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'find', () => query([orderFixture(overrides)]));
    mock.method(FulfillmentOrder, 'countDocuments', async () => 1);
  };

  test('shows the state, the order time, and the stored deadline', async () => {
    listOneOrder({ status: 'PACKED', packedAt: new Date('2026-08-10T14:00:00.000Z') });

    const response = await asParent(`/api/parent/child/${STUDENT_ID}/packages`);
    assert.equal(response.status, 200);

    const { packages, total, hasMore } = await response.json();
    assert.equal(total, 1);
    assert.equal(hasMore, false);

    const [item] = packages;
    assert.equal(item.status, 'PACKED');
    assert.equal(item.orderedAt, '2026-08-10T10:00:00.000Z');
    // Read from the order, not recomputed — the parent and the storeroom must
    // be looking at the same deadline.
    assert.equal(item.deliverBy, '2026-08-12T10:00:00.000Z');
    assert.equal(item.packedAt, '2026-08-10T14:00:00.000Z');
    assert.equal(item.overdue, true);
    assert.equal(item.hostelNumber, 'D-4');
  });

  test('a package inside its window is not shown as overdue', async () => {
    listOneOrder({ deliverBy: new Date(Date.now() + HOUR) });
    const { packages } = await (await asParent(`/api/parent/child/${STUDENT_ID}/packages`)).json();
    assert.equal(packages[0].overdue, false);
  });

  test('a delivered package is never overdue, and shows who received it', async () => {
    listOneOrder({
      status: 'DELIVERED',
      deliveredAt: new Date('2026-08-11T10:00:00.000Z'),
      proofOfDelivery: { receivedBy: 'Asha', recordedBy: STAFF_ID, recordedAt: new Date() },
    });

    const { packages } = await (await asParent(`/api/parent/child/${STUDENT_ID}/packages`)).json();
    assert.equal(packages[0].overdue, false);
    assert.equal(packages[0].receivedBy, 'Asha');
  });

  test('no staff account, audit trail, or ledger reference travels to the parent', async () => {
    listOneOrder({
      status: 'DELIVERED',
      deliveredAt: new Date(),
      deliveredBy: STAFF_ID,
      packedBy: STAFF_ID,
      deliveryNote: 'left at the warden desk',
      transitions: [{ from: 'PACKED', to: 'DELIVERED', at: new Date(), actorId: STAFF_ID }],
      proofOfDelivery: { receivedBy: 'Asha', recordedBy: STAFF_ID, recordedAt: new Date() },
    });

    const body = await (await asParent(`/api/parent/child/${STUDENT_ID}/packages`)).text();

    for (const leak of [STAFF_ID, TRANSACTION_ID, 'transitions', 'deliveredBy', 'deliveryNote']) {
      assert.equal(body.includes(leak), false, `parent response leaked ${leak}`);
    }
    assert.equal(body.includes('Asha'), true);
  });

  test('the list is paged and clamped rather than sent whole', async () => {
    ownsTheStudent();
    let limit;
    mock.method(FulfillmentOrder, 'find', () => {
      const chain = query([]);
      chain.limit = (value) => { limit = value; return chain; };
      return chain;
    });
    mock.method(FulfillmentOrder, 'countDocuments', async () => 500);

    const response = await asParent(`/api/parent/child/${STUDENT_ID}/packages?limit=9999`);
    const body = await response.json();

    assert.equal(limit, 100);
    assert.equal(body.total, 500);
    assert.equal(body.hasMore, true);
  });
});
