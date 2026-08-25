import PaymentIntent from '../../../models/PaymentIntent.js';
import PendingOrder from '../../../models/PendingOrder.js';
import WalletAdjustment from '../../../models/WalletAdjustment.js';
import Transaction from '../../../models/Transaction.js';
import Student from '../../../models/Student.js';
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

/* A crash between the mongo transaction committing and the final APPLYING ->
 * APPLIED write (or a caught error that released the claim after the work
 * already landed) can put an already-applied intent back through this code:
 * a reconcile sweep releases APPLYING -> PENDING by design, and the next
 * settle would otherwise redo the work. For an ORDER that means buying the
 * order again — impossible, since chargeCart's unique index would refuse it
 * — and *also* crediting the wallet, because a refused re-charge looks
 * exactly like "the order can no longer be bought" to code that doesn't
 * check first. For a TOPUP it means a second WalletAdjustment.create, which
 * the unique index does refuse, but then the claim release/reclaim loops
 * forever, erroring on every pass. Checking for prior evidence before doing
 * anything closes both: a replay finishes straight to APPLIED with the
 * ids it already produced, and never re-applies. */
const findPriorApplication = async (claimed, session) => {
  const adjustmentQuery = WalletAdjustment.findOne({ paymentIntentId: claimed._id });
  const priorAdjustment = session ? await adjustmentQuery.session(session) : await adjustmentQuery;

  if (priorAdjustment) {
    // Purpose TOPUP: this is the top-up itself. Purpose ORDER: the only way
    // a WalletAdjustment exists for an ORDER intent is a prior degrade —
    // a replay must not turn that into a second credit either.
    return { walletAdjustmentId: priorAdjustment._id, degradedToTopup: claimed.purpose !== 'TOPUP' };
  }

  if (claimed.purpose === 'ORDER') {
    const transactionQuery = Transaction.findOne({
      sourceType: 'UPI_ORDER_PAYMENT',
      sourceId: claimed.pendingOrderId,
    });
    const priorTransaction = session ? await transactionQuery.session(session) : await transactionQuery;

    if (priorTransaction) {
      return { transactionId: priorTransaction._id, degradedToTopup: false };
    }
  }

  return null;
};

/* Credits the paid amount as balance. Used by TOPUP, and by ORDER when the
 * order can no longer be bought — the parent's money must land somewhere. */
const creditAsTopup = async (intent, session) => {
  const amountRupees = paiseToRupees(intent.amountPaise);

  const studentQuery = Student.findById(intent.studentId);
  const student = session ? await studentQuery.session(session) : await studentQuery;

  if (!student || student.active === false) {
    throw new Error(`Student ${intent.studentId} not found for credit`);
  }

  const previousBalance = student.pocketMoney;
  const newBalance = previousBalance + amountRupees;

  // Written BEFORE the wallet is actually credited, gated by the unique
  // index on paymentIntentId (one_wallet_adjustment_per_payment_intent).
  // Under a real mongo session this ordering doesn't matter — the whole
  // transaction commits or rolls back together. Sessionless (a disconnect
  // blip, or these unit tests) there is no rollback, so this ordering is
  // what stops a retried settle from crediting the wallet twice for one
  // payment: if the $inc below never runs, the wallet is short a credit
  // rather than gaining an uncounted extra one, and findPriorApplication()
  // will find this row on any replay and stop before trying to credit
  // again — fails short and auditable, never over-credits silently.
  const [adjustment] = await WalletAdjustment.create(
    [{
      studentId: intent.studentId,
      source: 'PARENT_UPI',
      paymentIntentId: intent._id,
      type: 'TOP_UP',
      amount: amountRupees,
      previousBalance,
      newBalance,
      // Stays merchantOrderId, deliberately: it is unique per intent, so
      // every collision on the (performedBy, idempotencyKey) index this
      // shares with ADMIN rows is a correct duplicate rejection. A key that
      // could repeat across intents would turn that safety net into a bug
      // that silently rejects a legitimate second top-up.
      idempotencyKey: intent.merchantOrderId,
    }],
    { ...sessionOptions(session) }
  );

  const credited = await creditWallet(intent.studentId, amountRupees, { session });
  if (!credited) throw new Error(`Student ${intent.studentId} not found for credit`);

  return adjustment;
};

/* Tries to buy the order with the captured money. Returns the transaction on
 * success, null when the order can no longer be bought (caller degrades).
 * `onClaim` reports the moment the PendingOrder claim lands, so the caller
 * can release it if something throws afterward without a session to undo it
 * automatically (see the catch in settlePaymentIntent). */
const applyToOrder = async (intent, session, chargeCart, onClaim) => {
  const now = new Date();
  const order = await PendingOrder.findOneAndUpdate(
    { _id: intent.pendingOrderId, status: 'PENDING', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', approvalKey: intent.merchantOrderId, processingAt: now } },
    { new: true, runValidators: true, ...sessionOptions(session) }
  );

  if (!order) return null; // approved/rejected/expired since payment began

  onClaim?.(order._id);

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
    return (await markTerminal(intent._id, intent.status, {
      status: providerStatus.state === 'FAILED' ? 'FAILED' : 'EXPIRED',
      providerState: providerStatus.state,
    })) || PaymentIntent.findById(intentId);
  }

  if (providerStatus.state !== 'COMPLETED') {
    // A state this code has never heard of gets quarantined loudly, not paid.
    return (await markTerminal(intent._id, intent.status, {
      status: 'FAILED', providerState: providerStatus.state,
      failureReason: `Unknown provider state ${providerStatus.state}`,
    })) || PaymentIntent.findById(intentId);
  }

  if (providerStatus.amountPaise !== intent.amountPaise) {
    // Money arrived but not the money we asked for. Never auto-apply;
    // this row is the queue for a human. (Also catches PhonePe omitting
    // `amount`, which surfaces here as `undefined !== <number>` — fail
    // safe, not a bug to route around.)
    return (await markTerminal(intent._id, intent.status, {
      status: 'AMOUNT_MISMATCH',
      providerState: providerStatus.state,
      providerAmountPaise: providerStatus.amountPaise,
      failureReason: `Provider captured ${providerStatus.amountPaise}, intent expected ${intent.amountPaise}`,
    })) || PaymentIntent.findById(intentId);
  }

  // COMPLETED, right amount: claim it. Exactly one caller wins this write.
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: 'PENDING' },
    { $set: { status: 'APPLYING', providerState: 'COMPLETED' } },
    { new: true }
  );

  if (!claimed) return PaymentIntent.findById(intentId);

  // Tracks a PendingOrder claimed PROCESSING by this attempt, so the catch
  // below can release it if something throws afterward. Reset to null the
  // instant applyToOrder resolves normally (whether it bought the order or
  // released the claim itself) — only a throw leaves it set for the catch.
  let claimedOrderId = null;

  try {
    const result = await withMongoTransaction(async (session) => {
      const prior = await findPriorApplication(claimed, session);
      if (prior) return prior;

      if (claimed.purpose === 'TOPUP') {
        const adjustment = await creditAsTopup(claimed, session);
        return { walletAdjustmentId: adjustment._id, degradedToTopup: false };
      }

      const transaction = await applyToOrder(claimed, session, chargeCart, (id) => { claimedOrderId = id; });
      claimedOrderId = null; // resolved one way or another below; nothing left to release

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
    // next settle attempt (webhook retry, poll, script) can try again.
    // Safety on that retry is NOT "the unique ledger indexes alone" — a bare
    // $inc has no index to gate it. It comes from findPriorApplication()
    // checking for prior evidence before doing anything, together with
    // creditAsTopup() writing its WalletAdjustment (unique per intent)
    // BEFORE the wallet is actually credited: a retry either finds that row
    // first and stops, or finds nothing and is free to try, and the $inc
    // itself only ever runs once per row that made it into the ledger.
    await PaymentIntent.updateOne(
      { _id: claimed._id, status: 'APPLYING' },
      { $set: { status: 'PENDING' } }
    ).catch(() => {});

    // With a real session this is normally unnecessary — an aborted
    // transaction rolls the order's PROCESSING claim back together with
    // everything else, exactly like approvePendingOrder's claim does.
    // Sessionless (a disconnect blip, or these unit tests) that rollback
    // does not happen, so release it explicitly here too, or the order
    // strands at PROCESSING and a later settle would wrongly treat it as
    // unbuyable and degrade a perfectly good order to a top-up.
    if (claimedOrderId) {
      await PendingOrder.updateOne(
        { _id: claimedOrderId, status: 'PROCESSING', approvalKey: claimed.merchantOrderId },
        { $set: { status: 'PENDING' }, $unset: { approvalKey: 1, processingAt: 1 } }
      ).catch(() => {});
    }

    throw err;
  }
};

export default { settlePaymentIntent };
