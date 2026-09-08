import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Parent from '../models/Parent.js';
import Student from '../models/Student.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import PaymentIntent from '../models/PaymentIntent.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import WalletReversal from '../models/WalletReversal.js';
import phonepe from '../src/domain/payments/providers/phonepe.js';
import { amountInWords, ensureReceiptNumbers } from '../utils/walletReceipts.js';
import { renderReceiptPdf } from '../utils/receiptPdf.js';
import { splitGrade } from '../utils/studentClass.js';
import { maskVpa } from '../utils/upiVpa.js';

/* What a UPI recharge is labelled as on the receipt, composed once here so
 * the in-app view and the PDF cannot drift apart — they render the same
 * payload, and this is the only place that decides what it says.
 *
 * Null means "we genuinely do not know", which is the honest answer for a
 * hosted or SDK checkout: the parent picked their app inside PhonePe's own
 * screen, out of this server's sight. Those receipts print a plain "UPI"
 * rather than a guess. */
const UPI_APP_NAMES = { phonepe: 'PhonePe', gpay: 'Google Pay', paytm: 'Paytm' };

const upiLabelFor = (intent) =>
  UPI_APP_NAMES[intent.upiApp] || maskVpa(intent.upiVpa) || null;

/* The company block, defaulted to the letterhead of the paper receipt the
 * office already issues (GRAARR SERVICES, Sainath Nagar, Kurnool). The
 * environment can override any line without a release. */
const companyDetails = () => ({
  name: process.env.COMPANY_NAME || 'GRAARR SERVICES',
  address: process.env.COMPANY_ADDRESS || '120/3-M-1-S, SAINATH NAGAR\nKURNOOL',
  cin: process.env.COMPANY_CIN || '',
  gstin: process.env.COMPANY_GSTIN || '',
  phone: process.env.COMPANY_PHONE || '',
  email: process.env.COMPANY_EMAIL || '',
});

/* Payments settled before the UTR was captured still have one at PhonePe.
 * Ask once, keep what comes back — the same lazily-minted-then-reprinted-
 * forever shape the receipt number has. Strictly best-effort: PhonePe being
 * slow, down or forgetful must never stop a parent opening their receipt, so
 * every failure here is swallowed and the receipt prints without the line. */
const backfillUtr = async (intent, provider = phonepe) => {
  try {
    const status = await provider.getOrderStatus(intent.merchantOrderId, intent.checkoutMode);
    if (!status?.utr) return null;
    await PaymentIntent.updateOne({ _id: intent._id }, { $set: { utr: status.utr } });
    return status.utr;
  } catch (error) {
    console.warn(`Could not backfill UTR for intent ${intent._id}: ${error.message}`);
    return null;
  }
};

/* The adjustment a receipt is for, or the refusal. Both callers start here:
 * an id that is not an id, and one that names no row, are the same answer. */
const findAdjustment = async (adjustmentId, res) => {
  if (!mongoose.Types.ObjectId.isValid(adjustmentId)) {
    res.status(404).json({ message: 'Receipt not found' });
    return null;
  }

  /* Adjustment first, because deposits are what most receipts are. A
     cancellation writes to the other ledger and is documented the same way —
     one URL, one button, and the row itself decides which document comes
     back. The two collections never share an id, so trying both in order is
     not ambiguous. */
  const adjustment = await WalletAdjustment.findById(adjustmentId).lean();
  if (adjustment) return { row: adjustment, Model: WalletAdjustment, refund: false };

  const reversal = await WalletReversal.findById(adjustmentId).lean();
  if (reversal) return { row: reversal, Model: WalletReversal, refund: true };

  res.status(404).json({ message: 'Receipt not found' });
  return null;
};

/* Loads everything one receipt says, or answers the request itself and
 * returns null. Shared by the JSON and PDF routes so the app's view and the
 * shared file can never disagree about what the receipt contains — and, since
 * the office can reprint one, so that a parent and the desk are never handed
 * two different documents for the same payment. */
const loadReceipt = async (req, res) => {
  const { adjustmentId } = req.params;

  const found = await findAdjustment(adjustmentId, res);
  if (!found) return null;
  const adjustment = found.row;

  /* One parent read serves both the ownership gate and the "received from"
   * block. Same refusals as assertOwnsStudent, without a second query. */
  const parent = await Parent.findById(req.parent.id).select(
    'studentIds fatherName phone'
  );

  if (!parent) {
    res.status(401).json({ message: 'Parent account not found' });
    return null;
  }

  const owns = parent.studentIds.some(
    (id) => id.toString() === String(adjustment.studentId)
  );

  if (!owns) {
    res.status(403).json({ message: 'Not authorized for this student' });
    return null;
  }

  return composeReceipt(found, {
    name: parent.fatherName || '',
    phone: parent.phone,
  }, res);
};

/* The document itself. `receivedFrom` is who the money came from, which the
 * parent route reads off the signed-in account and the staff route off the
 * student's registered parent — the receipt says the same thing either way. */
const composeReceipt = async ({ row: adjustment, Model, refund }, receivedFrom, res) => {
  const adjustmentId = String(adjustment._id);

  const student = await Student.findById(adjustment.studentId)
    .select('name admissionNumber className section grade roomNumber')
    .lean();

  if (!student) {
    res.status(404).json({ message: 'Student not found' });
    return null;
  }

  // Regenerating an old receipt and opening a new one are the same read: the
  // number is minted at most once, then reprinted forever.
  let receiptNumber = adjustment.receiptNumber;
  if (!receiptNumber) {
    const assigned = await ensureReceiptNumbers(
      adjustment.studentId,
      student.admissionNumber
    );
    receiptNumber =
      assigned.get(String(adjustment._id)) ||
      // A concurrent request may have numbered this row first; its number is
      // on the document now.
      (await Model.findById(adjustmentId).lean())?.receiptNumber;
  }

  if (!receiptNumber) {
    res.status(500).json({ message: 'Could not assign a receipt number' });
    return null;
  }

  const receipt = {
    receiptNumber,
    date: adjustment.createdAt,
    amount: adjustment.amount,
    amountInWords: amountInWords(adjustment.amount),
    previousBalance: adjustment.previousBalance,
    newBalance: adjustment.newBalance,
    // A refund is its own kind of document: money the school gave back, not
    // money it took in. The renderer titles and words it accordingly.
    kind: refund ? 'REFUND' : 'RECHARGE',
    mode: refund ? 'REFUND' : adjustment.source === 'PARENT_UPI' ? 'UPI' : 'CASH',
    student: {
      name: student.name,
      admissionNumber: student.admissionNumber,
      // A document the split migration has not reached yet still carries the
      // combined grade; split it the same way the migration will.
      ...(student.className
        ? { className: student.className, section: student.section || '' }
        : splitGrade(student.grade)),
      roomNumber: student.roomNumber,
    },
    parent: receivedFrom,
    company: companyDetails(),
  };

  if (refund) {
    /* What the refund undid. The order is the handle the family and the
       storeroom both use, and the reason is the note whoever cancelled it
       wrote — the two things this document exists to record.
     *
     * The UTR is the one the money arrived on, not one of its own: giving
     * money back to a wallet moves nothing through the gateway. It prints
     * only where the order was paid by UPI directly, labelled as the original
     * payment's, because that is the reference a parent's bank knows. */
    const order = await FulfillmentOrder.findById(adjustment.fulfillmentOrderId)
      .select('_id status')
      .lean();
    const charge = await Transaction.findById(adjustment.transactionId)
      .select('sourceType idempotencyKey')
      .lean();
    const intent =
      charge?.sourceType === 'UPI_ORDER_PAYMENT' && charge.idempotencyKey
        ? await PaymentIntent.findOne({ merchantOrderId: charge.idempotencyKey })
            .select('merchantOrderId utr')
            .lean()
        : null;

    receipt.refund = {
      orderReference: order ? `#${String(order._id).slice(-6).toUpperCase()}` : '',
      orderStatus: order?.status || '',
      reason: adjustment.reason || '',
      originalUtr: intent?.utr || '',
      originalOrderRef: intent?.merchantOrderId || '',
    };

    if (adjustment.performedBy) {
      const admin = await Admin.findById(adjustment.performedBy).select('name').lean();
      if (admin) receipt.receivedBy = { name: admin.name };
    }
  } else if (adjustment.source === 'PARENT_UPI') {
    if (adjustment.paymentIntentId) {
      const intent = await PaymentIntent.findById(adjustment.paymentIntentId)
        .select('provider merchantOrderId providerOrderId degradedToTopup upiApp upiVpa utr checkoutMode')
        .lean();
      if (intent) {
        receipt.payment = {
          provider: intent.provider,
          merchantOrderId: intent.merchantOrderId,
          providerOrderId: intent.providerOrderId || '',
          upiApp: intent.upiApp || null,
          // Note what is absent: upiVpa itself. The address the payment was
          // billed to stays on this server; only its masked form travels.
          upiLabel: upiLabelFor(intent),
          utr: intent.utr || (await backfillUtr(intent)) || '',
        };
        if (intent.degradedToTopup) {
          receipt.note =
            'An order payment that could not buy its order; the amount was credited to the wallet instead.';
        }
      }
    }
  } else if (adjustment.performedBy) {
    const admin = await Admin.findById(adjustment.performedBy)
      .select('name')
      .lean();
    if (admin) receipt.receivedBy = { name: admin.name };
  }

  return receipt;
};

/* The same receipt, opened from the admin console.
 *
 * The route is nested under the student it belongs to, and that is not
 * decoration: it is the check. A receipt id alone would let any admin walk
 * the collection by guessing; naming the student means the console can only
 * open receipts for the record it is already looking at. */
const loadStaffReceipt = async (req, res) => {
  const found = await findAdjustment(req.params.adjustmentId, res);
  if (!found) return null;
  const adjustment = found.row;

  if (String(adjustment.studentId) !== String(req.params.id)) {
    res.status(404).json({ message: 'Receipt not found' });
    return null;
  }

  /* Who the school received the money from. A student whose parent has never
   * registered still has a father's name and a phone number on their own
   * record, and a receipt with an empty payer is worse than one built from
   * the roster. */
  const parent = await Parent.findOne({ studentIds: adjustment.studentId })
    .select('fatherName phone')
    .lean();

  if (parent) {
    return composeReceipt(found, {
      name: parent.fatherName || '',
      phone: parent.phone,
    }, res);
  }

  const student = await Student.findById(adjustment.studentId)
    .select('fatherName parentPhoneNumber')
    .lean();

  return composeReceipt(found, {
    name: student?.fatherName || '',
    phone: student?.parentPhoneNumber || '',
  }, res);
};

export const getStudentReceiptPdf = async (req, res) => {
  try {
    const receipt = await loadStaffReceipt(req, res);
    if (!receipt) return;

    res.setHeader('Content-Type', 'application/pdf');
    /* inline, not attachment: the office opens a receipt to read it — to check
       a number against what a parent is quoting down the phone — far more often
       than it saves one. The browser's own viewer still prints and saves it.
       The parent's copy stays an attachment: on a phone a download is the
       thing they can keep and send on. */
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${receipt.receiptNumber}.pdf"`
    );
    renderReceiptPdf(receipt, res);
  } catch (error) {
    console.error('❌ getStudentReceiptPdf Error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message });
  }
};

export const getWalletReceipt = async (req, res) => {
  try {
    const receipt = await loadReceipt(req, res);
    if (!receipt) return;
    res.json({ receipt });
  } catch (error) {
    console.error('❌ getWalletReceipt Error:', error);
    res.status(500).json({ message: error.message });
  }
};

export const getWalletReceiptPdf = async (req, res) => {
  try {
    const receipt = await loadReceipt(req, res);
    if (!receipt) return;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${receipt.receiptNumber}.pdf"`
    );
    renderReceiptPdf(receipt, res);
  } catch (error) {
    console.error('❌ getWalletReceiptPdf Error:', error);
    if (!res.headersSent) res.status(500).json({ message: error.message });
  }
};
