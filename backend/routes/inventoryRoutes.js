// import express from "express";
// import { getInventory } from "../controllers/inventoryController.js";

// const router = express.Router();

// router.get("/", getInventory);

// export default router;



import express from "express";
import { getInventory } from "../controllers/inventoryController.js";
import { protectAdmin } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protectAdmin, getInventory);

// Public endpoint for kiosk
router.get("/public", getInventory);

export default router;