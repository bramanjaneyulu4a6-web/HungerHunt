import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";
import { isNonNegativeNumber, isWholeNonNegative } from '../utils/quantities.js';
import { normalizeSubCategory, SUBCATEGORY_MAX_LENGTH } from '../utils/productSubcategory.js';


const LIMIT_PERIODS = ["DAILY", "WEEKLY", "MONTHLY", "TOTAL"];

// Forms send strings; both spellings of true mean true, as with `active`.
const asBoolean = (value) => value === true || value === "true";

/* Reads the purchase-limit fields off a request body.
 *
 * They arrive flat — purchaseLimitEnabled / Quantity / Period — because the
 * product form is multipart (it carries the image), and multipart has no
 * nested objects to send. Returns { present: false } when the body never
 * mentions the limit, which is how the archive toggle updates one field
 * without dragging a default over a configured limit.
 */
const readPurchaseLimit = (body) => {
  const mentions =
    body.purchaseLimitEnabled !== undefined ||
    body.purchaseLimitQuantity !== undefined ||
    body.purchaseLimitPeriod !== undefined;

  if (!mentions) return { present: false };

  const enabled = asBoolean(body.purchaseLimitEnabled);

  if (body.purchaseLimitPeriod !== undefined && !LIMIT_PERIODS.includes(body.purchaseLimitPeriod)) {
    return { present: true, error: "Limit period must be DAILY, WEEKLY, MONTHLY or TOTAL." };
  }

  // Only meaningful when the limit is on: turning one off should not be
  // refused because the box it leaves behind still reads blank.
  if (enabled) {
    if (!isWholeNonNegative(body.purchaseLimitQuantity) || Number(body.purchaseLimitQuantity) < 1) {
      return {
        present: true,
        error: "A purchase limit needs a whole quantity of one or more. Archive the product to stop selling it.",
      };
    }
  }

  // `value` creates the row whole; `fields` edits only what was named, so
  // switching a limit off leaves the quantity the office last chose sitting
  // there for when they switch it back on.
  const fields = {};

  if (body.purchaseLimitEnabled !== undefined) fields["purchaseLimit.enabled"] = enabled;

  if (isWholeNonNegative(body.purchaseLimitQuantity)) {
    fields["purchaseLimit.quantity"] = Number(body.purchaseLimitQuantity);
  }

  if (body.purchaseLimitPeriod !== undefined) {
    fields["purchaseLimit.period"] = body.purchaseLimitPeriod;
  }

  return {
    present: true,
    fields,
    value: {
      enabled,
      quantity: isWholeNonNegative(body.purchaseLimitQuantity)
        ? Number(body.purchaseLimitQuantity)
        : 0,
      period: body.purchaseLimitPeriod || "DAILY",
    },
  };
};

const uploadImage = (file) => {
  return new Promise((resolve, reject) => {

    const stream = cloudinary.uploader.upload_stream(
      {
        folder: "products"
      },
      (err, result) => {

        if (err) reject(err);

        else resolve(result.secure_url);

      }
    );

    streamifier.createReadStream(file.buffer).pipe(stream);

  });
};
export const addProduct = async (req, res) => {

  try {
    let image = "";

    if (req.file) {
      image = await uploadImage(req.file);
    }

    // Validated exactly as updateProduct validates it, and left out entirely
    // when absent so the schema default still applies — a caller that never
    // mentions reorder level should get the default, not a rejection for not
    // supplying one.
    if (req.body.reorderLevel !== undefined && !isWholeNonNegative(req.body.reorderLevel)) {
      return res.status(400).json({ message: "Reorder level must be a whole number of zero or more." });
    }
    if (req.body.safetyStock !== undefined && !isWholeNonNegative(req.body.safetyStock)) {
      return res.status(400).json({ message: "Safety stock must be a whole number of zero or more." });
    }
    const subCategory = normalizeSubCategory(req.body.subCategory);
    if (subCategory.length > SUBCATEGORY_MAX_LENGTH) {
      return res.status(400).json({ message: `Sub-category must be ${SUBCATEGORY_MAX_LENGTH} characters or fewer.` });
    }

    const purchaseLimit = readPurchaseLimit(req.body);

    if (purchaseLimit.error) {
      return res.status(400).json({ message: purchaseLimit.error });
    }

    const product = await Product.create({

      name: req.body.name,

      stockGroup: req.body.stockGroup,

      subCategory,

      unit: req.body.unit,

      price: req.body.price || 0,

      image,

      ...(req.body.reorderLevel !== undefined
        ? { reorderLevel: Number(req.body.reorderLevel) }
        : {}),
      ...(req.body.safetyStock !== undefined
        ? { safetyStock: Number(req.body.safetyStock) }
        : {}),

      ...(purchaseLimit.present ? { purchaseLimit: purchaseLimit.value } : {}),

    });

    // A product without a shelf is invisible to every sale screen and the
    // Inventory page alike, with nothing anywhere able to create the row
    // later except a goods receipt. So the catalogue row and its shelf are
    // created together or refused together.
    try {
      await Inventory.create({ productId: product._id, stock: 0 });
    } catch (err) {
      await Product.findByIdAndDelete(product._id).catch((rollbackErr) =>
        console.error("Product rollback failed", product._id, rollbackErr)
      );
      throw err;
    }

    res.status(201).json(product);

  } catch (error) {
    console.error("Product creation failed:", error);

    res.status(400).json({
      error: error.message
    });
  }

};

export const getProducts = async (req, res) => {
  try {
    // Active-only by default: both ordering screens build their lists here
    // and must not offer what is off sale. The admin catalogue asks for
    // everything so archived rows stay visible and restorable.
    const filter = req.query.all ? {} : { active: { $ne: false } };

    const products = await Product.find(filter)
      .collation({ locale: "en", strength: 2 })
      .sort({ name: 1 })
      .populate("stockGroup")
      .populate("unit");

    res.json(products);
  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};

export const updateProduct = async (req, res) => {
  if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
    return res.status(404).json({ message: "Product not found" });
  }

  try {
    // Only fields the body actually carries are written — an archive toggle
    // arrives alone, and must not drag undefined over the rest of the row.
    const updateData = {};

    if (req.body.name !== undefined) updateData.name = req.body.name;
    if (req.body.stockGroup !== undefined) updateData.stockGroup = req.body.stockGroup;
    if (req.body.subCategory !== undefined) {
      const subCategory = normalizeSubCategory(req.body.subCategory);
      if (subCategory.length > SUBCATEGORY_MAX_LENGTH) {
        return res.status(400).json({ message: `Sub-category must be ${SUBCATEGORY_MAX_LENGTH} characters or fewer.` });
      }
      updateData.subCategory = subCategory;
    }
    if (req.body.unit !== undefined) updateData.unit = req.body.unit;

    if (req.body.price !== undefined) {
      if (!isNonNegativeNumber(req.body.price)) {
        return res.status(400).json({ message: "Price must be a non-negative number." });
      }
      updateData.price = Number(req.body.price);
    }

    if (req.body.reorderLevel !== undefined) {
      if (!isWholeNonNegative(req.body.reorderLevel)) {
        return res.status(400).json({ message: "Reorder level must be a whole number of zero or more." });
      }
      updateData.reorderLevel = Number(req.body.reorderLevel);
    }

    if (req.body.safetyStock !== undefined) {
      if (!isWholeNonNegative(req.body.safetyStock)) {
        return res.status(400).json({ message: "Safety stock must be a whole number of zero or more." });
      }
      updateData.safetyStock = Number(req.body.safetyStock);
    }

    // Forms send strings; both spellings of true mean true.
    if (req.body.active !== undefined) {
      updateData.active = asBoolean(req.body.active);
    }

    const purchaseLimit = readPurchaseLimit(req.body);

    if (purchaseLimit.error) {
      return res.status(400).json({ message: purchaseLimit.error });
    }

    if (purchaseLimit.present) {
      Object.assign(updateData, purchaseLimit.fields);
    }

    if (req.file) {
      updateData.image = await uploadImage(req.file);
    }

    const product = await Product.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json(product);
  } catch (error) {
    // A refusal the caller can fix is 400; only genuine failure is 500.
    const status =
      error.name === "ValidationError" || error.name === "CastError" ? 400 : 500;
    res.status(status).json({ error: error.message });
  }
};



