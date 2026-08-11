import express from "express";
import { getInventory } from "../controllers/inventoryController.js";
import { protectStaff } from "../middleware/authMiddleware.js";

const router = express.Router();

// The menu the till draws its tiles from, so a cashier reaches it. Reading
// stock is as far as it goes: changing it is done through products and
// purchases, both of which are admin-only.
router.get("/", protectStaff, getInventory);

export default router;
