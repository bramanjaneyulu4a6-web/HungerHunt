import express from "express";
import Supplier from "../models/Supplier.js";
import { protectAdmin, protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

/* The storeroom reads suppliers to raise an order against one; only the back
   office changes them. Deactivation is the only removal — orders keep
   pointing at the row. */

router.get("/", protectWarehouse, async (req, res) => {
  try {
    const filter = req.query.all ? {} : { active: true };
    const suppliers = await Supplier.find(filter).sort({ name: 1 });
    res.json(suppliers);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", protectAdmin, async (req, res) => {
  try {
    const name = String(req.body.name ?? "").trim();
    if (!name) return res.status(400).json({ message: "Supplier name is required" });

    const leadTimeDays = Number(req.body.leadTimeDays ?? 7);
    if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
      return res.status(400).json({ message: 'Lead time must be zero days or more.' });
    }

    const supplier = await Supplier.create({
      name,
      phone: req.body.phone,
      contactPerson: req.body.contactPerson,
      notes: req.body.notes,
      leadTimeDays,
    });

    res.status(201).json(supplier);
  } catch (error) {
    // A duplicate name trips Mongo's unique index before it ever reaches
    // Mongoose validation, so the message on it is collection internals —
    // "E11000 duplicate key error collection: ... index: name_1 dup key:
    // {...}" — not something to put in front of whoever typed the name.
    if (error.code === 11000) {
      return res.status(409).json({ message: "A supplier with that name already exists." });
    }
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", protectAdmin, async (req, res) => {
  try {
    const writable = ['name', 'phone', 'contactPerson', 'notes', 'active'];
    const update = Object.fromEntries(
      writable.filter((field) => req.body[field] !== undefined).map((field) => [field, req.body[field]])
    );
    if (req.body.leadTimeDays !== undefined) {
      const leadTimeDays = Number(req.body.leadTimeDays);
      if (!Number.isFinite(leadTimeDays) || leadTimeDays < 0) {
        return res.status(400).json({ message: 'Lead time must be zero days or more.' });
      }
      update.leadTimeDays = leadTimeDays;
    }
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      update,
      { new: true, runValidators: true }
    );
    if (!supplier) return res.status(404).json({ message: "Supplier not found" });
    res.json(supplier);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A supplier with that name already exists." });
    }
    res.status(400).json({ error: error.message });
  }
});

export default router;
