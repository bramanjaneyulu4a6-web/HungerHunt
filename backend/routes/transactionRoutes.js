import express from "express";
import {
  generateBill,
  getAllTransactions,
  verifyPayment,
} from "../controllers/transactionController.js";

import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Billing moves money, so every route here requires an admin token.
// The kiosk signs in as staff and sends one.
router.use(protectAdmin);

router.post("/verify-payment", verifyPayment);
router.post("/bill", generateBill);
router.get("/history", getAllTransactions);

export default router;
