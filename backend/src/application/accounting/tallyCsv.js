/* The office's spreadsheet of every rupee that moved, in the column order the
 * school's uniform-receipts book already uses, for pasting into TallyPrime.
 *
 * A sibling of tallyXml.js and deliberately not a replacement for it. The XML
 * is balanced double-entry Tally imports natively; this is the flat list an
 * accountant reads, reconciles against the bank, and files. Same rows, two
 * audiences.
 *
 * Pure: rows in, one string out. The controller next door does the fetching
 * and the joining, so every mapping decision below can be read — and tested —
 * without a database.
 */
import { rupeesToPaise } from '../../../utils/money.js';
import { splitGrade } from '../../../utils/studentClass.js';

/* Excel decides a CSV's encoding from its first bytes, and without this it
   guesses the machine's legacy codepage and mangles any non-ASCII name. */
const BOM = '\uFEFF';

// RFC 4180: CRLF between records, quotes doubled inside a quoted field.
const EOL = '\r\n';

const COLUMNS = [
  'S.No', 'Receipt No', 'Admission No', 'Name', 'Class', 'Section', 'Amount',
  'Paid to', 'ModeOfPayment', 'Details', 'Date of Payment', 'Voucher Type',
];

const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

/* Rupees from paise rather than from the number itself: a ledger written
   before this export existed may hold 250.1 as a float, and toFixed on the
   float is where a stray paisa comes from. */
const amount = (rupees, { negative }) => {
  const paise = rupeesToPaise(rupees);
  const value = `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
  return negative && paise !== 0 ? `-${value}` : value;
};

/* The school's day, not the server's — "14 Aug 2026", as the uniform receipts
   book writes it. An evening payment in Kolkata is still the previous date by
   UTC, and dating it that way would move it into the wrong month's return. */
const paymentDate = (date, timeZone) =>
  new Intl.DateTimeFormat('en-GB', {
    timeZone, day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date(date));

/* A movement's student, flattened. A row whose student record has been hard
   deleted still has to appear — the money moved, and a book that silently
   drops it will not reconcile — so every field simply reads blank. */
const studentCells = (studentId) => {
  const student = studentId && typeof studentId === 'object' ? studentId : null;
  if (!student) return { admissionNumber: '', name: '', className: '', section: '' };
  // A record the split migration has not reached yet still carries the
  // combined grade; split it the same way the migration will.
  const { className, section } = student.className
    ? { className: student.className, section: student.section || '' }
    : splitGrade(student.grade);
  return {
    admissionNumber: student.admissionNumber || '',
    name: student.name || '',
    className,
    section,
  };
};

/* What each kind of movement is called, which way it signs, and the voucher
 * Tally should file it under.
 *
 * Wallet is the fifth mode alongside Cash, UPI and Refund because a wallet
 * purchase is none of the others: the money it spends arrived earlier as a
 * deposit that carries its own Cash or UPI row. Signing it negative — like a
 * refund — is what keeps the column summing to what the school actually holds.
 */
const movement = ({ mode, detail, voucherType, negative }) => ({
  mode, detail, voucherType, negative,
});

const TOP_UP = {
  PARENT_UPI: movement({
    mode: 'UPI', detail: 'UPI Deposit', voucherType: 'Receipt', negative: false,
  }),
  ADMIN: movement({
    mode: 'Cash', detail: 'Cash Deposit', voucherType: 'Receipt', negative: false,
  }),
};

const CHARGE = {
  UPI_ORDER_PAYMENT: movement({
    mode: 'UPI', detail: 'UPI Order Payment', voucherType: 'Sales', negative: false,
  }),
  WALLET: movement({
    mode: 'Wallet', detail: 'Student Wallet Deduction', voucherType: 'Sales', negative: true,
  }),
};

const REFUND = movement({
  mode: 'Refund', detail: 'Refund', voucherType: 'Credit Note', negative: true,
});

/* The order a charge or a refund belongs to, appended to the detail so the
   accountant querying a line has the same handle the storeroom and the family
   use. A deposit has no order, and a charge whose package was purged has none
   to name either. */
const detailFor = ({ detail }, orderReference) =>
  orderReference ? `${detail} - Order ${orderReference}` : detail;

const rowsFrom = ({ transactions, adjustments, reversals }) => [
  ...adjustments.map((entry) => ({
    date: entry.createdAt,
    receiptNumber: entry.receiptNumber,
    studentId: entry.studentId,
    rupees: entry.amount,
    kind: TOP_UP[entry.source] || TOP_UP.ADMIN,
    orderReference: null,
  })),
  ...transactions.map((entry) => ({
    date: entry.createdAt,
    // Only money that entered the school's books directly is numbered; a
    // wallet-funded charge spends money receipted on the way in, and
    // utils/walletReceipts.js deliberately leaves it without a number.
    receiptNumber: entry.receiptNumber,
    studentId: entry.studentId,
    rupees: entry.totalAmount,
    kind: CHARGE[entry.sourceType] || CHARGE.WALLET,
    orderReference: entry.orderReference,
  })),
  ...reversals.map((entry) => ({
    date: entry.createdAt,
    receiptNumber: entry.receiptNumber,
    studentId: entry.studentId,
    rupees: entry.amount,
    kind: REFUND,
    orderReference: entry.orderReference,
  })),
].sort((left, right) => new Date(left.date) - new Date(right.date));

export const buildTallyCsv = ({
  transactions, adjustments, reversals, paidTo, timeZone,
}) => {
  const rows = rowsFrom({ transactions, adjustments, reversals }).map((row, index) => {
    const student = studentCells(row.studentId);
    return [
      index + 1,
      row.receiptNumber || '',
      student.admissionNumber,
      student.name,
      student.className,
      student.section,
      amount(row.rupees, { negative: row.kind.negative }),
      paidTo,
      row.kind.mode,
      detailFor(row.kind, row.orderReference),
      paymentDate(row.date, timeZone),
      row.kind.voucherType,
    ].map(cell).join(',');
  });

  return `${BOM}${[COLUMNS.join(','), ...rows].join(EOL)}${EOL}`;
};
