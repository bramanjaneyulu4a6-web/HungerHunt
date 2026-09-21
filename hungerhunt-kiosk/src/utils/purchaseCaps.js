/* The kiosk's side of purchase limits: how many more of a product the cart may
 * take, and what to tell the student when it may not. The server's answer
 * (GET /inventory purchaseAllowance, backend utils/purchaseLimits.js) is the
 * one that binds at checkout; this only stops the tap that could only fail.
 */

// A cleared quantity box bills as 1, so it counts as 1 against a cap too.
const lineQuantity = (line) => parseInt(line?.quantity, 10) || 1;

/* Every cap on this product that still has a say, with `left`: how many more
 * of it this cart may take. A product's own cap is its own business. A
 * category or sub-category cap is shared — Salty Snacks at 2 a week covers
 * Blue Lays and Kurkure together — so the other lines in the cart under the
 * same cap use it up too (backend utils/purchaseLimits.js).
 *
 * An allowance from a server that predates shared caps carries no `caps`, and
 * reads as the single product cap it always was. */
export const capsInPlay = (product, cart = []) => {
  const allowance = product?.purchaseAllowance;
  if (!allowance?.enabled) return [];

  if (!Array.isArray(allowance.caps)) {
    return [{ ...allowance, type: "PRODUCT", name: product.name, left: Math.max(0, Number(allowance.remaining) || 0) }];
  }

  const caps = allowance.product
    ? [{ ...allowance.product, left: Math.max(0, Number(allowance.product.remaining) || 0) }]
    : [];

  for (const cap of allowance.caps) {
    const others = cart
      .filter((line) => line._id !== product._id && line.purchaseAllowance?.caps?.some((shared) => shared.key === cap.key))
      .reduce((total, line) => total + lineQuantity(line), 0);
    caps.push({ ...cap, others, left: Math.max(0, (Number(cap.remaining) || 0) - others) });
  }

  return caps;
};

// The cap the student meets first — the one that decides, and the one named.
export const bindingCap = (product, cart = []) =>
  capsInPlay(product, cart).reduce((best, cap) => (!best || cap.left < best.left ? cap : best), null);

export const allowanceCeiling = (product, cart = []) => bindingCap(product, cart)?.left ?? Number.POSITIVE_INFINITY;

export const allowancePeriod = (period) => ({
  DAILY: "daily",
  WEEKLY: "weekly",
  MONTHLY: "monthly",
  TOTAL: "total",
}[period] || "purchase");

export const limitMessage = (product, cart = []) => {
  const cap = bindingCap(product, cart);
  if (!cap) return "This item cannot be added.";
  const period = allowancePeriod(cap.period);
  const whose = cap.type === "CATEGORY" || cap.type === "SUBCATEGORY"
    ? `Your ${period} ${cap.name} limit`
    : `${product.name}'s ${period} limit`;
  if (cap.pending > 0) return `${whose} includes ${cap.pending} awaiting parent approval.`;
  if (cap.others > 0) return `${whose} is used up by what is already in your cart.`;
  return `${whose} has been reached.`;
};

// The tile's line under the price: what is left, and of which limit.
export const limitLine = (product, cart = []) => {
  const cap = bindingCap(product, cart);
  if (!cap) return "";
  const period = allowancePeriod(cap.period);
  const which = cap.type === "CATEGORY" || cap.type === "SUBCATEGORY" ? `${period} ${cap.name}` : period;
  return cap.left < 1 ? `${which} limit reached` : `${cap.left} left in your ${which} limit`;
};
