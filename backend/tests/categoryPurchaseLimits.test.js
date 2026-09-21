// Category and sub-category caps, and switching a whole category off.
//
// The rules pinned here: every cap covering a product applies and the
// strictest binds; a category or sub-category cap counts the student's total
// across all its products, in any mix; and a switched-off category sells
// nothing, however the order arrives. No database — every model call is
// stubbed, as in purchaseLimits.test.js.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
// See purchaseLimits.test.js: no PhonePe test account, whatever .env says.
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Product = (await import('../models/Product.js')).default;
const StockGroup = (await import('../models/StockGroup.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const {
  checkPurchaseLimits,
  getPurchaseAllowances,
  productInClosedCategory,
} = await import('../utils/purchaseLimits.js');
const { signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;
const { accountMatcher } = await import('./helpers/accountIs.js');

mongoose.set('bufferTimeoutMS', 200);

const STAFF_ID = '507f1f77bcf86cd799439011';
const STUDENT = { _id: '507f1f77bcf86cd799439021', demoAccount: false };
const SNACKS = '507f191e810c19729de860e1';
const DRINKS = '507f191e810c19729de860e9';
const BLUE_LAYS = '507f191e810c19729de860a1';
const KURKURE = '507f191e810c19729de860a2';
const BISCUIT = '507f191e810c19729de860a3';
const FROOTI = '507f191e810c19729de860a4';

const product = (_id, name, subCategory, stockGroup = SNACKS, purchaseLimit) => ({
  _id,
  name,
  subCategory,
  stockGroup,
  active: true,
  ...(purchaseLimit ? { purchaseLimit } : {}),
});

const blueLays = (limit) => product(BLUE_LAYS, 'Blue Lays', 'Salty Snacks', SNACKS, limit);
const kurkure = product(KURKURE, 'Kurkure', 'Salty Snacks');
const biscuit = product(BISCUIT, 'Parle-G', 'Biscuits');
const frooti = product(FROOTI, 'Frooti', 'Juices', DRINKS);
const CATALOGUE = [blueLays(), kurkure, biscuit, frooti];

const weekly = (quantity) => ({ enabled: true, quantity, period: 'WEEKLY' });

/* The categories, the catalogue behind them, and what the student has bought
   this period and has waiting. `bought` and `waiting` map product id to
   units; the aggregate stubs answer for whichever products a pipeline asks
   about, as Mongo would. */
const arrange = ({ groups = [], bought = {}, waiting = {} }) => {
  mock.method(StockGroup, 'find', (filter) => {
    const ids = (filter._id?.$in || []).map(String);
    const rows = groups
      .filter((group) => ids.includes(String(group._id)))
      .filter((group) => (filter.active === false ? group.active === false : true));
    const chain = { select: () => chain, lean: async () => rows };
    return chain;
  });
  mock.method(Product, 'find', (filter) => ({
    distinct: async () =>
      CATALOGUE.filter(
        (item) =>
          String(item.stockGroup) === String(filter.stockGroup) &&
          (filter.subCategory === undefined || item.subCategory === filter.subCategory)
      ).map((item) => new mongoose.Types.ObjectId(item._id)),
  }));
  const answer = (units) => (pipeline) => {
    const asked = pipeline[0].$match['items.productId'].$in.map(String);
    return Object.entries(units)
      .filter(([id]) => asked.includes(id))
      .map(([id, quantity]) => ({ _id: id, quantity }));
  };
  mock.method(Transaction, 'aggregate', answer(bought));
  mock.method(PendingOrder, 'aggregate', answer(waiting));
};

const snacks = (fields = {}) => ({ _id: SNACKS, name: 'Snacks', subCategoryLimits: [], ...fields });
const saltyCap = (quantity) => ({ name: 'Salty Snacks', ...weekly(quantity) });

afterEach(() => mock.restoreAll());

describe('the strictest cap wins', () => {
  test('a sub-category cap below the product cap binds: Blue Lays 3/week in Salty Snacks 2/week', async () => {
    arrange({ groups: [snacks({ subCategoryLimits: [saltyCap(2)] })] });

    const allowances = await getPurchaseAllowances({ studentId: STUDENT._id, products: [blueLays(weekly(3))], student: STUDENT });
    const allowance = allowances.get(BLUE_LAYS);

    assert.equal(allowance.remaining, 2);
    assert.deepEqual(allowance.scope, { type: 'SUBCATEGORY', name: 'Salty Snacks' });

    const three = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: blueLays(weekly(3)), quantity: 3 }],
    });
    assert.equal(three.ok, false);
    assert.equal(three.code, 'PRODUCT_LIMIT');
    assert.match(three.message, /Items from Salty Snacks are limited to 2 per week/);

    const two = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: blueLays(weekly(3)), quantity: 2 }],
    });
    assert.equal(two.ok, true);
  });

  test('a product cap below the sub-category cap still binds: Blue Lays 3/week in Salty Snacks 5/week', async () => {
    arrange({ groups: [snacks({ subCategoryLimits: [saltyCap(5)] })] });

    const allowance = (await getPurchaseAllowances({
      studentId: STUDENT._id, products: [blueLays(weekly(3))], student: STUDENT,
    })).get(BLUE_LAYS);

    assert.equal(allowance.remaining, 3);
    assert.deepEqual(allowance.scope, { type: 'PRODUCT', name: 'Blue Lays' });

    const four = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: blueLays(weekly(3)), quantity: 4 }],
    });
    assert.equal(four.ok, false);
    assert.match(four.message, /Blue Lays is limited to 3 per week/);
  });

  test('a category cap covers products that have no cap of their own', async () => {
    arrange({ groups: [snacks({ purchaseLimit: weekly(4) })] });

    const allowance = (await getPurchaseAllowances({
      studentId: STUDENT._id, products: [biscuit], student: STUDENT,
    })).get(BISCUIT);

    assert.equal(allowance.remaining, 4);
    assert.deepEqual(allowance.scope, { type: 'CATEGORY', name: 'Snacks' });
    assert.equal(allowance.product, null);
  });
});

describe('a category or sub-category cap counts the total, in any mix', () => {
  test('what was bought of one product uses up the cap for another', async () => {
    arrange({ groups: [snacks({ subCategoryLimits: [saltyCap(2)] })], bought: { [KURKURE]: 1 } });

    const result = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: blueLays(), quantity: 2 }],
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /Items from Salty Snacks are limited to 2 per week; 1 already bought, so only 1 more can be added/);
  });

  test('two products in one cart are added together against the cap', async () => {
    arrange({ groups: [snacks({ subCategoryLimits: [saltyCap(2)] })] });

    const over = await checkPurchaseLimits({
      studentId: STUDENT._id,
      student: STUDENT,
      entries: [{ product: blueLays(), quantity: 2 }, { product: kurkure, quantity: 1 }],
    });
    assert.equal(over.ok, false);

    const within = await checkPurchaseLimits({
      studentId: STUDENT._id,
      student: STUDENT,
      entries: [{ product: blueLays(), quantity: 1 }, { product: kurkure, quantity: 1 }],
    });
    assert.equal(within.ok, true);
  });

  test('orders awaiting approval reserve their units against the cap', async () => {
    arrange({ groups: [snacks({ purchaseLimit: weekly(3) })], waiting: { [BISCUIT]: 2 } });

    const allowance = (await getPurchaseAllowances({
      studentId: STUDENT._id, products: [blueLays()], student: STUDENT,
    })).get(BLUE_LAYS);

    assert.equal(allowance.pending, 2);
    assert.equal(allowance.remaining, 1);
  });

  test('a sub-category cap leaves the rest of its category alone', async () => {
    arrange({ groups: [snacks({ subCategoryLimits: [saltyCap(1)] })], bought: { [BLUE_LAYS]: 1 } });

    const result = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: biscuit, quantity: 5 }],
    });

    assert.equal(result.ok, true);
  });

  test('a category cap reaches across its sub-categories but not into another category', async () => {
    arrange({ groups: [snacks({ purchaseLimit: weekly(2) })], bought: { [BLUE_LAYS]: 1 } });

    const snack = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: biscuit, quantity: 2 }],
    });
    assert.equal(snack.ok, false);
    assert.match(snack.message, /Items from Snacks are limited to 2 per week/);

    const drink = await checkPurchaseLimits({
      studentId: STUDENT._id, student: STUDENT, entries: [{ product: frooti, quantity: 5 }],
    });
    assert.equal(drink.ok, true);
  });

  test('a cap switched off counts for nothing', async () => {
    arrange({
      groups: [snacks({ purchaseLimit: { enabled: false, quantity: 1, period: 'WEEKLY' } })],
      bought: { [BLUE_LAYS]: 9 },
    });

    const allowances = await getPurchaseAllowances({
      studentId: STUDENT._id, products: [blueLays()], student: STUDENT,
    });

    assert.equal(allowances.size, 0);
  });

  test('the demo account is exempt from category caps as from product caps', async () => {
    arrange({ groups: [snacks({ purchaseLimit: weekly(1) })], bought: { [BLUE_LAYS]: 9 } });

    const allowances = await getPurchaseAllowances({
      studentId: STUDENT._id, products: [blueLays()], student: { ...STUDENT, demoAccount: true },
    });

    assert.equal(allowances.size, 0);
  });
});

describe('a switched-off category', () => {
  test('is found among the products of an order', async () => {
    arrange({ groups: [snacks({ active: false }), { _id: DRINKS, name: 'Drinks', active: true }] });

    assert.equal((await productInClosedCategory([frooti, blueLays()]))?.name, 'Blue Lays');
    assert.equal(await productInClosedCategory([frooti]), null);
  });
});

/* ---------------- the console's routes ---------------- */

const adminToken = signStaffToken(STAFF_ID, 'admin');
const accountIs = accountMatcher(Admin, STAFF_ID);
let base;
let server;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

after(() => new Promise((resolve) => server.close(resolve)));

const put = (path, body) =>
  fetch(base + path, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${adminToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// A category row that saves in place, as a Mongoose document would.
const categoryRow = (fields = {}) => {
  const row = {
    _id: SNACKS,
    name: 'Snacks',
    subCategories: ['Salty Snacks', 'Biscuits', 'Others'],
    subCategoryLimits: [],
    ...fields,
    async save() { return this; },
  };
  mock.method(StockGroup, 'findById', async () => row);
  return row;
};

describe('the console sets categories on and off, and their caps', () => {
  test('switches a category off', async () => {
    accountIs('admin');
    let update;
    mock.method(StockGroup, 'findByIdAndUpdate', async (id, value) => {
      update = value;
      return { _id: id, ...value };
    });

    const response = await put(`/api/stock-groups/${SNACKS}`, { active: false });

    assert.equal(response.status, 200);
    assert.deepEqual(update, { active: false });
  });

  test('sets a category cap, and refuses one of zero while switched on', async () => {
    accountIs('admin');
    let update;
    mock.method(StockGroup, 'findByIdAndUpdate', async (id, value) => {
      update = value;
      return { _id: id, ...value };
    });

    const ok = await put(`/api/stock-groups/${SNACKS}`, { purchaseLimit: weekly(4) });
    assert.equal(ok.status, 200);
    assert.deepEqual(update, { purchaseLimit: weekly(4) });

    const zero = await put(`/api/stock-groups/${SNACKS}`, { purchaseLimit: weekly(0) });
    assert.equal(zero.status, 400);

    const badPeriod = await put(`/api/stock-groups/${SNACKS}`, { purchaseLimit: { enabled: true, quantity: 2, period: 'YEARLY' } });
    assert.equal(badPeriod.status, 400);
  });

  test('sets a sub-category cap, replacing any earlier one for that name', async () => {
    accountIs('admin');
    const row = categoryRow({ subCategoryLimits: [saltyCap(5)] });

    const response = await put(`/api/stock-groups/${SNACKS}/subcategory-limits`, {
      subCategory: 'Salty Snacks', ...weekly(2),
    });

    assert.equal(response.status, 200);
    assert.deepEqual(row.subCategoryLimits, [saltyCap(2)]);
  });

  test('refuses a cap on a sub-category the category does not list', async () => {
    accountIs('admin');
    categoryRow();

    const response = await put(`/api/stock-groups/${SNACKS}/subcategory-limits`, {
      subCategory: 'Chocolates', ...weekly(2),
    });

    assert.equal(response.status, 404);
  });

  test('a renamed sub-category carries its cap, and a removed one drops it', async () => {
    accountIs('admin');
    const row = categoryRow({ subCategoryLimits: [saltyCap(2), { name: 'Biscuits', ...weekly(3) }] });
    mock.method(Product, 'exists', async () => null);
    mock.method(Product, 'updateMany', async () => ({}));

    const response = await put(`/api/stock-groups/${SNACKS}/subcategories`, {
      subCategories: ['Chips', 'Others'],
      renameFrom: 'Salty Snacks',
      renameTo: 'Chips',
    });

    assert.equal(response.status, 200);
    assert.deepEqual(row.subCategoryLimits, [{ name: 'Chips', ...weekly(2) }]);
  });
});
