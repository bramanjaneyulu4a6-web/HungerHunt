import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
// A stale deployment value must not be able to restore the removed guard.
process.env.FEATURE_WEEKLY_ORDER_LIMIT = 'true';

const mongoose = (await import('mongoose')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const { chargeCart } = await import('../utils/checkout.js');

mongoose.set('bufferTimeoutMS', 200);

const STUDENT_ID = '507f1f77bcf86cd799439021';
const PRODUCT_ID = '507f191e810c19729de860ec';
const WEEKLY_INDEX = 'one_fulfillment_order_per_student_business_week';

afterEach(() => mock.restoreAll());

const findOneChain = (result) => {
  const chain = {
    populate: () => chain,
    session: () => Promise.resolve(result),
    then: (resolve, reject) => Promise.resolve(result).then(resolve, reject),
  };
  return chain;
};

describe('multiple orders per student per week', () => {
  test('checkout never looks for another order from the same week', async () => {
    mock.method(Student, 'findById', () => ({
      session: async () => ({ _id: STUDENT_ID, pocketMoney: 500 }),
    }));

    let weeklyLookups = 0;
    mock.method(FulfillmentOrder, 'findOne', () => {
      weeklyLookups += 1;
      return { session: async () => ({ _id: 'an-order-from-monday' }) };
    });
    mock.method(Inventory, 'findOne', () => findOneChain(null));

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      session: { id: 'fake-session' },
    });

    assert.equal(weeklyLookups, 0);
    assert.equal(result.status, 404);
    assert.equal(result.message, 'Inventory record not found.');
  });

  test('the schema cannot recreate the old unique weekly index', () => {
    const declared = FulfillmentOrder.schema
      .indexes()
      .map(([, options]) => options?.name)
      .filter(Boolean);

    assert.equal(declared.includes(WEEKLY_INDEX), false);
  });
});
