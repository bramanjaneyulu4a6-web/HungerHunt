// The server-side half of archiving: a till open since morning still shows
// yesterday's menu, so hiding an archived product client-side is not enough —
// the charge itself has to refuse it. Both sale paths (till bill, parent
// approval) go through chargeCart, so this is the one place.
import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { chargeCart } = await import('../utils/checkout.js');

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439021';
const PRODUCT_ID = '507f191e810c19729de860ec';

afterEach(() => mock.restoreAll());

// Inventory.findOne(...).populate(...) — a thenable chain fixed up front.
const findOneChain = (result) => {
  const chain = {
    populate: () => chain,
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('charging a cart with an archived product', () => {
  test('is refused by name before any stock or money moves', async () => {
    mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 500 }));
    mock.method(Inventory, 'findOne', () =>
      findOneChain({
        stock: 10,
        productId: { _id: PRODUCT_ID, name: 'Samosa', price: 12, active: false },
      })
    );
    let stockMoved = false;
    mock.method(Inventory, 'findOneAndUpdate', async () => { stockMoved = true; return null; });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, 400);
    assert.match(result.message, /Samosa is no longer sold/);
    assert.equal(stockMoved, false);
  });

  test('a live product still charges normally past the check', async () => {
    mock.method(Student, 'findById', async () => ({ _id: STUDENT_ID, pocketMoney: 500 }));
    mock.method(Inventory, 'findOne', () =>
      findOneChain({
        stock: 10,
        productId: { _id: PRODUCT_ID, name: 'Samosa', price: 12, active: true },
      })
    );
    // Refuse at the stock decrement so the test ends before wallets and
    // transactions come into it — reaching this call is the assertion.
    let reachedDecrement = false;
    mock.method(Inventory, 'findOneAndUpdate', async () => { reachedDecrement = true; return null; });
    mock.method(Inventory, 'updateOne', async () => ({}));

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
    });

    assert.equal(reachedDecrement, true);
    assert.equal(result.status, 409);
  });
});
