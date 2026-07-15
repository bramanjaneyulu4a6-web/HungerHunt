// import Product from '../models/Product.js';

// // export const addProduct = async (req, res) => {
// //   try {
// //     const product = await Product.create(req.body);
// //     res.status(201).json(product);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // };

// export const addProduct = async (req, res) => {

//   try {

//     const product = await Product.create({
//       name: req.body.name
//     });

//     res.status(201).json(product);

//   } catch (error) {
//     res.status(400).json({
//       error: error.message
//     });
//   }
// };

// export const getProducts = async (req, res) => {
//   try {
//     const products = await Product.find();
//     res.json(products);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// // export const updateProduct = async (req, res) => {
// //   try {
// //     const product = await Product.findByIdAndUpdate(req.params.id, req.body, { new: true });
// //     res.json(product);
// //   } catch (error) {
// //     res.status(400).json({ error: error.message });
// //   }
// // };

// // export const updateProduct = async (req, res) => {

// //   const product =
// //     await Product.findByIdAndUpdate(
// //       req.params.id,
// //       {
// //         name: req.body.name
// //       },
// //       {
// //         new: true
// //       }
// //     );

// //   res.json(product);
// // };


// export const updateProduct = async (req, res) => {
//   try {
//     const product = await Product.findByIdAndUpdate(
//       req.params.id,
//       {
//         name: req.body.name,
//         price: req.body.price
//       },
//       {
//         new: true
//       }
//     );

//     res.json(product);
//   } catch (error) {
//     res.status(500).json({
//       error: error.message
//     });
//   }
// };


// export const deleteProduct = async (req, res) => {
//   try {

//     await Inventory.findOneAndDelete({
//       productId: req.params.id
//     });

//     await Product.findByIdAndDelete(
//       req.params.id
//     );

//     res.json({
//       message: "Product removed"
//     });

//   } catch (error) {
//     res.status(500).json({
//       error: error.message
//     });
//   }
// };


// // export const deleteProduct = async (req, res) => {
// //   try {
// //     await Product.findByIdAndDelete(req.params.id);
// //     res.json({ message: 'Product removed' });
// //   } catch (error) {
// //     res.status(500).json({ error: error.message });
// //   }
// // };





// 19-06-2026




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
console.log(req.body);
console.log(req.file);
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
  console.log("========== PRODUCT ERROR ==========");
  console.log(error);
  console.log(error.message);
  console.log(error.stack);

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





