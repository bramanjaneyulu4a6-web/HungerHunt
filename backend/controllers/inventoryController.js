import mongoose from "mongoose";
import Inventory from "../models/Inventory.js";
import StockAdjustment from "../models/StockAdjustment.js";

export const getInventory = async (req, res) => {
  try {
    const inventory = await Inventory.find().populate({
      path: "productId",
      populate: {
        path: "stockGroup"
      }
    });

    // Sorted here, by product name, so every screen that reads the shelf
    // agrees on the order — the query itself cannot sort a populated field.
    inventory.sort((a, b) =>
      (a.productId?.name || "").localeCompare(b.productId?.name || "", "en", {
        sensitivity: "base"
      })
    );

    res.json(inventory);
  } catch (err) {
    res.status(500).json({
      message: err.message
    });
  }
};

// What counts as an adjustment: a whole, signed, non-zero number — and typed,
// so a stray boolean or blank does not coerce its way onto the shelf (the
// quantities.js rationale, for a signed count).
const isWholeNonZero = (v) =>
  (typeof v === "number" || (typeof v === "string" && v.trim() !== "")) &&
  Number.isInteger(Number(v)) &&
  Number(v) !== 0;

export const adjustStock = async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  const { delta, reason } = req.body ?? {};
  const cleanReason = String(reason ?? "").trim().slice(0, 200);

  if (!isWholeNonZero(delta)) {
    return res.status(400).json({
      message: "The adjustment must be a whole number of units, positive or negative, and not zero."
    });
  }

  if (!cleanReason) {
    return res.status(400).json({
      message: "A reason is required — the ledger is the point of adjusting here."
    });
  }

  const d = Number(delta);

  try {
    // The row must already exist: products are born with one, and the
    // backfill shelved everything older. Its absence means the product id is
    // wrong, not that a shelf should be invented.
    const row = await Inventory.findOne({ productId });

    if (!row) {
      return res.status(404).json({ message: "No inventory row for this product." });
    }

    // A write-down is conditional the same way a sale is, so a stale screen
    // cannot push the shelf below zero. A write-up needs no guard.
    const updated = await Inventory.findOneAndUpdate(
      d < 0 ? { productId, stock: { $gte: -d } } : { productId },
      { $inc: { stock: d } },
      { new: true }
    );

    if (!updated) {
      const current = await Inventory.findOne({ productId });
      return res.status(400).json({
        message: `Only ${current?.stock ?? 0} in stock — that adjustment would take it below zero. Refresh and try again.`
      });
    }

    // No movement without a row, in either direction: if the ledger write
    // fails, the stock write is taken back and the whole request fails.
    try {
      const adjustment = await StockAdjustment.create({
        productId,
        delta: d,
        reason: cleanReason,
        adjustedBy: req.adminId,
        stockAfter: updated.stock,
      });

      return res.status(201).json({ adjustment, stock: updated.stock });
    } catch (err) {
      await Inventory.updateOne({ productId }, { $inc: { stock: -d } }).catch(
        (rollbackErr) =>
          console.error("Adjustment rollback failed for product", productId, rollbackErr)
      );
      throw err;
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};

export const getAdjustments = async (req, res) => {
  const { productId } = req.params;

  if (!mongoose.Types.ObjectId.isValid(productId)) {
    return res.status(404).json({ message: "Product not found" });
  }

  try {
    const adjustments = await StockAdjustment.find({ productId })
      .populate("adjustedBy", "email role")
      .sort({ createdAt: -1 })
      .limit(100);

    res.json(adjustments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};