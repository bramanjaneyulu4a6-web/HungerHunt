/* The showroom account: the student a visiting parent drives the kiosk with at
 * an open day, whose orders lead nowhere.
 *
 * Two things are being pinned here, and the second matters as much as the
 * first. That a demo order writes nothing — no transaction, no package, no
 * stock movement, no notification. And that none of it leaks onto a real
 * student: every case below is run against an ordinary child as well, because
 * a bypass that widened by one row would mean a family's purchases silently
 * ceasing to exist.
 *
 * No database: every model call is stubbed.
 */
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.NODE_ENV = 'test';
// See tests-inherit-dev-env: app.js loads backend/.env into every test, and a
// test phone left in it would send these carts down the PhonePe bypass.
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const jwt = (await import('jsonwebtoken')).default;
const Student = (await import('../models/Student.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const PurchaseAuthorization = (await import('../models/PurchaseAuthorization.js')).default;
const { hashCart } = await import('../utils/purchaseAuthorization.js');
const { isDemoStudent, DEMO_SESSION_SECONDS } = await import('../utils/demoAccount.js');
const { chargeCart } = await import('../utils/checkout.js');
const { getPurchaseAllowances } = await import('../utils/purchaseLimits.js');
const { signAdminToken, signStudentToken, STUDENT_SESSION_SECONDS } = await import('../utils/tokens.js');
const Admin = (await import('../models/Admin.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { parentGateOpen } = await import('./helpers/parentGateOpen.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const DEMO_ID = '507f191e810c19729de860ea';
const REAL_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ADMIN_ID = '507f191e810c19729de860ed';

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// Every ordering rule reads as off (kiosk open) unless a test says otherwise.
beforeEach(() => parentGateOpen(OrderingSettings));
afterEach(() => mock.restoreAll());

const queryFor = (value) => {
  const query = Promise.resolve(value);
  for (const method of ['select', 'populate', 'sort', 'skip', 'limit', 'lean', 'session']) {
    query[method] = () => query;
  }
  return query;
};

const items = [{ productId: PRODUCT_ID, quantity: 2 }];

// The catalogue row both the real and the demo checkout price against.
const stubInventory = () =>
  mock.method(Inventory, 'find', () =>
    queryFor([{
      stock: 50,
      productId: { _id: PRODUCT_ID, name: 'Samosa', price: 20, active: true },
    }])
  );

// A live authorization for `items`, as verifyPayment would have left behind.
const stubAuthorization = (studentId) =>
  mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => ({
    token: 'token',
    studentId,
    cartHash: hashCart(items),
    expiresAt: new Date(Date.now() + 60_000),
  }));

const asStudent = (id, path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${signStudentToken(id, 'DEMO01')}`,
    },
    body: JSON.stringify(body),
  });

describe('isDemoStudent', () => {
  test('reads the flag off a loaded student without a second query', async () => {
    const findById = mock.method(Student, 'findById', () => queryFor(null));

    assert.equal(await isDemoStudent({ demoAccount: true }), true);
    assert.equal(await isDemoStudent({ demoAccount: false }), false);
    assert.equal(findById.mock.callCount(), 0);
  });

  test('looks an id up, and anything but an explicit true is not a demo', async () => {
    mock.method(Student, 'findById', () => queryFor({ demoAccount: true }));
    assert.equal(await isDemoStudent(DEMO_ID), true);

    mock.restoreAll();
    // The ordinary case: a student row that predates the field entirely.
    mock.method(Student, 'findById', () => queryFor({}));
    assert.equal(await isDemoStudent(REAL_ID), false);
  });

  test('no student at all is not a demo', async () => {
    assert.equal(await isDemoStudent(null), false);
    assert.equal(await isDemoStudent(undefined), false);
  });
});

describe('a demo bill', () => {
  beforeEach(() => {
    stubInventory();
    stubAuthorization(DEMO_ID);
    // protectStudent proves the row is still there before the route runs.
    mock.method(Student, 'exists', async () => ({ _id: DEMO_ID }));
    mock.method(Student, 'findById', () => queryFor({ _id: DEMO_ID, demoAccount: true }));
  });

  test('records nothing and tells nobody', async () => {
    const writeTransaction = mock.method(Transaction, 'create', async () => {
      throw new Error('a demo order must not be recorded');
    });
    const writePackage = mock.method(FulfillmentOrder, 'create', async () => {
      throw new Error('a demo order must not raise a package');
    });
    const moveStock = mock.method(Inventory, 'findOneAndUpdate', async () => {
      throw new Error('a demo order must not move stock');
    });
    const findParent = mock.method(Parent, 'findOne', () => queryFor(null));

    const response = await asStudent(DEMO_ID, '/api/transactions/bill', {
      items,
      purchaseToken: 'token',
    });
    const body = await response.json();

    assert.equal(response.status, 201);
    assert.equal(body.demo, true);
    assert.equal(body.fulfillmentOrder, null);
    // Priced from the live catalogue, so the visitor is shown real money.
    assert.equal(body.transaction.totalAmount, 40);
    assert.equal(body.transaction.items[0].name, 'Samosa');
    // Not a row: there is nothing to go and fetch afterwards.
    assert.equal(body.transaction._id, undefined);

    assert.equal(writeTransaction.mock.callCount(), 0);
    assert.equal(writePackage.mock.callCount(), 0);
    assert.equal(moveStock.mock.callCount(), 0);
    // The parent is never even looked up, let alone messaged.
    assert.equal(findParent.mock.callCount(), 0);
  });

  test('still has to carry a valid purchase code', async () => {
    mock.restoreAll();
    parentGateOpen(OrderingSettings);
    stubInventory();
    mock.method(Student, 'exists', async () => ({ _id: DEMO_ID }));
    mock.method(Student, 'findById', () => queryFor({ _id: DEMO_ID, demoAccount: true }));
    // The token was already spent, or never existed.
    mock.method(PurchaseAuthorization, 'findOneAndDelete', async () => null);

    const response = await asStudent(DEMO_ID, '/api/transactions/bill', {
      items,
      purchaseToken: 'spent',
    });

    assert.equal(response.status, 403);
  });
});

describe('chargeCart', () => {
  test('refuses a demo student outright rather than charging them', async () => {
    mock.method(Student, 'findById', () => queryFor({ _id: DEMO_ID, demoAccount: true }));
    const moveStock = mock.method(Inventory, 'findOneAndUpdate', async () => {
      throw new Error('a demo order must not move stock');
    });

    const result = await chargeCart({ studentId: DEMO_ID, items });

    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
    assert.match(result.message, /demo/i);
    assert.equal(moveStock.mock.callCount(), 0);
  });

  test('an ordinary student is carried past that guard as before', async () => {
    mock.method(Student, 'findById', () => queryFor({ _id: REAL_ID, demoAccount: false }));
    // Nothing on the shelf, so the charge stops at the next check — which is
    // the point: it got past the demo guard to reach one.
    mock.method(Inventory, 'find', () => queryFor([]));

    const result = await chargeCart({ studentId: REAL_ID, items });

    assert.equal(result.ok, false);
    assert.match(result.message, /Inventory record not found/);
  });
});

describe('per-product limits', () => {
  const product = {
    _id: PRODUCT_ID,
    name: 'Samosa',
    purchaseLimit: { enabled: true, quantity: 1, period: 'WEEKLY' },
  };

  test('do not apply to the demo account', async () => {
    const allowances = await getPurchaseAllowances({
      studentId: DEMO_ID,
      products: [product],
      student: { _id: DEMO_ID, demoAccount: true },
    });

    assert.equal(allowances.size, 0);
  });

  test('still apply to an ordinary student', async () => {
    mock.method(Transaction, 'aggregate', () => queryFor([{ _id: PRODUCT_ID, quantity: 1 }]));
    mock.method(PendingOrder, 'aggregate', () => queryFor([]));

    const allowances = await getPurchaseAllowances({
      studentId: REAL_ID,
      products: [product],
      student: { _id: REAL_ID, demoAccount: false },
    });

    assert.equal(allowances.get(PRODUCT_ID).remaining, 0);
  });
});

describe('the kiosk session', () => {
  beforeEach(() => parentGateOpen(OrderingSettings));

  const studentRow = (overrides) => ({
    _id: DEMO_ID,
    name: 'Demo Student',
    admissionNumber: 'DEMO01',
    pocketMoney: 3000,
    purchasePassword: 'hashed',
    requiresParentApproval: false,
    parentPhoneNumber: '0000000000',
    ...overrides,
  });

  const openSession = async (row) => {
    mock.method(Student, 'findOne', () => queryFor(row));
    const response = await fetch(base + '/api/students/kiosk-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber: row.admissionNumber }),
    });
    return { response, body: await response.json() };
  };

  test('a demo session runs twelve hours and says so, so the till draws no clock', async () => {
    mock.method(PendingOrder, 'findOne', () => queryFor(null));
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(null));

    const { response, body } = await openSession(studentRow({ demoAccount: true }));

    assert.equal(response.status, 200);
    assert.equal(body.student.demo, true);
    assert.equal(body.expiresInSeconds, DEMO_SESSION_SECONDS);

    // The countdown on screen is only a drawing of this, so the token is what
    // is actually asserted.
    const { exp, iat } = jwt.decode(body.token);
    assert.equal(exp - iat, DEMO_SESSION_SECONDS);
  });

  test('an ordinary student is still capped at 7:30', async () => {
    mock.method(PendingOrder, 'findOne', () => queryFor(null));
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(null));

    const { body } = await openSession(
      studentRow({ _id: REAL_ID, admissionNumber: 'REAL01', demoAccount: false })
    );

    assert.equal(body.student.demo, false);
    assert.equal(body.expiresInSeconds, STUDENT_SESSION_SECONDS);

    const { exp, iat } = jwt.decode(body.token);
    assert.equal(exp - iat, STUDENT_SESSION_SECONDS);
  });

  test("a stranger's leftover order does not shut the demo out", async () => {
    // Debris from before the flag was set. A real student with either of these
    // is turned away; the demo account must not be.
    mock.method(PendingOrder, 'findOne', () => queryFor({ status: 'PENDING' }));
    mock.method(FulfillmentOrder, 'findOne', () => queryFor({ status: 'PENDING' }));

    const { response } = await openSession(studentRow({ demoAccount: true }));

    assert.equal(response.status, 200);
  });

  test('an ordinary student with an open package is still turned away', async () => {
    mock.method(PendingOrder, 'findOne', () => queryFor(null));
    mock.method(FulfillmentOrder, 'findOne', () =>
      queryFor({ status: 'PENDING', deliverBy: new Date() })
    );

    const { response, body } = await openSession(
      studentRow({ _id: REAL_ID, admissionNumber: 'REAL01', demoAccount: false })
    );

    assert.equal(response.status, 409);
    assert.equal(body.code, 'KIOSK_ACTIVE_ORDER');
  });
});

/* The flag is a field on a row, which is the weaker of the two ways it could
 * have been declared: unlike an environment variable, data can be written by
 * anything that writes students. What makes it safe is that neither the admin
 * roster nor the CSV importer can reach it — both go through pickWritable, and
 * demoAccount is not in WRITABLE_FIELDS.
 *
 * That is one missing string, and a plausible future edit adds it back while
 * "making the roster editable". This is the test that would fail if it did,
 * because the consequence is not a cosmetic one: a real child marked as a demo
 * stops having their orders recorded and their parent told, silently.
 */
describe('the demo flag is not something an admin can set', () => {
  test('an update naming demoAccount writes everything else and drops it', async () => {
    accountMatcher(Admin, ADMIN_ID)('admin');

    let update;
    mock.method(Student, 'findOneAndUpdate', async (filter, changes) => {
      update = changes;
      return { _id: REAL_ID, name: 'Real Child' };
    });
    mock.method(Student, 'find', () => queryFor([]));
    mock.method(Parent, 'find', () => queryFor([]));
    // linkQuietly runs after the update and swallows its own failures; stubbed
    // only to keep its warning out of this file's output.
    mock.method(Parent, 'updateMany', async () => ({}));

    const response = await fetch(base + `/api/students/${REAL_ID}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${signAdminToken(ADMIN_ID)}`,
      },
      body: JSON.stringify({ name: 'Real Child', demoAccount: true }),
    });

    assert.equal(response.status, 200);
    // The legitimate part of the edit still landed...
    assert.equal(update.name, 'Real Child');
    // ...and the part that would have hidden this child's orders did not.
    assert.equal('demoAccount' in update, false);
  });
});
