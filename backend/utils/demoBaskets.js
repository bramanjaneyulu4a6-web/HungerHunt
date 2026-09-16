/* The five baskets the showroom family cycles through.
 *
 * A student may hold only one open request at a time — PendingOrder's
 * one_pending_order_per_student index, which is what stops an ignored request
 * locking a child out of the counter — so the five orders cannot all wait at
 * once. They rotate instead: one basket waits, and when its package is
 * collected the reset seeds the next one. A visitor still sees five different
 * orders go through the process, one after another.
 *
 * The list is derived from the live catalogue rather than written down here.
 * Hardcoded product names would be a second catalogue to maintain, and would
 * break the demo silently the day one of them was renamed or taken off the
 * kiosk — which is exactly the kind of edit that happens without anyone
 * thinking about a demo account. Deriving it means the baskets are always
 * things a visitor could really buy.
 *
 * Deterministic, because the seeder and the reset must agree on what "the next
 * basket" is without storing an index anywhere. Given the same catalogue both
 * compute the same five baskets in the same order. If the catalogue changes
 * under a running demo the rotation simply re-derives; the worst case is a
 * visitor seeing the sequence jump, which costs nothing.
 */

export const DEMO_BASKET_COUNT = 5;

/* Two lines each, striding through the catalogue so no two baskets share a
   product, with alternating quantities so the totals differ visibly. Sorted by
   name first: the caller's query order is not a promise, and two processes
   deriving different baskets from the same shelf would break the rotation. */
export const buildDemoBaskets = (products) => {
  const catalogue = [...products]
    .filter((product) => product?._id && Number.isFinite(product.price))
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));

  if (catalogue.length < 2) return [];

  return Array.from({ length: DEMO_BASKET_COUNT }, (_, index) => {
    const lines = [
      { product: catalogue[(index * 2) % catalogue.length], quantity: 1 },
      { product: catalogue[(index * 2 + 1) % catalogue.length], quantity: index % 2 ? 2 : 1 },
    ];

    const items = lines.map(({ product, quantity }) => ({
      productId: product._id,
      name: product.name,
      quantity,
      price: product.price,
    }));

    return {
      items,
      totalAmount: items.reduce((sum, item) => sum + item.price * item.quantity, 0),
    };
  });
};

// The products in a basket, as a stable string, so two baskets can be compared
// without caring what order their lines were written in.
const fingerprint = (items = []) =>
  [...items]
    .map((item) => `${String(item.productId)}x${item.quantity}`)
    .sort()
    .join('|');

/* Which basket follows the one just completed. Matching on contents rather
   than a stored counter keeps the rotation stateless — there is no index to
   drift, and no field on a row that means nothing to anything else.

   An unrecognised basket starts the cycle again. That covers the first ever
   order, an order rung up some other way, and a catalogue that changed under
   the demo — none of which should leave a visitor with no basket at all. */
export const nextBasketAfter = (items, baskets) => {
  if (!baskets?.length) return null;

  const current = fingerprint(items);
  const at = baskets.findIndex((basket) => fingerprint(basket.items) === current);

  return baskets[at === -1 ? 0 : (at + 1) % baskets.length];
};
