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
import test, { afterEach, describe, beforeEach } from 'node:test';
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
const OrderingSettings = (await import('../models/OrderingSettings.js')).default;
const { weeklyOrderLimitOff } = await import('./helpers/weeklyOrderLimitOff.js');
const { isDemoParentPhone, demoParentPhones } = await import('../config/demoAccess.js');
const { isDemoParentStudent } = await import('../utils/demoParent.js');

const DEMO_PHONE = '7995601391';
const REAL_PHONE = '9876543210';

// Not about the one-order-a-week rule; weeklyOrderLimit.test.js covers it.
beforeEach(() => weeklyOrderLimitOff(OrderingSettings));
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
    mock.method(Inventory, 'find', () => ({
      populate: () => ({
        session: async () => ([{ stock, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }]),
        then: (resolve) => resolve([{ stock, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }]),
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

/* The wallet is a stage prop: it should read the same to every visitor who
   picks up the tablet, whatever the one before them did with it. */
describe('the showroom wallet', () => {
  const cart = [{ productId: 'p1', quantity: 1 }];

  /* debitWallet reaches for findOneAndUpdate too, so counting every call would
     count the purchase itself as a top-up. A top-up SETS the balance; a debit
     INCREMENTS it, and that is what separates them. */
  const topUps = (spy) =>
    spy.mock.calls.filter(({ arguments: [, update] }) => update?.$set?.pocketMoney !== undefined);

  const stubCatalogue = () => {
    mock.method(Inventory, 'find', () => ({
      populate: () => ({
        session: async () => ([{ stock: 99, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }]),
        then: (resolve) => resolve([{ stock: 99, productId: { _id: 'p1', name: 'Frooti', price: 20, active: true } }]),
      }),
    }));
    mock.method(Inventory, 'findOneAndUpdate', async () => ({ stock: 98 }));
  };

  test('a demo wallet that has run low is filled back to 3000 before it is spent', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    stubCatalogue();
    const { DEMO_OPENING_BALANCE, DEMO_LOW_BALANCE } = await import('../config/demoAccess.js');

    mock.method(Student, 'findById', async () => ({
      _id: 's1', active: true, parentPhoneNumber: DEMO_PHONE, pocketMoney: DEMO_LOW_BALANCE - 1,
    }));
    const refill = mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: 's1', pocketMoney: DEMO_OPENING_BALANCE,
    }));

    const { chargeCart } = await import('../utils/checkout.js');
    await chargeCart({ studentId: 's1', items: cart, idempotencyKey: 'low' }).catch(() => {});

    const applied = topUps(refill);
    assert.equal(applied.length, 1, 'a low demo wallet should be topped up exactly once');
    assert.equal(applied[0].arguments[1].$set.pocketMoney, DEMO_OPENING_BALANCE);
  });

  test('a demo wallet with plenty in it is left alone', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    stubCatalogue();
    const { DEMO_OPENING_BALANCE } = await import('../config/demoAccess.js');

    mock.method(Student, 'findById', async () => ({
      _id: 's1', active: true, parentPhoneNumber: DEMO_PHONE, pocketMoney: DEMO_OPENING_BALANCE,
    }));
    const refill = mock.method(Student, 'findOneAndUpdate', async () => ({}));

    const { chargeCart } = await import('../utils/checkout.js');
    await chargeCart({ studentId: 's1', items: cart, idempotencyKey: 'full' }).catch(() => {});

    assert.equal(topUps(refill).length, 0, 'a healthy demo wallet needs no top-up');
  });

  /* The refusal a real family depends on. An empty wallet is supposed to stop
     a purchase, and a top-up that reached one child too far would be the
     school silently giving away food. */
  test('a real child with an empty wallet is refused, never topped up', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    stubCatalogue();

    mock.method(Student, 'findById', async () => ({
      _id: 's2', active: true, parentPhoneNumber: REAL_PHONE, pocketMoney: 0,
    }));
    const refill = mock.method(Student, 'findOneAndUpdate', async () => ({}));

    const { chargeCart } = await import('../utils/checkout.js');
    const result = await chargeCart({ studentId: 's2', items: cart, idempotencyKey: 'real' }).catch(() => ({}));

    assert.equal(topUps(refill).length, 0, 'a real wallet must never be topped up');
    assert.notEqual(result.ok, true, 'an empty real wallet must still refuse the purchase');
  });
});

/* However a demo order ends, a basket must take its place — and a real family
   opening their app must never set any of this off. */
describe('keeping a basket waiting', () => {
  test('a real family opening the app touches nothing at all', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const find = mock.method(Student, 'find');
    const { healDemoAccount } = await import('../utils/demoParentReset.js');

    assert.equal(await healDemoAccount({ parentId: 'p1', phone: REAL_PHONE }), false);
    assert.equal(find.mock.callCount(), 0, 'a real parent must not cost a single query');
  });

  test('with no demo account declared, not even the demo number heals', async () => {
    process.env.DEMO_PARENT_PHONES = '';
    const find = mock.method(Student, 'find');
    const { healDemoAccount } = await import('../utils/demoParentReset.js');

    assert.equal(await healDemoAccount({ parentId: 'p1', phone: DEMO_PHONE }), false);
    assert.equal(find.mock.callCount(), 0);
  });

  /* The next basket goes up beside a confirmed package, not after it: a
     visitor approves an order and immediately has another to answer while the
     first walks through the warehouse. */
  test('a basket is seeded even while a package is still on its way', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    const Product = (await import('../models/Product.js')).default;

    mock.method(Student, 'find', () => ({ select: () => ({ lean: async () => [{ _id: 's1' }] }) }));
    mock.method(PendingOrder, 'exists', async () => null);
    mock.method(PendingOrder, 'find', () => ({ sort: () => ({ select: () => ({ lean: async () => [] }) }) }));
    mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => [
      { _id: 'p1', name: 'A', price: 10 }, { _id: 'p2', name: 'B', price: 20 },
    ] }) }));
    const create = mock.method(PendingOrder, 'create', async () => ({}));

    const { healDemoAccount } = await import('../utils/demoParentReset.js');
    await healDemoAccount({ parentId: 'p1', phone: DEMO_PHONE });

    assert.equal(create.mock.callCount(), 1);
  });

  test('approving a demo order puts the next basket up at once', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    const Product = (await import('../models/Product.js')).default;
    const catalogue = [
      { _id: 'p1', name: 'A', price: 10 }, { _id: 'p2', name: 'B', price: 20 },
      { _id: 'p3', name: 'C', price: 30 }, { _id: 'p4', name: 'D', price: 40 },
    ];

    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: DEMO_PHONE }) }),
    }));
    mock.method(PendingOrder, 'exists', async () => null);
    mock.method(Product, 'find', () => ({ select: () => ({ lean: async () => catalogue }) }));
    const create = mock.method(PendingOrder, 'create', async () => ({}));

    const { buildDemoBaskets } = await import('../utils/demoBaskets.js');
    const baskets = buildDemoBaskets(catalogue);
    const { seedDemoBasketAfterApproval } = await import('../utils/demoParentReset.js');

    await seedDemoBasketAfterApproval({ studentId: 's1', parentId: 'p1', items: baskets[0].items });

    assert.equal(create.mock.callCount(), 1);
    assert.deepEqual(create.mock.calls[0].arguments[0].items, baskets[1].items,
      'the basket after the approved one, not the same one again');
  });

  test('approving a real family\'s order seeds nothing', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: REAL_PHONE }) }),
    }));
    const create = mock.method(PendingOrder, 'create', async () => ({}));

    const { seedDemoBasketAfterApproval } = await import('../utils/demoParentReset.js');

    assert.equal(await seedDemoBasketAfterApproval({ studentId: 's9', parentId: 'p9', items: [] }), false);
    assert.equal(create.mock.callCount(), 0);
  });

  test('a rejected request from a real family is left exactly as it is', async () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    const PendingOrder = (await import('../models/PendingOrder.js')).default;
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => ({ parentPhoneNumber: REAL_PHONE }) }),
    }));
    const remove = mock.method(PendingOrder, 'deleteOne', async () => ({}));
    const create = mock.method(PendingOrder, 'create', async () => ({}));

    const { resetDemoRequest } = await import('../utils/demoParentReset.js');

    assert.equal(await resetDemoRequest({ _id: 'r1', studentId: 's9', parentId: 'p9', items: [] }), false);
    assert.equal(remove.mock.callCount(), 0, 'a real family\'s history must not be deleted');
    assert.equal(create.mock.callCount(), 0);
  });
});

/* The simulate button is drawn from one key on the package, and only an
   account the simulate route would admit may carry it. */
describe('the simulate-the-warehouse button', () => {
  const pkg = (status) => ({ _id: 'f1', status, items: [], totalAmount: 30, studentSnapshot: {} });

  test('a package that may be simulated carries the key while it is still moving', async () => {
    const { parentPackageView } = await import('../controllers/parentController.js');

    assert.equal(parentPackageView(pkg('PENDING'), new Date(), null, { canSimulate: true }).warehouseSimulation, true);
    assert.equal(parentPackageView(pkg('COLLECTED'), new Date(), null, { canSimulate: true }).warehouseSimulation, false);
  });

  test('a real family\'s package never carries the key at all', async () => {
    const { parentPackageView } = await import('../controllers/parentController.js');
    const view = parentPackageView(pkg('PENDING'), new Date(), null);

    assert.equal('warehouseSimulation' in view, false);
  });
});
