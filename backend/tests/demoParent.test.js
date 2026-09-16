/* The showroom family: the parent account a visitor is handed at an open day
 * so they can drive the parent app themselves.
 *
 * Two things are pinned here, and the second matters as much as the first.
 * That a demo order leaves the shelves alone — it is the one part of a real
 * checkout it must not do. And that none of it reaches a real family: every
 * case is run against an ordinary child too, because a bypass that widened by
 * one row would mean a student's order silently not costing the school any
 * stock, and later deleting itself.
 *
 * No database: every model call is stubbed.
 */
import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.STUDENT_JWT_SECRET ||= 'student-test-secret';
process.env.NODE_ENV = 'test';
// See tests-inherit-dev-env: app.js loads backend/.env into every test. Both
// lists are pinned empty so a value left in that file cannot decide these.
process.env.PHONEPE_TEST_PARENT_PHONES = '';
process.env.DEMO_PARENT_PHONES = '';

const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const { isDemoParentPhone, demoParentPhones } = await import('../config/demoAccess.js');
const { isDemoParentStudent } = await import('../utils/demoParent.js');

const DEMO_PHONE = '7995601391';
const REAL_PHONE = '9876543210';

afterEach(() => {
  mock.restoreAll();
  process.env.DEMO_PARENT_PHONES = '';
});

/* The list is the only place a demo account is declared. Nothing reads a flag
   off the row, so there is nothing to fall out of step with it. */
describe('who is a demo parent', () => {
  test('nobody at all when the variable is unset', () => {
    process.env.DEMO_PARENT_PHONES = '';

    assert.equal(demoParentPhones().size, 0);
    assert.equal(isDemoParentPhone(DEMO_PHONE), false);
    assert.equal(isDemoParentPhone(REAL_PHONE), false);
  });

  /* The dangerous direction for this switch to fail in. An empty list meaning
     "everyone" would hand every family on the roll an account whose orders
     delete themselves. */
  test('an empty or whitespace list names nobody rather than everybody', () => {
    for (const value of ['', '  ', ',', ' , , ']) {
      process.env.DEMO_PARENT_PHONES = value;
      assert.equal(demoParentPhones().size, 0, `"${value}" should name nobody`);
      assert.equal(isDemoParentPhone(REAL_PHONE), false);
    }
  });

  test('only the declared number, and it survives spaces around the comma', () => {
    process.env.DEMO_PARENT_PHONES = ` ${DEMO_PHONE} , 9000000021 `;

    assert.equal(isDemoParentPhone(DEMO_PHONE), true);
    assert.equal(isDemoParentPhone('9000000021'), true);
    assert.equal(isDemoParentPhone(REAL_PHONE), false);
  });
});

describe('reading it off a child', () => {
  test('a student whose parent is declared is a demo child; an ordinary one is not', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;

    assert.equal(await isDemoParentStudent({ parentPhoneNumber: DEMO_PHONE }), true);
    assert.equal(await isDemoParentStudent({ parentPhoneNumber: REAL_PHONE }), false);
  });

  test('with no list, not even the declared number is a demo child', async () => {
    process.env.DEMO_PARENT_PHONES = '';

    assert.equal(await isDemoParentStudent({ parentPhoneNumber: DEMO_PHONE }), false);
  });

  /* The cheap question first: with no list there is no demo parent, so there is
     nothing worth a round trip to find out. */
  test('an id is not looked up at all when no demo account is declared', async () => {
    process.env.DEMO_PARENT_PHONES = '';
    const findById = mock.method(Student, 'findById');

    assert.equal(await isDemoParentStudent('507f1f77bcf86cd799439011'), false);
    assert.equal(findById.mock.callCount(), 0);
  });

  test('an id is looked up when one is declared', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: DEMO_PHONE }) }),
    }));

    assert.equal(await isDemoParentStudent('507f1f77bcf86cd799439011'), true);
  });
});

/* The one thing a demo checkout must not do. Everything else about it is real:
   a real transaction, a real package, a real wallet debit. */
describe('the shelves', () => {
  const cart = [{ productId: 'p1', quantity: 2 }];

  const stubInventory = (stock) => {
    mock.method(Inventory, 'findOne', () => ({
      populate: () => ({
        session: async () => ({ stock, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }),
        then: (resolve) => resolve({ stock, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }),
      }),
    }));
    return mock.method(Inventory, 'findOneAndUpdate', async () => ({ stock: stock - 2 }));
  };

  test('a demo basket never decrements stock', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const decrement = stubInventory(50);
    const { chargeCart } = await import('../utils/checkout.js');

    mock.method(Student, 'findById', async () => ({
      _id: 's1', active: true, parentPhoneNumber: DEMO_PHONE, pocketMoney: 5000,
    }));

    await chargeCart({ studentId: 's1', items: cart, idempotencyKey: 'k1' }).catch(() => {});

    assert.equal(decrement.mock.callCount(), 0, 'a demo basket must not touch Inventory');
  });

  /* The same cart on a real child. If this ever stops decrementing, the bypass
     has widened past the demo account and the storeroom's counts are fiction. */
  test('an ordinary basket still decrements stock', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const decrement = stubInventory(50);
    const { chargeCart } = await import('../utils/checkout.js');

    mock.method(Student, 'findById', async () => ({
      _id: 's2', active: true, parentPhoneNumber: REAL_PHONE, pocketMoney: 5000,
    }));

    await chargeCart({ studentId: 's2', items: cart, idempotencyKey: 'k2' }).catch(() => {});

    assert.ok(decrement.mock.callCount() > 0, 'a real basket must still take stock');
  });
});

/* Clearing up after the showroom family. This is the only place in the
   codebase that deletes a Transaction, so what is pinned here is mostly the
   things it must refuse to do. */
describe('resetting a collected order', () => {
  const order = { _id: 'o1', studentId: 's1', transactionId: 't1', totalAmount: 90 };

  test('a real student\'s collected package is never cleared', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: REAL_PHONE }) }),
    }));

    const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
    const Transaction = (await import('../models/Transaction.js')).default;
    const deletePackage = mock.method(FulfillmentOrder, 'deleteOne', async () => ({}));
    const deleteTransaction = mock.method(Transaction, 'deleteOne', async () => ({}));

    const { resetDemoOrder } = await import('../utils/demoParentReset.js');

    assert.equal(await resetDemoOrder(order), false);
    assert.equal(deletePackage.mock.callCount(), 0, 'a real package must never be deleted');
    assert.equal(deleteTransaction.mock.callCount(), 0, 'a real transaction must never be deleted');
  });

  test('with no demo account declared it does nothing at all', async () => {
    process.env.DEMO_PARENT_PHONES = '';
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: DEMO_PHONE }) }),
    }));

    const { resetDemoOrder } = await import('../utils/demoParentReset.js');

    assert.equal(await resetDemoOrder(order), false);
  });

  /* A caretaker at a dorm door scanning a real student's package must not be
     handed a 500 because the demo account's housekeeping went wrong. */
  test('a failure inside is swallowed rather than failing the collection', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    mock.method(Student, 'findById', () => {
      throw new Error('database gone');
    });
    mock.method(console, 'error', () => {});

    const { resetDemoOrder } = await import('../utils/demoParentReset.js');

    assert.equal(await resetDemoOrder(order), false);
  });

  test('an order with nothing to identify it is ignored', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const { resetDemoOrder } = await import('../utils/demoParentReset.js');

    assert.equal(await resetDemoOrder(null), false);
    assert.equal(await resetDemoOrder({}), false);
  });
});
