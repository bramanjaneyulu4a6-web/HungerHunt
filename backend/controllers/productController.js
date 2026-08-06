import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import cloudinary from "../config/cloudinary.js";
import streamifier from "streamifier";


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

    const product = await Product.create({

      name: req.body.name,

      stockGroup: req.body.stockGroup,

      unit: req.body.unit,

      price: req.body.price || 0,

      image

    });

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

    const products = await Product.find()
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

  try {

    const updateData = {

      name: req.body.name,

      stockGroup: req.body.stockGroup,

      unit: req.body.unit,

      price: Number(req.body.price)

    };

    if (req.file) {

      updateData.image = await uploadImage(req.file);

    }

    const product = await Product.findByIdAndUpdate(

      req.params.id,

      updateData,

      {

        new: true,

        runValidators: true

      }

    );

    res.json(product);

  } catch (error) {

    res.status(500).json({

      error: error.message

    });

  }

};

export const deleteProduct = async (req, res) => {
  try {

    await Inventory.findOneAndDelete({
      productId: req.params.id
    });

    await Product.findByIdAndDelete(
      req.params.id
    );

    res.json({
      message: "Product removed"
    });

  } catch (error) {
    res.status(500).json({
      error: error.message
    });
  }
};





