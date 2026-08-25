import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';

const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { chargeCart } = await import('../utils/checkout.js');

afterEach(() => mock.restoreAll());

const STUDENT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f1f77bcf86cd799439021';

const stubStudent = (overrides = {}) => {
  const student = {
    _id: STUDENT_ID, active: true, pocketMoney: 40,
    walletControl: { enabled: false }, ...overrides,
  };
  mock.method(Student, 'findById', () => Promise.resolve(student));
  return student;
};

const stubInventory = () => {
  mock.method(Inventory, 'findOne', () => ({
    populate: () => Promise.resolve({
      stock: 10,
      productId: { _id: PRODUCT_ID, name: 'Samosa', price: 15, active: true },
    }),
  }));
  mock.method(Inventory, 'findOneAndUpdate', () => Promise.resolve({ stock: 8 }));
};

test('EXTERNAL funding never touches the wallet and snapshots an unchanged balance', async () => {
  stubStudent();
  stubInventory();
  const debits = [];
  mock.method(Student, 'findOneAndUpdate', (filter) => {
    debits.push(filter);
    return Promise.resolve(null); // would fail a WALLET debit; must never run
  });
  let created;
  mock.method(Transaction, 'create', (doc) => {
    created = doc;
    return Promise.resolve({ _id: 'txn1', ...doc });
  });

  const result = await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 2, price: 15 }],
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: '507f1f77bcf86cd799439031',
    idempotencyKey: 'HH-x',
    funding: 'EXTERNAL',
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(debits.length, 0, 'wallet was debited on an externally funded order');
  assert.equal(created.previousBalance, 40);
  assert.equal(created.remainingBalance, 40);
  assert.equal(created.sourceType, 'UPI_ORDER_PAYMENT');
});

test('EXTERNAL funding succeeds even when the balance could not cover the bill', async () => {
  stubStudent({ pocketMoney: 0 });
  stubInventory();
  mock.method(Transaction, 'create', (doc) => Promise.resolve({ _id: 'txn1', ...doc }));

  const result = await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: 15 }],
    funding: 'EXTERNAL',
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: '507f1f77bcf86cd799439031',
  });

  assert.equal(result.ok, true, result.message);
});

test('the wallet-control aggregate excludes UPI-funded purchases', async () => {
  stubStudent({ walletControl: { enabled: true, limitAmount: 100, limitType: 'WEEKLY' } });
  stubInventory();
  let matchStage;
  mock.method(Transaction, 'aggregate', (pipeline) => {
    matchStage = pipeline[0].$match;
    return Promise.resolve([]);
  });
  const WalletReversal = (await import('../models/WalletReversal.js')).default;
  mock.method(WalletReversal, 'aggregate', () => Promise.resolve([]));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ pocketMoney: 25 }));
  mock.method(Transaction, 'create', (doc) => Promise.resolve({ _id: 't', ...doc }));

  await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: 15 }],
  });

  assert.deepEqual(matchStage.sourceType, { $ne: 'UPI_ORDER_PAYMENT' });
});
