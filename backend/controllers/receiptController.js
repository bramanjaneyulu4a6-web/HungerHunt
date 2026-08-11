import mongoose from "mongoose";

import Purchase from "../models/Purchase.js";
import GoodsReceipt from "../models/GoodsReceipt.js";
import Inventory from "../models/Inventory.js";
import { isNonNegativeNumber, isWholeNonNegative } from "../utils/quantities.js";

// A price the storeroom did not type is not a price of zero. Left out, it must
// leave whatever the order already believes alone.
const priceGiven = (v) => v !== undefined && v !== null && v !== "";

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
    const { productId, received = 0, damaged = 0, reason = "", purchasePrice } = line ?? {};

    if (!mongoose.Types.ObjectId.isValid(productId)) return null;
    if (!isWholeNonNegative(received) || !isWholeNonNegative(damaged)) return null;

    /* Validated as money rather than as a count: a rate per kilo is fractional
       and a free sample is zero, so only "not a number" and "less than
       nothing" are wrong. Absent is fine and means the invoice was not to
       hand. */
    if (priceGiven(purchasePrice) && !isNonNegativeNumber(purchasePrice)) return null;

    const price = priceGiven(purchasePrice) ? Number(purchasePrice) : undefined;
    const cleanReason = String(reason).slice(0, 200);
    const seen = byProduct.get(String(productId));

    if (seen) {
      seen.received += Number(received);
      seen.damaged += Number(damaged);
      // Both explanations are kept — each one is about units that arrived.
      seen.reason = [seen.reason, cleanReason].filter(Boolean).join("; ").slice(0, 200);
      if (seen.purchasePrice === undefined && price !== undefined) {
        seen.purchasePrice = price;
      }
      continue;
    }

    byProduct.set(String(productId), {
      productId,
      received: Number(received),
      damaged: Number(damaged),
      reason: cleanReason,
      ...(price === undefined ? {} : { purchasePrice: price }),
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
      message: "Every line needs a product, a whole received or damaged count and a non-negative unit cost if one is given, and something must have arrived.",
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

    /* The token is looked up before anything is judged, because the retry it
       exists for is precisely the one every check below would refuse. A
       confirm whose response was eaten by the network committed: the order
       this re-read carries the advanced received counts, so the replay asks
       for units that no longer remain and would be told to raise a new order
       for extras — advice that invents a supplier debt out of a dropped
       packet. Finding the delivery already booked and answering with it is
       the whole point of minting the token.

       The 11000 catch further down stays as the backstop for the other case:
       two genuinely simultaneous taps, both of which read the order before
       either wrote. */
    const alreadyBooked = await GoodsReceipt.findOne({
      purchaseId: purchase._id,
      clientToken,
    });

    if (alreadyBooked) return res.json({ receipt: alreadyBooked, purchase });

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
        const item = purchase.items.find(
          (i) => String(i.productId) === String(line.productId)
        );

        /* The unit cost rides along on the same positional write when, and
           only when, the storeroom typed one. Nothing else in the system ever
           sets it on an order raised here, so without this the back office
           reports every warehouse-received order as ₹0.00 spent forever, with
           no screen able to correct it after the fact. Absent — or zero, which
           is what an empty box coerces to everywhere else in this system —
           means leave it alone: a second delivery with no invoice to hand must
           not wipe the price the first one recorded. The receipt row keeps the
           figure either way, so a genuinely free delivery is still on record. */
        await Purchase.updateOne(
          { _id: purchase._id, "items.productId": line.productId },
          {
            $inc: { "items.$.received": coverage },
            ...(line.purchasePrice > 0
              ? { $set: { "items.$.purchasePrice": line.purchasePrice } }
              : {}),
          }
        );
        /* The price the line held before this write, remembered only when this
           write is about to replace it. The compensation below is exact about
           every other field it touches; a price left standing on a delivery
           that was rolled back is a figure the ledger has no receipt for. */
        appliedOrder.push({
          productId: line.productId,
          coverage,
          priorPrice: line.purchasePrice > 0 ? Number(item?.purchasePrice || 0) : undefined,
        });
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

      for (const { productId, coverage, priorPrice } of appliedOrder) {
        try {
          await Purchase.updateOne(
            { _id: purchase._id, "items.productId": productId },
            {
              $inc: { "items.$.received": -coverage },
              ...(priorPrice === undefined
                ? {}
                : { $set: { "items.$.purchasePrice": priorPrice } }),
            }
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
