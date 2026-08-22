import mongoose from 'mongoose';

import Admin from '../../../../models/Admin.js';
import FulfillmentOrder from '../../../../models/FulfillmentOrder.js';
import Hostel from '../../../../models/Hostel.js';
import StaffReport from '../../../../models/StaffReport.js';
import {
  OPEN_REPORT_STATUSES,
  ReportKind,
  ReportStatus,
  canTransitionReport,
  categoriesFor,
  categoryProblem,
  RESOLUTION_MAX_LENGTH,
  reportKinds,
  reportNoteProblem,
  reportStatuses,
} from '../../../domain/reports/staffReport.js';
import {
  ApplicationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/applicationError.js';

const PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;

/* One caretaker may have this many reports outstanding before they are asked to
   wait for an answer. Not a rate limit by the clock — a caretaker having a bad
   week may legitimately file several in an hour, and a limiter that punished
   that would teach them to stop reporting. This bounds the collection instead:
   a stuck client or a jammed button cannot grow it without limit, and a
   caretaker with twenty-five unanswered reports has a problem that one more
   report will not solve. */
const MAX_OPEN_PER_CARETAKER = 25;

const serialize = (report, { forRaiser = false } = {}) => ({
  id: String(report._id),
  kind: report.kind,
  category: report.category,
  categoryLabel: categoriesFor(report.kind)[report.category] || report.category,
  note: report.note,
  status: report.status,
  raisedAt: report.createdAt,
  order: report.order
    ? {
        id: String(report.order.orderId),
        studentName: report.order.studentName,
        hostelNumber: report.order.hostelNumber,
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
          hostelNumber: report.raiser?.hostelNumber || '',
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

/* Raised by the caretaker, about their own hostel, on their own account.
 *
 * Nothing about who is reporting comes from the body — not the name, not the
 * hostel, not the account. A report is a statement by a person, and the only
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

  if (outstanding >= MAX_OPEN_PER_CARETAKER) {
    throw new ApplicationError(
      `You have ${outstanding} reports still being handled. Wait for those to be answered before raising another.`,
      { status: 429, code: 'TOO_MANY_OPEN_REPORTS' }
    );
  }

  let order;

  if (kind === ReportKind.ORDER_ISSUE) {
    const orderId = readObjectId(req.body.orderId, 'orderId');

    /* Scoped exactly as the collection route is. A caretaker may report a
       problem with a package at their hostel and no other, and a package that
       is not theirs is a 404 rather than a refusal — the same answer as asking
       for one that does not exist, so this cannot be used to learn that another
       dorm's package is real. */
    const current = await FulfillmentOrder.findOne({
      _id: orderId,
      'studentSnapshot.hostelId': req.staff.hostelId,
    })
      .select('studentSnapshot status')
      .lean();
    if (!current) throw new NotFoundError('Fulfilment order');

    order = {
      orderId: current._id,
      studentName: current.studentSnapshot?.name || '',
      hostelNumber: current.studentSnapshot?.hostelNumber || '',
      statusAtReport: current.status,
    };
  }

  /* Read rather than taken from the token, and copied onto the report: a name
     and a hostel a reader can act on months later, without the office having to
     resolve two ids by hand to find out who wrote this. */
  const [account, hostel] = await Promise.all([
    Admin.findById(req.staff.id).select('name email').lean(),
    req.staff.hostelId ? Hostel.findById(req.staff.hostelId).select('code name').lean() : null,
  ]);

  const created = await StaffReport.create({
    kind,
    category,
    note,
    raisedBy: req.staff.id,
    raiser: {
      name: account?.name || account?.email || 'Caretaker',
      role: req.staff.role,
      hostelNumber: hostel?.code || '',
    },
    hostelId: req.staff.hostelId,
    ...(order ? { order } : {}),
    status: ReportStatus.OPEN,
  });

  res.status(201).json({
    data: serialize(created.toObject(), { forRaiser: true }),
    meta: { requestId: req.context.requestId },
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
  const details = [];
  if (status && status !== 'OUTSTANDING' && !reportStatuses.includes(status)) {
    details.push({ field: 'status', message: 'Unknown report status.' });
  }
  if (kind && !reportKinds.includes(kind)) {
    details.push({ field: 'kind', message: 'Unknown report type.' });
  }
  if (details.length) throw new ValidationError(details);

  const filter = {
    ...(status === 'OUTSTANDING'
      ? { status: { $in: OPEN_REPORT_STATUSES } }
      : status
        ? { status }
        : {}),
    ...(kind ? { kind } : {}),
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
    StaffReport.countDocuments({ status: { $in: OPEN_REPORT_STATUSES } }),
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
