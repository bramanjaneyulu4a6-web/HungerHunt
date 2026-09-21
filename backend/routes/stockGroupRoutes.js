import express from "express";
import StockGroup, { LIMIT_PERIODS } from "../models/StockGroup.js";
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

/* Categories are code-defined: scripts/data/catalogue.json lists them and
   seedCatalogue.js loads them, and frontend-admin/src/constants/units.js maps
   each name to the measurement units its products may be sold in. That map
   keys off the name, so a category created — or renamed — through the API
   would match no units, and the product form would quietly fall back to
   offering all of them.

   Creating, renaming and removing therefore all happen in the seed data, and
   405 here rather than a silent 404 tells a stale console the route is sealed
   rather than mistyped. Display order and sub-categories stay editable below:
   neither is keyed on by anything. */
const sealed = (req, res) =>
  res.status(405).json({
    message:
      "Categories are defined in the catalogue seed, not through the API. Edit scripts/data/catalogue.json and re-run the seed.",
  });

router.post("/", sealed);
router.delete("/:id", sealed);

const cleanSubCategories = (value) => {
  if (!Array.isArray(value)) return { error: 'Sub-categories must be a list.' };
  const names = [...new Set(value.map(normalizeSubCategory))];
  if (names.some((name) => name.length > SUBCATEGORY_MAX_LENGTH)) {
    return { error: `Sub-category names must be ${SUBCATEGORY_MAX_LENGTH} characters or fewer.` };
  }
  if (!names.includes(DEFAULT_SUBCATEGORY)) names.push(DEFAULT_SUBCATEGORY);
  return { names };
};

/* A cap as the console sends it: { enabled, quantity, period }. Off keeps
   whatever quantity was there, as a product's cap does, so switching a cap
   back on restores it. On needs a whole number of at least 1 — "none at all"
   is what switching the category off is for. */
const readLimit = (value) => {
  if (!value || typeof value !== "object") return { error: "A limit must be { enabled, quantity, period }." };
  const enabled = value.enabled === true;
  const period = value.period === undefined ? "WEEKLY" : value.period;
  if (!LIMIT_PERIODS.includes(period)) {
    return { error: `The period must be one of ${LIMIT_PERIODS.join(", ")}.` };
  }
  const quantity = value.quantity === undefined || value.quantity === "" ? 0 : Number(value.quantity);
  if (!Number.isFinite(quantity) || quantity < 0 || !Number.isInteger(quantity)) {
    return { error: "The limit must be a whole number." };
  }
  if (enabled && quantity < 1) {
    return { error: "Enter a limit of at least 1, or switch the limit off." };
  }
  return { limit: { enabled, quantity, period } };
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

    // A sub-category's cap follows its name: carried by a rename, dropped
    // with the sub-category, so no cap outlives what it was set on.
    const renamed = renameFrom && renameTo && renameFrom !== renameTo;
    category.subCategoryLimits = (category.subCategoryLimits || [])
      .map((entry) => (renamed && entry.name === renameFrom ? { ...entry.toObject?.() ?? entry, name: renameTo } : entry))
      .filter((entry) => cleaned.names.includes(entry.name));

    category.subCategories = cleaned.names;
    await category.save();
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message, error: error.message });
  }
});

/* One sub-category's cap: { subCategory, enabled, quantity, period }. The
   sub-category must be one this category lists. */
router.put("/:id/subcategory-limits", async (req, res) => {
  const name = normalizeSubCategory(req.body?.subCategory);
  const read = readLimit(req.body);
  if (read.error) return res.status(400).json({ message: read.error });

  try {
    const category = await StockGroup.findById(req.params.id);
    if (!category) return res.status(404).json({ message: "Category not found" });

    const listed = (category.subCategories?.length ? category.subCategories : [DEFAULT_SUBCATEGORY])
      .map(normalizeSubCategory);
    if (!listed.includes(name)) return res.status(404).json({ message: "Sub-category not found." });

    const others = (category.subCategoryLimits || []).filter((entry) => entry.name !== name);
    category.subCategoryLimits = [...others, { name, ...read.limit }];
    await category.save();
    res.json(category);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* `order`, `active` and the category's own `purchaseLimit`. A name in the
   body is ignored rather than refused, because the reorder caller sends the
   whole group back when dragging tabs into a new kiosk order, and rejecting
   that would break reordering to punish a field nobody meant to change. */
router.put("/:id", async (req, res) => {
  try {
    const updates = {};
    if (req.body.order !== undefined) updates.order = req.body.order;
    if (req.body.active !== undefined) {
      if (typeof req.body.active !== "boolean") {
        return res.status(400).json({ message: "active must be true or false." });
      }
      updates.active = req.body.active;
    }
    if (req.body.purchaseLimit !== undefined) {
      const read = readLimit(req.body.purchaseLimit);
      if (read.error) return res.status(400).json({ message: read.error });
      updates.purchaseLimit = read.limit;
    }

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

export default router;
