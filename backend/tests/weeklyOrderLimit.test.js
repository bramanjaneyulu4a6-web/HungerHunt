/* One order per student per business week, behind a super admin's switch.
 *
 * The rule was lifted on 2026-08-15 and brought back on 2026-09-22 as a
 * setting that is on when no settings row exists. What is pinned here: what
 * uses up the week, who is exempt, that the switch really turns it off, that
 * the charge is refused before stock or wallet move, and that the old unique
 * index is not coming back with it. */
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

// app.js loads backend/.env; a demo or test phone there would exempt the
// students below and hide the rule.
process.env.DEMO_PARENT_PHONES = '';
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { checkWeeklyOrderLimit, WEEKLY_ORDER_CODE } = await import('../utils/weeklyOrderLimit.js');
const { chargeCart } = await import('../utils/checkout.js');
const { businessPeriodStart } = await import('../utils/businessTime.js');
const { signAdminToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439021';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ME = '507f1f77bcf86cd799439011';
const WEEKLY_INDEX = 'one_fulfillment_order_per_student_business_week';

const student = { _id: STUDENT_ID, name: 'Asha Rao', parentPhoneNumber: '9876543210', pocketMoney: 500 };

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => {
  mock.restoreAll();
  process.env.DEMO_PARENT_PHONES = '';
  process.env.PHONEPE_TEST_PARENT_PHONES = '';
});

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.session = () => query;
  query.lean = () => query;
  return query;
};

const settingsRow = (row) => mock.method(OrderingSettings, 'findOne', () => queryFor(row));

// Records each filter asked, answering from the given result.
const stubExists = (Model, result) => {
  const asked = [];
  mock.method(Model, 'exists', (filter) => {
    asked.push(filter);
    return queryFor(result);
  });
  return asked;
};

describe('what uses up the week', () => {
  test('with no settings row the rule is on, and a package this week refuses the next order', async () => {
    settingsRow(null);
    const packages = stubExists(FulfillmentOrder, { _id: 'monday-package' });
    stubExists(PendingOrder, null);

    const now = new Date('2026-09-23T10:00:00+05:30'); // a Wednesday
    const result = await checkWeeklyOrderLimit({ student, now });

    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.equal(result.code, WEEKLY_ORDER_CODE);
    assert.match(result.message, /already ordered this week/);

    const [filter] = packages;
    assert.equal(filter.studentId, STUDENT_ID);
    assert.deepEqual(filter.status, { $ne: 'CANCELLED' });
    assert.equal(filter.orderedAt.$gte.getTime(), businessPeriodStart('WEEKLY', now).getTime());
  });

  test('the week starts at Sunday midnight IST', () => {
    const start = businessPeriodStart('WEEKLY', new Date('2026-09-23T10:00:00+05:30'));
    assert.equal(start.toISOString(), new Date('2026-09-20T00:00:00+05:30').toISOString());
  });

  test('an order still waiting on its approver refuses the next one', async () => {
    settingsRow(null);
    stubExists(FulfillmentOrder, null);
    const waiting = stubExists(PendingOrder, { _id: 'waiting' });

    const result = await checkWeeklyOrderLimit({ student });

    assert.equal(result.ok, false);
    assert.match(result.message, /waiting for approval/);
    assert.deepEqual(waiting[0].status, { $in: ['PENDING', 'PROCESSING'] });
    assert.ok(waiting[0].expiresAt.$gt instanceof Date);
  });

  test('the waiting order being paid for does not count against itself', async () => {
    settingsRow(null);
    stubExists(FulfillmentOrder, null);
    const waiting = stubExists(PendingOrder, null);

    const result = await checkWeeklyOrderLimit({ student, excludePendingOrderId: 'this-order' });

    assert.equal(result.ok, true);
    assert.deepEqual(waiting[0]._id, { $ne: 'this-order' });
  });

  test('a student with nothing this week may order', async () => {
    settingsRow({ oneOrderPerWeek: true });
    stubExists(FulfillmentOrder, null);
    stubExists(PendingOrder, null);

    assert.deepEqual(await checkWeeklyOrderLimit({ student }), { ok: true });
  });
});

describe('who is not asked', () => {
  test('with the switch off, nothing is looked up', async () => {
    settingsRow({ oneOrderPerWeek: false });
    const packages = stubExists(FulfillmentOrder, { _id: 'monday-package' });

    assert.deepEqual(await checkWeeklyOrderLimit({ student }), { ok: true });
    assert.equal(packages.length, 0);
  });

  test('a test-account student is exempt', async () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = student.parentPhoneNumber;
    settingsRow(null);
    const packages = stubExists(FulfillmentOrder, { _id: 'monday-package' });

    assert.deepEqual(await checkWeeklyOrderLimit({ student }), { ok: true });
    assert.equal(packages.length, 0);
  });

  test('the showroom family is exempt', async () => {
    process.env.DEMO_PARENT_PHONES = student.parentPhoneNumber;
    settingsRow(null);
    const packages = stubExists(FulfillmentOrder, { _id: 'monday-package' });

    assert.deepEqual(await checkWeeklyOrderLimit({ student }), { ok: true });
    assert.equal(packages.length, 0);
  });
});

describe('the charge', () => {
  test('a second order this week is refused before stock or wallet move', async () => {
    settingsRow(null);
    stubExists(FulfillmentOrder, { _id: 'monday-package' });
    stubExists(PendingOrder, null);
    mock.method(Student, 'findById', async () => ({ ...student }));
    mock.method(Inventory, 'find', () => {
      const chain = {
        populate: () => chain,
        session: () => chain,
        then: (resolve, reject) => Promise.resolve([
          { stock: 10, productId: { _id: PRODUCT_ID, name: 'Samosa', price: 20, active: true } },
        ]).then(resolve, reject),
      };
      return chain;
    });
    const decrement = mock.method(Inventory, 'findOneAndUpdate', async () => null);

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, WEEKLY_ORDER_CODE);
    assert.equal(decrement.mock.callCount(), 0);
  });

  test('the old unique weekly index is not declared again', () => {
    const declared = FulfillmentOrder.schema
      .indexes()
      .map(([, options]) => options?.name)
      .filter(Boolean);

    assert.equal(declared.includes(WEEKLY_INDEX), false);
  });
});

describe('the switch', () => {
  const accountIs = accountMatcher(Admin, ME);
  const asAdmin = (path, options = {}) => fetch(base + path, {
    ...options,
    headers: { Authorization: `Bearer ${signAdminToken(ME)}`, 'Content-Type': 'application/json', ...options.headers },
  });

  test('a super admin reads it as on by default', async () => {
    accountIs('admin', { superAdmin: true });
    settingsRow(null);

    const res = await asAdmin('/api/admin/settings/ordering');
    assert.equal(res.status, 200);
    assert.equal((await res.json()).oneOrderPerWeek, true);
  });

  test('turning it off writes only that rule', async () => {
    accountIs('admin', { superAdmin: true });
    let change;
    mock.method(OrderingSettings, 'findOneAndUpdate', (filter, update) => {
      change = update.$set;
      return queryFor({ oneOrderPerWeek: false, updatedAt: new Date(), updatedBy: { _id: ME, name: 'Dhruv' } });
    });

    const res = await asAdmin('/api/admin/settings/ordering', {
      method: 'PUT',
      body: JSON.stringify({ oneOrderPerWeek: false }),
    });

    assert.equal(res.status, 200);
    assert.equal(change.oneOrderPerWeek, false);
    assert.equal('requireActivatedParent' in change, false);
    const body = await res.json();
    assert.equal(body.oneOrderPerWeek, false);
    assert.equal(body.requireActivatedParent, true);
  });

  test('a request naming no rule, or not a boolean, is refused', async () => {
    accountIs('admin', { superAdmin: true });
    const write = mock.method(OrderingSettings, 'findOneAndUpdate', () => queryFor(null));

    for (const body of [{}, { oneOrderPerWeek: 'no' }]) {
      const res = await asAdmin('/api/admin/settings/ordering', { method: 'PUT', body: JSON.stringify(body) });
      assert.equal(res.status, 400);
    }
    assert.equal(write.mock.callCount(), 0);
  });
});
