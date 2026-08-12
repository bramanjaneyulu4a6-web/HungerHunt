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

    const supplier = await Supplier.create({
      name,
      phone: req.body.phone,
      contactPerson: req.body.contactPerson,
      notes: req.body.notes,
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
    const { name, phone, contactPerson, notes, active } = req.body;
    const supplier = await Supplier.findByIdAndUpdate(
      req.params.id,
      { name, phone, contactPerson, notes, active },
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
