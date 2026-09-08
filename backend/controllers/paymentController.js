import crypto from 'node:crypto';
import mongoose from 'mongoose';
import PaymentIntent from '../models/PaymentIntent.js';
import PendingOrder from '../models/PendingOrder.js';
import Parent from '../models/Parent.js';
import phonepe from '../src/domain/payments/providers/phonepe.js';
import settle from '../src/domain/payments/settlePaymentIntent.js';
import { rupeesToPaise, paiseToRupees } from '../src/domain/payments/money.js';
import { isValidVpa, maskVpa, normalizeVpa } from '../utils/upiVpa.js';

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

/* What the return page is allowed to see without a session. Deliberately
 * narrower than intentView: no amount, no student, no order, no timestamps.
 * A verdict is all that screen renders, so a verdict is all this hands out —
 * and if the token ever leaks (a shoulder-surfed URL, a shared screenshot),
 * what leaks with it is "a payment succeeded", not how much or for whom. */
const publicIntentView = (intent) => ({
  id: String(intent._id),
  purpose: intent.purpose,
  status: intent.status,
  degradedToTopup: Boolean(intent.degradedToTopup),
});

/* Same lesson as the webhook's auth check in providers/phonepe.js: compare
 * BYTE length before timingSafeEqual, which throws on a length mismatch
 * rather than returning false. The query string is attacker-controlled and
 * can carry multi-byte characters. */
const tokenMatches = (presented, expected) => {
  if (typeof presented !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = Buffer.from(presented);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
};

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
const MIN_PAYMENT_PAISE = 100;

const phonepeEnabled = () => process.env.PHONEPE_PAYMENTS_ENABLED === 'true';

const sdkConfiguration = () => ({
  merchantId: process.env.PHONEPE_MERCHANT_ID,
  appId: process.env.PHONEPE_IOS_APP_ID,
  environment: process.env.PHONEPE_ENV === 'production' ? 'PRODUCTION' : 'SANDBOX',
});

const UPI_APPS = {
  phonepe: { ANDROID: 'com.phonepe.app', IOS: 'PHONEPE' },
  gpay: { ANDROID: 'com.google.android.apps.nbu.paisa.user', IOS: 'GPAY' },
  paytm: { ANDROID: 'net.one97.paytm', IOS: 'PAYTM' },
};

/* A checkout mode is two things: how the payment is opened with PhonePe, and
 * what the app is handed back so it can pass the parent along. Keeping the
 * pair together is what stops a new mode from being half-added — one that
 * starts a payment the app then has no way to continue.
 *
 * UPI_COLLECT is the one with nothing to hand over. There is no page, no app
 * and no URL: PhonePe pushes the request to whatever app owns the address the
 * parent typed, and the only thing to report back is who was asked. */
const START_CHECKOUT = {
  SDK: ({ merchantOrderId, amountPaise }) =>
    phonepe.createSdkPayment({ merchantOrderId, amountPaise }),

  UPI_INTENT: ({ merchantOrderId, amountPaise, upiApp, deviceOS }) =>
    phonepe.createUpiIntentPayment({
      merchantOrderId,
      amountPaise,
      targetApp: UPI_APPS[upiApp][deviceOS],
      deviceOS,
      merchantCallBackScheme: 'hungerhuntpay',
    }),

  UPI_COLLECT: ({ merchantOrderId, amountPaise, upiVpa }) =>
    phonepe.createUpiCollectPayment({ merchantOrderId, amountPaise, vpa: upiVpa }),

  REDIRECT: ({ merchantOrderId, amountPaise, redirectUrl }) =>
    phonepe.createPayment({ merchantOrderId, amountPaise, redirectUrl }),
};

const HANDOFF = {
  SDK: (created) => ({
    sdk: { orderId: created.orderId, token: created.token, ...sdkConfiguration() },
  }),
  UPI_INTENT: (created) => ({ intentUrl: created.intentUrl }),
  /* Masked on the way back, not because the app does not know the address —
     it just typed it, and its waiting screen shows it in full so a parent can
     spot a typo that would otherwise look like a payment ignored. Masked
     because this response has no need to carry it: the only job of this echo
     is to say a collect was started, and a payload that never holds the whole
     address cannot leak one in a log, a proxy or a crash report. */
  UPI_COLLECT: (created, { upiVpa }) => ({ collect: { vpa: maskVpa(upiVpa) } }),
  REDIRECT: (created) => ({ redirectUrl: created.redirectUrl }),
};

export const createPaymentIntent = async (req, res) => {
  try {
    if (!phonepeEnabled()) {
      return res.status(503).json({ message: 'UPI payments are temporarily unavailable.' });
    }

    const { purpose } = req.body || {};
    const requestedMode = req.body?.checkoutMode;
    const checkoutMode = ['SDK', 'UPI_INTENT', 'UPI_COLLECT'].includes(requestedMode)
      ? requestedMode
      : 'REDIRECT';
    const deviceOS = req.body?.deviceOS === 'IOS' ? 'IOS' : 'ANDROID';
    const upiApp = typeof req.body?.upiApp === 'string' ? req.body.upiApp : '';
    if (checkoutMode === 'UPI_INTENT' && !UPI_APPS[upiApp]) {
      return res.status(400).json({ message: 'Choose a supported UPI app.' });
    }

    /* The address is checked here, before an intent row exists, so a typo
       costs the parent a message rather than a stranded PENDING payment they
       then see in their history. */
    const upiVpa = normalizeVpa(req.body?.vpa);
    if (checkoutMode === 'UPI_COLLECT' && !isValidVpa(upiVpa)) {
      return res.status(400).json({
        message: 'Enter a UPI ID in the form name@bank, such as 9876543210@ybl.',
      });
    }
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

    if (amountPaise < MIN_PAYMENT_PAISE) {
      return res.status(400).json({ message: 'PhonePe payments must be at least ₹1.' });
    }

    const intent = await PaymentIntent.create({
      parentId: req.parent.id,
      studentId,
      purpose,
      pendingOrderId,
      amountPaise,
      checkoutMode,
      ...(checkoutMode === 'UPI_INTENT' ? { upiApp } : {}),
      ...(checkoutMode === 'UPI_COLLECT' ? { upiVpa } : {}),
      merchantOrderId: `HH-${new mongoose.Types.ObjectId()}`,
      returnToken: crypto.randomBytes(32).toString('hex'),
    });

    let created;
    try {
      created = await START_CHECKOUT[checkoutMode]({
        merchantOrderId: intent.merchantOrderId,
        amountPaise,
        upiApp,
        upiVpa,
        deviceOS,
        // The token travels only here, in the URL PhonePe redirects to. It is
        // what lets that page report a verdict in a browser with no session —
        // see returnToken on the model.
        redirectUrl: `${process.env.PHONEPE_REDIRECT_BASE_URL}/payment-return?intent=${intent._id}&t=${intent.returnToken}`,
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

    res.status(201).json({
      intent: intentView(pending || intent),
      ...HANDOFF[checkoutMode](created, { upiVpa }),
    });
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

/* The return page's read, for the browser PhonePe redirected into — which
 * on native shares no session with the app that started the payment. No auth
 * middleware; possession of the intent's returnToken is the whole credential,
 * and it only ever answers for that one payment.
 *
 * It settles exactly as the authenticated poll does, and for the same
 * reason: this is a recovery path, so it has to be able to discover a
 * dropped webhook rather than parrot a stale row. It still cannot decide
 * anything about money — settlePaymentIntent asks PhonePe's server. Every
 * rejection answers 404 with the same body, so the route never confirms that
 * an intent id exists to someone holding the wrong token. */
export const getPublicPaymentIntent = async (req, res) => {
  const notFound = () => res.status(404).json({ message: 'Payment not found.' });

  try {
    const presented = typeof req.query.t === 'string' ? req.query.t : '';
    if (!presented || !mongoose.isValidObjectId(req.params.id)) return notFound();

    const intent = await PaymentIntent.findById(req.params.id).select('+returnToken');
    if (!intent || !tokenMatches(presented, intent.returnToken)) return notFound();

    const fresh = ['PENDING', 'APPLYING', 'CREATED'].includes(intent.status)
      ? (await settle.settlePaymentIntent(intent._id).catch(() => intent)) || intent
      : intent;

    res.set('Cache-Control', 'no-store').json({ intent: publicIntentView(fresh) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const phonepeWebhook = async (req, res) => {
  if (!phonepe.verifyWebhookAuth(req.get('authorization'))) {
    const _h = String(req.get('authorization') || '');
    console.error('PhonePe webhook authentication failed.', {
      event: req.body?.event || null,
      headerPresent: Boolean(_h),
      headerLen: _h.length,
    });
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // PhonePe nests order fields under payload; tolerate both shapes.
  const merchantOrderId =
    req.body?.payload?.merchantOrderId || req.body?.merchantOrderId || null;

  // PhonePe requires a 2xx acknowledgement within 3–5 seconds. Authenticate
  // and capture the provider-owned reference synchronously, then acknowledge;
  // status verification and ledger work continue through the same idempotent
  // settle path. The scheduled reconcile sweep is the durable recovery path
  // if this process dies after acknowledgement.
  res.status(202).json({ received: true });

  try {
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
  } catch (err) {
    // The acknowledgement has already gone out, so a transient lookup failure
    // is recovered by the scheduled sweep. Catch it here so post-response work
    // never becomes an unhandled rejection that can terminate the process.
    console.error('Webhook lookup failed for', merchantOrderId, err);
    return;
  }
};
