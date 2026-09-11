/* The two files the accounting page hands the office, described once.
 *
 * Same rows, two audiences: TallyPrime imports the XML as balanced double
 * entries, while the CSV is the flat spreadsheet an accountant reconciles
 * against the bank and files — the column order of the school's own uniform
 * receipts book. Keeping them in one table is what stops the download
 * plumbing being written twice, once per button, and drifting.
 *
 * Pure — no network, no React. The page next door owns the request.
 */
export const EXPORT_FORMATS = {
  xml: {
    path: '/v1/accounting-exports/tally.xml',
    fallbackName: 'hungerhunt-tally.xml',
    countHeader: 'x-hungerhunt-voucher-count',
    counted: 'vouchers',
  },
  csv: {
    path: '/v1/accounting-exports/tally.csv',
    fallbackName: 'hungerhunt-tally.csv',
    countHeader: 'x-hungerhunt-row-count',
    counted: 'rows',
  },
};

export const exportedCount = (format, headers) =>
  `${headers?.[format.countHeader] || 0} ${format.counted} exported`;

/* The server names the file: it is the side that knows the date range asked
   for. The fallback covers a response that reaches us without the header. */
export const exportFilename = (disposition, format) =>
  /filename="([^"]+)"/.exec(disposition || '')?.[1] || format.fallbackName;

/* The five movements an export can be narrowed to, in the order the checkboxes
 * show them and the order the server returns them in. The keys are the
 * server's vocabulary (backend/src/application/accounting/movementTypes.js);
 * the labels are the office's, matching what the ledger screens already call
 * these rows so a filter and a feed read the same way. */
export const MOVEMENT_TYPES = [
  { key: 'CASH_DEPOSIT', label: 'Cash Deposits' },
  { key: 'UPI_DEPOSIT', label: 'UPI Deposits' },
  { key: 'WALLET_DEDUCTION', label: 'Student Wallet Deductions' },
  { key: 'UPI_ORDER_PAYMENT', label: 'UPI Order Payments' },
  { key: 'REFUND', label: 'Refunds' },
];

export const includeParam = (selected) => selected.join(',');

/* The school's day, not the browser's.
 *
 * The same IST rule the dashboard reads a business day by (see
 * businessDateToday in ledgerEntry.js). An admin exporting at 11pm from a
 * laptop whose clock is on UTC would otherwise ask for yesterday, and a
 * quick button that silently exports the wrong day is worse than no button. */
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const inKolkata = (now) => new Date(now.getTime() + IST_OFFSET_MS);
const asDate = (shifted) => shifted.toISOString().slice(0, 10);

/* Week starts Sunday, so on a Sunday "this week" is that single day rather
   than the seven behind it — the office asked for week-to-date, not a rolling
   window. getUTCDay on the shifted instant is Kolkata's weekday. */
const QUICK_STARTS = {
  today: (shifted) => shifted,
  week: (shifted) =>
    new Date(shifted.getTime() - shifted.getUTCDay() * 24 * 60 * 60 * 1000),
};

export const QUICK_RANGES = [
  { key: 'today', label: 'Today' },
  { key: 'week', label: 'This week' },
];

export const quickRange = (key, now = new Date()) => {
  const shifted = inKolkata(now);
  return { from: asDate(QUICK_STARTS[key](shifted)), to: asDate(shifted) };
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Parsed by hand rather than through Date: these are already plain calendar
// dates, and putting them back through a timezone is how one shifts by a day.
const parts = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return { year, month: MONTHS[month - 1], day };
};

const spell = ({ day, month, year }, withYear) =>
  withYear ? `${day} ${month} ${year}` : `${day} ${month}`;

/* What a quick button promises, printed beside it. Nobody should have to guess
   what "this week" resolved to before committing a download. */
export const quickRangeLabel = ({ from, to }) => {
  const start = parts(from);
  const end = parts(to);
  if (from === to) return spell(end, true);
  return `${spell(start, start.year !== end.year)} – ${spell(end, true)}`;
};
