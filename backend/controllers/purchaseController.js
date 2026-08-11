import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import Inventory from "../models/Inventory.js";
import GoodsReceipt from "../models/GoodsReceipt.js";
import { isNonNegativeNumber, isWholeNonNegative } from "../utils/quantities.js";

/* Returns the cleaned item list, or null when anything about it is unusable.
   Without this an unparseable quantity reached `stock` directly and corrupted it.

   Folded by product, the same shape as normalizeLines in receiptController —
   and for the same reason. Every write to items[].received uses the positional
   "items.$" operator, which touches only the first array element that matches,
   so a second line for a product already on the order is a line nothing can
   ever receive against and the order sticks on PARTIAL forever.

   `whole` is what separates raising an order from closing one. A new order has
   to be in units a receipt can express — receipts are whole, so an order for
   2.5 satisfies `received >= quantity` never and the over-receipt guard caps
   the last delivery at 2. Rows raised before that rule existed may hold
   fractions, and the one-step close below still has to be able to close them,
   so it asks for the looser check. */
const normalizeItems = (items, { whole }) => {
  if (!Array.isArray(items) || items.length === 0) return null;

  const acceptable = whole ? isWholeNonNegative : isNonNegativeNumber;
  const byProduct = new Map();

  for (const item of items) {
    const { productId, quantity, purchasePrice = 0 } = item ?? {};

    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    if (!acceptable(quantity)) return null;
    if (!isNonNegativeNumber(purchasePrice)) return null;

    const seen = byProduct.get(String(productId));

    if (seen) {
      seen.quantity += Number(quantity);
      // A zero price is "nobody said", so a later row that does say wins over
      // it; two rows that both name a price keep the first, which is the one
      // the person filling the form saw.
      if (!seen.purchasePrice) seen.purchasePrice = Number(purchasePrice);
      continue;
    }

    byProduct.set(String(productId), {
      productId,
      quantity: Number(quantity),
      purchasePrice: Number(purchasePrice)
    });
  }

  return [...byProduct.values()];
};

const ORDER_REJECTED =
  "Every item needs a product, a whole quantity of zero or more, and a non-negative price.";

const ITEMS_REJECTED =
  "Every item needs a product, a quantity of zero or more, and a non-negative price.";

export const createPurchase = async (req, res) => {
  try {

    const items = normalizeItems(req.body.items, { whole: true });

    if (!items) {
      return res.status(400).json({ message: ORDER_REJECTED });
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

/* The back office's pending list. PARTIAL belongs here as much as NEW: a
   supplier who never ships the last three units leaves an order that the
   storeroom cannot receive to the end, and if this asked for NEW alone that
   order would vanish from every screen with nothing anywhere able to close
   it. The admin closes it at what actually arrived; the shortfall stays on
   the record. */
export const getNewPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: { $in: ["NEW", "PARTIAL"] }
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
/* Lean on purpose, and the console's money depends on it. Hydration applies
   the schema default, so a row closed before receipts existed — which has no
   `received` field in the database at all — would arrive at the browser
   carrying `received: 0`. The console reads `item.received ?? item.quantity`,
   meaning "an order closed before receipts existed was fully received", and a
   zero that Mongoose invented satisfies `??` perfectly well: every legacy
   order would report nothing arrived and ₹0.00 spent, against rows somebody
   reconciles the school's money with. Lean hands back what the document
   actually holds, so absent stays absent and the fallback fires.

   The pending list above is deliberately not lean. There the same absent field
   means the opposite — nothing has arrived on an order nobody has closed — and
   0 is the honest reading of it. */
export const getCompletedPurchases = async (req, res) => {
  try {

    const purchases = await Purchase.find({
      status: { $in: ["COMPLETED", "CANCELLED"] }
    })
      .populate("items.productId")
      .populate("supplierId")
      .lean();

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

/* The one-step close the back-office screen calls, and the only way a part
   delivered order the supplier abandoned ever gets finished. Reimplemented
   over receipts so even these closes leave an audit row: what arrived is
   booked as a receipt (stamped with who), and the order is then closed
   whatever remains — which is exactly what the old overwrite did, except the
   shortfall now stays visible instead of being edited away.

   It posts quantities rather than deriving them, so it carries the same
   over-receipt guard as receiveDelivery: the only thing it may apply is what
   the order still has outstanding. */
export const completePurchase = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  // Deliberately the looser check: this is the path that has to keep closing
  // orders raised before whole quantities were required of them.
  const items = normalizeItems(req.body.items, { whole: false });

  if (!items) {
    return res.status(400).json({ message: ITEMS_REJECTED });
  }

  let claimed = null;
  let receipt = null;
  let reopenTo = "NEW";
  // Two lists rather than one, because the two writes per item can fail
  // between each other and the compensation has to take back exactly what
  // landed — no more, and nothing it never applied.
  const appliedStock = [];
  const appliedOrder = [];

  try {
    /* Read before claiming, exactly as receiveDelivery does, because this
       screen can be looked at for a long time. An order for ten that the
       storeroom has already booked six against is PARTIAL with received: 6,
       and a tab opened before that still shows ten in every box. Closing it
       would add ten units of stock when four were owed, advance received to
       sixteen against an ordered ten, and file a receipt claiming a delivery
       that never came — after which the shortfall reads as zero and the
       corruption is invisible. What remains is the only quantity this may
       apply. */
    const order = await Purchase.findById(id);

    if (!order) return res.status(404).json({ message: "Purchase not found" });

    if (order.status === "COMPLETED") {
      return res.status(409).json({
        message: "This purchase order has already been completed."
      });
    }

    // What the catch has to put back. A PARTIAL order reopened as NEW would
    // return to the pending list looking untouched with its received counts
    // already advanced, which is the same over-apply from the other side.
    reopenTo = order.status === "PARTIAL" ? "PARTIAL" : "NEW";

    for (const item of items) {
      /* Summed across every matching line rather than taken from the first,
         because a legacy order may carry the same product twice and the
         person closing it is looking at both rows. New orders are folded at
         creation, so for them this is the single line's remainder. */
      const lines = order.items.filter(
        (i) => String(i.productId) === String(item.productId)
      );

      if (lines.length === 0) {
        return res.status(400).json({ message: "That product is not on this order." });
      }

      const remaining = lines.reduce(
        (sum, line) => sum + (line.quantity - (line.received || 0)),
        0
      );

      if (item.quantity > remaining) {
        return res.status(400).json({
          message:
            "That is more than remains on the order — a delivery has already been booked against it. Refresh and close it at what is still outstanding.",
        });
      }
    }

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

      /* Same rule as the receive path: a price is only written when one was
         actually given. normalizeItems defaults an absent price to 0, so
         setting it unconditionally means an admin who clears the box wipes the
         figure the storeroom copied off the supplier's invoice — and nothing
         anywhere can put it back. */
      await Purchase.updateOne(
        { _id: id, "items.productId": item.productId },
        {
          $inc: { "items.$.received": item.quantity },
          ...(item.purchasePrice > 0
            ? { $set: { "items.$.purchasePrice": item.purchasePrice } }
            : {})
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
          { $set: { status: reopenTo }, $unset: { completedAt: 1 } }
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

/* The exit for an order raised by mistake. Guarded the same way completion
   is — only a still-open order transitions, so two tabs cannot both cancel
   and a completed order cannot be un-completed by the back door. Nothing is
   compensated because nothing is undone: whatever receipts already booked
   stays booked, and the shortfall stays readable as ordered minus received. */
export const cancelPurchase = async (req, res) => {
  const { id } = req.params;

  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(404).json({ message: "Purchase not found" });
  }

  try {
    const cancelled = await Purchase.findOneAndUpdate(
      { _id: id, status: { $in: ["NEW", "PARTIAL"] } },
      { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: req.adminId },
      { new: true, runValidators: true }
    );

    if (!cancelled) {
      const exists = await Purchase.exists({ _id: id });

      return exists
        ? res.status(409).json({
            message: "This order is already closed — completed or cancelled elsewhere."
          })
        : res.status(404).json({ message: "Purchase not found" });
    }

    res.json(cancelled);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: err.message });
  }
};