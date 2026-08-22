import mongoose from 'mongoose';

import FulfillmentOrder from '../../../../models/FulfillmentOrder.js';
import { buildDeliveryReport } from '../../../domain/fulfillment/deliveryReport.js';
import {
  OrderStatus,
  canTransitionOrder,
  orderStatuses,
} from '../../../domain/fulfillment/orderState.js';
import {
  ALERT_SNOOZE_MS,
  MAX_ACKNOWLEDGEMENTS,
  OPEN_STATUSES,
  isOpenOrder,
  isOverdue,
  overdueByMinutes,
  partitionAlerts,
  snoozedUntil,
} from '../../../domain/fulfillment/overdue.js';
import {
  buildProofOfDelivery,
  proofOfDeliveryProblem,
} from '../../../domain/fulfillment/proofOfDelivery.js';
import { checkPurchaseCode } from '../../../domain/students/purchaseCodeCheck.js';
import {
  ApplicationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/applicationError.js';
import { parseBusinessDateRange } from '../../../shared/http/businessDateRange.js';
import { cancelAndRefundFulfillment } from '../../../../utils/refunds.js';

const transitionFields = Object.freeze({
  [OrderStatus.PACKED]: ['packedAt', 'packedBy'],
  [OrderStatus.OUT_FOR_DELIVERY]: ['dispatchedAt', 'dispatchedBy'],
  [OrderStatus.DELIVERED]: ['deliveredAt', 'deliveredBy'],
  [OrderStatus.COLLECTED]: ['collectedAt', 'collectedBy'],
  [OrderStatus.CANCELLED]: ['cancelledAt', 'cancelledBy'],
});

// Every list read here is bounded. None of these screens paginate past the
// first answer, so the cap is what stands between a busy week and a response
// that has to be scrolled to be useless.
const MAX_ACTIVE = 500;
const MAX_ALERTS = 200;
const MAX_REPORT_ORDERS = 20_000;
const MAX_RANGE_DAYS = 93;
const HISTORY_PAGE_SIZE = 25;
const MAX_HISTORY_PAGE_SIZE = 100;

const serialize = (order, { includeMoney = true } = {}) => ({
  id: String(order._id),
  transactionId: String(order.transactionId),
  studentId: String(order.studentId),
  student: order.studentSnapshot,
  items: includeMoney
    ? order.items
    : order.items.map(({ productId, name, quantity }) => ({ productId, name, quantity })),
  ...(includeMoney ? { totalAmount: order.totalAmount } : {}),
  status: order.status,
  businessWeekStart: order.businessWeekStart,
  orderedAt: order.orderedAt,
  deliverBy: order.deliverBy,
  packedAt: order.packedAt,
  dispatchedAt: order.dispatchedAt,
  deliveredAt: order.deliveredAt,
  collectedAt: order.collectedAt,
  deliveryNote: order.deliveryNote || '',
  proofOfDelivery: order.proofOfDelivery
    ? {
        receivedBy: order.proofOfDelivery.receivedBy,
        recordedBy: String(order.proofOfDelivery.recordedBy),
        recordedAt: order.proofOfDelivery.recordedAt,
      }
    : null,
  transitions: order.transitions || [],
});

const readPaging = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(
    Math.max(Number.parseInt(query.limit, 10) || HISTORY_PAGE_SIZE, 1),
    MAX_HISTORY_PAGE_SIZE
  );
  return { page, limit, skip: (page - 1) * limit };
};

const readStatus = (query) => {
  const status = query.status?.toUpperCase();
  if (status && !orderStatuses.includes(status)) {
    throw new ValidationError([{ field: 'status', message: 'Unknown fulfilment status.' }]);
  }
  return status;
};

const readObjectId = (value) => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ValidationError([{ field: 'id', message: 'Must be a valid identifier.' }]);
  }
  return value;
};

/* The caretaker's queue is wider than the storeroom's. A package the warehouse
   has delivered is finished work upstream and is only starting downstream: it
   is sitting in the caretaker's room waiting for its student to come and type
   their code. So DELIVERED stays on this screen and leaves it only when the
   student has actually taken the package. */
const CARETAKER_LIVE_STATUSES = Object.freeze([...OPEN_STATUSES, OrderStatus.DELIVERED]);

export const list = async (req, res) => {
  const caretaker = req.staff.role === 'caretaker';
  const status = caretaker ? null : readStatus(req.query);

  const filter = {
    ...(status
      ? { status }
      : { status: { $in: caretaker ? CARETAKER_LIVE_STATUSES : OPEN_STATUSES } }),
    ...(caretaker ? { 'studentSnapshot.hostelId': req.staff.hostelId } : {}),
  };
  const ordersQuery = FulfillmentOrder.find(filter)
    .sort({ deliverBy: 1 })
    .limit(MAX_ACTIVE)
    .lean();
  const [orders, awaitingCollection] = caretaker
    ? await Promise.all([
        ordersQuery,
        FulfillmentOrder.countDocuments({
          status: OrderStatus.DELIVERED,
          'studentSnapshot.hostelId': req.staff.hostelId,
        }),
      ])
    : [await ordersQuery, undefined];

  res.json({
    data: orders.map((order) => serialize(order, { includeMoney: !caretaker })),
    meta: {
      requestId: req.context.requestId,
      count: orders.length,
      ...(caretaker ? { awaitingCollection } : {}),
    },
  });
};

/* The caretaker's history has no date window: it is a receipt log for the
   hostel, not an operational report. It stays bounded through pagination and
   never includes prices or another hostel's packages.

   It logs collections, not deliveries — a package the caretaker is still
   holding has not left their hands, and belongs on the queue they work from
   rather than in the record of what students have taken. */
export const caretakerHistory = async (req, res) => {
  const { page, limit, skip } = readPaging(req.query);
  const filter = {
    status: OrderStatus.COLLECTED,
    'studentSnapshot.hostelId': req.staff.hostelId,
  };

  const [orders, total] = await Promise.all([
    FulfillmentOrder.find(filter)
      .sort({ collectedAt: -1, _id: -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    FulfillmentOrder.countDocuments(filter),
  ]);

  res.json({
    data: orders.map((order) => serialize(order, { includeMoney: false })),
    meta: {
      requestId: req.context.requestId,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
    },
  });
};

/* The last step, and the only one in this file a member of staff cannot take.
 *
 * A package is collected when the student it belongs to types their own
 * purchase code on the caretaker's screen. The caretaker's account is what
 * gets the request through the door and says which hostel is asking; the code
 * is what says the right student is standing there. Neither alone is enough,
 * which is the whole point of having replaced "received all" with this: one
 * tap used to close a hundred packages nobody had handed to anybody.
 *
 * The code is checked against the same counter and the same lock as the till.
 * See src/domain/students/purchaseCodeCheck.js for why that sharing matters. */
const COLLECTION_LOCKED_MESSAGE =
  'Too many wrong codes for this student. Their code is locked for a few' +
  ' minutes — try again later, or a parent can set a new one in the app.';

export const confirmCollection = async (req, res) => {
  const id = readObjectId(req.params.id);

  /* The package is checked before the code is. A student standing at the
     wrong moment — their package still in the van, or already collected —
     should not spend one of five attempts finding that out. */
  const current = await FulfillmentOrder.findOne({
    _id: id,
    'studentSnapshot.hostelId': req.staff.hostelId,
  }).lean();
  if (!current) throw new NotFoundError('Fulfilment order');

  if (!canTransitionOrder(current.status, OrderStatus.COLLECTED)) {
    throw new ConflictError(
      current.status === OrderStatus.COLLECTED
        ? 'This package has already been collected.'
        : `Package is ${current.status}; it can only be collected once the warehouse has delivered it to your hostel.`,
      { currentStatus: current.status, requestedStatus: OrderStatus.COLLECTED }
    );
  }

  const check = await checkPurchaseCode({
    studentId: current.studentId,
    code: req.body.code,
    lockedMessage: COLLECTION_LOCKED_MESSAGE,
  });

  if (!check.ok) {
    // The refusal is the checker's to word — including the deliberate silence
    // about whether a locked student's code was the right one.
    throw new ApplicationError(check.body.message, {
      status: check.status,
      code: check.body.code || (check.status === 404 ? 'NOT_FOUND' : 'INVALID_PURCHASE_CODE'),
    });
  }

  const now = new Date();
  const updated = await FulfillmentOrder.findOneAndUpdate(
    {
      _id: current._id,
      status: OrderStatus.DELIVERED,
      'studentSnapshot.hostelId': req.staff.hostelId,
    },
    {
      $set: {
        status: OrderStatus.COLLECTED,
        collectedAt: now,
        collectedBy: req.staff.id,
      },
      $push: {
        transitions: {
          from: current.status,
          to: OrderStatus.COLLECTED,
          at: now,
          actorId: req.staff.id,
          note: '',
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new ConflictError('Package changed while it was being collected. Refresh and retry.');
  }

  res.json({
    data: serialize(updated, { includeMoney: false }),
    meta: { requestId: req.context.requestId },
  });
};

/* Packages that have missed their deadline and have not been acknowledged
   since. Deliberately derived on read rather than written by a background job:
   the deadline is stored on the order, so "which packages are late" is a
   question the database can already answer, and there is no scheduler to keep
   alive, no queue to drain, and nothing to reconcile if one is restarted. */
export const alerts = async (req, res) => {
  const now = new Date();
  const overdueFilter = {
    status: { $in: OPEN_STATUSES },
    deliverBy: { $lt: now },
  };
  const [raisedCandidates, mutedCount] = await Promise.all([
    FulfillmentOrder.find({
      ...overdueFilter,
      $or: [
        { alertSnoozedUntil: { $exists: false } },
        { alertSnoozedUntil: null },
        { alertSnoozedUntil: { $lte: now } },
      ],
    })
      .sort({ deliverBy: 1 })
      .limit(MAX_ALERTS)
      .lean(),
    FulfillmentOrder.countDocuments({
      ...overdueFilter,
      alertSnoozedUntil: { $gt: now },
    }),
  ]);

  // Keep the pure policy function in the request path as a defence against a
  // legacy or malformed date that does not behave as expected in the query.
  const { raised } = partitionAlerts(raisedCandidates, now);

  res.json({
    data: raised.map((order) => ({
      ...serialize(order),
      overdueByMinutes: overdueByMinutes(order, now),
      acknowledgements: (order.overdueAcknowledgements || []).length,
    })),
    meta: {
      requestId: req.context.requestId,
      count: raised.length,
      // What acknowledging has hidden, so a quiet board is never mistaken for
      // one with nothing late on it.
      acknowledgedCount: mutedCount,
      snoozeHours: ALERT_SNOOZE_MS / 3_600_000,
      truncated: raisedCandidates.length === MAX_ALERTS,
    },
  });
};

export const acknowledgeAlert = async (req, res) => {
  const id = readObjectId(req.params.id);
  const note = String(req.body.note || '').trim().slice(0, 200);
  const now = new Date();

  const current = await FulfillmentOrder.findById(id).lean();
  if (!current) throw new NotFoundError('Fulfilment order');
  if (!isOpenOrder(current.status)) {
    throw new ConflictError(
      `Package is ${current.status}; only an undelivered package can be late.`,
      { currentStatus: current.status }
    );
  }
  if (!isOverdue(current, now)) {
    throw new ConflictError('This package has not missed its delivery deadline.', {
      deliverBy: current.deliverBy,
    });
  }

  const until = snoozedUntil(now);
  const updated = await FulfillmentOrder.findOneAndUpdate(
    { _id: id, status: current.status },
    {
      $set: { alertSnoozedUntil: until },
      $push: {
        overdueAcknowledgements: {
          $each: [{ at: now, actorId: req.staff.id, note, snoozedUntil: until }],
          $slice: -MAX_ACKNOWLEDGEMENTS,
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new ConflictError('Package changed while it was being acknowledged. Refresh and retry.');
  }

  res.json({
    data: { ...serialize(updated), alertSnoozedUntil: until },
    meta: { requestId: req.context.requestId, snoozeHours: ALERT_SNOOZE_MS / 3_600_000 },
  });
};

/* Delivery history over a bounded business-date range, one page at a time.
   Keyed on orderedAt rather than deliveredAt: every package has an order time,
   so a range never silently drops the packages that were never delivered —
   which are the ones a history is most often opened to find. */
export const history = async (req, res) => {
  const { from, to, timeZone } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });
  const status = readStatus(req.query);
  const { page, limit, skip } = readPaging(req.query);

  const filter = { orderedAt: { $gte: from, $lt: to }, ...(status ? { status } : {}) };

  const [orders, total] = await Promise.all([
    FulfillmentOrder.find(filter).sort({ orderedAt: -1 }).skip(skip).limit(limit).lean(),
    FulfillmentOrder.countDocuments(filter),
  ]);

  res.json({
    data: orders.map(serialize),
    meta: {
      requestId: req.context.requestId,
      count: orders.length,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
      range: { from, to, timeZone },
    },
  });
};

export const report = async (req, res) => {
  const { from, to, timeZone } = parseBusinessDateRange(req.query, { maxDays: MAX_RANGE_DAYS });

  const orders = await FulfillmentOrder.find({ orderedAt: { $gte: from, $lt: to } })
    .select('status orderedAt deliverBy packedAt dispatchedAt deliveredAt collectedAt proofOfDelivery.receivedBy')
    .limit(MAX_REPORT_ORDERS + 1)
    .lean();

  // Refused rather than silently computed from a truncated read: a report that
  // quietly covers part of its own range is worse than no report.
  if (orders.length > MAX_REPORT_ORDERS) {
    throw new ApplicationError(
      `More than ${MAX_REPORT_ORDERS.toLocaleString('en-US')} packages fall in this range. Select a shorter period.`,
      { status: 413, code: 'REPORT_TOO_LARGE' }
    );
  }

  res.json({
    data: buildDeliveryReport({ orders, from, to, now: new Date(), timeZone }),
    meta: { requestId: req.context.requestId, deterministic: true },
  });
};

export const transition = async (req, res) => {
  readObjectId(req.params.id);

  const to = String(req.body.status || '').toUpperCase();
  if (!orderStatuses.includes(to) || to === OrderStatus.PENDING) {
    throw new ValidationError([{ field: 'status', message: 'Unknown transition target.' }]);
  }
  /* Only the student can finish a package, and they do it by typing their
     code on the caretaker's screen — never through this route, which is the
     storeroom's. See confirmCollection. */
  if (to === OrderStatus.COLLECTED) {
    throw new ApplicationError(
      'A package is collected by the student entering their purchase code, not by staff.',
      { status: 403, code: 'FORBIDDEN' }
    );
  }
  if (to === OrderStatus.CANCELLED) {
    const idempotencyKey = String(req.get('Idempotency-Key') || '').trim();
    const reason = String(req.body.reason || req.body.note || '').trim();
    const details = [];
    if (!idempotencyKey || idempotencyKey.length > 100) {
      details.push({ field: 'Idempotency-Key', message: 'Required, maximum 100 characters.' });
    }
    if (!reason || reason.length > 200) {
      details.push({ field: 'reason', message: 'Required, maximum 200 characters.' });
    }
    if (details.length) throw new ValidationError(details);
    const result = await cancelAndRefundFulfillment({
      orderId: req.params.id,
      actorId: req.staff.id,
      idempotencyKey,
      reason,
    });
    return res.json({
      data: {
        order: serialize(result.order),
        reversal: {
          id: String(result.reversal._id),
          amount: result.reversal.amount,
          previousBalance: result.reversal.previousBalance,
          newBalance: result.reversal.newBalance,
        },
      },
      meta: { requestId: req.context.requestId, replayed: result.replayed },
    });
  }

  const current = await FulfillmentOrder.findById(req.params.id).lean();
  if (!current) throw new NotFoundError('Fulfilment order');
  if (!canTransitionOrder(current.status, to)) {
    throw new ConflictError(
      `Fulfilment order is ${current.status}; it cannot transition to ${to}.`,
      { currentStatus: current.status, requestedStatus: to }
    );
  }

  const now = new Date();
  const [timestampField, actorField] = transitionFields[to];
  const note = String(req.body.note || '').trim().slice(0, 200);
  const set = { status: to, [timestampField]: now, [actorField]: req.staff.id };

  /* Delivery is the warehouse handing the package over at the hostel, and the
     one fact only the person handing it over knows is who took it. So that
     name comes from the body — and it is the sole part of this record that
     does: the account recording it and the time are taken from the session and
     the clock, so a mistyped or invented name still sits beside a staff member
     and a minute that can be asked about. */
  if (to === OrderStatus.DELIVERED) {
    const receivedBy = String(req.body.receivedBy ?? '').trim();
    const problem = proofOfDeliveryProblem(receivedBy);

    if (problem) throw new ValidationError([{ field: 'receivedBy', message: problem }]);

    set.proofOfDelivery = buildProofOfDelivery({
      receivedBy,
      recordedBy: req.staff.id,
      recordedAt: now,
    });
    set.deliveryNote = note;
  }

  const updated = await FulfillmentOrder.findOneAndUpdate(
    { _id: current._id, status: current.status },
    {
      $set: set,
      $push: {
        transitions: {
          from: current.status,
          to,
          at: now,
          actorId: req.staff.id,
          note,
        },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new ConflictError('Fulfilment order changed while it was being updated. Refresh and retry.');
  }

  res.json({
    data: serialize(updated),
    meta: { requestId: req.context.requestId },
  });
};
