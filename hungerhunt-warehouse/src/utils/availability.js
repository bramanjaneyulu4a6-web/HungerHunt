/* Mirror of backend/utils/availability.js — the one availability rule.
 *
 * The backend sends `availability` on every inventory and product row;
 * screens read that. This local copy exists only as a fallback for a
 * deployed backend that predates the field. Change one, change all of them.
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

/* Availability for a row from either list endpoint: an inventory row
 * ({ productId, stock }) or a product row (the product itself, carrying
 * stock). Prefers the server's word; computes only when it can. When stock
 * itself is unknown — a stale /products response — the answer is null, and
 * a screen must render no availability state rather than guess "out of
 * stock" off a missing field.
 *
 * Which shape a row is, is decided by whether it *has* a productId key, not
 * by whether that key is truthy: an inventory row whose product was deleted
 * carries productId: null, and `row.productId ?? row` would hand the row
 * itself to the rule and call an unlinked shelf AVAILABLE. */
export const resolveAvailability = (row) => {
  if (!row) return null;
  if (row.availability) return row.availability;
  if (typeof row.stock !== "number") return null;

  const isInventoryRow = Object.prototype.hasOwnProperty.call(row, "productId");
  return availabilityOf(isInventoryRow ? row.productId : row, row.stock);
};
