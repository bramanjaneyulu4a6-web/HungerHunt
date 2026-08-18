import mongoose from 'mongoose';

import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { OPEN_STATUSES } from '../src/domain/fulfillment/overdue.js';
import { RECEIVER_MAX_LENGTH } from '../src/domain/fulfillment/proofOfDelivery.js';

export const WEEKLY_ORDER_INDEX = 'one_fulfillment_order_per_student_business_week';

const itemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    name: { type: String, required: true },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
  },
  { _id: false }
);

const transitionSchema = new mongoose.Schema(
  {
    from: { type: String, required: true },
    to: { type: String, required: true },
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    note: { type: String, maxlength: 200, default: '' },
  },
  { _id: false }
);

/* The whole of what a delivery is proved by: a short receiver note, the staff
   account that recorded it, and when. The note is capped and validated in
   src/domain/fulfillment/proofOfDelivery.js — no images, signatures, identity
   numbers, or contact details are stored, here or anywhere else. */
const proofOfDeliverySchema = new mongoose.Schema(
  {
    receivedBy: { type: String, required: true, maxlength: RECEIVER_MAX_LENGTH },
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    recordedAt: { type: Date, required: true },
  },
  { _id: false }
);

// One row per time a member of staff said "seen" to an overdue package.
// Append-only, like transitions: acknowledging is an operational act with an
// actor, and the reason it was left late is worth keeping.
const overdueAcknowledgementSchema = new mongoose.Schema(
  {
    at: { type: Date, required: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', required: true },
    note: { type: String, maxlength: 200, default: '' },
    snoozedUntil: { type: Date, required: true },
  },
  { _id: false }
);

const fulfillmentOrderSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Transaction',
      required: true,
      unique: true,
    },
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Student',
      required: true,
      index: true,
    },
    studentSnapshot: {
      name: { type: String, required: true },
      admissionNumber: { type: String, default: '' },
      hostelNumber: { type: String, required: true },
      hostelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Hostel', required: true },
    },
    items: { type: [itemSchema], required: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: Object.values(OrderStatus),
      default: OrderStatus.PENDING,
      index: true,
    },
    businessWeekStart: { type: Date, required: true },
    orderedAt: { type: Date, required: true },
    deliverBy: { type: Date, required: true, index: true },
    packedAt: Date,
    packedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    dispatchedAt: Date,
    dispatchedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    deliveredAt: Date,
    deliveredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    deliveryNote: { type: String, maxlength: 200, default: '' },
    proofOfDelivery: proofOfDeliverySchema,
    cancelledAt: Date,
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
    transitions: { type: [transitionSchema], default: [] },

    // Denormalised from the newest acknowledgement so the alert query can skip
    // already-seen packages in the database rather than after loading them.
    alertSnoozedUntil: Date,
    overdueAcknowledgements: { type: [overdueAcknowledgementSchema], default: [] },
  },
  { timestamps: true }
);

/* businessWeekStart remains reporting metadata. It is deliberately not
   unique: a student may have any number of orders in the same week. */
fulfillmentOrderSchema.index({ status: 1, deliverBy: 1 });

// The overdue sweep: open packages past their deadline, newest deadline last.
fulfillmentOrderSchema.index(
  { deliverBy: 1 },
  {
    partialFilterExpression: { status: { $in: OPEN_STATUSES } },
    name: 'open_packages_by_deadline',
  }
);

// The two bounded reads. History and the operational report scan a date range
// of orders; the parent's own list is that range narrowed to one student.
fulfillmentOrderSchema.index({ orderedAt: -1 });
fulfillmentOrderSchema.index({ studentId: 1, orderedAt: -1 });
fulfillmentOrderSchema.index({ 'studentSnapshot.hostelId': 1, status: 1, deliverBy: 1 });
fulfillmentOrderSchema.index({ 'studentSnapshot.hostelId': 1, status: 1, deliveredAt: -1 });

export default mongoose.model('FulfillmentOrder', fulfillmentOrderSchema);
