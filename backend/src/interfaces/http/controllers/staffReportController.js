import mongoose from 'mongoose';

import Admin from '../../../../models/Admin.js';
import Counter from '../../../../models/Counter.js';
import FulfillmentOrder from '../../../../models/FulfillmentOrder.js';
import Room from '../../../../models/Room.js';
import StaffReport from '../../../../models/StaffReport.js';
import {
  OPEN_REPORT_STATUSES,
  ReportKind,
  ReportStatus,
  STUDENT_ORDER_ISSUE_CATEGORIES,
  affectedItemsProblem,
  canTransitionReport,
  categoriesFor,
  categoryProblem,
  RESOLUTION_MAX_LENGTH,
  reportKinds,
  reportNoteProblem,
  reportStatuses,
  studentCategoryNeedsItems,
} from '../../../domain/reports/staffReport.js';
import {
  ApplicationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/applicationError.js';
import { buildRoomUnits } from '../../../../utils/roomUnits.js';

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const REPORT_SOURCES = Object.freeze(['student', 'caretaker', 'warehouse', 'parent']);

/* One staff account may have this many reports outstanding before they are asked to
   wait for an answer. Not a rate limit by the clock — a staff member having a bad
   week may legitimately file several in an hour, and a limiter that punished
   that would teach them to stop reporting. This bounds the collection instead:
   a stuck client or a jammed button cannot grow it without limit, and a
   account with twenty-five unanswered reports has a problem that one more
   report will not solve. */
const MAX_OPEN_PER_RAISER = 25;
const MAX_WAREHOUSE_GROUP_ORDERS = 500;

/* Room codes are read by people, so they are ordered the way people read them:
   ROOM-10 after ROOM-9, not before it. */
const naturalCodes = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
const joinRoomCodes = (codes) => [...codes].sort(naturalCodes.compare.bind(naturalCodes)).join(' · ');

const serialize = (report, { forRaiser = false } = {}) => ({
  id: String(report._id),
  kind: report.kind,
  category: report.category,
  categoryLabel: categoriesFor(report.kind)[report.category] || report.category,
  note: report.note,
  status: report.status,
  reportNumber: report.reportNumber ?? null,
  affectedItems: (report.affectedItems || []).map(({ productId, name, quantity }) => ({
    productId: String(productId),
    name,
    quantity,
  })),
  raisedAt: report.createdAt,
  order: report.order
    ? {
        id: String(report.order.orderId),
        studentName: report.order.studentName,
        roomNumber: report.order.roomNumber,
        statusAtReport: report.order.statusAtReport,
      }
    : null,
  acknowledgedAt: report.acknowledgedAt || null,
  resolvedAt: report.resolvedAt || null,
  resolutionNote: report.resolutionNote || '',
  /* Who answered, shown to the caretaker as well as the office. Every admin
     account sees this queue and any of them may answer anything in it, so the
     name on the answer is what stops a shared responsibility from becoming
     nobody's. It is also the reason to be careful what you write: an answer
     signed by its author is a different piece of writing from an anonymous
     one. The full handling trail stays with the office. */
  answeredBy: report.resolvedByName || '',
  ...(forRaiser
    ? {}
    : {
        raisedBy: {
          id: String(report.raisedBy),
          name: report.raiser?.name || '',
          role: report.raiser?.role || '',
          // Every room the raiser held when they wrote it, joined for reading.
          roomNumbers: report.raiser?.roomNumbers || '',
        },
        handling: report.handling || [],
      }),
});

const readPaging = (query) => {
  const page = Math.max(Number.parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(Number.parseInt(query.limit, 10) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  return { page, limit, skip: (page - 1) * limit };
};

const readObjectId = (value, field = 'id') => {
  if (!mongoose.Types.ObjectId.isValid(value)) {
    throw new ValidationError([{ field, message: 'Must be a valid identifier.' }]);
  }
  return value;
};

/* Raised by the caretaker, about their own rooms, on their own account.
 *
 * Nothing about who is reporting comes from the body — not the name, not the
 * rooms, not the account. A report is a statement by a person, and the only
 * trustworthy source for which person is the session that carried it here. */
export const create = async (req, res) => {
  const kind = String(req.body.kind || '').toUpperCase();
  const category = String(req.body.category || '').toUpperCase();
  const note = String(req.body.note ?? '').trim();

  const details = [];
  if (!reportKinds.includes(kind)) {
    details.push({ field: 'kind', message: 'Unknown report type.' });
  } else {
    const problem = categoryProblem(kind, category);
    if (problem) details.push({ field: 'category', message: problem });
  }
  const noteProblem = reportNoteProblem(note);
  if (noteProblem) details.push({ field: 'note', message: noteProblem });
  if (details.length) throw new ValidationError(details);

  const outstanding = await StaffReport.countDocuments({
    raisedBy: req.staff.id,
    status: { $in: OPEN_REPORT_STATUSES },
  });

  if (outstanding >= MAX_OPEN_PER_RAISER) {
    throw new ApplicationError(
      `You have ${outstanding} reports still being handled. Wait for those to be answered before raising another.`,
      { status: 429, code: 'TOO_MANY_OPEN_REPORTS' }
    );
  }

  let order;

  if (kind === ReportKind.ORDER_ISSUE) {
    const orderId = readObjectId(req.body.orderId, 'orderId');

    /* Scoped exactly as the collection route is. A caretaker may report a
       problem with a package in any room they hold and no other, and a package
       that is not theirs is a 404 rather than a refusal — the same answer as
       asking for one that does not exist, so this cannot be used to learn that
       another room's package is real. */
    const current = await FulfillmentOrder.findOne({
      _id: orderId,
      'studentSnapshot.roomId': { $in: req.staff.roomIds },
    })
      .select('studentSnapshot status')
      .lean();
    if (!current) throw new NotFoundError('Fulfilment order');

    order = {
      orderId: current._id,
      studentName: current.studentSnapshot?.name || '',
      roomNumber: current.studentSnapshot?.roomNumber || '',
      statusAtReport: current.status,
    };
  }

  /* Read rather than taken from the token, and copied onto the report: a name
     and the rooms a reader can act on months later, without the office having
     to resolve a handful of ids by hand to find out who wrote this. A caretaker
     with three rooms gets all three, because "which room" is not a question
     their report can answer and the office should not have to guess. */
  const [account, rooms] = await Promise.all([
    Admin.findById(req.staff.id).select('name email').lean(),
    Room.find({ _id: { $in: req.staff.roomIds } }).select('code').lean(),
  ]);

  const created = await StaffReport.create({
    kind,
    category,
    note,
    raisedBy: req.staff.id,
    raiser: {
      name: account?.name || account?.email || 'Caretaker',
      role: req.staff.role,
      roomNumbers: joinRoomCodes(rooms.map((room) => room.code)),
    },
    roomIds: req.staff.roomIds,
    ...(order ? { order } : {}),
    status: ReportStatus.OPEN,
  });

  res.status(201).json({
    data: serialize(created.toObject(), { forRaiser: true }),
    meta: { requestId: req.context.requestId },
  });
};

/* A warehouse report belongs to a delivery-unit work tile, not to one student's
 * package. The client sends the underlying ids only as proof of that scope; the
 * server resolves the unit they fall inside and refuses a group that spans more
 * than one. No student is named in the report, preserving the block workflow
 * while keeping the office's existing Warehouse report channel and audit trail.
 *
 * The unit, not the single room, is the boundary now: a caretaker holding three
 * rooms takes one trolley for all three, and a storeroom problem with that run
 * is one report. Two rooms held by different people are still two problems, and
 * a group spanning both is refused rather than filed against whichever room
 * happened to sort first. */
export const createWarehouseOrderIssue = async (req, res) => {
  const category = String(req.body.category || '').toUpperCase();
  const note = String(req.body.note ?? '').trim();
  const orderIds = [...new Set(Array.isArray(req.body.orderIds) ? req.body.orderIds.map(String) : [])];
  const details = [];

  const categoryError = categoryProblem(ReportKind.ORDER_ISSUE, category);
  if (categoryError) details.push({ field: 'category', message: categoryError });
  const noteError = reportNoteProblem(note);
  if (noteError) details.push({ field: 'note', message: noteError });
  if (!orderIds.length || orderIds.length > MAX_WAREHOUSE_GROUP_ORDERS) {
    details.push({
      field: 'orderIds',
      message: `Choose between 1 and ${MAX_WAREHOUSE_GROUP_ORDERS} orders from one caretaker unit.`,
    });
  } else if (orderIds.some((id) => !mongoose.Types.ObjectId.isValid(id))) {
    details.push({ field: 'orderIds', message: 'Every order must have a valid identifier.' });
  }
  if (details.length) throw new ValidationError(details);

  const orders = await FulfillmentOrder.find({
    _id: { $in: orderIds },
    status: 'PENDING',
  })
    .select('studentSnapshot.roomId')
    .lean();

  if (orders.length !== orderIds.length) {
    throw new ConflictError('One or more orders have moved. Refresh the New orders tab and try again.');
  }

  /* One unit has to contain all of them. Containment, not equality: a report
     about two of a caretaker's three rooms is still a report about that
     caretaker's run, and refusing it would only teach the storeroom to file
     three separate ones. */
  const orderRoomIds = new Set(orders.map((order) => String(order.studentSnapshot?.roomId || '')));
  const units = await buildRoomUnits();
  const unit = orderRoomIds.has('')
    ? null
    : units.find((candidate) => {
        const ids = new Set(candidate.rooms.map((room) => room.id));
        return [...orderRoomIds].every((id) => ids.has(id));
      });

  if (!unit) {
    throw new ValidationError([
      { field: 'orderIds', message: 'All orders in a grouped report must belong to one caretaker unit.' },
    ]);
  }

  const outstanding = await StaffReport.countDocuments({
    raisedBy: req.staff.id,
    status: { $in: OPEN_REPORT_STATUSES },
  });
  if (outstanding >= MAX_OPEN_PER_RAISER) {
    throw new ApplicationError(
      `You have ${outstanding} reports still being handled. Wait for those to be answered before raising another.`,
      { status: 429, code: 'TOO_MANY_OPEN_REPORTS' }
    );
  }

  const account = await Admin.findById(req.staff.id).select('name email').lean();

  /* Stamped with the whole unit rather than only the rooms this group of orders
     happened to touch: the report is about the run, and a reader six months on
     should see which run that was. */
  const roomNumbers = joinRoomCodes(unit.rooms.map((room) => room.code));
  const created = await StaffReport.create({
    kind: ReportKind.ORDER_ISSUE,
    category,
    note,
    raisedBy: req.staff.id,
    raiser: {
      name: account?.name || account?.email || 'Warehouse',
      role: 'warehouse',
      roomNumbers,
    },
    roomIds: unit.rooms.map((room) => room.id),
    status: ReportStatus.OPEN,
  });

  res.status(201).json({
    data: serialize(created.toObject(), { forRaiser: true }),
    meta: {
      requestId: req.context.requestId,
      roomNumbers,
      groupedOrders: orders.length,
    },
  });
};

/* Raised by the student, at the handover screen, through the caretaker's
 * session. The caretaker's account carries it — students have no staff
 * accounts — but the raiser on the record is the student the package belongs
 * to, because the words in it are theirs.
 *
 * Filing one changes nothing about the package. The student goes straight back
 * to the code screen and takes their food; the report travels on its own. */
export const createStudentOrderIssue = async (req, res) => {
  const orderId = readObjectId(req.params.id, 'orderId');
  const category = String(req.body.category || '').toUpperCase();
  const note = String(req.body.note ?? '').trim();
  const items = req.body.items;

  const details = [];
  if (!Object.hasOwn(STUDENT_ORDER_ISSUE_CATEGORIES, category)) {
    details.push({ field: 'category', message: 'Choose one of the listed categories.' });
  }
  const noteProblem = reportNoteProblem(note);
  if (noteProblem) details.push({ field: 'note', message: noteProblem });
  if (details.length) throw new ValidationError(details);

  const outstanding = await StaffReport.countDocuments({
    raisedBy: req.staff.id,
    status: { $in: OPEN_REPORT_STATUSES },
  });

  if (outstanding >= MAX_OPEN_PER_RAISER) {
    throw new ApplicationError(
      'This room has too many reports still being handled. Ask your caretaker to wait for answers before sending more.',
      { status: 429, code: 'TOO_MANY_OPEN_REPORTS' }
    );
  }

  // Scoped exactly as collection is: a package from a room this caretaker does
  // not hold reads as absent.
  const current = await FulfillmentOrder.findOne({
    _id: orderId,
    'studentSnapshot.roomId': { $in: req.staff.roomIds },
  })
    .select('studentSnapshot status items')
    .lean();
  if (!current) throw new NotFoundError('Fulfilment order');

  /* The handover screen is the only place this report can come from, and it
     only exists once the package is with the caretaker. Anything earlier is
     the warehouse's problem to hear about through the caretaker's own
     channel. */
  if (current.status !== 'DELIVERED') {
    throw new ConflictError(
      `Package is ${current.status}; a student can only report it at the handover screen.`
    );
  }

  const itemsProblem = affectedItemsProblem(category, items, current.items);
  if (itemsProblem) throw new ValidationError([{ field: 'items', message: itemsProblem }]);

  /* Names are copied from the order, not trusted from the client: the client
     sends ids and counts, and the record says what those ids were called at
     the time. */
  const orderedById = new Map(current.items.map((item) => [String(item.productId), item]));
  const affectedItems = studentCategoryNeedsItems(category)
    ? items.map(({ productId, quantity }) => ({
        productId,
        name: orderedById.get(String(productId)).name,
        quantity,
      }))
    : undefined;

  const reportNumber = await Counter.nextSequence('staff-report');

  const created = await StaffReport.create({
    kind: ReportKind.ORDER_ISSUE,
    category,
    note,
    reportNumber,
    raisedBy: req.staff.id,
    raiser: {
      name: current.studentSnapshot?.name || 'Student',
      role: 'student',
      // A student stands in one room, so this is the order's room, not the
      // caretaker's whole set.
      roomNumbers: current.studentSnapshot?.roomNumber || '',
    },
    /* The order's own room, never the caretaker's whole set. listStudentOrder-
       Reports matches on any overlap, so stamping all of the raiser's rooms
       would let a colleague who shares only one of them read a student's name
       and complaint about a room they do not hold. Nothing is lost: the
       caretaker filing this necessarily holds the order's room, so the same
       overlap filter still reads it back on their own handover screen. */
    roomIds: [current.studentSnapshot.roomId],
    order: {
      orderId: current._id,
      studentName: current.studentSnapshot?.name || '',
      roomNumber: current.studentSnapshot?.roomNumber || '',
      statusAtReport: current.status,
    },
    ...(affectedItems ? { affectedItems } : {}),
    status: ReportStatus.OPEN,
  });

  res.status(201).json({
    data: serialize(created.toObject(), { forRaiser: true }),
    meta: { requestId: req.context.requestId },
  });
};

/* What the handover screen shows back under the code field: every report a
 * student has raised about this order, with its number and its status. Only
 * student-raised reports — the caretaker's own channel about the same package
 * is between the caretaker and the office, and this list is read by the
 * student. Scoped to the caretaker's rooms through the report's own roomIds, so
 * an order from a room they do not hold simply lists nothing. */
export const listStudentOrderReports = async (req, res) => {
  const orderId = readObjectId(req.params.id, 'orderId');

  const reports = await StaffReport.find({
    'order.orderId': orderId,
    roomIds: { $in: req.staff.roomIds },
    'raiser.role': 'student',
  })
    .sort({ createdAt: -1 })
    .limit(50)
    .lean();

  res.json({
    data: reports.map((report) => serialize(report, { forRaiser: true })),
    meta: { requestId: req.context.requestId, count: reports.length },
  });
};

// A caretaker's own reports, and only their own — the filter is the account
// from the session, so there is no query that widens it.
export const mine = async (req, res) => {
  const { page, limit, skip } = readPaging(req.query);
  const filter = { raisedBy: req.staff.id };

  const [reports, total, outstanding] = await Promise.all([
    StaffReport.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
    StaffReport.countDocuments(filter),
    StaffReport.countDocuments({ ...filter, status: { $in: OPEN_REPORT_STATUSES } }),
  ]);

  res.json({
    data: reports.map((report) => serialize(report, { forRaiser: true })),
    meta: {
      requestId: req.context.requestId,
      count: reports.length,
      total,
      outstanding,
      page,
      pages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
    },
  });
};

/* The office's queue. Unanswered first and oldest first inside that, because
   the failure mode of a complaint channel is not losing a report — it is
   letting one sit unread until the person who wrote it stops writing them. */
export const list = async (req, res) => {
  const { page, limit, skip } = readPaging(req.query);

  const status = req.query.status?.toUpperCase();
  const kind = req.query.kind?.toUpperCase();
  const source = req.query.source?.toLowerCase();
  const details = [];
  if (status && status !== 'OUTSTANDING' && !reportStatuses.includes(status)) {
    details.push({ field: 'status', message: 'Unknown report status.' });
  }
  if (kind && !reportKinds.includes(kind)) {
    details.push({ field: 'kind', message: 'Unknown report type.' });
  }
  if (source && !REPORT_SOURCES.includes(source)) {
    details.push({ field: 'source', message: 'Unknown report source.' });
  }
  if (details.length) throw new ValidationError(details);

  const sourceFilter = source ? { 'raiser.role': source } : {};

  const filter = {
    ...(status === 'OUTSTANDING'
      ? { status: { $in: OPEN_REPORT_STATUSES } }
      : status
        ? { status }
        : {}),
    ...(kind ? { kind } : {}),
    ...sourceFilter,
  };

  /* Oldest first while looking at what is still owed, newest first when
     reading the log.

     Deliberately not a sort on status: the three values sort alphabetically,
     which would put ACKNOWLEDGED — already being looked at — ahead of OPEN,
     which nobody has read yet. The chosen view is what separates those, so the
     order inside it is purely by age, which is the thing that actually goes
     wrong with a report. */
  const showingUnanswered =
    status === 'OUTSTANDING' || OPEN_REPORT_STATUSES.includes(status);

  const [reports, total, outstanding] = await Promise.all([
    StaffReport.find(filter)
      .sort({ createdAt: showingUnanswered ? 1 : -1 })
      .skip(skip)
      .limit(limit)
      .lean(),
    StaffReport.countDocuments(filter),
    StaffReport.countDocuments({ ...sourceFilter, status: { $in: OPEN_REPORT_STATUSES } }),
  ]);

  res.json({
    data: reports.map((report) => serialize(report)),
    meta: {
      requestId: req.context.requestId,
      count: reports.length,
      total,
      outstanding,
      page,
      pages: Math.ceil(total / limit) || 1,
      hasMore: page * limit < total,
    },
  });
};

export const transition = async (req, res) => {
  const id = readObjectId(req.params.id);
  const to = String(req.body.status || '').toUpperCase();
  const note = String(req.body.note || '').trim().slice(0, RESOLUTION_MAX_LENGTH);

  if (!reportStatuses.includes(to) || to === ReportStatus.OPEN) {
    throw new ValidationError([{ field: 'status', message: 'Unknown handling step.' }]);
  }

  /* Resolving is the answer the caretaker reads, so it has to say something.
     Acknowledging is allowed to be silent — it means "read, being looked at",
     and requiring prose for that would only produce the word "noted". */
  if (to === ReportStatus.RESOLVED && !note) {
    throw new ValidationError([
      { field: 'note', message: 'Say what was done — the caretaker who raised this will read it.' },
    ]);
  }

  const current = await StaffReport.findById(id).lean();
  if (!current) throw new NotFoundError('Report');

  if (!canTransitionReport(current.status, to)) {
    throw new ConflictError(`Report is ${current.status}; it cannot move to ${to}.`, {
      currentStatus: current.status,
      requestedStatus: to,
    });
  }

  const now = new Date();
  const account = await Admin.findById(req.staff.id).select('name email').lean();
  const actorName = account?.name || account?.email || 'The office';

  const set = {
    status: to,
    ...(to === ReportStatus.ACKNOWLEDGED ? { acknowledgedAt: now } : {}),
    ...(to === ReportStatus.RESOLVED
      ? {
          resolvedAt: now,
          resolvedBy: req.staff.id,
          resolvedByName: actorName,
          resolutionNote: note,
        }
      : {}),
  };

  const updated = await StaffReport.findOneAndUpdate(
    { _id: id, status: current.status },
    {
      $set: set,
      $push: {
        handling: { from: current.status, to, at: now, actorId: req.staff.id, actorName, note },
      },
    },
    { new: true, runValidators: true }
  ).lean();

  if (!updated) {
    throw new ConflictError('Report changed while it was being handled. Refresh and retry.');
  }

  res.json({
    data: serialize(updated),
    meta: { requestId: req.context.requestId },
  });
};
