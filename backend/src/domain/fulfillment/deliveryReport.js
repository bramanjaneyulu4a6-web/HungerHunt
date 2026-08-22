import { OrderStatus, orderStatuses } from './orderState.js';
import { isOverdue } from './overdue.js';

// Both states in which the warehouse has handed the package over at the hostel.
const DELIVERED_STATUSES = Object.freeze([OrderStatus.DELIVERED, OrderStatus.COLLECTED]);

/* 1.1 added collection: the counts below stopped being able to say whether a
   delivered package ever reached the student it was for. */
export const DELIVERY_REPORT_SCHEMA_VERSION = '1.1';

/* An operational report, not a staff scorecard and not a customer list.
 *
 * Everything below is a count or a duration. No student name, dorm, item,
 * amount, or staff account leaves this function, which is what lets the report
 * be read by anyone who may run the storeroom without widening what they can
 * see about individual children. The per-package detail already has two homes
 * with narrower audiences: the alert list and the delivery history. */

const HOUR_MS = 3_600_000;

const round = (value, places) => {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
};

const hoursBetween = (from, to) =>
  (new Date(to).getTime() - new Date(from).getTime()) / HOUR_MS;

const median = (sorted) => {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

/* Both an average and a median, because they disagree in the way that matters
   here: one package forgotten over a weekend moves the mean by hours and the
   median not at all, and knowing which of those happened is the difference
   between a process problem and a single missed package. */
const durations = (values) => {
  if (values.length === 0) return { samples: 0, averageHours: null, medianHours: null };
  const sorted = values.slice().sort((a, b) => a - b);
  const total = sorted.reduce((sum, value) => sum + value, 0);
  return {
    samples: sorted.length,
    averageHours: round(total / sorted.length, 2),
    medianHours: round(median(sorted), 2),
  };
};

const emptyCounts = () =>
  Object.fromEntries(orderStatuses.map((status) => [status, 0]));

export const buildDeliveryReport = ({ orders, from, to, now = new Date(), timeZone }) => {
  const byStatus = emptyCounts();

  const orderToPack = [];
  const packToDispatch = [];
  const dispatchToDeliver = [];
  const orderToDeliver = [];
  const deliverToCollect = [];

  let delivered = 0;
  let collected = 0;
  let onTime = 0;
  let late = 0;
  let receiverRecorded = 0;
  let openOverdue = 0;

  for (const order of orders) {
    if (byStatus[order.status] === undefined) byStatus[order.status] = 0;
    byStatus[order.status] += 1;

    if (order.packedAt) orderToPack.push(hoursBetween(order.orderedAt, order.packedAt));
    if (order.packedAt && order.dispatchedAt) {
      packToDispatch.push(hoursBetween(order.packedAt, order.dispatchedAt));
    }
    if (order.dispatchedAt && order.deliveredAt) {
      dispatchToDeliver.push(hoursBetween(order.dispatchedAt, order.deliveredAt));
    }
    if (order.deliveredAt && order.collectedAt) {
      deliverToCollect.push(hoursBetween(order.deliveredAt, order.collectedAt));
    }

    /* Delivery is measured at the hostel door, so a package the student has
       since collected is still a delivered package — it must be counted here
       too, or every on-time delivery would quietly leave the numerator the
       moment its student turned up for it. */
    if (DELIVERED_STATUSES.includes(order.status) && order.deliveredAt) {
      delivered += 1;
      if (order.status === OrderStatus.COLLECTED) collected += 1;
      orderToDeliver.push(hoursBetween(order.orderedAt, order.deliveredAt));

      if (new Date(order.deliveredAt).getTime() <= new Date(order.deliverBy).getTime()) {
        onTime += 1;
      } else {
        late += 1;
      }

      // Rows delivered before the receiver note was required have none, and
      // that gap is reported rather than counted as compliance.
      if (order.proofOfDelivery?.receivedBy) receiverRecorded += 1;
    }

    if (isOverdue(order, now)) openOverdue += 1;
  }

  return {
    schemaVersion: DELIVERY_REPORT_SCHEMA_VERSION,
    generatedAt: now.toISOString(),
    range: { from: new Date(from).toISOString(), to: new Date(to).toISOString(), timeZone },
    summary: {
      packages: orders.length,
      byStatus,
      openOverdue,
    },
    delivery: {
      delivered,
      // Of the delivered packages, how many are actually in a student's hands.
      // The gap is what is sitting in caretakers' rooms.
      collected,
      awaitingCollection: delivered - collected,
      onTime,
      late,
      // Null rather than 1 or 0 when nothing was delivered: "no data" and
      // "everything was on time" must not render as the same number.
      onTimeRate: delivered ? round(onTime / delivered, 4) : null,
    },
    proofOfDelivery: {
      recorded: receiverRecorded,
      missing: delivered - receiverRecorded,
    },
    durations: {
      orderToPack: durations(orderToPack),
      packToDispatch: durations(packToDispatch),
      dispatchToDeliver: durations(dispatchToDeliver),
      orderToDeliver: durations(orderToDeliver),
      deliverToCollect: durations(deliverToCollect),
    },
  };
};
