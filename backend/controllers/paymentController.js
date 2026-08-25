import mongoose from 'mongoose';
import PaymentIntent from '../models/PaymentIntent.js';
import PendingOrder from '../models/PendingOrder.js';
import Parent from '../models/Parent.js';
import phonepe from '../src/domain/payments/providers/phonepe.js';
import settle from '../src/domain/payments/settlePaymentIntent.js';
import { rupeesToPaise, paiseToRupees } from '../src/domain/payments/money.js';

/* The Golden Rule of gateways, enforced here by what these handlers refuse to
 * do: nothing a client can call marks money as received. createIntent starts
 * a payment; getIntent (and the webhook) hand the intent to
 * settlePaymentIntent, which asks PhonePe's server before moving anything.
 * The app returning from checkout saying "success!" changes nothing by
 * itself.
 *
 * Both the provider and settle are reached through their default export
 * objects (phonepe.createPayment, settle.settlePaymentIntent) rather than as
 * named imports off a module namespace — mock.method() cannot redefine a
 * namespace property on this repo's Node, so this is also what lets the
 * tests stub them. */

const intentView = (intent) => ({
  id: String(intent._id),
  purpose: intent.purpose,
  status: intent.status,
  amountPaise: intent.amountPaise,
  amountRupees: paiseToRupees(intent.amountPaise),
  degradedToTopup: Boolean(intent.degradedToTopup),
  pendingOrderId: intent.pendingOrderId ? String(intent.pendingOrderId) : null,
  createdAt: intent.createdAt,
});

const TOPUP_MAX_RUPEES = 20000;

export const createPaymentIntent = async (req, res) => {
  try {
    const { purpose } = req.body || {};
    let studentId;
    let pendingOrderId = null;
    let amountPaise;

    if (purpose === 'TOPUP') {
      const { amountRupees } = req.body;
      studentId = req.body.studentId;

      if (!Number.isInteger(amountRupees) || amountRupees < 1 || amountRupees > TOPUP_MAX_RUPEES) {
        return res.status(400).json({
          message: `Amount must be a whole rupee figure between 1 and ${TOPUP_MAX_RUPEES}.`,
        });
      }

      const ownsStudent = await Parent.exists({ _id: req.parent.id, studentIds: studentId });
      if (!ownsStudent) {
        return res.status(404).json({ message: 'Student not found' });
      }

      amountPaise = rupeesToPaise(amountRupees);
    } else if (purpose === 'ORDER') {
      const order = await PendingOrder.findOne({
        _id: req.body.pendingOrderId,
        parentId: req.parent.id,
      });

      if (!order) return res.status(404).json({ message: 'This order could not be found.' });
      if (order.status !== 'PENDING' || order.expiresAt <= new Date()) {
        return res.status(409).json({ message: 'This order is no longer awaiting payment.' });
      }

      studentId = order.studentId;
      pendingOrderId = order._id;
      // Snapshot of the total the parent is being shown right now. Settle
      // re-checks it; an order edited after this point degrades to a top-up
      // rather than buying something the parent never saw.
      amountPaise = rupeesToPaise(order.totalAmount);
    } else {
      return res.status(400).json({ message: 'purpose must be TOPUP or ORDER.' });
    }

    const intent = await PaymentIntent.create({
      parentId: req.parent.id,
      studentId,
      purpose,
      pendingOrderId,
      amountPaise,
      merchantOrderId: `HH-${new mongoose.Types.ObjectId()}`,
    });

    let created;
    try {
      created = await phonepe.createPayment({
        merchantOrderId: intent.merchantOrderId,
        amountPaise,
        redirectUrl: `${process.env.PHONEPE_REDIRECT_BASE_URL}/payment-return?intent=${intent._id}`,
      });
    } catch (err) {
      await PaymentIntent.findOneAndUpdate(
        { _id: intent._id, status: 'CREATED' },
        { $set: { status: 'FAILED', failureReason: `Provider create failed: ${err.message}` } }
      );
      return res.status(502).json({ message: 'The payment service is not answering. Nothing was charged — try again.' });
    }

    const pending = await PaymentIntent.findOneAndUpdate(
      { _id: intent._id, status: 'CREATED' },
      { $set: { status: 'PENDING', providerOrderId: created.providerOrderId } },
      { new: true }
    );

    res.status(201).json({ intent: intentView(pending || intent), redirectUrl: created.redirectUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPaymentIntent = async (req, res) => {
  try {
    const intent = await PaymentIntent.findOne({ _id: req.params.id, parentId: req.parent.id });
    if (!intent) return res.status(404).json({ message: 'Payment not found.' });

    // Polling IS the recovery path: every read of an unfinished intent asks
    // PhonePe what actually happened, so a dropped webhook only ever delays
    // money, never loses it.
    const fresh = ['PENDING', 'APPLYING', 'CREATED'].includes(intent.status)
      ? (await settle.settlePaymentIntent(intent._id).catch(() => intent)) || intent
      : intent;

    res.set('Cache-Control', 'no-store').json({ intent: intentView(fresh) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const phonepeWebhook = async (req, res) => {
  if (!phonepe.verifyWebhookAuth(req.get('authorization'))) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // PhonePe nests order fields under payload; tolerate both shapes.
  const merchantOrderId =
    req.body?.payload?.merchantOrderId || req.body?.merchantOrderId || null;

  if (merchantOrderId) {
    const intent = await PaymentIntent.findOne({ merchantOrderId });
    if (intent) {
      // The webhook body is a doorbell, not a bank statement: settle
      // re-reads status server-to-server and ignores what the body claims.
      await settle.settlePaymentIntent(intent._id).catch((err) => {
        console.error('Webhook settle failed for', merchantOrderId, err);
      });
    }
  }

  // Always 200 once authenticated: a 5xx would make PhonePe hammer retries
  // for problems a retry cannot fix. The reconcile script owns stragglers.
  res.json({ received: true });
};
