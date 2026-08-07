// Phase 3d: the parent's purchase password is now part of the charge.
//
// verifyPayment used to answer { success: true } and generateBill never asked
// about the password at all — the two were joined only by the till calling them
// in order, so anything holding an admin token could post the bill on its own.
// verifyPayment now issues a single-use token bound to the student and the
// cart, and generateBill spends it.
//
// The real app, routes and controller run here. Only the model calls are
// stubbed, so no database is needed: PurchaseAuthorization is backed by a Map
// that removes on read, which is the property Mongo's findOneAndDelete provides
// and the reason a token cannot be spent twice.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';
import bcrypt from 'bcryptjs';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.AUTH_BYPASS = 'false';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const PurchaseAuthorization = (await import('../models/PurchaseAuthorization.js')).default;
const { hashCart } = await import('../utils/purchaseAuthorization.js');
const { signAdminToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

// Anything that slips past a stub should fail rather than wait out Mongoose's
// 10s buffering timeout.
mongoose.set('bufferTimeoutMS', 1000);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const OTHER_STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const OTHER_PRODUCT_ID = '507f191e810c19729de860ed';

const PHONE = '9999999999';
const PASSWORD = 'parent-purchase-password';

const adminToken = signAdminToken(ADMIN_ID);

// Pinned, so these assertions keep their meaning once the real date passes.
const GRACE_OPEN = '2999-01-01T00:00:00Z';
const GRACE_CLOSED = '2000-01-01T00:00:00Z';

const setGrace = (when) => { process.env.PURCHASE_AUTH_GRACE_UNTIL = when; };

const CART = [{ productId: PRODUCT_ID, quantity: 2 }];

let base;
let passwordHash;

before(async () => {
  passwordHash = await bcrypt.hash(PASSWORD, 4);

  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => {
  mock.restoreAll();
  delete process.env.PURCHASE_AUTH_GRACE_UNTIL;
});

// Mongoose queries are thenable and chainable; the controller awaits some
// directly and calls .select()/.populate() on others.
const queryFor = (value) => {
  const query = Promise.resolve(value);
  query.select = () => query;
  query.populate = () => query;
  return query;
};

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${adminToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

// Stands in for the collection. findOneAndDelete takes the row out as it reads
// it, so a token is gone the moment it is claimed.
const store = new Map();

const stubAuthorizationStore = () => {
  store.clear();

  mock.method(PurchaseAuthorization, 'create', async (doc) => {
    store.set(doc.token, { ...doc });
    return doc;
  });

  mock.method(PurchaseAuthorization, 'findOneAndDelete', async ({ token }) => {
    const found = store.get(token);
    if (!found) return null;
    store.delete(token);
    return found;
  });
};

// Everything downstream of the gate, so a bill that is allowed through reaches
// 201 and a bill that is not can be shown to have touched nothing.
const stubBillPath = () => {
  const counts = { debits: 0, stockMoves: 0, transactions: 0 };

  mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));

  mock.method(Student, 'findById', () =>
    queryFor({
      _id: STUDENT_ID,
      parentPhoneNumber: PHONE,
      purchasePassword: passwordHash,
      pocketMoney: 500,
    })
  );

  mock.method(Inventory, 'findOne', () =>
    queryFor({
      stock: 50,
      productId: { _id: PRODUCT_ID, name: 'Bun', price: 10 },
    })
  );

  mock.method(Inventory, 'findOneAndUpdate', async () => {
    counts.stockMoves += 1;
    return { stock: 48 };
  });

  mock.method(Student, 'findOneAndUpdate', async () => {
    counts.debits += 1;
    return { pocketMoney: 480 };
  });

  mock.method(Transaction, 'create', async () => {
    counts.transactions += 1;
    return { _id: '507f191e810c19729de860ee' };
  });

  mock.method(Parent, 'findOne', async () => null);

  return counts;
};

// The whole till flow: take the password, then charge with what it returned.
const verify = async (body = {}) => {
  const res = await post('/api/transactions/verify-payment', {
    studentId: STUDENT_ID,
    phone: PHONE,
    password: PASSWORD,
    items: CART,
    ...body,
  });

  return { status: res.status, body: await res.json() };
};

const bill = (body = {}) =>
  post('/api/transactions/bill', {
    studentId: STUDENT_ID,
    items: CART,
    totalAmount: 20,
    ...body,
  });

describe('a bill must carry the token verify-payment issued', () => {
  test('a valid token charges the wallet', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const verified = await verify();
    assert.equal(verified.status, 200);
    assert.ok(verified.body.purchaseToken, 'verify-payment must hand back a token');

    const res = await bill({ purchaseToken: verified.body.purchaseToken });

    assert.equal(res.status, 201, JSON.stringify(await res.json()));
    assert.equal(counts.debits, 1);
    assert.equal(counts.transactions, 1);
  });

  test('a bill with no token is refused, and nothing is charged', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const res = await bill();

    assert.equal(res.status, 403);
    assert.equal(counts.debits, 0, 'a refused bill must not touch the wallet');
    assert.equal(counts.stockMoves, 0, 'a refused bill must not move stock');
  });

  test('a token cannot be spent twice', async () => {
    // Open, to show the window covers only bills with no token at all — a token
    // that has already been used is refused throughout.
    setGrace(GRACE_OPEN);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const { body } = await verify();

    assert.equal((await bill({ purchaseToken: body.purchaseToken })).status, 201);

    const replay = await bill({ purchaseToken: body.purchaseToken });

    assert.equal(replay.status, 403);
    assert.equal(counts.debits, 1, 'the wallet must be debited once, not twice');
  });

  test('an expired token is refused', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const { body } = await verify();
    // Reaches into the store rather than waiting out the real TTL. What is
    // under test is that the stored date is read at all.
    store.get(body.purchaseToken).expiresAt = new Date(Date.now() - 1000);

    const res = await bill({ purchaseToken: body.purchaseToken });

    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /expired/i);
    assert.equal(counts.debits, 0);
  });

  test('a token issued for one cart does not pay for another', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const { body } = await verify();

    // The password was given for two buns. This bills twenty.
    const res = await bill({
      purchaseToken: body.purchaseToken,
      items: [{ productId: PRODUCT_ID, quantity: 20 }],
    });

    assert.equal(res.status, 403);
    assert.equal(counts.debits, 0);
  });

  test('a token issued for one student does not pay for another', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const { body } = await verify();

    const res = await bill({
      purchaseToken: body.purchaseToken,
      studentId: OTHER_STUDENT_ID,
    });

    assert.equal(res.status, 403);
    assert.equal(counts.debits, 0);
  });

  test('an unknown token is refused', async () => {
    setGrace(GRACE_CLOSED);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const res = await bill({ purchaseToken: 'a'.repeat(64) });

    assert.equal(res.status, 403);
    assert.equal(counts.debits, 0);
  });
});

// The till and this server deploy separately, and the till is a screen that
// stays open all day on the bundle it loaded that morning. Until the date
// passes, a bill from one of those keeps working.
describe('the grace window for clients that send no token', () => {
  test('a bill with no token is still charged while the window is open', async () => {
    setGrace(GRACE_OPEN);
    stubAuthorizationStore();
    const counts = stubBillPath();

    const res = await bill();

    assert.equal(res.status, 201, JSON.stringify(await res.json()));
    assert.equal(counts.debits, 1);
  });

  test('a client that sends no items still gets the answer it expects', async () => {
    setGrace(GRACE_OPEN);
    stubAuthorizationStore();
    stubBillPath();

    const res = await post('/api/transactions/verify-payment', {
      studentId: STUDENT_ID,
      phone: PHONE,
      password: PASSWORD,
    });

    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.success, true);
    assert.equal(body.purchaseToken, undefined);
  });

  test('the wrong password issues no token, window or not', async () => {
    setGrace(GRACE_OPEN);
    stubAuthorizationStore();
    stubBillPath();

    const res = await post('/api/transactions/verify-payment', {
      studentId: STUDENT_ID,
      phone: PHONE,
      password: 'not-the-password',
      items: CART,
    });

    assert.equal(res.status, 400);
    assert.equal(store.size, 0);
  });
});

// Verify and bill hash the cart independently. If the two disagree for the same
// cart, every sale fails — so the parts the client controls must not matter.
describe('the cart hash is canonical', () => {
  const items = [
    { productId: PRODUCT_ID, quantity: 2 },
    { productId: OTHER_PRODUCT_ID, quantity: 1 },
  ];

  test('line order does not change the hash', () => {
    assert.equal(hashCart(items), hashCart([...items].reverse()));
  });

  test('a quantity sent as a string hashes the same as the number', () => {
    assert.equal(
      hashCart([{ productId: PRODUCT_ID, quantity: 2 }]),
      hashCart([{ productId: PRODUCT_ID, quantity: '2' }])
    );
  });

  test('a different quantity is a different cart', () => {
    assert.notEqual(
      hashCart([{ productId: PRODUCT_ID, quantity: 2 }]),
      hashCart([{ productId: PRODUCT_ID, quantity: 3 }])
    );
  });

  test('a different product is a different cart', () => {
    assert.notEqual(
      hashCart([{ productId: PRODUCT_ID, quantity: 2 }]),
      hashCart([{ productId: OTHER_PRODUCT_ID, quantity: 2 }])
    );
  });

  test('an added line is a different cart', () => {
    assert.notEqual(hashCart(items), hashCart(items.slice(0, 1)));
  });
});
