import { OrderStatus } from './orderState.js';

/* A package that is still owed to a student. DELIVERED and CANCELLED are the
   two ways a package stops being work, so everything else is open — written
   as the complement rather than a hand-kept list, so a new intermediate state
   is counted as open the moment it exists instead of silently escaping alerts. */
export const OPEN_STATUSES = Object.freeze(
  Object.values(OrderStatus).filter(
    (status) => status !== OrderStatus.DELIVERED && status !== OrderStatus.CANCELLED
  )
);

/* How long one acknowledgement quiets a package for.
 *
 * The alert list is what the storeroom reads; nothing is pushed to a device.
 * The spam this prevents is therefore the screen kind: a package that missed
 * its deadline stays overdue until it is delivered, so without this it would
 * head the board every time anyone opened it, for as long as it took — and a
 * warning that is always on is one nobody reads.
 *
 * Twelve hours is chosen against the 48-hour delivery window: short enough
 * that a package cannot be quieted for the rest of its life in one click,
 * long enough that acknowledging it in the morning does not put it back on
 * the board before the same shift has had a chance to act on it. */
export const ALERT_SNOOZE_MS = 12 * 60 * 60 * 1_000;

// Bounds the acknowledgement trail. A 48-hour window and a 12-hour snooze make
// four entries the realistic ceiling; the cap only stops a looping client from
// growing one document without limit.
export const MAX_ACKNOWLEDGEMENTS = 50;

export const isOpenOrder = (status) => OPEN_STATUSES.includes(status);

export const isOverdue = (order, now = new Date()) =>
  isOpenOrder(order.status) && new Date(order.deliverBy).getTime() < now.getTime();

// Acknowledged recently enough that the storeroom has already seen it.
export const alertMuted = (order, now = new Date()) =>
  Boolean(order.alertSnoozedUntil) &&
  new Date(order.alertSnoozedUntil).getTime() > now.getTime();

export const overdueByMinutes = (order, now = new Date()) =>
  Math.max(0, Math.floor((now.getTime() - new Date(order.deliverBy).getTime()) / 60_000));

export const snoozedUntil = (now = new Date()) => new Date(now.getTime() + ALERT_SNOOZE_MS);

/* Splits overdue packages into the ones the board should shout about and the
   ones already acknowledged. The muted count is still reported, so quieting a
   package hides the noise without hiding the fact that it is late. */
export const partitionAlerts = (orders, now = new Date()) => {
  const overdue = orders.filter((order) => isOverdue(order, now));
  const raised = overdue.filter((order) => !alertMuted(order, now));
  return { raised, mutedCount: overdue.length - raised.length };
};
