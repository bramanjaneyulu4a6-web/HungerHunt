import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";
import { isNonNegativeNumber, isWholeNonNegative } from '../utils/quantities.js';


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

    const product = await Product.create({

      name: req.body.name,

      stockGroup: req.body.stockGroup,

      unit: req.body.unit,

      price: req.body.price || 0,

      image,

      ...(req.body.reorderLevel !== undefined
        ? { reorderLevel: Number(req.body.reorderLevel) }
        : {}),

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

    // Forms send strings; both spellings of true mean true.
    if (req.body.active !== undefined) {
      updateData.active = req.body.active === true || req.body.active === "true";
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





