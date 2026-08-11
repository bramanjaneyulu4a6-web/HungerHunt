import express from "express";
import {
  generateBill,
  getAllTransactions,
  verifyPayment,
} from "../controllers/transactionController.js";

import { protectAdmin, protectStaff } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Taking a payment is the till's whole job, so both routes it needs are open to
   a cashier. Neither can be driven from the token alone: the student's own
   4-digit code has to clear verify-payment first, and the purchase token it
   issues is single-use, expires in two minutes and is bound to that exact cart.

   The ledger is a different matter — every purchase every student has ever
   made is a report, not a step in a sale, and it stays with the back office. */

router.post("/verify-payment", protectStaff, verifyPayment);
router.post("/bill", protectStaff, generateBill);
router.get("/history", protectAdmin, getAllTransactions);

export default router;
