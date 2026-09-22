import FulfillmentOrder from '../models/FulfillmentOrder.js';
import OrderingSettings from '../models/OrderingSettings.js';
import PendingOrder from '../models/PendingOrder.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { isDemoParentPhone } from '../config/demoAccess.js';
import { businessPeriodStart } from './businessTime.js';
import { isTestAccountStudent } from './testAccount.js';

/* One order per student per business week.
 *
 * Lifted on 2026-08-15 (d83767e) and brought back on 2026-09-22 as a super
 * admin's switch rather than the unique index it used to be, so it can be
 * turned off again without a deploy. server.js still drops that old index on
 * boot: the rule lives here now, and the index would refuse orders even with
 * the switch off.
 *
 * What uses up the week:
 *  - a package charged since Sunday midnight in the business time zone (the
 *    same boundary as the parent's weekly spending limit) that has not been
 *    cancelled. A deleted charge leaves its package alone, so it still counts
 *    until the package is cancelled too;
 *  - an order still waiting on its parent or caretaker, whenever it was raised.
 *    Declined and expired ones free the student.
 *
 * Asked where an order is raised (so the kiosk says no while the student is
 * there) and again where money moves (so nothing slips past between the two).
 *
 * Test-account students and the showroom family are exempt, as they are from
 * the other kiosk limits: both have to be able to order again and again. */

export const WEEKLY_ORDER_CODE = 'WEEKLY_ORDER_LIMIT';

export const oneOrderPerWeekOn = async ({ session = null } = {}) => {
  const query = OrderingSettings.findOne({ key: 'ordering' }).select('oneOrderPerWeek').lean();
  const row = session ? await query.session(session) : await query;
  return row?.oneOrderPerWeek !== false;
};

const refusal = (student, message) => ({
  ok: false,
  status: 409,
  code: WEEKLY_ORDER_CODE,
  message: message ?? `${student.name} has already ordered this week. The next order can be placed from Sunday.`,
});

/* student must be a loaded row carrying _id, name and parentPhoneNumber.
   excludePendingOrderId is the waiting order being paid for right now, which
   must not count against itself. */
export const checkWeeklyOrderLimit = async ({
  student,
  session = null,
  excludePendingOrderId = null,
  now = new Date(),
}) => {
  if (isDemoParentPhone(student.parentPhoneNumber)) return { ok: true };
  if (!(await oneOrderPerWeekOn({ session }))) return { ok: true };
  if (await isTestAccountStudent(student, { session })) return { ok: true };

  const packageQuery = FulfillmentOrder.exists({
    studentId: student._id,
    orderedAt: { $gte: businessPeriodStart('WEEKLY', now) },
    status: { $ne: OrderStatus.CANCELLED },
  });
  if (await (session ? packageQuery.session(session) : packageQuery)) {
    return refusal(student);
  }

  const waitingQuery = PendingOrder.exists({
    studentId: student._id,
    status: { $in: ['PENDING', 'PROCESSING'] },
    expiresAt: { $gt: now },
    ...(excludePendingOrderId ? { _id: { $ne: excludePendingOrderId } } : {}),
  });
  if (await (session ? waitingQuery.session(session) : waitingQuery)) {
    return refusal(student, `${student.name} already has an order waiting for approval this week.`);
  }

  return { ok: true };
};
