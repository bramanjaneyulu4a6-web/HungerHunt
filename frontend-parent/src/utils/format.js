// Currency was hand-built as `₹{amount}` at every call site, so large balances
// printed as ₹6950 with no grouping. Intl gives the lakh/crore grouping Indian
// users expect (₹1,20,000 rather than ₹120,000).
const inr = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

export const formatINR = (amount) => inr.format(Number(amount) || 0);
