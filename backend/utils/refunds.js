import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Inventory from '../models/Inventory.js';
import Transaction from '../models/Transaction.js';
import WalletReversal from '../models/WalletReversal.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { sessionOptions, withMongoTransaction } from './mongoTransaction.js';
import { creditWallet } from './walletAccount.js';

const cancellable = [OrderStatus.PENDING, OrderStatus.PACKED];

export const cancelAndRefundFulfillment = async ({ orderId, actorId, idempotencyKey, reason }) => {
  const prior = await WalletReversal.findOne({ performedBy: actorId, idempotencyKey });
  if (prior) {
    if (String(prior.fulfillmentOrderId) !== String(orderId)) {
      const error = new Error('This Idempotency-Key was already used for another cancellation.');
      error.status = 409;
      throw error;
    }
    return { reversal: prior, order: await FulfillmentOrder.findById(orderId), replayed: true };
  }

  try {
    return await withMongoTransaction(async (session) => {
      const now = new Date();
      const currentQuery = FulfillmentOrder.findById(orderId);
      const current = session ? await currentQuery.session(session) : await currentQuery;
      if (!current) {
        const error = new Error('Fulfilment order not found.');
        error.status = 404;
        throw error;
      }
      if (!cancellable.includes(current.status)) {
        const error = new Error(
          `Package is ${current.status}; cancellation is allowed only before dispatch.`
        );
        error.status = 409;
        throw error;
      }
      const order = await FulfillmentOrder.findOneAndUpdate(
        { _id: orderId, status: current.status },
        {
          $set: { status: OrderStatus.CANCELLED, cancelledAt: now, cancelledBy: actorId },
          $push: { transitions: { from: current.status, to: OrderStatus.CANCELLED, at: now, actorId, note: reason } },
        },
        { new: true, ...sessionOptions(session) }
      );
      if (!order) {
        const error = new Error('Package changed while cancellation was being processed. Refresh and retry.');
        error.status = 409;
        throw error;
      }

      const transactionQuery = Transaction.findById(order.transactionId);
      const transaction = session ? await transactionQuery.session(session) : await transactionQuery;
      if (!transaction || String(transaction.studentId) !== String(order.studentId)) {
        const error = new Error('The package payment ledger is missing or inconsistent.');
        error.status = 409;
        throw error;
      }

      const reversalDocument = {
        studentId: order.studentId,
        transactionId: transaction._id,
        fulfillmentOrderId: order._id,
        performedBy: actorId,
        amount: transaction.totalAmount,
        previousBalance: 0,
        newBalance: 0,
        reason,
        idempotencyKey,
        restoredItems: transaction.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
      };
      const reversal = session
        ? (await WalletReversal.create([reversalDocument], { session }))[0]
        : await WalletReversal.create(reversalDocument);

      const student = await creditWallet(order.studentId, transaction.totalAmount, { session });
      if (!student) {
        const error = new Error('Student record not found.');
        error.status = 409;
        throw error;
      }

      for (const item of transaction.items) {
        await Inventory.updateOne(
          { productId: item.productId },
          { $inc: { stock: item.quantity } },
          { upsert: true, ...sessionOptions(session) }
        );
      }

      reversal.previousBalance = student.pocketMoney - transaction.totalAmount;
      reversal.newBalance = student.pocketMoney;
      await WalletReversal.updateOne(
        { _id: reversal._id },
        { $set: { previousBalance: reversal.previousBalance, newBalance: reversal.newBalance } },
        sessionOptions(session)
      );
      return { reversal, order, student, replayed: false };
    });
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const replay = await WalletReversal.findOne({ performedBy: actorId, idempotencyKey });
    if (!replay || String(replay.fulfillmentOrderId) !== String(orderId)) throw error;
    return { reversal: replay, order: await FulfillmentOrder.findById(orderId), replayed: true };
  }
};
