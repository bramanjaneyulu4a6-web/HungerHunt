import mongoose from "mongoose";

import { businessDateAt, businessDateStart } from "../utils/businessTime.js";

// A purchase the till has rung up but not charged, waiting on the parent.
//
// The lines are copied rather than referenced. A parent approving tomorrow is
// approving what they were shown today, so the name and price are frozen at
// the moment the request was raised; a price change since then does not
// silently move the amount they agreed to. Stock is the exception and is
// re-read at approval, because it is the one thing that must be true *now*.

const pendingOrderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },

    name: {
      type: String,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
      min: 1,
    },

    price: {
      type: Number,
      required: true,
    },
  },
  { _id: false }
);

// Open until the end of the next day in the school's time zone (23:59:59 IST
// by default): an order placed at 4 pm Monday can be answered until Tuesday
// night, whatever time it was raised. A student may only have one request
// open, so this is also what stops an ignored request from locking them out of
// the counter for good.
export const pendingOrderExpiry = (now = new Date()) => {
  const [year, month, day] = businessDateAt(now).split("-").map(Number);
  const dayAfterNext = new Date(Date.UTC(year, month - 1, day + 2)).toISOString().slice(0, 10);
  return new Date(businessDateStart(dayAfterNext).getTime() - 1000);
};

const pendingOrderSchema = new mongoose.Schema(
  {
    studentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
      index: true,
    },

    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Parent",
      required: true,
      index: true,
    },

    items: {
      type: [pendingOrderItemSchema],
      required: true,
    },

    totalAmount: {
      type: Number,
      required: true,
    },

    // EXPIRED is written when a request is next looked at after its window has
    // passed, rather than by a sweep: nothing here has to be timely, and a
    // status the reader derives cannot drift from the date beside it.
    status: {
      type: String,
      enum: ["PENDING", "PROCESSING", "APPROVED", "REJECTED", "EXPIRED"],
      default: "PENDING",
      index: true,
    },

    expiresAt: {
      type: Date,
      required: true,
      default: pendingOrderExpiry,
    },

    // Set when an admin rang the order up at the console, null when the student
    // raised it themselves at the kiosk. The parent's approval is what spends
    // the money either way; this records who asked.
    raisedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    approvedAt: Date,

    rejectedAt: Date,

    // The caretaker who approved or declined it, when the parent had handed
    // them that; null when the parent answered (or nobody has yet).
    answeredBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    // "Notify Parent via WhatsApp" counts once per order: the first tap, from
    // the kiosk's result screen or the caretaker app, is recorded here and
    // locks the button everywhere. Only that WhatsApp was opened is known —
    // never whether the message was sent.
    parentNotifiedAt: { type: Date, default: null },
    parentNotifiedVia: { type: String, enum: ["KIOSK", "CARETAKER", null], default: null },
    parentNotifiedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Admin",
      default: null,
    },

    // A client reuses this key when an approval response is lost. Together
    // with the atomic PENDING -> PROCESSING claim it makes one approval one
    // charge across double taps, retries and multiple devices.
    approvalKey: { type: String, maxlength: 100 },

    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
    },

    processingAt: Date,
  },
  {
    timestamps: true,
  }
);

// Every read is "the open request for this student", or "this parent's open
// requests, newest first".
pendingOrderSchema.index({ studentId: 1, status: 1 });
pendingOrderSchema.index({ parentId: 1, status: 1, createdAt: -1 });
pendingOrderSchema.index(
  { studentId: 1 },
  {
    unique: true,
    partialFilterExpression: {
      $or: [{ status: "PENDING" }, { status: "PROCESSING" }],
    },
    name: "one_pending_order_per_student",
  }
);

export default mongoose.model("PendingOrder", pendingOrderSchema);
