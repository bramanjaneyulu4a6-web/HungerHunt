import PaymentIntent from '../../../models/PaymentIntent.js';
import PendingOrder from '../../../models/PendingOrder.js';
import WalletAdjustment from '../../../models/WalletAdjustment.js';
import phonepeDefault from './providers/phonepe.js';
import { chargeCart as realChargeCart } from '../../../utils/checkout.js';
import { creditWallet } from '../../../utils/walletAccount.js';
import { withMongoTransaction, sessionOptions } from '../../../utils/mongoTransaction.js';
import { paiseToRupees, rupeesToPaise } from './money.js';

/* The only function in the codebase that turns a provider's "COMPLETED" into
 * money. The webhook calls it, the app's status poll calls it, the reconcile
 * script calls it — concurrently, repeatedly, after crashes — and the
 * PENDING->APPLYING claim plus the unique ledger indexes make all of those
 * paths credit exactly once.
 *
 * It re-reads status from PhonePe's server API every time. A webhook body or
 * a client's say-so is never the thing that moves money.
 *
 * `deps` is dependency injection, not module patching: Node (v26.7.0 here)
 * throws `TypeError: Cannot redefine property` when a test tries to
 * mock.method() an ES module namespace import, so the provider and chargeCart
 * are passed in instead of imported as a namespace and stubbed in place.
 * Task 7's controller reaches this through the default export below so its
 * own tests can stub settlePaymentIntent itself. */

const TERMINAL = ['APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'];

const markTerminal = (intentId, fromStatus, set) =>
  PaymentIntent.findOneAndUpdate(
    { _id: intentId, status: fromStatus },
    { $set: set },
    { new: true }
  );

/* Credits the paid amount as balance. Used by TOPUP, and by ORDER when the
 * order can no longer be bought — the parent's money must land somewhere. */
const creditAsTopup = async (intent, session) => {
  const amountRupees = paiseToRupees(intent.amountPaise);
  const student = await creditWallet(intent.studentId, amountRupees, { session });

  if (!student) throw new Error(`Student ${intent.studentId} not found for credit`);

  const [adjustment] = await WalletAdjustment.create(
    [{
      studentId: intent.studentId,
      source: 'PARENT_UPI',
      paymentIntentId: intent._id,
      type: 'TOP_UP',
      amount: amountRupees,
      previousBalance: student.pocketMoney - amountRupees,
      newBalance: student.pocketMoney,
      // Stays merchantOrderId, deliberately: it is unique per intent, so
      // every collision on the (performedBy, idempotencyKey) index this
      // shares with ADMIN rows is a correct duplicate rejection. A key that
      // could repeat across intents would turn that safety net into a bug
      // that silently rejects a legitimate second top-up.
      idempotencyKey: intent.merchantOrderId,
    }],
    { ...sessionOptions(session) }
  );

  return adjustment;
};

/* Tries to buy the order with the captured money. Returns the transaction on
 * success, null when the order can no longer be bought (caller degrades). */
const applyToOrder = async (intent, session, chargeCart) => {
  const now = new Date();
  const order = await PendingOrder.findOneAndUpdate(
    { _id: intent.pendingOrderId, status: 'PENDING', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', approvalKey: intent.merchantOrderId, processingAt: now } },
    { new: true, runValidators: true, ...sessionOptions(session) }
  );

  if (!order) return null; // approved/rejected/expired since payment began

  const releaseOrder = () =>
    PendingOrder.findOneAndUpdate(
      { _id: order._id, status: 'PROCESSING', approvalKey: intent.merchantOrderId },
      { $set: { status: 'PENDING' }, $unset: { approvalKey: 1, processingAt: 1 } },
      { ...sessionOptions(session) }
    );

  // The parent paid the total they were shown. If the order was edited since
  // (the till can reprice), the paid amount no longer buys this order.
  if (rupeesToPaise(order.totalAmount) !== intent.amountPaise) {
    await releaseOrder();
    return null;
  }

  const charge = await chargeCart({
    studentId: order.studentId,
    items: order.items.map((item) => ({
      productId: item.productId, quantity: item.quantity, price: item.price,
    })),
    session,
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: order._id,
    idempotencyKey: intent.merchantOrderId,
    funding: 'EXTERNAL',
  });

  if (!charge.ok) {
    await releaseOrder();
    return null;
  }

  await PendingOrder.findOneAndUpdate(
    { _id: order._id, status: 'PROCESSING', approvalKey: intent.merchantOrderId },
    {
      $set: { status: 'APPROVED', approvedAt: new Date(), transactionId: charge.transaction._id },
      $unset: { processingAt: 1 },
    },
    { runValidators: true, ...sessionOptions(session) }
  );

  return charge.transaction;
};

export const settlePaymentIntent = async (intentId, deps = {}) => {
  const { provider = phonepeDefault, chargeCart = realChargeCart } = deps;

  const intent = await PaymentIntent.findById(intentId);
  if (!intent || TERMINAL.includes(intent.status)) return intent;
  if (intent.status === 'APPLYING') return intent; // another worker is mid-apply

  const providerStatus = await provider.getOrderStatus(intent.merchantOrderId);

  if (providerStatus.state === 'PENDING') return intent;

  if (providerStatus.state === 'FAILED' || providerStatus.state === 'EXPIRED') {
    return markTerminal(intent._id, intent.status, {
      status: providerStatus.state === 'FAILED' ? 'FAILED' : 'EXPIRED',
      providerState: providerStatus.state,
    }) || intent;
  }

  if (providerStatus.state !== 'COMPLETED') {
    // A state this code has never heard of gets quarantined loudly, not paid.
    return markTerminal(intent._id, intent.status, {
      status: 'FAILED', providerState: providerStatus.state,
      failureReason: `Unknown provider state ${providerStatus.state}`,
    }) || intent;
  }

  if (providerStatus.amountPaise !== intent.amountPaise) {
    // Money arrived but not the money we asked for. Never auto-apply;
    // this row is the queue for a human. (Also catches PhonePe omitting
    // `amount`, which surfaces here as `undefined !== <number>` — fail
    // safe, not a bug to route around.)
    return markTerminal(intent._id, intent.status, {
      status: 'AMOUNT_MISMATCH',
      providerState: providerStatus.state,
      providerAmountPaise: providerStatus.amountPaise,
      failureReason: `Provider captured ${providerStatus.amountPaise}, intent expected ${intent.amountPaise}`,
    }) || intent;
  }

  // COMPLETED, right amount: claim it. Exactly one caller wins this write.
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: 'PENDING' },
    { $set: { status: 'APPLYING', providerState: 'COMPLETED' } },
    { new: true }
  );

  if (!claimed) return PaymentIntent.findById(intentId);

  try {
    const result = await withMongoTransaction(async (session) => {
      if (claimed.purpose === 'TOPUP') {
        const adjustment = await creditAsTopup(claimed, session);
        return { walletAdjustmentId: adjustment._id, degradedToTopup: false };
      }

      const transaction = await applyToOrder(claimed, session, chargeCart);
      if (transaction) {
        return { transactionId: transaction._id, degradedToTopup: false };
      }

      // The order can no longer be bought. The money still has to land:
      // wallet credit, marked so support can see what happened.
      const adjustment = await creditAsTopup(claimed, session);
      return { walletAdjustmentId: adjustment._id, degradedToTopup: true };
    });

    return await PaymentIntent.findOneAndUpdate(
      { _id: claimed._id, status: 'APPLYING' },
      {
        $set: {
          status: 'APPLIED',
          appliedAt: new Date(),
          degradedToTopup: result.degradedToTopup,
          ...(result.transactionId ? { transactionId: result.transactionId } : {}),
          ...(result.walletAdjustmentId ? { walletAdjustmentId: result.walletAdjustmentId } : {}),
        },
      },
      { new: true }
    );
  } catch (err) {
    // Fail open, exactly like approvePendingOrder: release the claim so the
    // next settle attempt (webhook retry, poll, script) can try again. The
    // unique ledger indexes make a half-applied retry safe.
    await PaymentIntent.updateOne(
      { _id: claimed._id, status: 'APPLYING' },
      { $set: { status: 'PENDING' } }
    ).catch(() => {});
    throw err;
  }
};

export default { settlePaymentIntent };
