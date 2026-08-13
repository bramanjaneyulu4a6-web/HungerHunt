import test, { afterEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { cancelAndRefundFulfillment } = await import('../utils/refunds.js');

const ORDER_ID = '507f191e810c19729de860ef';
const TRANSACTION_ID = '507f191e810c19729de860ee';
const STUDENT_ID = '507f191e810c19729de860eb';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ADMIN_ID = '507f1f77bcf86cd799439011';

afterEach(() => mock.restoreAll());

describe('paid package cancellation', () => {
  test('atomically records a reversal, restores wallet and stock, and replays safely', async () => {
    const current = { _id: ORDER_ID, status: 'PACKED', transactionId: TRANSACTION_ID, studentId: STUDENT_ID };
    const cancelled = { ...current, status: 'CANCELLED' };
    let storedReversal = null;
    mock.method(WalletReversal, 'findOne', async () => storedReversal);
    mock.method(FulfillmentOrder, 'findById', async () => current);
    const transition = mock.method(FulfillmentOrder, 'findOneAndUpdate', async () => cancelled);
    mock.method(Transaction, 'findById', async () => ({
      _id: TRANSACTION_ID, studentId: STUDENT_ID, totalAmount: 40,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    }));
    mock.method(WalletReversal, 'create', async (document) => {
      storedReversal = { _id: '507f191e810c19729de860ea', ...document };
      return storedReversal;
    });
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => ({ pocketMoney: 90 }));
    const stock = mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    mock.method(WalletReversal, 'updateOne', async () => ({ modifiedCount: 1 }));

    const first = await cancelAndRefundFulfillment({
      orderId: ORDER_ID, actorId: ADMIN_ID, idempotencyKey: 'cancel-once', reason: 'Packing error',
    });
    const replay = await cancelAndRefundFulfillment({
      orderId: ORDER_ID, actorId: ADMIN_ID, idempotencyKey: 'cancel-once', reason: 'Packing error',
    });

    assert.equal(first.reversal.amount, 40);
    assert.equal(first.reversal.previousBalance, 50);
    assert.equal(first.reversal.newBalance, 90);
    assert.equal(replay.replayed, true);
    assert.equal(transition.mock.callCount(), 1);
    assert.equal(wallet.mock.callCount(), 1);
    assert.equal(stock.mock.callCount(), 1);
    assert.deepEqual(stock.mock.calls[0].arguments[1], { $inc: { stock: 2 } });
  });

  test('refuses cancellation after dispatch before any financial movement', async () => {
    mock.method(WalletReversal, 'findOne', async () => null);
    mock.method(FulfillmentOrder, 'findById', async () => ({ status: 'OUT_FOR_DELIVERY' }));
    const wallet = mock.method(Student, 'findOneAndUpdate', async () => null);

    await assert.rejects(
      () => cancelAndRefundFulfillment({
        orderId: ORDER_ID, actorId: ADMIN_ID, idempotencyKey: 'too-late', reason: 'Late request',
      }),
      (error) => error.status === 409 && /before dispatch/.test(error.message)
    );
    assert.equal(wallet.mock.callCount(), 0);
  });
});

