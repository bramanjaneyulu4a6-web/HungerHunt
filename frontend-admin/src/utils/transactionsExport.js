// Extension included on the import in the test so this module runs under
// `node --test` as well as Vite.
import { KIND_LABELS } from './transactions.js';

/* The Transactions page's Export popup, minus the React: what a selection asks
 * the server for, and the spreadsheet the answer becomes.
 *
 * Unlike the TallyPrime CSV on the Exports page, this is the page's own view
 * written down — every kind including refunds, the wallet before and after,
 * who processed it, and (when asked) the deleted rows marked as deleted. It is
 * for the office to read and hand round, not for Tally to import, so it keeps
 * the page's vocabulary rather than the uniform-receipts book's.
 *
 * Pure: rows in, one string out. The popup owns the request and the download.
 */

// The value the server reads as "rows nobody on the staff made"
// (backend src/application/accounting/processedBy.js).
export const NO_STAFF = 'none';
export const NO_STAFF_LABEL = 'No staff (kiosk and parent app)';

export const EXPORT_KINDS = Object.keys(KIND_LABELS);

/* The kinds no member of staff ever makes — a parent's UPI top-up, a kiosk or
   parent-approved wallet payment, a UPI order payment. With "No staff"
   unticked none of them can match, so the popup and the Exports page grey
   them out rather than offer a tick that exports nothing. Cash deposits and
   refunds always carry the admin who made them (performedBy is required on a
   refund, and set on every desk deposit). */
export const STAFFLESS_KINDS = ['UPI_DEPOSIT', 'WALLET_DEDUCTION', 'UPI_ORDER_PAYMENT'];

// The kinds that can't be chosen while "No staff" is unticked.
export const unavailableKinds = (processedBy) =>
  processedBy.includes(NO_STAFF) ? [] : STAFFLESS_KINDS;

/* What is actually asked for: the ticks, minus any kind the people chosen
   cannot have made. The ticks themselves are kept, so ticking "No staff"
   again brings back exactly what was ticked before. */
export const effectiveKinds = (kinds, processedBy) => {
  const unavailable = unavailableKinds(processedBy);
  return kinds.filter((kind) => !unavailable.includes(kind));
};

/* A list that holds everything is sent as nothing, which the server reads as
   everything — so a person added to the staff list between opening the popup
   and pressing Download is not silently left out of an "everyone" export. */
export const listParam = (selected, all) =>
  all.every((entry) => selected.includes(entry)) ? undefined : selected.join(',');

export const exportParams = ({ from, to, kinds, processedBy, staffKeys }) => {
  const params = { from, to };
  const include = listParam(kinds, EXPORT_KINDS);
  const people = listParam(processedBy, staffKeys);
  if (include) params.include = include;
  if (people) params.processedBy = people;
  return params;
};

const BOM = '\uFEFF';
const EOL = '\r\n';

const COLUMNS = [
  'S.No', 'Date', 'Time', 'Type', 'Status', 'Student', 'Admission No', 'Class',
  'Section', 'Room', 'Mode', 'Amount', 'Wallet before', 'Wallet after',
  'Receipt No', 'Order', 'Gateway Reference', 'UTR', 'Processed by',
  'Deleted by', 'Deletion reason', 'Note',
];

const cell = (value) => {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
};

// Two decimals from paise, so a float like 250.1 never prints a stray paisa.
const rupees = (value) => {
  if (value === null || value === undefined) return '';
  const paise = Math.round(Math.abs(Number(value)) * 100);
  const text = `${Math.floor(paise / 100)}.${String(paise % 100).padStart(2, '0')}`;
  return Number(value) < 0 && paise !== 0 ? `-${text}` : text;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/* The school's day and clock, not the browser's: an evening deposit in
   Kolkata is still the previous date in UTC. 24-hour time so a spreadsheet
   sorts it as written. */
const inKolkata = (iso) => {
  const shifted = new Date(new Date(iso).getTime() + IST_OFFSET_MS).toISOString();
  const [year, month, day] = shifted.slice(0, 10).split('-').map(Number);
  return { date: `${day} ${MONTHS[month - 1]} ${year}`, time: shifted.slice(11, 16) };
};

export const buildTransactionsCsv = (rows) => {
  const lines = rows.map((row, index) => {
    const { date, time } = inKolkata(row.at);
    return [
      index + 1,
      date,
      time,
      KIND_LABELS[row.kind] || row.kind,
      row.deleted ? 'Deleted' : '',
      row.student?.name || 'Deleted student',
      row.student?.admissionNumber,
      row.student?.className,
      row.student?.section,
      row.student?.roomNumber,
      row.mode,
      rupees(row.signedAmount),
      rupees(row.balanceBefore),
      rupees(row.balanceAfter),
      row.receiptNumber,
      row.reference,
      row.gateway?.reference,
      row.gateway?.utr,
      row.processedBy,
      row.deletion?.byName,
      row.deletion?.reason,
      row.note,
    ].map(cell).join(',');
  });
  return `${BOM}${[COLUMNS.join(','), ...lines].join(EOL)}${EOL}`;
};

export const transactionsFilename = ({ from, to }) =>
  from === to
    ? `hungerhunt-transactions-${from}.csv`
    : `hungerhunt-transactions-${from}-to-${to}.csv`;
