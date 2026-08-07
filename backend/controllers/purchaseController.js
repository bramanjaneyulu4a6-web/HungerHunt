import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import Inventory from "../models/Inventory.js";

// Accepts numbers and numeric strings; rejects null, blanks, NaN and negatives.
// A quantity of zero is allowed — it records an ordered item that never arrived.
const isNonNegativeNumber = (value) =>
  value !== null && value !== "" && Number.isFinite(Number(value)) && Number(value) >= 0;

// Returns the cleaned item list, or null when anything about it is unusable.
// Without this an unparseable quantity reached `stock` directly and corrupted it.
const normalizeItems = (items) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const normalized = [];

  for (const item of items) {
    const { productId, quantity, purchasePrice = 0 } = item ?? {};

    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    if (!isNonNegativeNumber(quantity)) return null;
    if (!isNonNegativeNumber(purchasePrice)) return null;

    normalized.push({
      productId,
      quantity: Number(quantity),
      purchasePrice: Number(purchasePrice)
    });
  }

  return normalized;
};

const ITEMS_REJECTED =
  "Every item needs a product, a quantity of zero or more, and a non-negative price.";

export const createPurchase = async (req, res) => {
  try {

    const items = normalizeItems(req.body.items);

    if (!items) {
      return res.status(400).json({ message: ITEMS_REJECTED });
    }

    const purchase = new Purchase({
      status: "NEW",
      items
    });

    await purchase.save();

    res.status(201).json(purchase);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message
    });
  }
};

export const getNewPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: "NEW"
    })
      .populate("items.productId")
      .sort({ createdAt: -1 });

    res.json(purchases);

  } catch (err) {
    console.error(err);
    res.status(500).json({
      message: err.message
    });
  }
};
export const getCompletedPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: "COMPLETED"
    }).populate("items.productId");

    res.json(purchases);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Undoes stock already added by a completion that failed partway through.
const removeStock = async (applied) => {
  for (const { productId, quantity } of applied) {
    try {
      await Inventory.updateOne({ productId }, { $inc: { stock: -quantity } });
    } catch (err) {
      console.error("Stock rollback failed for product", productId, err);
    }
  }
};

export const completePurchase = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  const items = normalizeItems(req.body.items);

  if (!items) {
    return res.status(400).json({ message: ITEMS_REJECTED });
  }

  let claimed = null;
  const applied = [];

  try {

    // Claim the order and record the delivery in one step. Only a purchase
    // still marked NEW is transitioned, so a double-click, a retry after a
    // slow response, or a second open tab cannot add the same delivery to
    // inventory twice.
    claimed = await Purchase.findOneAndUpdate(
      { _id: id, status: "NEW" },
      { items, status: "COMPLETED", completedAt: new Date() },
      { new: true, runValidators: true }
    );

    if (!claimed) {
      const exists = await Purchase.exists({ _id: id });

      return exists
        ? res.status(409).json({
            message: "This purchase order has already been completed."
          })
        : res.status(404).json({ message: "Purchase not found" });
    }

    // Upsert so two products arriving at once cannot both try to create the
    // same inventory row and trip its unique index.
    for (const item of claimed.items) {
      await Inventory.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
        { upsert: true }
      );

      applied.push({ productId: item.productId, quantity: item.quantity });
    }

    res.json(claimed);

  } catch (err) {
    console.error(err);

    // Take back the stock already applied and reopen the order, otherwise the
    // delivery is stranded on a COMPLETED purchase that can never be received.
    if (claimed) {
      await removeStock(applied);

      try {
        await Purchase.updateOne(
          { _id: id },
          { $set: { status: "NEW" }, $unset: { completedAt: 1 } }
        );
      } catch (reopenErr) {
        console.error("Could not reopen purchase", id, reopenErr);
      }
    }

    res.status(500).json({
      message: err.message
    });
  }
};