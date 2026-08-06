// Currency was hand-built as `₹{amount}` at every call site, so large balances
// printed as ₹6950 with no grouping. Intl gives the lakh/crore grouping Indian
// users expect (₹1,20,000 rather than ₹120,000).
// Whole amounts print without decimals; fractional ones keep their paise
// rather than silently rounding (purchase prices can be ₹12.50).
const whole = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const paise = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export const formatINR = (amount) => {
  const n = Number(amount) || 0;
  return Number.isInteger(n) ? whole.format(n) : paise.format(n);
};
