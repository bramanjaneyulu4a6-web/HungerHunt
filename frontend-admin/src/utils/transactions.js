// Extension included on the import in the test so this module runs under
// `node --test` as well as Vite.

/* The Transactions page, minus the React: which tab a row belongs to, how a
 * column sorts, what the search box matches, and what a quick period button
 * resolves to. Pure so every one of those rules is tested without a browser,
 * and so the page is only a table.
 *
 * Rows are what GET /v1/accounting-exports/movements returns — the same rows
 * the TallyPrime CSV files, which is the point: what the office scrolls
 * through here is what it would download. */

export const TABS = [
  { key: 'all', label: 'All Transactions' },
  { key: 'deposits', label: 'Deposits', hint: 'Cash and UPI' },
  { key: 'deductions', label: 'Deductions', hint: 'Wallet payments, UPI order payments, refunds' },
];

const TAB_GROUP = { deposits: 'DEPOSIT', deductions: 'DEDUCTION' };

export const inTab = (row, tab) => tab === 'all' || row.group === TAB_GROUP[tab];

/* The five kinds a row can be, as the office names them, and the four modes
   the Mode filter offers. Both lists are the server's vocabulary; only the
   labels are ours. */
export const KIND_LABELS = {
  CASH_DEPOSIT: 'Cash Deposit',
  UPI_DEPOSIT: 'UPI Deposit',
  WALLET_DEDUCTION: 'Wallet Payment',
  UPI_ORDER_PAYMENT: 'UPI Order Payment',
  REFUND: 'Refund',
};

export const MODES = ['Cash', 'UPI', 'Wallet', 'Refund'];

/* One comparator per sortable column. Strings compare case-insensitively so
   "aarav" and "Bharat" sort as a person expects; numbers compare as numbers
   so ₹1,000 does not land between ₹10 and ₹2. A tie falls back to time so the
   order is stable across clicks. */
const text = (value) => String(value ?? '').toLocaleLowerCase();

const COLUMN_VALUE = {
  at: (row) => row.at,
  kind: (row) => text(KIND_LABELS[row.kind] || row.kind),
  student: (row) => text(row.student?.name),
  admissionNumber: (row) => text(row.student?.admissionNumber),
  className: (row) => text(`${row.student?.className || ''} ${row.student?.section || ''}`),
  mode: (row) => text(row.mode),
  amount: (row) => row.signedAmount,
  receiptNumber: (row) => text(row.receiptNumber),
  reference: (row) => text(row.reference),
  processedBy: (row) => text(row.processedBy),
  balanceAfter: (row) => (row.balanceAfter == null ? Number.NEGATIVE_INFINITY : row.balanceAfter),
};

export const SORTABLE_COLUMNS = Object.keys(COLUMN_VALUE);

const compare = (left, right) =>
  typeof left === 'number' && typeof right === 'number'
    ? left - right
    : left < right ? -1 : left > right ? 1 : 0;

export const sortRows = (rows, { key = 'at', direction = 'asc' } = {}) => {
  const value = COLUMN_VALUE[key] || COLUMN_VALUE.at;
  const sign = direction === 'desc' ? -1 : 1;
  return [...rows].sort(
    (left, right) =>
      sign * compare(value(left), value(right)) || compare(left.at, right.at) || compare(left.id, right.id)
  );
};

/* Clicking a header sorts by it ascending; clicking it again flips it. A new
   column always starts ascending — except amount and time, which people
   almost always want largest or latest first on the second look, and so the
   first click gives ascending like every other column, for consistency. */
export const nextSort = (current, key) =>
  current.key === key
    ? { key, direction: current.direction === 'asc' ? 'desc' : 'asc' }
    : { key, direction: 'asc' };

/* The search box matches the things a person has in front of them when they
   come asking: a name, an admission number, a receipt number, an order
   handle, a staff name. Not amounts — "250" would match every ₹250 and every
   admission number containing it. */
const haystack = (row) =>
  [
    row.student?.name,
    row.student?.admissionNumber,
    row.student?.roomNumber,
    row.receiptNumber,
    row.reference,
    row.processedBy,
    row.note,
  ]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();

export const filterRows = (rows, { tab = 'all', query = '', kind = '', mode = '' } = {}) => {
  const needle = query.trim().toLocaleLowerCase();
  return rows.filter(
    (row) =>
      inTab(row, tab) &&
      (!kind || row.kind === kind) &&
      (!mode || row.mode === mode) &&
      (!needle || haystack(row).includes(needle))
  );
};

/* The school's day, not the browser's — the same IST rule the dashboard and
   the export page use. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const inKolkata = (now) => new Date(now.getTime() + IST_OFFSET_MS);
const asDate = (shifted) => shifted.toISOString().slice(0, 10);

export const PERIODS = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'week', label: 'This week' },
  { key: 'month', label: 'This month' },
  { key: 'custom', label: 'Custom' },
];

// Week starts Sunday and is week-to-date; month is month-to-date.
export const periodRange = (key, now = new Date()) => {
  const today = inKolkata(now);
  const day = (offset) => asDate(new Date(today.getTime() + offset * DAY_MS));
  switch (key) {
    case 'yesterday':
      return { from: day(-1), to: day(-1) };
    case 'week':
      return { from: day(-today.getUTCDay()), to: day(0) };
    case 'month':
      return { from: `${asDate(today).slice(0, 8)}01`, to: day(0) };
    default:
      return { from: day(0), to: day(0) };
  }
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const spell = (date, withYear) => {
  const [year, month, day] = date.split('-').map(Number);
  return withYear ? `${day} ${MONTHS[month - 1]} ${year}` : `${day} ${MONTHS[month - 1]}`;
};

// "14 Sep 2026", or "1 – 14 Sep 2026" style for a span.
export const rangeLabel = ({ from, to }) => {
  if (!from || !to) return '';
  if (from === to) return spell(from, true);
  return `${spell(from, from.slice(0, 4) !== to.slice(0, 4))} – ${spell(to, true)}`;
};

// A period is asked for as calendar dates; a backwards one is a typo, not a request.
export const rangeProblem = ({ from, to }) => {
  if (!from || !to) return 'Choose both dates.';
  if (to < from) return 'The end date is before the start date.';
  return null;
};
