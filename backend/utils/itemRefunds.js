import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Inventory from '../models/Inventory.js';
import ItemRefund from '../models/ItemRefund.js';
import Transaction from '../models/Transaction.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { sessionOptions, withMongoTransaction } from './mongoTransaction.js';
import { creditWallet } from './walletAccount.js';
import { mintReceiptNumber } from './walletReceipts.js';

const refundableStatuses = [OrderStatus.PENDING, OrderStatus.PACKED];

const httpError = (message, status = 409) => Object.assign(new Error(message), { status });

export const refundFulfillmentItems = async ({ orderId, actorId, idempotencyKey, reason, items, session: outerSession = null }) => {
  const priorQuery = ItemRefund.findOne({ performedBy: actorId, idempotencyKey });
  const prior = outerSession ? await priorQuery.session(outerSession) : await priorQuery;
  if (prior) {
    if (String(prior.fulfillmentOrderId) !== String(orderId)) {
      throw httpError('This Idempotency-Key was already used for another item refund.');
    }
    return { refund: prior, order: await FulfillmentOrder.findById(orderId), replayed: true };
  }

  const work = async (session) => {
      const query = FulfillmentOrder.findById(orderId);
      const current = session ? await query.session(session) : await query;
      if (!current) throw httpError('Fulfilment order not found.', 404);
      if (!refundableStatuses.includes(current.status)) {
        throw httpError(`Package is ${current.status}; items can be refunded only before dispatch.`);
      }

      const transactionQuery = Transaction.findById(current.transactionId);
      const transaction = session ? await transactionQuery.session(session) : await transactionQuery;
      if (!transaction || transaction.deletion || String(transaction.studentId) !== String(current.studentId)) {
        throw httpError('The package payment ledger is missing, deleted, or inconsistent.');
      }

      const requested = new Map();
      for (const item of items || []) {
        const productId = String(item?.productId || '');
        const quantity = Number(item?.quantity);
        if (!productId || !Number.isInteger(quantity) || quantity <= 0 || requested.has(productId)) {
          throw httpError('Choose each product once with a positive whole quantity.', 400);
        }
        requested.set(productId, quantity);
      }
      if (!requested.size) throw httpError('Choose at least one item to refund.', 400);

      const refundedItems = [];
      const remainingItems = [];
      for (const line of current.items) {
        const quantity = requested.get(String(line.productId)) || 0;
        if (quantity > line.quantity) {
          throw httpError(`${line.name} has only ${line.quantity} refundable unit(s).`, 400);
        }
        if (quantity) {
          refundedItems.push({
            productId: line.productId, name: line.name, quantity, price: line.price,
          });
          requested.delete(String(line.productId));
        }
        if (line.quantity > quantity) {
          remainingItems.push({
            productId: line.productId, name: line.name,
            quantity: line.quantity - quantity, price: line.price,
          });
        }
      }
      if (requested.size) throw httpError('One or more selected products are not in this package.', 400);

      const amount = refundedItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      if (amount <= 0) throw httpError('The selected items have no refundable value.', 400);
      const totalAmount = remainingItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
      const now = new Date();
      const cancelled = remainingItems.length === 0;
      const transition = cancelled
        ? [{ from: current.status, to: OrderStatus.CANCELLED, at: now, actorId, note: reason }]
        : [];

      const order = await FulfillmentOrder.findOneAndUpdate(
        { _id: orderId, status: current.status, updatedAt: current.updatedAt },
        {
          $set: {
            items: remainingItems,
            totalAmount,
            ...(cancelled ? { status: OrderStatus.CANCELLED, cancelledAt: now, cancelledBy: actorId } : {}),
          },
          ...(transition.length ? { $push: { transitions: transition[0] } } : {}),
        },
        { new: true, ...sessionOptions(session) }
      );
      if (!order) throw httpError('Package changed while the refund was being processed. Refresh and retry.');

      const student = await creditWallet(current.studentId, amount, { session });
      if (!student) throw httpError('Student record not found.');

      for (const item of refundedItems) {
        await Inventory.updateOne(
          { productId: item.productId },
          { $inc: { stock: item.quantity } },
          { upsert: true, ...sessionOptions(session) }
        );
      }

      const receiptNumber = await mintReceiptNumber({
        studentId: current.studentId,
        admissionNumber: student.admissionNumber,
        date: now,
      });
      const document = {
        studentId: current.studentId,
        transactionId: current.transactionId,
        fulfillmentOrderId: current._id,
        performedBy: actorId,
        amount,
        previousBalance: student.pocketMoney - amount,
        newBalance: student.pocketMoney,
        reason,
        idempotencyKey,
        items: refundedItems,
        receiptNumber,
      };
      const refund = session
        ? (await ItemRefund.create([document], { session }))[0]
        : await ItemRefund.create(document);
      return { refund, order, student, replayed: false };
  };

  try {
    return outerSession ? await work(outerSession) : await withMongoTransaction(work);
  } catch (error) {
    if (error?.code !== 11000) throw error;
    const replay = await ItemRefund.findOne({ performedBy: actorId, idempotencyKey });
    if (!replay || String(replay.fulfillmentOrderId) !== String(orderId)) throw error;
    return { refund: replay, order: await FulfillmentOrder.findById(orderId), replayed: true };
  }
};
