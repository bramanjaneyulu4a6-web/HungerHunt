/* Whether an inventory row belongs on the kiosk menu.
 *
 * The backend now says so itself via `availability` — LOW is deliberately
 * still sellable; only OUT_OF_STOCK and ARCHIVED are off sale. The legacy
 * stock>0 && not-archived check remains as the fallback for a deployed
 * backend that predates the field, and is the same rule by construction. */
export const sellable = (row) => {
  if (!row?.productId) return false;

  if (row.availability) {
    return row.availability === "AVAILABLE" || row.availability === "LOW";
  }

  // Legacy path, no availability field sent: active === false is off sale;
  // an absent active field predates the flag and means active.
  return row.stock > 0 && row.productId.active !== false;
};
