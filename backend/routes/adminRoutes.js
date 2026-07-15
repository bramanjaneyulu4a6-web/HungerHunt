import express from "express";
import {
  registerAdmin,
  loginAdmin,
  forgotPassword
} from "../controllers/adminController.js";

const router = express.Router();

// ✅ FIXED ROUTES (NO EXTRA /admin)
router.post("/register", registerAdmin);
router.post("/login", loginAdmin);
router.post("/forgot-password", forgotPassword);

export default router;