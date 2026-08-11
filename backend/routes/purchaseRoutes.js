import express from "express";

import {
  createPurchase,
  getNewPurchases,
  getCompletedPurchases,
  getOpenPurchases,
  getPurchase,
  completePurchase,
  cancelPurchase
} from "../controllers/purchaseController.js";

import {
  receiveDelivery,
  getReceiptsForPurchase
} from "../controllers/receiptController.js";

import { protectAdmin, protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

/* The storeroom raises orders and looks at what is still open; the back
   office keeps the completed ledger and the legacy complete-in-one-step
   endpoint its old screen still calls. /:id goes last so the named routes
   above it are not swallowed. */

router.post("/", protectWarehouse, createPurchase);
router.get("/open", protectWarehouse, getOpenPurchases);

router.get("/new", protectAdmin, getNewPurchases);
router.get("/completed", protectAdmin, getCompletedPurchases);
router.put("/complete/:id", protectAdmin, completePurchase);
router.put("/cancel/:id", protectAdmin, cancelPurchase);

router.post("/:id/receipts", protectWarehouse, receiveDelivery);
router.get("/:id/receipts", protectWarehouse, getReceiptsForPurchase);

router.get("/:id", protectWarehouse, getPurchase);

export default router;
