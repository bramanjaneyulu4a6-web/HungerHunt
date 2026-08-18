/* The single definition of what a stock number means for sale.
 *
 * Derived on read, everywhere, on purpose: `active` stays the office's
 * manual archive flag and is never written by automation, so a delivery
 * cannot un-archive a product and a sale cannot archive one. A product at
 * zero simply *is* out of stock until a receipt or adjustment says
 * otherwise — no flag to maintain, no repair job when a write path forgets.
 *
 * ARCHIVED      active === false (or no product row at all) — manual, wins
 * OUT_OF_STOCK  nothing on the shelf — off sale automatically
 * LOW           below the reorder level (strictly: "the level below which")
 * AVAILABLE     otherwise
 *
 * The frontends carry an identical copy as a fallback for a backend that
 * predates the `availability` field. Change one, change all of them.
 */
export const availabilityOf = (product, stock) => {
  if (!product || product.active === false) return "ARCHIVED";

  const onShelf = Number(stock) || 0;
  if (onShelf <= 0) return "OUT_OF_STOCK";

  // 5 is the model default; 0 means "never flag".
  const reorderLevel = Number(product.reorderLevel ?? 5);
  if (reorderLevel > 0 && onShelf < reorderLevel) return "LOW";

  return "AVAILABLE";
};
