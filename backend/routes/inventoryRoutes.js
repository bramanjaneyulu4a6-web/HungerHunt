import express from "express";
import { getInventory } from "../controllers/inventoryController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

// The kiosk signs in as staff, so stock levels never need to be public.
router.use(protectAdmin);

router.get("/", getInventory);

export default router;
