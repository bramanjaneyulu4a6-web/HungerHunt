/* The PhonePe test account: the one parent (and their linked students) that
 * PhonePe's reviewer drives through the whole app while real families see
 * no checkout at all. To make that review possible without a warehouse crew
 * standing by, the test students shop without the weekly limits and the test
 * parent can walk a package through the storeroom themselves.
 *
 * All of it hangs off PHONEPE_TEST_PARENT_PHONES. An empty list means no
 * test account exists — a regular parent must never be able to reach any of
 * this by accident, so every test here checks the ordinary family as well.
 *
 * No database: every model call is stubbed.
 */
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { chargeCart } = await import('../utils/checkout.js');
const { isTestAccountPhone } = await import('../config/paymentAccess.js');
const { signParentToken, signStudentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const TEST_PHONE = '9000000021';
const FAMILY_PHONE = '9959544147';
const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ORDER_ID = '507f191e810c19729de860ef';
const TRANSACTION_ID = '507f191e810c19729de860ee';

const testParentToken = signParentToken(PARENT_ID, TEST_PHONE);
const familyParentToken = signParentToken(PARENT_ID, FAMILY_PHONE);

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => {
  delete process.env.PHONEPE_TEST_PARENT_PHONES;
  mock.restoreAll();
});

const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  query.sort = () => query;
  query.skip = () => query;
  query.limit = () => query;
  query.lean = () => query;
  query.session = () => query;
  return query;
};

const asParent = (token, path, options = {}) =>
  fetch(base + path, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

const ownsTheStudent = () =>
  mock.method(Parent, 'findById', () => queryFor({ _id: PARENT_ID, studentIds: [STUDENT_ID] }));

describe('isTestAccountPhone', () => {
  test('nobody is a test account while no allowlist is set', () => {
    delete process.env.PHONEPE_TEST_PARENT_PHONES;
    assert.equal(isTestAccountPhone(TEST_PHONE), false);
  });

  test('only the listed phones are, once it is', () => {
    assert.equal(isTestAccountPhone(TEST_PHONE), true);
    assert.equal(isTestAccountPhone(FAMILY_PHONE), false);
    assert.equal(isTestAccountPhone(undefined), false);
  });
});

/* The student is built so that BOTH limits would refuse: a product that may
   not be bought at all this week, and a wallet cap of one rupee. Reaching the
   stock decrement means both were skipped; it is stubbed to refuse so the run
   ends there without touching wallets or ledgers. */
describe('checkout for a test student', () => {
  const limitedProduct = {
    _id: PRODUCT_ID,
    name: 'Chocolate',
    price: 20,
    active: true,
    purchaseLimit: { enabled: true, quantity: 0, period: 'WEEKLY' },
  };

  const arrange = (parentPhoneNumber) => {
    const aggregates = [];
    mock.method(Student, 'findById', async () => ({
      _id: STUDENT_ID,
      pocketMoney: 500,
      parentPhoneNumber,
      walletControl: { enabled: true, limitAmount: 1, limitType: 'WEEKLY' },
    }));
    mock.method(Inventory, 'findOne', () => queryFor({ stock: 100, productId: limitedProduct }));
    mock.method(Transaction, 'aggregate', (pipeline) => {
      aggregates.push(pipeline);
      return [];
    });
    mock.method(PendingOrder, 'aggregate', (pipeline) => {
      aggregates.push(pipeline);
      return [];
    });
    mock.method(Inventory, 'findOneAndUpdate', async () => null);
    return aggregates;
  };

  const charge = () =>
    chargeCart({ studentId: STUDENT_ID, items: [{ productId: PRODUCT_ID, quantity: 3 }] });

  test('skips the product limit and the weekly cap', async () => {
    const aggregates = arrange(TEST_PHONE);

    const result = await charge();

    assert.equal(result.status, 409);
    assert.match(result.message, /Stock changed/);
    assert.equal(aggregates.length, 0, 'no limit was counted');
  });

  test('a regular family is still held to the product limit', async () => {
    arrange(FAMILY_PHONE);

    const result = await charge();

    assert.equal(result.status, 400);
    assert.equal(result.code, 'PRODUCT_LIMIT');
  });

  test('the test phone means nothing while no allowlist is set', async () => {
    delete process.env.PHONEPE_TEST_PARENT_PHONES;
    arrange(TEST_PHONE);

    const result = await charge();

    assert.equal(result.code, 'PRODUCT_LIMIT');
  });
});

describe('the kiosk catalogue for a test student', () => {
  const shelf = [
    {
      stock: 10,
      productId: {
        _id: PRODUCT_ID,
        name: 'Chocolate',
        active: true,
        purchaseLimit: { enabled: true, quantity: 1, period: 'WEEKLY' },
      },
      toObject() {
        return { stock: this.stock, productId: this.productId };
      },
    },
  ];

  const asStudent = () =>
    fetch(base + '/api/inventory', {
      headers: { Authorization: `Bearer ${signStudentToken(STUDENT_ID, '990001')}` },
    });

  test('carries no allowances, so no tile reads "limit reached"', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'findById', () => queryFor({ parentPhoneNumber: TEST_PHONE }));
    mock.method(Inventory, 'find', () => queryFor(shelf));
    let counted = 0;
    mock.method(Transaction, 'aggregate', () => { counted += 1; return []; });
    mock.method(PendingOrder, 'aggregate', () => { counted += 1; return []; });

    const body = await (await asStudent()).json();

    assert.equal(body[0].purchaseAllowance, null);
    assert.equal(counted, 0);
  });

  test('a regular student still sees theirs', async () => {
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));
    mock.method(Student, 'findById', () => queryFor({ parentPhoneNumber: FAMILY_PHONE }));
    mock.method(Inventory, 'find', () => queryFor(shelf));
    mock.method(Transaction, 'aggregate', () => []);
    mock.method(PendingOrder, 'aggregate', () => []);

    const body = await (await asStudent()).json();

    assert.equal(body[0].purchaseAllowance.remaining, 1);
  });
});

describe('the kiosk door for a test student', () => {
  const student = (parentPhoneNumber) => ({
    _id: STUDENT_ID,
    name: 'Test Student One',
    admissionNumber: '990001',
    pocketMoney: 500,
    purchasePassword: 'hashed',
    parentPhoneNumber,
  });

  const login = () =>
    fetch(base + '/api/students/kiosk-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admissionNumber: '990001' }),
    });

  test('opens even while an earlier package is still on its way', async () => {
    mock.method(Student, 'findOne', () => queryFor(student(TEST_PHONE)));
    mock.method(PendingOrder, 'findOne', () => queryFor(null));
    mock.method(FulfillmentOrder, 'findOne', () =>
      queryFor({ status: 'PACKED', deliverBy: new Date() })
    );

    const res = await login();

    assert.equal(res.status, 200);
  });

  test('a regular student still waits for the last order to finish', async () => {
    mock.method(Student, 'findOne', () => queryFor(student(FAMILY_PHONE)));
    mock.method(PendingOrder, 'findOne', () => queryFor(null));
    mock.method(FulfillmentOrder, 'findOne', () =>
      queryFor({ status: 'PACKED', deliverBy: new Date() })
    );

    const res = await login();

    assert.equal(res.status, 409);
    assert.equal((await res.json()).code, 'KIOSK_ACTIVE_ORDER');
  });

  test('an unanswered approval request still closes the door', async () => {
    mock.method(Student, 'findOne', () => queryFor(student(TEST_PHONE)));
    mock.method(PendingOrder, 'findOne', () =>
      queryFor({ status: 'PENDING', expiresAt: new Date(Date.now() + 60_000) })
    );
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(null));

    const res = await login();

    assert.equal(res.status, 409);
  });
});

const packageRow = (status) => ({
  _id: ORDER_ID,
  transactionId: TRANSACTION_ID,
  studentId: STUDENT_ID,
  studentSnapshot: { name: 'Test Student One', roomNumber: 'T-01' },
  items: [{ productId: PRODUCT_ID, name: 'Chocolate', quantity: 1, price: 20 }],
  totalAmount: 20,
  status,
  orderedAt: new Date(),
  deliverBy: new Date(Date.now() + 48 * 3_600_000),
  transitions: [],
});

describe("the test parent's packages", () => {
  const listPackages = async (token) => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'countDocuments', async () => 2);
    mock.method(Transaction, 'find', () => queryFor([]));
    return (await asParent(token, `/api/parent/child/${STUDENT_ID}/packages`)).json();
  };

  test('offer the warehouse simulation until the package is finished', async () => {
    mock.method(FulfillmentOrder, 'find', () =>
      queryFor([packageRow('PENDING'), packageRow('COLLECTED')])
    );

    const body = await listPackages(testParentToken);

    assert.equal(body.packages[0].warehouseSimulation, true);
    assert.equal(body.packages[1].warehouseSimulation, false);
  });

  test("a regular family's packages never do", async () => {
    mock.method(FulfillmentOrder, 'find', () => queryFor([packageRow('PENDING')]));

    const body = await listPackages(familyParentToken);

    assert.equal('warehouseSimulation' in body.packages[0], false);
  });
});

describe('simulating the warehouse', () => {
  const simulate = (token) =>
    asParent(token, `/api/parent/packages/${ORDER_ID}/simulate-warehouse`, { method: 'POST' });

  test('is refused to a regular family before anything is looked up', async () => {
    let looked = false;
    mock.method(FulfillmentOrder, 'findOne', () => { looked = true; return queryFor(null); });

    const res = await simulate(familyParentToken);

    assert.equal(res.status, 403);
    assert.equal(looked, false);
  });

  test('walks a paid package all the way to collected with default proof', async () => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(packageRow('PENDING')));

    let written;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, update) => {
      written = { filter, update };
      return queryFor({
        ...packageRow('COLLECTED'),
        ...update.$set,
        transitions: update.$push.transitions.$each,
      });
    });

    const res = await simulate(testParentToken);
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.deepEqual(written.filter, {
      _id: ORDER_ID,
      status: 'PENDING',
      studentId: { $in: [STUDENT_ID] },
    });
    assert.equal(written.update.$set.status, 'COLLECTED');
    assert.equal(written.update.$set.proofOfDelivery.receivedBy, 'Test Receiver');
    assert.equal(written.update.$set.proofOfDelivery.receiverPhone, '9000000000');
    assert.ok(written.update.$set.packedAt instanceof Date);
    assert.ok(written.update.$set.collectedAt instanceof Date);
    assert.deepEqual(
      written.update.$push.transitions.$each.map((t) => `${t.from}>${t.to}`),
      ['PENDING>PACKED', 'PACKED>OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY>DELIVERED', 'DELIVERED>COLLECTED']
    );
    for (const transition of written.update.$push.transitions.$each) {
      assert.match(transition.note, /simulated/i);
      assert.equal('actorId' in transition, false);
    }
    assert.equal(body.package.status, 'COLLECTED');
    assert.equal(body.package.warehouseSimulation, false);
  });

  test('picks up from wherever the storeroom left the package', async () => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(packageRow('OUT_FOR_DELIVERY')));
    let written;
    mock.method(FulfillmentOrder, 'findOneAndUpdate', (filter, update) => {
      written = update;
      return queryFor({ ...packageRow('COLLECTED'), transitions: update.$push.transitions.$each });
    });

    await simulate(testParentToken);

    assert.deepEqual(
      written.$push.transitions.$each.map((t) => t.to),
      ['DELIVERED', 'COLLECTED']
    );
    assert.equal('packedAt' in written.$set, false);
  });

  test('has nothing to do for a finished package', async () => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(packageRow('COLLECTED')));

    const res = await simulate(testParentToken);

    assert.equal(res.status, 409);
  });

  test("cannot reach another family's package", async () => {
    ownsTheStudent();
    mock.method(FulfillmentOrder, 'findOne', () => queryFor(null));

    const res = await simulate(testParentToken);

    assert.equal(res.status, 404);
  });
});
