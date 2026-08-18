import mongoose from "mongoose";

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

// Three days, so a request raised on a Friday is still answerable on Monday.
// A student may only have one request open, so this is also what stops an
// ignored request from locking them out of the counter for good.
export const PENDING_ORDER_TTL_DAYS = 3;

export const pendingOrderExpiry = () =>
  new Date(Date.now() + PENDING_ORDER_TTL_DAYS * 24 * 60 * 60 * 1000);

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
