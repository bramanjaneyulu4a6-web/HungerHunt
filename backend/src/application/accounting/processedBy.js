/* Narrowing a period's movements to the people who handled them.
 *
 * Only two kinds of row have a person behind them: a cash deposit taken at
 * the desk and a refund an admin gave. A kiosk charge, a parent's UPI top-up
 * and a UPI order payment were made by the family themselves, so they belong
 * to nobody — and the office can still ask for them, by name, as `none`.
 *
 * Shared by the two exports and the Transactions feed, so "Bharat's rows"
 * means the same rows in every one of them.
 *
 * Pure: strings in, query filters out. No models, no database.
 */
import { ValidationError } from '../../shared/errors/applicationError.js';

// The rows no member of staff made: kiosk charges and parents' own payments.
export const NO_STAFF = 'none';

const OBJECT_ID = /^[a-f0-9]{24}$/i;

/* What the request asked for. An absent or empty parameter is everyone, which
   is what keeps every existing caller working untouched. A value that is
   neither an admin id nor `none` is refused rather than dropped, for the same
   reason parseIncluded refuses a typo: a silently narrower export is found
   weeks later, a 400 at once. */
export const parseProcessedBy = (value) => {
  if (value === undefined || value === null || String(value).trim() === '') return null;

  const asked = [...new Set(String(value).split(',').map((entry) => entry.trim()).filter(Boolean))];
  const unknown = asked.filter((entry) => entry !== NO_STAFF && !OBJECT_ID.test(entry));
  if (unknown.length) {
    throw new ValidationError([
      { field: 'processedBy', message: `Unknown staff id(s): ${unknown.join(', ')}.` },
    ]);
  }
  if (!asked.length) {
    throw new ValidationError([
      { field: 'processedBy', message: 'Select at least one person to export.' },
    ]);
  }

  return {
    staffIds: asked.filter((entry) => entry !== NO_STAFF).map((entry) => entry.toLowerCase()),
    none: asked.includes(NO_STAFF),
  };
};

/* The collection filters, narrowed to those people.
 *
 * A deposit or a refund carries performedBy; `none` also claims the ones that
 * carry nothing (a parent's UPI top-up) — $in with null matches a missing
 * field as well as an explicit null. A charge never has a person, so it is
 * read only when `none` was asked for. A collection already unselected stays
 * null: this narrows, it never widens. */
export const narrowByProcessedBy = (filters, processedBy) => {
  if (!processedBy) return filters;
  const performers = processedBy.none ? [...processedBy.staffIds, null] : processedBy.staffIds;
  const performed = (filter) => (filter ? { ...filter, performedBy: { $in: performers } } : null);
  return {
    adjustments: performed(filters.adjustments),
    reversals: performed(filters.reversals),
    transactions: processedBy.none ? filters.transactions : null,
  };
};
