// import express from 'express';
// import {
//   generateBill,
//   getAllTransactions,
//   verifyPayment
// } from "../controllers/transactionController.js";
// import { protectAdmin } from '../middleware/authMiddleware.js';

// const router = express.Router();
// router.post("/verify-payment", verifyPayment);
// // Secure all transaction processing capabilities to school terminal operators
// router.use(protectAdmin);

// // @route   POST /api/transactions/bill
// // @desc    Process custom store checkout, deduct wallet money, adjust current stock
// router.post('/bill', generateBill);

// // @route   GET /api/transactions/history
// // @desc    Get master log of all school store transactions for administrative audit
// router.get('/history', getAllTransactions);



// export default router;





import express from "express";
import {
  generateBill,
  getAllTransactions,
  verifyPayment,
} from "../controllers/transactionController.js";

import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public kiosk routes
router.post("/verify-payment", verifyPayment);
router.post("/bill", generateBill);

// Admin routes
router.use(protectAdmin);

router.get("/history", getAllTransactions);

export default router;