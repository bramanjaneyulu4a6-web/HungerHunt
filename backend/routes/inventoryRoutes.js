import express from "express";
import { getInventory, adjustStock, getAdjustments } from "../controllers/inventoryController.js";
import { orStudent, protectAdmin, protectAnyStaff } from "../middleware/authMiddleware.js";

const router = express.Router();

// The menu the till sells from and the shelf the storeroom counts onto — every
// kind of staff reads it, and so does a student at the kiosk, who is drawing
// the same tiles from it. Changing stock is done through products and
// purchases, which keep their own narrower gates.
router.get("/", orStudent(protectAnyStaff), getInventory);

// Manual movements are the office's alone — the storeroom's stock changes
// arrive as goods receipts, and a student obviously never writes the shelf.
router.post("/:productId/adjust", protectAdmin, adjustStock);
router.get("/:productId/adjustments", protectAdmin, getAdjustments);

export default router;
