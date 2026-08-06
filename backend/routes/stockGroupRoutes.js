import express from "express";
import StockGroup from "../models/StockGroup.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protectAdmin);

router.get("/", async (req, res) => {
  try {
    const groups = await StockGroup.find();
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const group = await StockGroup.create({ name: req.body.name });
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const group = await StockGroup.findByIdAndUpdate(
      req.params.id,
      { name: req.body.name },
      { new: true, runValidators: true }
    );
    if (!group) return res.status(404).json({ message: "Stock group not found" });
    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const group = await StockGroup.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: "Stock group not found" });
    res.json({ message: "Stock group removed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
