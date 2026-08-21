/* Bringing every shelf to one opening figure.
 *
 * Works in deltas rather than writing the number straight in, because the
 * Inventory count is meant to stay derivable — goods receipts in, sales out,
 * StockAdjustment rows for everything else. A script that set `stock` directly
 * would leave a shelf whose number no ledger explains, which is the one thing
 * the adjustment table exists to prevent. Each delta below becomes a row naming
 * who set it and why; StockAdjustment's own comment lists opening stock as the
 * case it was built for. */

export const planOpeningStock = ({ products, shelves, target }) => {
  if (!Number.isInteger(target) || target < 0) {
    throw new Error('Opening stock must be a whole number of zero or more.');
  }

  const stockByProduct = new Map(
    (shelves || []).map((row) => [String(row.productId), row.stock])
  );

  return (products || [])
    // `!== false` rather than truthiness: rows written before the field carry
    // no flag and are on sale, the same reading every other filter uses.
    .filter((product) => product.active !== false)
    .map((product) => {
      // A product with no shelf row reads as empty here exactly as it does on
      // every screen — only possible for rows older than the shelf backfill.
      const from = Number(stockByProduct.get(String(product._id)) ?? 0);

      return {
        productId: product._id,
        name: product.name,
        from,
        to: target,
        delta: target - from,
      };
    })
    // A zero delta is not a movement. StockAdjustment refuses one outright, and
    // a ledger row saying nothing happened is worse than no row at all.
    .filter((entry) => entry.delta !== 0);
};
