import express from 'express';
import { addProduct, getProducts, updateProduct, deleteProduct } from '../controllers/productController.js';
import { protectAdmin, protectWarehouse } from '../middleware/authMiddleware.js';
import upload from "../middleware/upload.js";

const router = express.Router();

// The storeroom reads the catalogue to raise an order from it; only the back
// office changes it.
router.get('/', protectWarehouse, getProducts);

router.post(
  '/',
  protectAdmin,
  upload.single("image"),
  addProduct
);

router.route('/:id')
  .put(
  protectAdmin,
  upload.single("image"),
  updateProduct
)
  .delete(protectAdmin, deleteProduct);

export default router;