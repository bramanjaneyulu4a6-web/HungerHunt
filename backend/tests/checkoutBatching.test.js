/* chargeCart reads the whole cart in one query.
 *
 * This is a latency test written as a behaviour test. The service runs in
 * Oregon and Atlas is in Mumbai, so every round trip costs ~245ms regardless
 * of how fast the query is — and the old loop spent two of them per cart line
 * (the findOne, then a second query behind populate). A five-line basket was
 * over two seconds of waiting on a database that answered in under a
 * millisecond.
 *
 * Batching only pays if nothing else moved, so what is pinned here is both
 * halves: that one query is issued no matter how many lines the cart has, and
 * that each line is still judged against its OWN row, in cart order, with the
 * same refusals as before. A regression that reintroduces the per-line read
 * would still pass every other suite in this repository — the only symptom is
 * a slower till.
 */
import test, { afterEach, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

/* app.js loads backend/.env into every test run, so a developer whose .env
   names a demo or test phone would otherwise run this suite down the showroom
   branch — which skips the stock check these tests are about. */
process.env.DEMO_PARENT_PHONES = '';
process.env.PHONEPE_TEST_PARENT_PHONES = '';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { weeklyOrderLimitOff } = await import('./helpers/weeklyOrderLimitOff.js');
const { chargeCart } = await import('../utils/checkout.js');

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439021';
const SAMOSA = '507f191e810c19729de860c1';
const BUN = '507f191e810c19729de860c2';
const MILK = '507f191e810c19729de860c3';

// Not about the one-order-a-week rule; weeklyOrderLimit.test.js covers it.
beforeEach(() => weeklyOrderLimitOff(OrderingSettings));
afterEach(() => mock.restoreAll());

const row = (productId, name, price, stock, active = true) => ({
  stock,
  productId: { _id: productId, name, price, active },
});

/* Inventory.find(...).populate(...) — a thenable chain fixed up front, so the
   call can be counted without a database. */
const stubCatalogue = (rows) =>
  mock.method(Inventory, 'find', () => {
    const chain = {
      populate: () => chain,
      session: () => chain,
      then: (resolve, reject) => Promise.resolve(rows).then(resolve, reject),
    };
    return chain;
  });

const stubStudent = () =>
  mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 5000 }));

// Reaching the decrement is what "the cart priced cleanly" looks like from
// outside, and refusing there ends the charge before any wallet is touched.
const refuseAtDecrement = () => {
  const decrement = mock.method(Inventory, 'findOneAndUpdate', async () => null);
  mock.method(Inventory, 'updateOne', async () => ({}));
  return decrement;
};

describe('chargeCart reads the cart in one query', () => {
  test('a three-line cart costs one read, not three', async () => {
    stubStudent();
    const find = stubCatalogue([
      row(SAMOSA, 'Samosa', 12, 10),
      row(BUN, 'Bun', 10, 10),
      row(MILK, 'Milk', 20, 10),
    ]);
    const findOne = mock.method(Inventory, 'findOne', () => {
      throw new Error('chargeCart must not read inventory one line at a time');
    });
    const decrement = refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: SAMOSA, quantity: 1 },
        { productId: BUN, quantity: 1 },
        { productId: MILK, quantity: 1 },
      ],
    });

    assert.equal(find.mock.callCount(), 1);
    assert.equal(findOne.mock.callCount(), 0);
    // It got as far as claiming stock, so all three lines priced.
    assert.ok(decrement.mock.callCount() > 0);
    assert.equal(result.ok, false);
    assert.equal(result.status, 409);
  });

  test('the query asks for exactly the products the cart names', async () => {
    stubStudent();
    const find = stubCatalogue([row(SAMOSA, 'Samosa', 12, 10), row(BUN, 'Bun', 10, 10)]);
    refuseAtDecrement();

    await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: SAMOSA, quantity: 1 },
        { productId: BUN, quantity: 2 },
      ],
    });

    const filter = find.mock.calls[0].arguments[0];
    assert.deepEqual(filter.productId.$in, [SAMOSA, BUN]);
  });
});

describe('every line is still judged against its own row', () => {
  test('an archived product is named even when it is the last line', async () => {
    stubStudent();
    stubCatalogue([
      row(SAMOSA, 'Samosa', 12, 10),
      row(BUN, 'Bun', 10, 10),
      row(MILK, 'Milk', 20, 10, false),
    ]);
    const decrement = refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: SAMOSA, quantity: 1 },
        { productId: BUN, quantity: 1 },
        { productId: MILK, quantity: 1 },
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /Milk is no longer sold/);
    // Refused during pricing, so nothing was claimed.
    assert.equal(decrement.mock.callCount(), 0);
  });

  /* The rows come back in whatever order the index hands them over, which is
     not the cart's order. Pairing by position instead of by product would
     price every line against the wrong row and still look like it worked. */
  test('rows are matched by product, not by position', async () => {
    stubStudent();
    stubCatalogue([
      row(MILK, 'Milk', 20, 10),
      row(SAMOSA, 'Samosa', 12, 0),
      row(BUN, 'Bun', 10, 10),
    ]);
    refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: MILK, quantity: 1 },
        { productId: SAMOSA, quantity: 1 },
        { productId: BUN, quantity: 1 },
      ],
    });

    assert.equal(result.ok, false);
    assert.match(result.message, /Insufficient stock for Samosa/);
  });

  test('one product named on two lines resolves from the single read', async () => {
    stubStudent();
    const find = stubCatalogue([row(SAMOSA, 'Samosa', 12, 10), row(BUN, 'Bun', 10, 10, false)]);
    refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: SAMOSA, quantity: 1 },
        { productId: SAMOSA, quantity: 2 },
        { productId: BUN, quantity: 1 },
      ],
    });

    assert.equal(find.mock.callCount(), 1);
    // Both Samosa lines priced; the refusal is the line that earned it.
    assert.match(result.message, /Bun is no longer sold/);
  });

  test('a product with no inventory row is still "not found"', async () => {
    stubStudent();
    stubCatalogue([row(SAMOSA, 'Samosa', 12, 10)]);
    const decrement = refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [
        { productId: SAMOSA, quantity: 1 },
        { productId: BUN, quantity: 1 },
      ],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.message, /Inventory record not found/);
    assert.equal(decrement.mock.callCount(), 0);
  });

  /* A row whose product has been deleted populates to null. It used to be
     caught by the null check after findOne; now it simply keys to nothing and
     lands on the same refusal, which is worth pinning because the two routes
     to that message are no longer the same code. */
  test('a row whose product no longer exists is "not found"', async () => {
    stubStudent();
    stubCatalogue([{ stock: 10, productId: null }]);
    refuseAtDecrement();

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: SAMOSA, quantity: 1 }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 404);
    assert.match(result.message, /Inventory record not found/);
  });

  /* Both callers reject an empty cart with a 400 long before this, so what is
     pinned is only the guard itself: no line, no query. What the charge goes
     on to do with nothing to sell is not this test's business, and needs a
     wallet it has no reason to stub. */
  test('an empty cart reads nothing at all', async () => {
    stubStudent();
    const find = stubCatalogue([]);

    await chargeCart({ studentId: STUDENT_ID, items: [] }).catch(() => {});

    assert.equal(find.mock.callCount(), 0);
  });
});
