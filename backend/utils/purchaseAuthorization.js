import crypto from 'node:crypto';

import PurchaseAuthorization from '../models/PurchaseAuthorization.js';

// verifyPayment checks the parent's purchase password and generateBill charges
// the wallet, and until now nothing joined the two: they were separate routes
// that the till happened to call in order. Anyone holding an admin token could
// post the second without the first.
//
// verifyPayment now hands back a token, and generateBill will not charge
// without one. Binding it to the cart as well as the student is what stops a
// password given for a ₹20 snack from paying for a ₹2,000 basket.

// The gap this has to cover is one HTTP round trip: the token is issued after
// the password is accepted, and spent by the request the client sends next.
// Two minutes is many times what that takes, which leaves room for a stalled
// request or a cashier interrupted mid-sale, and is still short enough that a
// token is never sitting around. Length is not doing much security work here —
// single use and the cart binding are — so it is set for the counter.
export const TTL_SECONDS = 120;

// Verify and bill must hash the same cart to the same string, or every sale
// fails. Object key order and line order are both out of the client's control,
// so neither is trusted: each line becomes one "id:quantity" string and the
// list is sorted. Sorting the composed strings rather than the ids alone keeps
// the order settled even if a cart ever carries the same product twice.
export const hashCart = (items) => {
  const canonical = items
    .map((item) => `${String(item.productId)}:${Number(item.quantity)}`)
    .sort()
    .join('|');

  return crypto.createHash('sha256').update(canonical).digest('hex');
};

export const issueAuthorization = async ({ studentId, items }) => {
  const token = crypto.randomBytes(32).toString('hex');

  await PurchaseAuthorization.create({
    token,
    studentId,
    cartHash: hashCart(items),
    expiresAt: new Date(Date.now() + TTL_SECONDS * 1000),
  });

  return token;
};

// Claims the authorisation first and judges it afterwards. Taking the row out
// of the collection is what makes it single use: two requests racing with the
// same token cannot both find it, so a double-tap or a retried request charges
// once. It also means a token presented against the wrong cart is spent rather
// than left to be tried against another one.
//
// Returns a reason rather than a message so the caller decides what a bill
// with no token at all means — which changes on the grace date below.
export const consumeAuthorization = async ({ token, studentId, items }) => {
  if (!token || typeof token !== 'string') return { ok: false, reason: 'missing' };

  const record = await PurchaseAuthorization.findOneAndDelete({ token });

  if (!record) return { ok: false, reason: 'unknown' };
  if (record.expiresAt.getTime() <= Date.now()) return { ok: false, reason: 'expired' };
  if (String(record.studentId) !== String(studentId)) return { ok: false, reason: 'student' };
  if (record.cartHash !== hashCart(items)) return { ok: false, reason: 'cart' };

  return { ok: true };
};

// What the cashier is told. Every one of these ends the same way, because the
// only thing they can do about any of them is ask for the password again.
export const AUTHORIZATION_MESSAGES = {
  missing: 'This charge has not been verified. Please take the purchase password again.',
  unknown: 'That verification has already been used. Please take the purchase password again.',
  expired: 'That verification has expired. Please take the purchase password again.',
  student: 'That verification was for a different student. Please take the purchase password again.',
  cart: 'The cart changed after the purchase password was taken. Please take it again.',
};

// Requiring the token is a breaking change to the contract between the till and
// this server, and the two cannot be deployed as one act: the backend and the
// three frontends ship separately, and the till is a screen that stays open all
// day on a bundle it loaded that morning. A backend that demanded the token
// immediately would fail every sale made from a tab nobody had reloaded.
//
// So a bill arriving with no token at all is still charged until the date
// below, and logged each time it happens. The exposure that leaves open is the
// one that already exists, for a few more days, on a staff-only route — and
// each such bill names itself in the log, so whether any client is still stale
// is something to read rather than guess. Once the log is quiet the window can
// be closed early with PURCHASE_AUTH_GRACE_UNTIL; nothing has to wait for the
// default. A token that *is* presented is checked in full from the first day.
//
// This is the shape utils/tokens.js uses for the same problem: a date that ends
// by itself, not a flag somebody has to remember to turn off.
const DEFAULT_GRACE_UNTIL = '2026-08-21T00:00:00Z';

export const graceUntil = () =>
  new Date(process.env.PURCHASE_AUTH_GRACE_UNTIL || DEFAULT_GRACE_UNTIL);

export const unverifiedBillsAccepted = () => Date.now() < graceUntil().getTime();
