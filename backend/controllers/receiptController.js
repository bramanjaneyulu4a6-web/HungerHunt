import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import GoodsReceipt from "../models/GoodsReceipt.js";
import Inventory from "../models/Inventory.js";

// Numbers and numeric strings only. Left to plain coercion, null and a blank
// field both read as 0 and a stray `true` reads as 1, so a garbled payload
// would be quietly reinterpreted as a count rather than refused.
const isWholeNonNegative = (v) =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) &&
  Number.isInteger(Number(v)) &&
  Number(v) >= 0;

// Returns cleaned lines, or null when anything is unusable. A receipt where
// nothing arrived and nothing was damaged is not a receipt.
const normalizeLines = (lines) => {
  if (!Array.isArray(lines) || lines.length === 0) return null;

  /* Folded by product rather than kept as sent. Two rows for the same product
     are each checked against the whole of what remains, so ten and ten against
     an order for ten would both pass and twenty units would land — one
     double-rendered form row is enough to do it. Folding also keeps the
     positional "items.$" write to one per product. */
  const byProduct = new Map();

  for (const line of lines) {
    const { productId, received = 0, damaged = 0, reason = "" } = line ?? {};

    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    if (!isWholeNonNegative(received) || !isWholeNonNegative(damaged)) return null;

    const cleanReason = String(reason).slice(0, 200);
    const seen = byProduct.get(String(productId));

    if (seen) {
      seen.received += Number(received);
      seen.damaged += Number(damaged);
      // Both explanations are kept — each one is about units that arrived.
      seen.reason = [seen.reason, cleanReason].filter(Boolean).join("; ").slice(0, 200);
      continue;
    }

    byProduct.set(String(productId), {
      productId,
      received: Number(received),
      damaged: Number(damaged),
      reason: cleanReason,
    });
  }

  const normalized = [...byProduct.values()];

  if (!normalized.some((l) => l.received > 0 || l.damaged > 0)) return null;

  return normalized;
};

/* Books one physical delivery against an order.

   received goes to the shelf; damaged counts against the order but never
   against stock — the unit arrived, so the supplier owes nothing more, but
   nobody can sell it.

   The clientToken plus the unique {purchaseId, clientToken} index is the
   double-tap guard: a retry of the same confirm finds the row already there
   and is answered with it instead of booking the delivery twice.

   Failure anywhere after the receipt row exists takes back the stock already
   applied, the received counts already advanced, and the row itself — the
   same compensation shape completePurchase has always used. */
export const receiveDelivery = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  const lines = normalizeLines(req.body.lines);
  if (!lines) {
    return res.status(400).json({
      message: "Every line needs a product and a whole received or damaged count, and something must have arrived.",
    });
  }

  const clientToken =
    typeof req.body.clientToken === "string" && req.body.clientToken.length > 0
      ? req.body.clientToken.slice(0, 100)
      : null;

  if (!clientToken) {
    return res.status(400).json({ message: "clientToken is required, so a retry cannot book a delivery twice." });
  }

  try {
    const purchase = await Purchase.findById(id);

    if (!purchase) return res.status(404).json({ message: "Purchase not found" });

    if (purchase.status === "COMPLETED") {
      return res.status(409).json({ message: "This order is already fully received." });
    }

    // Every line must be on the order, and fit inside what remains.
    for (const line of lines) {
      const item = purchase.items.find(
        (i) => String(i.productId) === String(line.productId)
      );

      if (!item) {
        return res.status(400).json({ message: "That product is not on this order." });
      }

      const remaining = item.quantity - (item.received || 0);

      if (line.received + line.damaged > remaining) {
        return res.status(400).json({
          message: "That is more than remains on the order. Raise a new order for extras.",
        });
      }
    }

    let receipt = null;

    try {
      receipt = await GoodsReceipt.create({
        purchaseId: purchase._id,
        receivedBy: req.adminId,
        invoiceNumber: String(req.body.invoiceNumber ?? "").slice(0, 100),
        note: String(req.body.note ?? "").slice(0, 500),
        clientToken,
        lines,
      });
    } catch (err) {
      if (err.code === 11000) {
        // The double-tap: this delivery is already booked. Answer with it.
        const existing = await GoodsReceipt.findOne({ purchaseId: purchase._id, clientToken });
        return res.json({ receipt: existing, purchase });
      }
      throw err;
    }

    const appliedStock = [];
    const appliedOrder = [];

    try {
      for (const line of lines) {
        if (line.received > 0) {
          await Inventory.updateOne(
            { productId: line.productId },
            { $inc: { stock: line.received } },
            { upsert: true }
          );
          appliedStock.push(line);
        }

        const coverage = line.received + line.damaged;
        await Purchase.updateOne(
          { _id: purchase._id, "items.productId": line.productId },
          { $inc: { "items.$.received": coverage } }
        );
        appliedOrder.push({ productId: line.productId, coverage });
      }

      const fresh = await Purchase.findById(purchase._id);
      const done = fresh.items.every((i) => (i.received || 0) >= i.quantity);

      fresh.status = done ? "COMPLETED" : "PARTIAL";
      if (done) fresh.completedAt = new Date();
      await fresh.save();

      return res.status(201).json({ receipt, purchase: fresh });
    } catch (err) {
      console.error(err);

      for (const line of appliedStock) {
        try {
          await Inventory.updateOne(
            { productId: line.productId },
            { $inc: { stock: -line.received } }
          );
        } catch (rollbackErr) {
          console.error("Stock rollback failed for product", line.productId, rollbackErr);
        }
      }

      for (const { productId, coverage } of appliedOrder) {
        try {
          await Purchase.updateOne(
            { _id: purchase._id, "items.productId": productId },
            { $inc: { "items.$.received": -coverage } }
          );
        } catch (rollbackErr) {
          console.error("Order rollback failed for product", productId, rollbackErr);
        }
      }

      try {
        await GoodsReceipt.deleteOne({ _id: receipt._id });
      } catch (rollbackErr) {
        console.error("Receipt rollback failed", rollbackErr);
      }

      return res.status(500).json({ message: err.message });
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getReceiptsForPurchase = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const receipts = await GoodsReceipt.find({ purchaseId: req.params.id })
      .populate("lines.productId")
      .populate("receivedBy", "email role")
      .sort({ createdAt: -1 });

    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The storeroom's logbook: the latest deliveries across every order, newest
// first. Capped — the full ledger lives in the back office.
export const getRecentReceipts = async (req, res) => {
  try {
    const receipts = await GoodsReceipt.find()
      .populate("lines.productId")
      .populate("receivedBy", "email role")
      .populate({ path: "purchaseId", populate: { path: "supplierId" } })
      .sort({ createdAt: -1 })
      .limit(50);

    res.json(receipts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
