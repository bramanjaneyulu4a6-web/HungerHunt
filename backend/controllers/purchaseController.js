import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import Inventory from "../models/Inventory.js";
import GoodsReceipt from "../models/GoodsReceipt.js";

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

    const supplierId = req.body.supplierId;
    if (supplierId !== undefined && supplierId !== null && supplierId !== "" &&
        !mongoose.Types.ObjectId.isValid(supplierId)) {
      return res.status(400).json({ message: "Unknown supplier" });
    }

    const purchase = await Purchase.create({
      status: "NEW",
      items,
      ...(supplierId ? { supplierId } : {}),
      raisedBy: req.adminId,
    });

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
      .populate("supplierId")
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
    })
      .populate("items.productId")
      .populate("supplierId");

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

// And undoes the received counts it already advanced. Left behind, they would
// eat into what the order still has remaining, so the retry of a failed close
// would be refused as an over-receipt against a delivery that never landed.
const removeReceived = async (id, applied) => {
  for (const { productId, quantity } of applied) {
    try {
      await Purchase.updateOne(
        { _id: id, "items.productId": productId },
        { $inc: { "items.$.received": -quantity } }
      );
    } catch (err) {
      console.error("Received rollback failed for product", productId, err);
    }
  }
};

/* The one-step close the old back-office screen still calls. Reimplemented
   over receipts so even legacy closes leave an audit row: what arrived is
   booked as a receipt (stamped with who), and the order is then closed
   whatever remains — which is exactly what the old overwrite did, except the
   shortfall now stays visible instead of being edited away. Retired once the
   screen moves to receipts in a later task. */
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
  let receipt = null;
  // Two lists rather than one, because the two writes per item can fail
  // between each other and the compensation has to take back exactly what
  // landed — no more, and nothing it never applied.
  const appliedStock = [];
  const appliedOrder = [];

  try {
    // Only a still-open order transitions, so a double-click or second tab
    // cannot add the same delivery to inventory twice.
    claimed = await Purchase.findOneAndUpdate(
      { _id: id, status: { $in: ["NEW", "PARTIAL"] } },
      { status: "COMPLETED", completedAt: new Date() },
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

    /* The audit row is a precondition of the close, not a footnote to it: an
       order closed with no receipt behind it is the silent overwrite this
       ledger exists to end. Written before anything is applied, so a failure
       here falls into the catch below with nothing yet to compensate — the
       order reopens and the screen can be retried. */
    receipt = await GoodsReceipt.create({
      purchaseId: claimed._id,
      receivedBy: req.adminId,
      invoiceNumber: "",
      note: "Closed from the back office in one step.",
      clientToken: `legacy-${id}-${Date.now()}`,
      lines: items.map((i) => ({ productId: i.productId, received: i.quantity, damaged: 0 })),
    });

    for (const item of items) {
      await Inventory.updateOne(
        { productId: item.productId },
        { $inc: { stock: item.quantity } },
        { upsert: true }
      );

      appliedStock.push({ productId: item.productId, quantity: item.quantity });

      await Purchase.updateOne(
        { _id: id, "items.productId": item.productId },
        {
          $inc: { "items.$.received": item.quantity },
          $set: { "items.$.purchasePrice": item.purchasePrice }
        }
      );

      appliedOrder.push({ productId: item.productId, quantity: item.quantity });
    }

    res.json(claimed);

  } catch (err) {
    console.error(err);

    // Take back the stock already applied and reopen the order, otherwise the
    // delivery is stranded on a COMPLETED purchase that can never be received.
    if (claimed) {
      await removeStock(appliedStock);
      await removeReceived(id, appliedOrder);

      /* And take back the ledger row, which the reopened order no longer has
         a delivery to match. Left standing it would claim units that were
         never applied, so the shortfall derived from ordered-minus-receipts
         would understate what the supplier still owes — the same invariant
         broken from the other side. Each failed attempt mints its own token,
         so these accumulate rather than colliding. */
      if (receipt) {
        try {
          await GoodsReceipt.deleteOne({ _id: receipt._id });
        } catch (rollbackErr) {
          console.error("Receipt rollback failed for purchase", id, rollbackErr);
        }
      }

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

// NEW and PARTIAL together are "the storeroom's inbox": everything a delivery
// could still arrive against. Remaining per line is derivable client-side as
// quantity - received.
export const getOpenPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find({ status: { $in: ["NEW", "PARTIAL"] } })
      .populate("items.productId")
      .populate("supplierId")
      .sort({ createdAt: -1 });

    res.json(purchases);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPurchase = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ message: "Purchase not found" });
    }

    const purchase = await Purchase.findById(req.params.id)
      .populate("items.productId")
      .populate("supplierId");

    if (!purchase) return res.status(404).json({ message: "Purchase not found" });
    res.json(purchase);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};