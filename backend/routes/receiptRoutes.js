import express from "express";
import { getRecentReceipts } from "../controllers/receiptController.js";
import { protectWarehouse } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protectWarehouse, getRecentReceipts);

export default router;
