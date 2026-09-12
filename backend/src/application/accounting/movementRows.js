/* Every rupee that moved, as rows a person reads on a screen.
 *
 * A sibling of tallyCsv.js: the same three collections, the same five kinds
 * of movement, the same sign convention — a deposit and a UPI order payment
 * add to what the school holds, a wallet deduction and a refund take from it.
 * The CSV is what the accountant files; this is what the office scrolls
 * through on the Transactions page, and both have to tell the same story
 * about the same day, which is why the classification lives in one place
 * per audience rather than being re-derived by a React component.
 *
 * Pure: rows in, rows out. The controller does the reading and the joining.
 */

/* The five kinds, with the two groups the page's tabs split them into.
   Deposits are money arriving into a wallet; deductions are the sales side —
   a wallet charged, an order paid by UPI, or either of those refunded. */
export const MOVEMENT_KINDS = Object.freeze({
  CASH_DEPOSIT: Object.freeze({
    group: 'DEPOSIT', mode: 'Cash', detail: 'Cash Deposit', sign: 1,
  }),
  UPI_DEPOSIT: Object.freeze({
    group: 'DEPOSIT', mode: 'UPI', detail: 'UPI Deposit', sign: 1,
  }),
  WALLET_DEDUCTION: Object.freeze({
    group: 'DEDUCTION', mode: 'Wallet', detail: 'Student Wallet Deduction', sign: -1,
  }),
  UPI_ORDER_PAYMENT: Object.freeze({
    group: 'DEDUCTION', mode: 'UPI', detail: 'UPI Order Payment', sign: 1,
  }),
  REFUND: Object.freeze({
    group: 'DEDUCTION', mode: 'Refund', detail: 'Refund', sign: -1,
  }),
});

/* A movement's student, flattened. A row whose student record has been hard
   deleted still has to appear — the money moved — so every field reads blank
   rather than the row vanishing. */
const studentOf = (studentId) => {
  const student = studentId && typeof studentId === 'object' ? studentId : null;
  return {
    id: studentId ? String(student?._id ?? studentId) : null,
    name: student?.name || '',
    admissionNumber: student?.admissionNumber || '',
    className: student?.className || student?.grade || '',
    section: student?.section || '',
    roomNumber: student?.roomNumber || '',
  };
};

const named = (names, id) => (id && names?.get(String(id))) || null;

const money = (value) => (Number.isFinite(value) ? value : null);

const itemsOf = (items) =>
  (items || [])
    .filter((item) => item && (item.name || item.productId))
    .map((item) => ({
      name: item.name || 'Item',
      quantity: Number(item.quantity) || 0,
      price: Number(item.price) || 0,
    }));

/* `gateway` is what PhonePe knows the payment by, for the rare call to
   support: the order reference, the bank's UTR, and the app it was paid
   from. Only UPI rows carry one. `adjustmentId` / `reversalId` are the ids
   the receipt route prints from — a deposit and a refund each have paper;
   a wallet charge and a UPI order payment do not. */
const row = ({
  id, kind, at, amount, receiptNumber, reference, studentId, processedBy,
  balanceBefore, balanceAfter, note, items, gateway, adjustmentId, reversalId, transactionId,
}) => {
  const meta = MOVEMENT_KINDS[kind];
  const rupees = Number(amount) || 0;
  return {
    id: String(id),
    kind,
    group: meta.group,
    mode: meta.mode,
    detail: meta.detail,
    at: new Date(at).toISOString(),
    amount: rupees,
    signedAmount: meta.sign * rupees,
    receiptNumber: receiptNumber || null,
    reference: reference || null,
    student: studentOf(studentId),
    processedBy: processedBy || null,
    balanceBefore: money(balanceBefore),
    balanceAfter: money(balanceAfter),
    note: note || '',
    items: itemsOf(items),
    gateway: gateway?.reference || gateway?.utr
      ? { reference: gateway.reference || null, utr: gateway.utr || null, upiApp: gateway.upiApp || null }
      : null,
    adjustmentId: adjustmentId ? String(adjustmentId) : null,
    reversalId: reversalId ? String(reversalId) : null,
    transactionId: transactionId ? String(transactionId) : null,
  };
};

/* `staffNames` maps an admin id to a display name, for the deposits and
   refunds a member of staff performed. Kiosk charges and parent payments
   have no staff behind them and read as nobody. `orderReference` on a
   transaction or reversal is the package's short handle, attached by the
   controller the same way the CSV's is; `gateway` and a reversal's `items`
   (the basket of the charge it undid) are attached there too. */
export const buildMovementRows = ({
  transactions = [],
  adjustments = [],
  reversals = [],
  staffNames = new Map(),
}) =>
  [
    ...adjustments.map((entry) =>
      row({
        id: entry._id,
        kind: entry.source === 'PARENT_UPI' ? 'UPI_DEPOSIT' : 'CASH_DEPOSIT',
        at: entry.createdAt,
        amount: entry.amount,
        receiptNumber: entry.receiptNumber,
        reference: null,
        studentId: entry.studentId,
        processedBy: named(staffNames, entry.performedBy),
        balanceBefore: entry.previousBalance,
        balanceAfter: entry.newBalance,
        gateway: entry.gateway,
        adjustmentId: entry._id,
      })
    ),
    ...transactions.map((entry) =>
      row({
        id: entry._id,
        kind: entry.sourceType === 'UPI_ORDER_PAYMENT' ? 'UPI_ORDER_PAYMENT' : 'WALLET_DEDUCTION',
        at: entry.createdAt,
        amount: entry.totalAmount,
        receiptNumber: entry.receiptNumber,
        reference: entry.orderReference,
        studentId: entry.studentId,
        processedBy: null,
        balanceBefore: entry.previousBalance,
        balanceAfter: entry.remainingBalance,
        items: entry.items,
        gateway: entry.gateway,
        transactionId: entry._id,
      })
    ),
    ...reversals.map((entry) =>
      row({
        id: entry._id,
        kind: 'REFUND',
        at: entry.createdAt,
        amount: entry.amount,
        receiptNumber: entry.receiptNumber,
        reference: entry.orderReference,
        studentId: entry.studentId,
        processedBy: named(staffNames, entry.performedBy),
        balanceBefore: entry.previousBalance,
        balanceAfter: entry.newBalance,
        note: entry.reason,
        items: entry.items,
        reversalId: entry._id,
        transactionId: entry.transactionId,
      })
    ),
  ].sort((left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id));

// What the page's tiles show: money in, money out, and what that nets to.
export const movementTotals = (rows) =>
  rows.reduce(
    (totals, entry) => {
      if (entry.signedAmount >= 0) totals.in += entry.signedAmount;
      else totals.out += -entry.signedAmount;
      totals.net = totals.in - totals.out;
      totals.count += 1;
      return totals;
    },
    { in: 0, out: 0, net: 0, count: 0 }
  );
