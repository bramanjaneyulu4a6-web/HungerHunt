import express from "express";
import {
  registerAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword
} from "../controllers/adminController.js";
import { authLimiter, passwordResetRequestLimiter } from "../middleware/rateLimit.js";
/* Staff have their OWN gate, separate from the parents'. Recharges are done by
   an admin, so the office must stay able to sign in while parents flood. */
import { adminAuthGate } from "../middleware/authConcurrency.js";
import { protectAdminUnlessBootstrap } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", authLimiter, adminAuthGate, protectAdminUnlessBootstrap, registerAdmin);
router.post("/login", authLimiter, adminAuthGate, loginAdmin);
// Emails on every hit; same reasoning as the parent route.
router.post("/forgot-password", passwordResetRequestLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, adminAuthGate, resetPassword);

export default router;
