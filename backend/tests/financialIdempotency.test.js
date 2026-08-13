import test, { afterEach, before, beforeEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS = 'false';

const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const { signAdminToken, signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const PARENT_ID = '507f191e810c19729de860ea';
const STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ORDER_ID = '507f191e810c19729de860ed';
const TRANSACTION_ID = '507f191e810c19729de860ee';

const adminToken = signAdminToken(ADMIN_ID);
const parentToken = signParentToken(PARENT_ID, '9876543210');
let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
});

afterEach(() => mock.restoreAll());

const request = (method, path, token, body, key) =>
  fetch(base + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'Idempotency-Key': key,
    },
    body: JSON.stringify(body ?? {}),
  });

describe('financial idempotency', () => {
  test('replaying a wallet top-up increments the balance once', async () => {
    let stored = null;
    mock.method(WalletAdjustment, 'findOne', async () => stored);
    mock.method(WalletAdjustment, 'create', async (document) => {
      stored = {
        _id: TRANSACTION_ID,
        ...document,
        previousBalance: 100,
        newBalance: 150,
      };
      return stored;
    });
    const increment = mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: STUDENT_ID,
      pocketMoney: 150,
    }));
    mock.method(WalletAdjustment, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(Parent, 'findOne', async () => null);

    const first = await request(
      'PUT',
      `/api/students/${STUDENT_ID}/topup`,
      adminToken,
      { amount: 50 },
      'topup-once'
    );
    const replay = await request(
      'PUT',
      `/api/students/${STUDENT_ID}/topup`,
      adminToken,
      { amount: 50 },
      'topup-once'
    );

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(increment.mock.callCount(), 1);
  });

  test('replaying a parent approval charges stock and wallet once', async () => {
    const order = {
      _id: ORDER_ID,
      parentId: PARENT_ID,
      studentId: STUDENT_ID,
      status: 'PENDING',
      expiresAt: new Date(Date.now() + 60_000),
      items: [{ productId: PRODUCT_ID, name: 'Samosa', quantity: 2, price: 20 }],
      totalAmount: 40,
      save: async function () { return this; },
    };
    const transaction = {
      _id: TRANSACTION_ID,
      studentId: STUDENT_ID,
      totalAmount: 40,
      previousBalance: 100,
      remainingBalance: 60,
    };

    mock.method(PendingOrder, 'findOne', async () => order);
    mock.method(PendingOrder, 'findOneAndUpdate', async (_filter, update) => {
      Object.assign(order, update.$set);
      if (update.$unset) {
        for (const field of Object.keys(update.$unset)) delete order[field];
      }
      return order;
    });
    mock.method(Student, 'findById', async () => ({
      _id: STUDENT_ID,
      pocketMoney: 100,
      walletControl: { enabled: false },
    }));
    mock.method(Inventory, 'findOne', () => ({
      populate: async () => ({
        stock: 10,
        productId: { _id: PRODUCT_ID, name: 'Samosa', price: 99, active: true },
      }),
    }));
    const decrement = mock.method(Inventory, 'findOneAndUpdate', async () => ({ stock: 8 }));
    const debit = mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: STUDENT_ID,
      pocketMoney: 60,
    }));
    const ledger = mock.method(Transaction, 'create', async () => transaction);
    mock.method(Transaction, 'findById', async () => transaction);
    mock.method(Parent, 'findById', async () => null);

    const first = await request(
      'POST',
      `/api/pending-orders/${ORDER_ID}/approve`,
      parentToken,
      {},
      'approval-once'
    );
    const replay = await request(
      'POST',
      `/api/pending-orders/${ORDER_ID}/approve`,
      parentToken,
      {},
      'approval-once'
    );

    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal((await replay.json()).replayed, true);
    assert.equal(decrement.mock.callCount(), 1);
    assert.equal(debit.mock.callCount(), 1);
    assert.equal(ledger.mock.callCount(), 1);
    assert.equal(transaction.totalAmount, 40, 'the stored snapshot price, not live ₹99, is charged');
  });
});
