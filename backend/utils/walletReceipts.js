import Counter from '../models/Counter.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import WalletReversal from '../models/WalletReversal.js';

/* The receipt number a parent can quote to the office:
 *
 *   GMS 0709 990123 042
 *       ^    ^      ^
 *       |    |      per-student running sequence, three digits
 *       |    admission number of the wallet that was recharged
 *       day and month of the recharge, in IST
 *
 * written without separators — GMS0709990123042. */

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export const buildReceiptNumber = ({ date, admissionNumber, seq }) => {
  // The school's clock, not the server's: a recharge at 1am IST belongs to
  // that IST day even though UTC is still on yesterday.
  const ist = new Date(new Date(date).getTime() + IST_OFFSET_MS);
  const day = String(ist.getUTCDate()).padStart(2, '0');
  const month = String(ist.getUTCMonth() + 1).padStart(2, '0');
  // padStart, not slice: the thousandth recharge keeps its digits rather than
  // colliding with an earlier number.
  const sequence = String(seq).padStart(3, '0');
  return `GMS${day}${month}${admissionNumber}${sequence}`;
};

const ONES = [
  '', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen',
  'Seventeen', 'Eighteen', 'Nineteen',
];
const TENS = [
  '', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty',
  'Ninety',
];

const twoDigits = (n) =>
  n < 20 ? ONES[n] : [TENS[Math.floor(n / 10)], ONES[n % 10]].filter(Boolean).join(' ');

const threeDigits = (n) =>
  [n >= 100 ? `${ONES[Math.floor(n / 100)]} Hundred` : '', twoDigits(n % 100)]
    .filter(Boolean)
    .join(' ');

// Indian grouping: crore, lakh, thousand, then the last three digits.
const wholeInWords = (n) => {
  if (n === 0) return 'Zero';
  const parts = [];
  const crore = Math.floor(n / 10000000);
  const lakh = Math.floor((n % 10000000) / 100000);
  const thousand = Math.floor((n % 100000) / 1000);
  const rest = n % 1000;
  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));
  return parts.join(' ');
};

export const amountInWords = (amount) => {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  const words = `Rupees ${wholeInWords(rupees)}`;
  return paise > 0
    ? `${words} and ${twoDigits(paise)} Paise Only`
    : `${words} Only`;
};

/* Numbers every still-unnumbered receiptable payment for the student, oldest
 * first, so the per-student sequence always follows payment date no matter
 * which receipt the parent happens to open first.
 *
 * Three ledgers hold receiptable movements: every top-up writes a
 * WalletAdjustment, a UPI-funded order writes a Transaction — money that
 * entered the school's books directly, receipted like a desk payment — and a
 * cancellation writes a WalletReversal, money going back out of them. All
 * three draw from the one per-student counter, so the numbers interleave by
 * date. Wallet-funded charges spend money that was receipted when it entered
 * the wallet, and stay out.
 *
 * A refund is numbered from the same series deliberately. It is the opposite
 * direction of money, but it is the same question at the counter — "which
 * piece of paper is this?" — and two series would mean two searches and a
 * number that means different things depending on which one you looked in.
 *
 * Idempotent and race-safe: the {_id, receiptNumber: null} filter means a
 * number lands on a row exactly once — a concurrent caller that loses the
 * race simply wastes its counter value, leaving a gap, never a duplicate.
 * Returns a map of row id -> number for the rows this call numbered. */
export const ensureReceiptNumbers = async (studentId, admissionNumber) => {
  const [adjustments, upiCharges, reversals] = await Promise.all([
    WalletAdjustment.find({ studentId, receiptNumber: null })
      .sort({ createdAt: 1 })
      .lean(),
    Transaction.find({ studentId, sourceType: 'UPI_ORDER_PAYMENT', receiptNumber: null })
      .sort({ createdAt: 1 })
      .lean(),
    WalletReversal.find({ studentId, receiptNumber: null })
      .sort({ createdAt: 1 })
      .lean(),
  ]);

  const unnumbered = [
    ...adjustments.map((row) => ({ row, Model: WalletAdjustment })),
    ...upiCharges.map((row) => ({ row, Model: Transaction })),
    ...reversals.map((row) => ({ row, Model: WalletReversal })),
  ].sort((left, right) => new Date(left.row.createdAt) - new Date(right.row.createdAt));

  const assigned = new Map();

  for (const { row, Model } of unnumbered) {
    const seq = await Counter.nextSequence(`walletReceipt:${studentId}`);
    const receiptNumber = buildReceiptNumber({
      date: row.createdAt,
      admissionNumber,
      seq,
    });
    const updated = await Model.findOneAndUpdate(
      { _id: row._id, receiptNumber: null },
      { $set: { receiptNumber } },
      { new: true }
    ).lean();
    if (updated?.receiptNumber) assigned.set(String(row._id), updated.receiptNumber);
  }

  return assigned;
};
