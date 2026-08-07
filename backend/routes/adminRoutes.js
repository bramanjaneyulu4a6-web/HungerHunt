import express from "express";
import {
  registerAdmin,
  loginAdmin,
  forgotPassword,
  resetPassword
} from "../controllers/adminController.js";
import { authLimiter } from "../middleware/rateLimit.js";
import { protectAdminUnlessBootstrap } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/register", authLimiter, protectAdminUnlessBootstrap, registerAdmin);
router.post("/login", authLimiter, loginAdmin);
router.post("/forgot-password", authLimiter, forgotPassword);
router.post("/reset-password/:token", authLimiter, resetPassword);

export default router;
