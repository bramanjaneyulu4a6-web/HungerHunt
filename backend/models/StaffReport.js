import mongoose from 'mongoose';

import {
  NOTE_MAX_LENGTH,
  RESOLUTION_MAX_LENGTH,
  ReportKind,
  ReportStatus,
  reportKinds,
  reportStatuses,
} from '../src/domain/reports/staffReport.js';

/* Who raised it, copied at the time. The account is still referenced, and staff
   accounts are never deleted — but a report read six months later should say
   the name and room(s) the person had when they wrote it, not the ones a later
   transfer gave them. No phone number: the office has the staff roster, and a
   report is not the place to spread a contact detail. */
const raiserSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    role: { type: String, required: true },
    roomNumbers: { type: String, default: '' },
  },
  { _id: false }
);

/* Enough of the package to know which one is meant without joining, and
   nothing that would age badly. Prices are deliberately absent: a caretaker
   never sees what a package cost, and a report they raised must not become the
   one place it leaks. */
const orderSnapshotSchema = new mongoose.Schema(
  {
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'FulfillmentOrder', required: true },
    studentName: { type: String, required: true },
    roomNumber: { type: String, default: '' },
    statusAtReport: { type: String, required: true },
  },
  { _id: false }
);

/* Append-only, like a package's transitions: being read is an act with an
   actor, and so is being answered.
 *
 * actorName is copied in beside the account rather than left to a join. Every
 * admin sees this queue and any of them may answer any report, so the record of
 * which one did is the only thing that keeps a shared responsibility from
 * becoming nobody's — and a name that still reads correctly a year later, after
 * the person has left or the roster has been edited, has to have been written
 * down at the time. */
const handlingSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    actorName: { type: String, default: '' },
    note: { type: String, maxlength: RESOLUTION_MAX_LENGTH, default: '' },
  },
  { _id: false }
);

/* The items a student pointed at when reporting, copied with their names the
   way the order snapshot copies the student's. Quantities here are how many of
   that item the report is about, never more than the order held. */
const affectedItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const staffReportSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: reportKinds, required: true },
    category: { type: String, required: true },
    note: { type: String, required: true, maxlength: NOTE_MAX_LENGTH },

    /* A short number a student can read off a screen and an office can quote
       back. Only reports filed from the handover screen carry one so far, so
       the unique index is sparse rather than required. */
    reportNumber: { type: Number },

    // Present only on student-raised order issues with an item category.
    affectedItems: { type: [affectedItemSchema], default: undefined },

    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: true,
      index: true,
    },
    raiser: { type: raiserSchema, required: true },
    roomIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Room' }],

    // Present on ORDER_ISSUE and absent on COMPLAINT. Not required at the
    // schema level because the two kinds share one collection; the controller
    // is what refuses an order issue with no order.
    order: orderSnapshotSchema,

    status: {
      type: String,
      enum: reportStatuses,
      default: ReportStatus.OPEN,
      index: true,
    },
    handling: { type: [handlingSchema], default: [] },
    acknowledgedAt: Date,
    resolvedAt: Date,
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    // Snapshotted for the same reason as the handling trail's, and shown to the
    // caretaker with the answer: an answer that nobody's name is on is one
    // nobody has to stand behind.
    resolvedByName: { type: String, default: '' },
    // What the office said back. The caretaker sees this, which is the point of
    // recording it here rather than in the handling trail alone.
    resolutionNote: { type: String, maxlength: RESOLUTION_MAX_LENGTH, default: '' },
  },
  { timestamps: true }
);

// The office's queue: oldest unanswered first, so nothing ages out of sight.
staffReportSchema.index({ status: 1, createdAt: 1 });
staffReportSchema.index({ kind: 1, status: 1, createdAt: -1 });

// The caretaker's own list, newest first.
staffReportSchema.index({ raisedBy: 1, createdAt: -1 });

// Every report raised about one package, for the rare "what happened to this
// order" question. Sparse: complaints carry no order at all.
staffReportSchema.index({ 'order.orderId': 1 }, { sparse: true });

// Quotable and unique where present; older reports never carried one.
staffReportSchema.index({ reportNumber: 1 }, { unique: true, sparse: true });

export const REPORT_KINDS = ReportKind;

export default mongoose.model('StaffReport', staffReportSchema);
