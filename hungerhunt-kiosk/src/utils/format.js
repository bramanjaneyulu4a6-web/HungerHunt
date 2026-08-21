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

// A pack size and its unit are stored apart — 250 on the product, "ml" on the
// unit it references — and neither means anything alone. Joined here so every
// screen says "250 ml" the same way, and so the one rule that matters lives in
// one place: a product with no recorded size prints nothing at all, never
// "0 ml", because an unmeasured packet and an empty one are different claims.
export const formatPackSize = (size, unitSymbol) => {
  const n = Number(size);
  const symbol = String(unitSymbol ?? '').trim();

  if (!Number.isFinite(n) || n <= 0 || !symbol) return '';

  return `${n} ${symbol}`;
};
