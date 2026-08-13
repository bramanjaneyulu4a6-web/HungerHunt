import { businessDateStart } from '../../../utils/businessTime.js';
import { ValidationError } from '../errors/applicationError.js';

/* Date-only bounds are read in the configured business timezone and the
   through-date is inclusive, because a report asked for "the 13th" means the
   school's 13th and means all of it. A full timestamp is taken as given, for
   callers that want an exact instant. */

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

const followingDate = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

export const parseBusinessDateRange = (query, { maxDays }) => {
  const timeZone = process.env.BUSINESS_TIME_ZONE || 'Asia/Kolkata';
  let from;
  let to;

  try {
    from = DATE_ONLY.test(query.from) ? businessDateStart(query.from, timeZone) : new Date(query.from);
    to = DATE_ONLY.test(query.to)
      ? businessDateStart(followingDate(query.to), timeZone)
      : new Date(query.to);
  } catch {
    from = new Date(Number.NaN);
    to = new Date(Number.NaN);
  }

  if (!query.from || !query.to || Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new ValidationError([{ field: 'from/to', message: 'Both must be ISO-8601 dates or timestamps.' }]);
  }

  if (to <= from || to - from > maxDays * 24 * 60 * 60 * 1_000) {
    throw new ValidationError([
      { field: 'from/to', message: `Range must be positive and no longer than ${maxDays} days.` },
    ]);
  }

  return { from, to, timeZone };
};
