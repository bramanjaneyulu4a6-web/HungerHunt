import express from 'express';
import { addProduct, getProducts, updateProduct, deleteProduct } from '../controllers/productController.js';
import { protectAdmin } from '../middleware/authMiddleware.js';
import upload from "../middleware/upload.js";

const router = express.Router();

router.get('/', getProducts);


// router.post('/', protectAdmin, addProduct);
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