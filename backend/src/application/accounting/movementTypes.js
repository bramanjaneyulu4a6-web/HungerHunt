/* The five things that can happen to a rupee here, and what asking for a
 * subset of them means to each collection.
 *
 * Shared by both accounting exports so the CSV and the XML can never disagree
 * about what "Cash Deposits only" selected — they read the same rows, and an
 * accountant reconciling one against the other has to be able to trust that.
 *
 * Pure: strings in, query filters out. No models, no database.
 */
import { ValidationError } from '../../shared/errors/applicationError.js';

export const MOVEMENT_TYPES = [
  'CASH_DEPOSIT',
  'UPI_DEPOSIT',
  'WALLET_DEDUCTION',
  'UPI_ORDER_PAYMENT',
  'REFUND',
];

/* What the request asked for, in canonical order.
 *
 * An absent or empty parameter means everything, which is what keeps the XML
 * export's existing callers working untouched. A list that names something
 * unrecognised is refused rather than narrowed: a typo that silently halves a
 * month's export is discovered weeks later by an accountant who cannot make
 * the books balance, while a 400 is discovered immediately. */
export const parseIncluded = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') {
    return MOVEMENT_TYPES;
  }

  const asked = String(value)
    .split(',')
    .map((entry) => entry.trim().toUpperCase())
    .filter(Boolean);

  const unknown = asked.filter((entry) => !MOVEMENT_TYPES.includes(entry));
  if (unknown.length) {
    throw new ValidationError([
      { field: 'include', message: `Unknown movement type(s): ${unknown.join(', ')}.` },
    ]);
  }
  if (!asked.length) {
    throw new ValidationError([
      { field: 'include', message: 'Select at least one movement type to export.' },
    ]);
  }

  return MOVEMENT_TYPES.filter((type) => asked.includes(type));
};

/* Half a collection, expressed as the filter that claims it.
 *
 * Both halves selected drops the discriminator entirely rather than listing
 * both values, because a row written before the discriminating field existed
 * carries no value for it and an $in would leave it out of an export that
 * asked for everything.
 *
 * One half selected matches the way the ledger itself reads these rows: it
 * calls anything that is not PARENT_UPI cash, and anything that is not
 * UPI_ORDER_PAYMENT wallet-funded (see utils/studentLedger.js). Filtering by
 * $ne rather than by the positive value keeps those older rows on the same
 * side of the split the screens already put them on. */
const halves = ({ both, gateway, field, gatewayValue }) => {
  if (both) return {};
  return gateway ? { [field]: gatewayValue } : { [field]: { $ne: gatewayValue } };
};

export const collectionFilters = (included) => {
  const has = (type) => included.includes(type);

  const cash = has('CASH_DEPOSIT');
  const upiDeposit = has('UPI_DEPOSIT');
  const wallet = has('WALLET_DEDUCTION');
  const upiOrder = has('UPI_ORDER_PAYMENT');

  return {
    // null, not {}: a collection nothing was selected from is never read.
    adjustments: cash || upiDeposit
      ? halves({
          both: cash && upiDeposit,
          gateway: upiDeposit,
          field: 'source',
          gatewayValue: 'PARENT_UPI',
        })
      : null,
    transactions: wallet || upiOrder
      ? halves({
          both: wallet && upiOrder,
          gateway: upiOrder,
          field: 'sourceType',
          gatewayValue: 'UPI_ORDER_PAYMENT',
        })
      : null,
    reversals: has('REFUND') ? {} : null,
  };
};
