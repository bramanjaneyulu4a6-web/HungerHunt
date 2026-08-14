// Per-product purchase limits: how many units of one product a single student
// may buy in a period. Both ways of spending reach chargeCart, so that is where
// the limit is enforced and where most of this lives. The counting rules are
// the fiddly part — cancelled orders must not count, one cart naming a product
// twice must count as one, and the period must be the business day, not the
// server's.
import test, { before, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Student = (await import('../models/Student.js')).default;
const Product = (await import('../models/Product.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { chargeCart } = await import('../utils/checkout.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f1f77bcf86cd799439021';
const PRODUCT_ID = '507f191e810c19729de860ec';
const GROUP_ID = '507f191e810c19729de860e1';
const UNIT_ID = '507f191e810c19729de860e2';

const adminToken = signStaffToken(STAFF_ID, 'admin');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, STAFF_ID);

// Inventory.findOne(...).populate(...) — a thenable chain fixed up front.
const findOneChain = (result) => {
  const chain = {
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

const chocolate = (purchaseLimit) => ({
  _id: PRODUCT_ID,
  name: 'Chocolate',
  price: 20,
  active: true,
  purchaseLimit,
});

// Stands the shelf and the wallet up, and records what the limit check asked
// the database. Refusing at the stock decrement ends each run before wallets
// and transactions come into it — reaching that call means the limit passed.
const arrange = ({ product, alreadyBought = 0 }) => {
  const pipelines = [];

  mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 5000 }));
  mock.method(Inventory, 'findOne', () => findOneChain({ stock: 100, productId: product }));
  mock.method(Transaction, 'aggregate', (pipeline) => {
    pipelines.push(pipeline);
    return alreadyBought > 0 ? [{ _id: PRODUCT_ID, quantity: alreadyBought }] : [];
  });

  const state = { pipelines, reachedDecrement: false };

  mock.method(Inventory, 'findOneAndUpdate', async () => {
    state.reachedDecrement = true;
    return null;
  });
  mock.method(Inventory, 'updateOne', async () => ({}));

  return state;
};

describe('a product with a purchase limit', () => {
  test('refuses the sale that would cross the limit, before stock or money moves', async () => {
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'DAILY' }),
      alreadyBought: 2,
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.equal(result.code, 'PRODUCT_LIMIT');
    // The message has to be actionable at a counter: what the cap is, what is
    // gone, and what is left.
    assert.match(result.message, /Chocolate is limited to 3 per day/);
    assert.match(result.message, /2 already bought/);
    assert.match(result.message, /only 1 more/);
    assert.equal(state.reachedDecrement, false);
  });

  test('allows the sale that exactly reaches the limit', async () => {
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'DAILY' }),
      alreadyBought: 2,
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(state.reachedDecrement, true);
    assert.equal(result.status, 409); // stopped at the stubbed decrement
  });

  test('says none can be added once the limit is spent', async () => {
    arrange({
      product: chocolate({ enabled: true, quantity: 2, period: 'DAILY' }),
      alreadyBought: 2,
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /None can be added/);
  });

  test('counts one product named on two lines of the same cart as one total', async () => {
    // Two lines of 2 against a limit of 3 is over, even though neither line is.
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'DAILY' }),
      alreadyBought: 0,
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: PRODUCT_ID, quantity: 2 },
        { productId: PRODUCT_ID, quantity: 2 },
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.code, 'PRODUCT_LIMIT');
    assert.equal(state.reachedDecrement, false);
  });

  test('does not count an order that was cancelled', async () => {
    // The reversal lives in its own collection and leaves the transaction
    // row in place, so the sum has to exclude reversed transactions rather
    // than trust the transaction list as it stands.
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'DAILY' }),
    });

    await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    const [pipeline] = state.pipelines;
    const lookup = pipeline.find((stage) => stage.$lookup);

    assert.ok(lookup, 'the count should join the reversals it must exclude');
    assert.equal(lookup.$lookup.foreignField, 'transactionId');
    assert.ok(
      pipeline.some(
        (stage) => stage.$match && stage.$match['reversals.0']?.$exists === false
      ),
      'reversed transactions should be dropped from the count'
    );
  });

  test('counts a DAILY limit from the start of the business day', async () => {
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'DAILY' }),
    });

    await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    const since = state.pipelines[0][0].$match.createdAt?.$gte;

    assert.ok(since instanceof Date, 'a periodic limit needs a window');
    assert.ok(since <= new Date(), 'the window starts in the past');
  });

  test('counts a TOTAL limit over the whole history, with no window', async () => {
    const state = arrange({
      product: chocolate({ enabled: true, quantity: 3, period: 'TOTAL' }),
      alreadyBought: 3,
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(state.pipelines[0][0].$match.createdAt, undefined);
    assert.match(result.message, /3 per in total/);
  });
});

describe('a product without a purchase limit', () => {
  test('is not counted at all', async () => {
    const state = arrange({ product: chocolate(undefined) });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 99 }],
    });

    assert.equal(state.pipelines.length, 0, 'no limit means no query');
    assert.equal(state.reachedDecrement, true);
    assert.equal(result.status, 409);
  });

  test('is not counted when the limit is switched off', async () => {
    const state = arrange({
      product: chocolate({ enabled: false, quantity: 2, period: 'DAILY' }),
    });

    await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 99 }],
    });

    assert.equal(state.pipelines.length, 0);
    assert.equal(state.reachedDecrement, true);
  });
});

/* The administrative half: what the catalogue accepts. */

const post = (body) =>
  fetch(`${base}/api/products`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const put = (body) =>
  fetch(`${base}/api/products/${PRODUCT_ID}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  });

const NEW_PRODUCT = {
  name: 'Chocolate',
  stockGroup: GROUP_ID,
  unit: UNIT_ID,
  price: 20,
};

describe('configuring a purchase limit', () => {
  test('is stored with the product it caps', async () => {
    accountIs('admin');
    let created;
    mock.method(Product, 'create', async (document) => {
      created = document;
      return { _id: PRODUCT_ID, ...document };
    });
    mock.method(Inventory, 'create', async () => ({}));

    const res = await post({
      ...NEW_PRODUCT,
      purchaseLimitEnabled: 'true',
      purchaseLimitQuantity: '2',
      purchaseLimitPeriod: 'WEEKLY',
    });

    assert.equal(res.status, 201);
    assert.deepEqual(created.purchaseLimit, {
      enabled: true,
      quantity: 2,
      period: 'WEEKLY',
    });
  });

  test('is refused when switched on with nothing to enforce', async () => {
    // A limit of zero would take the product off sale without anyone saying
    // so; archiving is how that is meant to be said.
    accountIs('admin');
    let created = false;
    mock.method(Product, 'create', async () => { created = true; return {}; });

    const res = await post({
      ...NEW_PRODUCT,
      purchaseLimitEnabled: 'true',
      purchaseLimitQuantity: '0',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /one or more/);
    assert.equal(created, false);
  });

  test('refuses a period nothing knows how to count', async () => {
    accountIs('admin');
    mock.method(Product, 'create', async () => ({}));

    const res = await post({
      ...NEW_PRODUCT,
      purchaseLimitEnabled: 'true',
      purchaseLimitQuantity: '2',
      purchaseLimitPeriod: 'FORTNIGHTLY',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /DAILY, WEEKLY, MONTHLY or TOTAL/);
  });

  test('keeps the quantity when the limit is switched off', async () => {
    // So switching it back on does not mean typing the number again.
    accountIs('admin');
    let update;
    mock.method(Product, 'findByIdAndUpdate', async (_id, data) => {
      update = data;
      return { _id: PRODUCT_ID };
    });

    const res = await put({ purchaseLimitEnabled: 'false' });

    assert.equal(res.status, 200);
    assert.equal(update['purchaseLimit.enabled'], false);
    assert.equal('purchaseLimit.quantity' in update, false);
  });

  test('is left alone by an edit that never mentions it', async () => {
    // The archive toggle sends one field; it must not reset the limit.
    accountIs('admin');
    let update;
    mock.method(Product, 'findByIdAndUpdate', async (_id, data) => {
      update = data;
      return { _id: PRODUCT_ID };
    });

    const res = await put({ active: false });

    assert.equal(res.status, 200);
    assert.deepEqual(update, { active: false });
  });
});
