import mongoose from "mongoose";
import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import { demoParentPhones } from "../config/demoAccess.js";

/* What orders took off one product's shelf, one row per day.
 *
 * Checkout decrements stock without writing a StockAdjustment, so the item's
 * history read as if only the office ever moved it. These rows are derived
 * from the charges themselves rather than written beside them: every past day
 * is there without a backfill, and the history can never disagree with the
 * ledger it summarises.
 *
 * Every charge counts, including ones later refunded or deleted — the stock
 * did leave the shelf that day; a refund returning it is a separate event.
 * The one exclusion is the showroom family, whose checkout never takes stock
 * (chargeCart skips the decrement for them).
 *
 * Days are IST, and the history starts on 19 September 2026 by decision. */
export const ORDER_HISTORY_FROM = new Date("2026-09-18T18:30:00.000Z");
const TIMEZONE = "Asia/Kolkata";

const dayLabel = (day) =>
  new Date(`${day}T00:00:00+05:30`).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: TIMEZONE,
  });

const demoStudentIds = async () => {
  const phones = [...demoParentPhones()];
  if (!phones.length) return [];
  const rows = await Student.find({ parentPhoneNumber: { $in: phones } }).select("_id").lean();
  return rows.map((row) => row._id);
};

export const orderDeductionsByDay = async (productId) => {
  const product = new mongoose.Types.ObjectId(String(productId));
  const excluded = await demoStudentIds();

  const days = await Transaction.aggregate([
    {
      $match: {
        createdAt: { $gte: ORDER_HISTORY_FROM },
        "items.productId": product,
        ...(excluded.length ? { studentId: { $nin: excluded } } : {}),
      },
    },
    { $unwind: "$items" },
    { $match: { "items.productId": product } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: TIMEZONE } },
        quantity: { $sum: "$items.quantity" },
        orders: { $addToSet: "$_id" },
        lastAt: { $max: "$createdAt" },
      },
    },
    { $sort: { _id: -1 } },
  ]);

  return days.map((day) => {
    const orderCount = day.orders.length;
    return {
      _id: `orders-${day._id}`,
      kind: "ORDERS",
      day: day._id,
      createdAt: day.lastAt,
      delta: -day.quantity,
      orderCount,
      reason: `Orders confirmed on ${dayLabel(day._id)} (${orderCount} order${orderCount === 1 ? "" : "s"})`,
      adjustedBy: null,
      stockAfter: null,
    };
  });
};
