import express from "express";
import StockGroup from "../models/StockGroup.js";
import Product from "../models/Product.js";
import { protectAdmin } from "../middleware/authMiddleware.js";
import {
  DEFAULT_SUBCATEGORY,
  normalizeSubCategory,
  SUBCATEGORY_MAX_LENGTH,
} from '../utils/productSubcategory.js';

const router = express.Router();

router.use(protectAdmin);

router.get("/", async (req, res) => {
  try {
    const groups = await StockGroup.find().sort({ order: 1, name: 1 });
    res.json(groups);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/", async (req, res) => {
  try {
    const group = await StockGroup.create({
      name: req.body.name,
      order: await StockGroup.countDocuments(),
      subCategories: [DEFAULT_SUBCATEGORY],
    });
    res.status(201).json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

const cleanSubCategories = (value) => {
  if (!Array.isArray(value)) return { error: 'Sub-categories must be a list.' };
  const names = [...new Set(value.map(normalizeSubCategory))];
  if (names.some((name) => name.length > SUBCATEGORY_MAX_LENGTH)) {
    return { error: `Sub-category names must be ${SUBCATEGORY_MAX_LENGTH} characters or fewer.` };
  }
  if (!names.includes(DEFAULT_SUBCATEGORY)) names.push(DEFAULT_SUBCATEGORY);
  return { names };
};

router.put("/:id/subcategories", async (req, res) => {
  const cleaned = cleanSubCategories(req.body?.subCategories);
  if (cleaned.error) return res.status(400).json({ message: cleaned.error });

  const renameFrom = req.body?.renameFrom === undefined
    ? ''
    : normalizeSubCategory(req.body.renameFrom);
  const renameTo = req.body?.renameTo === undefined
    ? ''
    : normalizeSubCategory(req.body.renameTo);

  try {
    const category = await StockGroup.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const current = category.subCategories?.length
      ? category.subCategories.map(normalizeSubCategory)
      : [DEFAULT_SUBCATEGORY];
    const removed = current.filter((name) => !cleaned.names.includes(name) && name !== renameFrom);

    if (removed.length) {
      const used = await Product.exists({ stockGroup: category._id, subCategory: { $in: removed } });
      if (used) {
        return res.status(409).json({
          message: 'Move products out of a sub-category before removing it.',
        });
      }
    }

    if (renameFrom && renameTo && renameFrom !== renameTo) {
      if (!current.includes(renameFrom)) {
        const used = await Product.exists({ stockGroup: category._id, subCategory: renameFrom });
        if (!used) return res.status(404).json({ message: 'Sub-category not found.' });
      }
      await Product.updateMany(
        { stockGroup: category._id, subCategory: renameFrom },
        { $set: { subCategory: renameTo } }
      );
    }

    category.subCategories = cleaned.names;
    await category.save();
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message, error: error.message });
  }
});

router.put("/:id", async (req, res) => {
  try {
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.order !== undefined) updates.order = req.body.order;

    const group = await StockGroup.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    if (!group) return res.status(404).json({ message: "Category not found" });
    res.json(group);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

router.delete("/:id", async (req, res) => {
  try {
    const inUse = await Product.exists({ stockGroup: req.params.id });
    if (inUse) {
      return res.status(409).json({
        message: "Move all products to another category before removing this category",
      });
    }

    const group = await StockGroup.findByIdAndDelete(req.params.id);
    if (!group) return res.status(404).json({ message: "Category not found" });
    res.json({ message: "Category removed" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;
