import mongoose from 'mongoose';
import Transaction from '../models/Transaction.js';
import WalletReversal from '../models/WalletReversal.js';
import PendingOrder from '../models/PendingOrder.js';
import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';
import { normalizeSubCategory } from './productSubcategory.js';
import { businessPeriodStart } from './businessTime.js';
import { isTestAccountStudent } from './testAccount.js';
import { isDemoStudent } from './demoAccount.js';

/* Purchase limits: how many units a single student may buy in a period — of
 * one product, of a whole category, or of one sub-category of a category.
 *
 * Every cap that covers a product applies, and the strictest binds: Blue Lays
 * at 3 a week inside Salty Snacks at 2 a week can be bought twice. A category
 * or sub-category cap counts the student's total across all its products, in
 * any mix, so the two Salty Snacks may be one Blue Lays and one Kurkure.
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
export const limitOf = (product) => {
  const limit = product?.purchaseLimit;

  if (!limit?.enabled) return null;

  const quantity = Number(limit.quantity);

  if (!Number.isFinite(quantity) || quantity < 0) return null;

  return { quantity, period: limit.period || 'DAILY' };
};

const asObjectId = (value) =>
  mongoose.Types.ObjectId.isValid(value) ? new mongoose.Types.ObjectId(value) : value;

const withSession = (query, session) => (session ? query.session(session) : query);

// A product's category id, whether stockGroup arrived populated or as an id.
const groupIdOf = (product) => {
  const group = product?.stockGroup;
  if (!group) return null;
  return String(group._id ?? group);
};

const subCategoryOf = (product) => normalizeSubCategory(product?.subCategory);

/* The category and sub-category caps over these products' categories, as
 * { key, type, name, groupId, subCategory, quantity, period }. subCategory is
 * null for a whole-category cap. */
const loadGroupCaps = async (products, session) => {
  const groupIds = [...new Set(products.map(groupIdOf).filter(Boolean))];
  if (groupIds.length === 0) return [];

  const groups = await withSession(
    StockGroup.find({ _id: { $in: groupIds.map(asObjectId) } })
      .select('name purchaseLimit subCategoryLimits')
      .lean(),
    session
  );
  const caps = [];

  for (const group of groups) {
    const groupId = String(group._id);
    const own = limitOf(group);

    if (own) {
      caps.push({ key: `category:${groupId}`, type: 'CATEGORY', name: group.name, groupId, subCategory: null, ...own });
    }

    for (const entry of group.subCategoryLimits || []) {
      const limit = limitOf({ purchaseLimit: entry });
      if (!limit) continue;
      const subCategory = normalizeSubCategory(entry.name);
      caps.push({
        key: `subcategory:${groupId}:${subCategory}`,
        type: 'SUBCATEGORY',
        name: subCategory,
        groupId,
        subCategory,
        ...limit,
      });
    }
  }

  return caps;
};

const capCovers = (cap, product) =>
  groupIdOf(product) === cap.groupId &&
  (cap.subCategory === null || subCategoryOf(product) === cap.subCategory);

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
  const match = {
    studentId: asObjectId(studentId),
    'items.productId': { $in: productIds.map(asObjectId) },
  };

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

/* Open parent-approval requests reserve their quantities too. Without this a
 * student could fill the same weekly allowance again while the first basket
 * was waiting for an answer. The request being approved is excluded from its
 * own final charge, otherwise its lines would be counted once as pending and
 * once as the cart currently being checked. */
const pendingQuantities = async ({
  studentId,
  productIds,
  session,
  now,
  excludePendingOrderId = null,
}) => {
  const match = {
    studentId: asObjectId(studentId),
    $or: [
      { status: 'PENDING', expiresAt: { $gt: now } },
      { status: 'PROCESSING' },
    ],
    'items.productId': { $in: productIds.map(asObjectId) },
  };

  if (excludePendingOrderId) match._id = { $ne: asObjectId(excludePendingOrderId) };

  const query = PendingOrder.aggregate([
    { $match: match },
    { $unwind: '$items' },
    { $match: { 'items.productId': { $in: productIds.map(asObjectId) } } },
    { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } },
  ]);
  const rows = session ? await query.session(session) : await query;

  return new Map(rows.map((row) => [String(row._id), Number(row.quantity) || 0]));
};

/* What a category or sub-category cap has used: every unit bought in its
 * period, and every unit waiting in an open request, across all the products
 * it covers — archived ones included, since what was bought was bought. A
 * product's current category decides, so moving a product moves its history
 * with it. */
const capUsage = async ({ cap, studentId, session, now, excludePendingOrderId }) => {
  const filter = { stockGroup: asObjectId(cap.groupId) };
  if (cap.subCategory !== null) filter.subCategory = cap.subCategory;

  const productIds = await withSession(Product.find(filter).distinct('_id'), session);
  if (productIds.length === 0) return { purchased: 0, pending: 0 };

  const [bought, waiting] = await Promise.all([
    purchasedInPeriod({ studentId, productIds, since: periodStart(cap.period, now), session }),
    pendingQuantities({ studentId, productIds, session, now, excludePendingOrderId }),
  ]);
  const sum = (map) => [...map.values()].reduce((total, value) => total + value, 0);

  return { purchased: sum(bought), pending: sum(waiting) };
};

/* The catalogue needs the same answer as checkout so it can stop the invalid
 * action at the Add/+ button instead of allowing a basket that can only fail.
 * Values are the number of additional units the current basket may contain;
 * the kiosk compares that ceiling with the quantity already in its cart. */
export const getPurchaseAllowances = async ({
  studentId,
  products,
  session = null,
  now = new Date(),
  excludePendingOrderId = null,
  student = null,
}) => {
  const result = new Map();
  if (!products?.length) return result;

  const limited = products
    .map((product) => ({ product, limit: limitOf(product) }))
    .filter((entry) => entry.limit);
  const caps = (await loadGroupCaps(products, session))
    .filter((cap) => products.some((product) => capCovers(cap, product)));

  if (limited.length === 0 && caps.length === 0) return result;

  // The PhonePe reviewer's children shop without limits, so that a review can
  // place order after order without waiting for a business week to turn over.
  // An empty map reads as "nothing is limited" to every caller — the kiosk
  // draws no counters and checkPurchaseLimits finds nothing to refuse — which
  // is why the bypass lives here and not in each of them.
  //
  // The demo account is exempt for a different reason: a visitor trying the
  // kiosk must never be told they have reached a cap belonging to a child who
  // does not exist. Same empty map, same silence at every caller.
  if (await isTestAccountStudent(student ?? studentId, { session })) return result;
  if (await isDemoStudent(student ?? studentId, { session })) return result;

  // Each product's own cap, counted per product.
  const productCaps = new Map();

  if (limited.length) {
    const pending = await pendingQuantities({
      studentId,
      productIds: limited.map(({ product }) => product._id),
      session,
      now,
      excludePendingOrderId,
    });
    const byPeriod = new Map();

    for (const entry of limited) {
      const group = byPeriod.get(entry.limit.period);
      if (group) group.push(entry);
      else byPeriod.set(entry.limit.period, [entry]);
    }

    for (const [period, group] of byPeriod) {
      const purchased = await purchasedInPeriod({
        studentId,
        productIds: group.map(({ product }) => product._id),
        since: periodStart(period, now),
        session,
      });

      for (const { product, limit } of group) {
        const key = String(product._id);
        const bought = purchased.get(key) || 0;
        const awaitingApproval = pending.get(key) || 0;

        productCaps.set(key, {
          type: 'PRODUCT',
          name: product.name,
          quantity: limit.quantity,
          period,
          purchased: bought,
          pending: awaitingApproval,
          remaining: Math.max(0, limit.quantity - bought - awaitingApproval),
        });
      }
    }
  }

  // Each category and sub-category cap, counted once across its products.
  const groupCaps = await Promise.all(
    caps.map(async (cap) => {
      const used = await capUsage({ cap, studentId, session, now, excludePendingOrderId });
      return {
        key: cap.key,
        type: cap.type,
        name: cap.name,
        quantity: cap.quantity,
        period: cap.period,
        purchased: used.purchased,
        pending: used.pending,
        remaining: Math.max(0, cap.quantity - used.purchased - used.pending),
        covers: (product) => capCovers(cap, product),
      };
    })
  );

  for (const product of products) {
    const key = String(product._id);
    const own = productCaps.get(key) || null;
    const shared = groupCaps.filter((cap) => cap.covers(product)).map(({ covers: _covers, ...cap }) => cap);

    if (!own && shared.length === 0) continue;

    // The strictest cap is the one the student meets first; it is also the
    // one the kiosk names. On a tie the product's own cap is named.
    const binding = [own, ...shared]
      .filter(Boolean)
      .reduce((best, cap) => (cap.remaining < best.remaining ? cap : best));

    result.set(key, {
      enabled: true,
      quantity: binding.quantity,
      period: binding.period,
      purchased: binding.purchased,
      pending: binding.pending,
      remaining: binding.remaining,
      // Which cap the figures above belong to: PRODUCT, CATEGORY or
      // SUBCATEGORY, and its name.
      scope: { type: binding.type, name: binding.name },
      // Every cap in play. A category or sub-category cap is shared by the
      // whole cart, so the kiosk needs each one's key and remaining to stop
      // two products together going over it.
      product: own,
      caps: shared,
    });
  }

  return result;
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
const usedText = (cap) =>
  cap.pending > 0
    ? `${cap.purchased} bought and ${cap.pending} awaiting parent approval`
    : `${cap.purchased} already bought`;

const refusal = (subject, cap) => {
  const label = purchaseLimitPeriodLabel(cap.period);
  return {
    ok: false,
    status: 400,
    code: 'PRODUCT_LIMIT',
    scope: { type: cap.type, name: cap.name },
    message:
      cap.remaining === 0
        ? `${subject} limited to ${cap.quantity} per ${label}; ${usedText(cap)}. None can be added.`
        : `${subject} limited to ${cap.quantity} per ${label}; ${usedText(cap)}, ` +
          `so only ${cap.remaining} more can be added.`,
  };
};

export const checkPurchaseLimits = async ({
  studentId,
  entries,
  session = null,
  now = new Date(),
  excludePendingOrderId = null,
  student = null,
}) => {
  // One cart can name the same product on two lines; the limit applies to the
  // total being bought, not to whichever line is looked at first.
  const wanted = new Map();

  for (const { product, quantity } of entries) {
    const key = String(product._id);
    const seen = wanted.get(key);

    if (seen) {
      seen.quantity += Number(quantity);
    } else {
      wanted.set(key, { product, quantity: Number(quantity) });
    }
  }

  if (wanted.size === 0) return { ok: true };

  const allowances = await getPurchaseAllowances({
    studentId,
    products: [...wanted.values()].map(({ product }) => product),
    session,
    now,
    excludePendingOrderId,
    student,
  });

  // A product's own cap, line by line.
  for (const entry of wanted.values()) {
    const own = allowances.get(String(entry.product._id))?.product;
    if (own && entry.quantity > own.remaining) return refusal(`${entry.product.name} is`, own);
  }

  // A category or sub-category cap, against everything in the cart it covers.
  const shared = new Map();

  for (const entry of wanted.values()) {
    for (const cap of allowances.get(String(entry.product._id))?.caps || []) {
      const total = shared.get(cap.key);
      if (total) total.quantity += entry.quantity;
      else shared.set(cap.key, { cap, quantity: entry.quantity });
    }
  }

  for (const { cap, quantity } of shared.values()) {
    if (quantity > cap.remaining) return refusal(`Items from ${cap.name} are`, cap);
  }

  return { ok: true };
};

/* Products whose category the office has switched off. Asked by every way of
 * buying — the till, raising a request and approving one — before any cap:
 * a switched-off category is not for sale at all, to anyone, test accounts
 * included. Returns the first such product, or null. */
export const productInClosedCategory = async (products, session = null) => {
  const groupIds = [...new Set(products.map(groupIdOf).filter(Boolean))];
  if (groupIds.length === 0) return null;

  const closed = await withSession(
    StockGroup.find({ _id: { $in: groupIds.map(asObjectId) }, active: false }).select('_id').lean(),
    session
  );
  if (closed.length === 0) return null;

  const closedIds = new Set(closed.map((group) => String(group._id)));
  return products.find((product) => closedIds.has(groupIdOf(product))) || null;
};

export const CLOSED_CATEGORY_MESSAGE = (product) => `${product.name} is not available right now.`;
