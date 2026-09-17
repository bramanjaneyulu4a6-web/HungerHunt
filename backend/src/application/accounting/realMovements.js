/* What the accounting exports file: money that really moved, and nothing else.
 *
 * A cancelled package moved no money in the end — the charge and its refund
 * cancel out — so an export leaves both halves out rather than booking a sale
 * and a credit note for nothing. The one exception is a package the parent
 * paid for straight over UPI: that money really reached the school's bank,
 * and the cancellation put it into the child's wallet. It is filed as the UPI
 * deposit it became, on the day it arrived, so the books still hold it.
 *
 * Failed top-ups and deleted rows never reach this far: the reader does not
 * fetch them. Refund rows are not read for an export at all.
 *
 * Pure: rows in, rows out. No models, no database.
 */

const UPI_ORDER = 'UPI_ORDER_PAYMENT';

const isUpiOrder = (charge) => charge.sourceType === UPI_ORDER;

/* The charges an export has to read. Beyond the charge types selected, a
   request for UPI deposits also reads UPI orders, because a cancelled one is
   filed as a UPI deposit. null means no charge is read at all. */
export const exportChargeFilter = (included) => {
  const wallet = included.includes('WALLET_DEDUCTION');
  const upi = included.includes(UPI_ORDER) || included.includes('UPI_DEPOSIT');
  if (wallet && upi) return {};
  if (wallet) return { sourceType: { $ne: UPI_ORDER } };
  if (upi) return { sourceType: UPI_ORDER };
  return null;
};

const asUpiDeposit = (charge) => ({
  _id: charge._id,
  studentId: charge.studentId,
  source: 'PARENT_UPI',
  amount: charge.totalAmount,
  receiptNumber: charge.receiptNumber,
  createdAt: charge.createdAt,
});

export const realMovements = ({ transactions, adjustments, cancelledIds, included }) => {
  const has = (type) => included.includes(type);
  const cancelled = (charge) => cancelledIds.has(String(charge._id));

  const charges = transactions.filter((charge) =>
    !cancelled(charge) && has(isUpiOrder(charge) ? UPI_ORDER : 'WALLET_DEDUCTION'));

  const becameDeposits = has('UPI_DEPOSIT')
    ? transactions.filter((charge) => cancelled(charge) && isUpiOrder(charge)).map(asUpiDeposit)
    : [];

  const deposits = becameDeposits.length
    ? [...adjustments, ...becameDeposits]
      .sort((left, right) => new Date(left.createdAt) - new Date(right.createdAt))
    : adjustments;

  return { transactions: charges, adjustments: deposits };
};
