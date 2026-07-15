import express from "express";
import {
  registerAdmin,
  loginAdmin,
  forgotPassword
} from "../controllers/adminController.js"


const router = express.Router();

router.post("/admin/register", registerAdmin);
router.post("/admin/login", loginAdmin);
router.post("/admin/forgot-password", forgotPassword);

export default router;