/* The periods a per-student cap is counted over, with the words the console
 * shows for them — shared by the category and sub-category cap editor and
 * the Products page. */
export const LIMIT_PERIODS = [
  ['DAILY', 'per day'],
  ['WEEKLY', 'per week'],
  ['MONTHLY', 'per month'],
  ['TOTAL', 'ever'],
];

// "2 per week", or '' for no cap. The same words the product table uses.
export const capLabel = (limit) => {
  if (!limit?.enabled) return '';
  const period = LIMIT_PERIODS.find(([value]) => value === limit.period);
  return `${limit.quantity} ${period ? period[1] : 'per week'}`;
};
