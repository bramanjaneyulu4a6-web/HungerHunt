import test, { afterEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const ItemRefund = (await import('../models/ItemRefund.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { refundFulfillmentItems } = await import('../utils/itemRefunds.js');

const ORDER_ID = '507f191e810c19729de860ef';
const TRANSACTION_ID = '507f191e810c19729de860ee';
const STUDENT_ID = '507f191e810c19729de860eb';
const KITKAT_ID = '507f191e810c19729de860ec';
const CHIPS_ID = '507f191e810c19729de860ed';
const ADMIN_ID = '507f1f77bcf86cd799439011';

afterEach(() => mock.restoreAll());

const order = () => ({
  _id: ORDER_ID,
  status: 'PENDING',
  transactionId: TRANSACTION_ID,
  studentId: STUDENT_ID,
  updatedAt: new Date('2026-10-03T00:00:00Z'),
  items: [
    { productId: KITKAT_ID, name: 'KitKat', quantity: 2, price: 25 },
    { productId: CHIPS_ID, name: 'Chips', quantity: 1, price: 20 },
  ],
});

describe('partial item refunds', () => {
  test('credits only selected lines, restores their stock, and leaves the remaining package active', async () => {
    let stored = null;
    mock.method(ItemRefund, 'findOne', async () => stored);
    mock.method(FulfillmentOrder, 'findById', async () => order());
    mock.method(Transaction, 'findById', async () => ({
      _id: TRANSACTION_ID, studentId: STUDENT_ID, deletion: null,
    }));
    const updateOrder = mock.method(FulfillmentOrder, 'findOneAndUpdate', async (_filter, update) => ({
      ...order(), ...update.$set,
    }));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 150 }));
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(ItemRefund, 'create', async (document) => {
      stored = { _id: '507f191e810c19729de860ea', ...document };
      return stored;
    });

    const first = await refundFulfillmentItems({
      orderId: ORDER_ID,
      actorId: ADMIN_ID,
      idempotencyKey: 'unavailable-kitkat',
      reason: 'Unavailable',
      items: [{ productId: KITKAT_ID, quantity: 2 }],
    });
    const replay = await refundFulfillmentItems({
      orderId: ORDER_ID,
      actorId: ADMIN_ID,
      idempotencyKey: 'unavailable-kitkat',
      reason: 'Unavailable',
      items: [{ productId: KITKAT_ID, quantity: 2 }],
    });

    assert.equal(first.refund.amount, 50);
    assert.equal(first.refund.previousBalance, 100);
    assert.equal(first.order.status, 'PENDING');
    assert.deepEqual(first.order.items.map(({ name, quantity }) => ({ name, quantity })), [
      { name: 'Chips', quantity: 1 },
    ]);
    assert.equal(first.order.totalAmount, 20);
    assert.equal(replay.replayed, true);
    assert.equal(updateOrder.mock.callCount(), 1);
    assert.equal(wallet.mock.callCount(), 1);
    assert.deepEqual(stock.mock.calls[0].arguments[1], { $inc: { stock: 2 } });
  });

  test('closes a package when every remaining item is refunded', async () => {
    const single = { ...order(), items: [order().items[0]] };
    mock.method(ItemRefund, 'findOne', async () => null);
    mock.method(FulfillmentOrder, 'findById', async () => single);
    mock.method(Transaction, 'findById', async () => ({
      _id: TRANSACTION_ID, studentId: STUDENT_ID, deletion: null,
    }));
    mock.method(FulfillmentOrder, 'findOneAndUpdate', async (_filter, update) => ({
      ...single, ...update.$set,
    }));
    mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 50 }));
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(ItemRefund, 'create', async (document) => ({ _id: '507f191e810c19729de860ea', ...document }));

    const result = await refundFulfillmentItems({
      orderId: ORDER_ID,
      actorId: ADMIN_ID,
      idempotencyKey: 'all-unavailable',
      reason: 'Unavailable',
      items: [{ productId: KITKAT_ID, quantity: 2 }],
    });

    assert.equal(result.order.status, 'CANCELLED');
    assert.deepEqual(result.order.items, []);
    assert.equal(result.order.totalAmount, 0);
  });

  test('refuses an excessive quantity without moving money or stock', async () => {
    mock.method(ItemRefund, 'findOne', async () => null);
    mock.method(FulfillmentOrder, 'findById', async () => order());
    mock.method(Transaction, 'findById', async () => ({
      _id: TRANSACTION_ID, studentId: STUDENT_ID, deletion: null,
    }));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => null);
    const stock = mock.method(Inventory, 'updateOne', async () => null);

    await assert.rejects(
      () => refundFulfillmentItems({
        orderId: ORDER_ID,
        actorId: ADMIN_ID,
        idempotencyKey: 'too-many',
        reason: 'Unavailable',
        items: [{ productId: KITKAT_ID, quantity: 3 }],
      }),
      (error) => error.status === 400 && /only 2 refundable/.test(error.message)
    );
    assert.equal(wallet.mock.callCount(), 0);
    assert.equal(stock.mock.callCount(), 0);
  });
});
