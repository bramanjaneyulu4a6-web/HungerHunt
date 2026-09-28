/* Purchase orders arrive newest first today, but sorting here keeps the form
 * correct if the endpoint's presentation order changes later. Zero means no
 * rate was recorded, so it must not replace the blank that asks an admin to
 * enter a real supplier price. */
export const lastUsedPurchaseRates = (orders = []) => {
  const newest = [...orders].sort((a, b) =>
    new Date(b.submittedAt || b.createdAt || 0) - new Date(a.submittedAt || a.createdAt || 0)
  );
  const rates = new Map();

  for (const order of newest) {
    for (const item of order.items || []) {
      const productId = String(item.productId?._id ?? item.productId ?? '');
      const rate = Number(item.estimatedUnitCost ?? item.purchasePrice);
      if (productId && !rates.has(productId) && Number.isFinite(rate) && rate > 0) {
        rates.set(productId, rate);
      }
    }
  }

  return rates;
};
