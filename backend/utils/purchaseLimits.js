import Transaction from '../models/Transaction.js';
import WalletReversal from '../models/WalletReversal.js';
import { businessPeriodStart } from './businessTime.js';

/* Per-product purchase limits: how many units of one product a single student
 * may buy in a period.
 *
 * This is a different question from walletControl, which caps rupees across
 * the whole basket, and both are asked on every sale. A student inside their
 * spending limit can still be refused a fourth chocolate, and a student on
 * their first chocolate can still be refused for being out of money.
 *
 * It lives beside chargeCart rather than inside a controller because both ways
 * of spending — the till billing at the counter and a parent approving a
 * request — have to count the same way. A limit only one route enforces is not
 * a limit.
 */

const PERIOD_LABELS = {
  DAILY: 'day',
  WEEKLY: 'week',
  MONTHLY: 'month',
  TOTAL: 'in total',
};

export const purchaseLimitPeriodLabel = (period) => PERIOD_LABELS[period] || 'day';

// TOTAL counts over the student's whole history, so it has no start. The rest
// go through businessPeriodStart, which turns days over at midnight in the
// configured business zone — the same boundary walletControl already uses, so
// a student is not told two different stories about when "today" began.
const periodStart = (period, now) => (period === 'TOTAL' ? null : businessPeriodStart(period, now));

// Absent purchaseLimit reads as no limit: rows written before the field
// carry nothing, and a disabled switch must behave identically to never
// having been configured. A quantity of 0 with the switch on is a real
// setting — "students may not buy this" — so it is not treated as unset.
const limitOf = (product) => {
  const limit = product?.purchaseLimit;

  if (!limit?.enabled) return null;

  const quantity = Number(limit.quantity);

  if (!Number.isFinite(quantity) || quantity < 0) return null;

  return { quantity, period: limit.period || 'DAILY' };
};

/* Units of each product the student has already bought in one period.
 *
 * Cancelled orders do not count. A cancellation restores the whole
 * transaction — every line, the full amount, one reversal per transaction —
 * so the honest sum is over transactions that were never reversed, rather
 * than a gross total with reversed quantities subtracted afterwards.
 *
 * That distinction matters at a period edge: something bought yesterday and
 * cancelled today is already outside today's window, and subtracting it a
 * second time would hand the student units they never spent.
 */
const purchasedInPeriod = async ({ studentId, productIds, since, session }) => {
  const match = { studentId, 'items.productId': { $in: productIds } };

  if (since) match.createdAt = { $gte: since };

  const query = Transaction.aggregate([
    { $match: match },
    {
      $lookup: {
        from: WalletReversal.collection.name,
        localField: '_id',
        foreignField: 'transactionId',
        as: 'reversals',
      },
    },
    { $match: { 'reversals.0': { $exists: false } } },
    { $unwind: '$items' },
    { $match: { 'items.productId': { $in: productIds } } },
    { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } },
  ]);

  const rows = session ? await query.session(session) : await query;

  return new Map(rows.map((row) => [String(row._id), Number(row.quantity) || 0]));
};

/* Checks a priced cart against every limit its products carry.
 *
 * `entries` are { product, quantity } pairs with the product hydrated — the
 * callers all have it already, and re-reading the catalogue here would let
 * the limit be judged against a different row than the price was.
 *
 * Returns { ok: true } or { ok: false, status, message }, matching chargeCart
 * so a caller decides what an HTTP response looks like.
 */
export const checkPurchaseLimits = async ({ studentId, entries, session = null, now = new Date() }) => {
  // One cart can name the same product on two lines; the limit applies to the
  // total being bought, not to whichever line is looked at first.
  const wanted = new Map();

  for (const { product, quantity } of entries) {
    const limit = limitOf(product);

    if (!limit) continue;

    const key = String(product._id);
    const seen = wanted.get(key);

    if (seen) {
      seen.quantity += Number(quantity);
    } else {
      wanted.set(key, { product, limit, quantity: Number(quantity) });
    }
  }

  if (wanted.size === 0) return { ok: true };

  // Products sharing a period share a query — in practice everything is
  // DAILY, so this is usually one round trip however large the cart.
  const byPeriod = new Map();

  for (const entry of wanted.values()) {
    const group = byPeriod.get(entry.limit.period);

    if (group) group.push(entry);
    else byPeriod.set(entry.limit.period, [entry]);
  }

  for (const [period, group] of byPeriod) {
    const purchased = await purchasedInPeriod({
      studentId,
      productIds: group.map((entry) => entry.product._id),
      since: periodStart(period, now),
      session,
    });

    for (const entry of group) {
      const already = purchased.get(String(entry.product._id)) || 0;
      const remaining = Math.max(0, entry.limit.quantity - already);

      if (already + entry.quantity > entry.limit.quantity) {
        const label = purchaseLimitPeriodLabel(period);

        return {
          ok: false,
          status: 400,
          code: 'PRODUCT_LIMIT',
          message:
            remaining === 0
              ? `${entry.product.name} is limited to ${entry.limit.quantity} per ${label}` +
                ` and ${already} have already been bought. None can be added.`
              : `${entry.product.name} is limited to ${entry.limit.quantity} per ${label}.` +
                ` ${already} already bought, so only ${remaining} more can be added.`,
        };
      }
    }
  }

  return { ok: true };
};
