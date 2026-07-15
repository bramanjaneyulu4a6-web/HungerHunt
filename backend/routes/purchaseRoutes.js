import express from "express";

import {
  createPurchase,
  getNewPurchases,
  getCompletedPurchases,
  completePurchase
} from "../controllers/purchaseController.js";

import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protectAdmin, createPurchase);

router.get("/new", protectAdmin, getNewPurchases);

router.get(
  "/completed",
  protectAdmin,
  getCompletedPurchases
);

router.put(
  "/complete/:id",
  protectAdmin,
  completePurchase
);

export default router;