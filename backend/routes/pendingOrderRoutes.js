import express from "express";

import {
  approvePendingOrder,
  createPendingOrder,
  getParentPendingOrders,
  getPendingOrderStatus,
  rejectPendingOrder,
  updatePendingOrder,
} from "../controllers/pendingOrderController.js";

import { protectAdmin, protectParent } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Two audiences on one router, so each route names the token it takes rather
   than inheriting one. The till raises requests and asks after them; the parent
   reads and answers their own. Neither side's token opens the other's routes —
   protectAdmin and protectParent check the role claim, not just the signature,
   so an admin token cannot approve a purchase on a parent's behalf. */

router.post("/", protectAdmin, createPendingOrder);
router.get("/:id/status", protectAdmin, getPendingOrderStatus);

router.get("/parent", protectParent, getParentPendingOrders);
router.put("/:id", protectParent, updatePendingOrder);
router.post("/:id/approve", protectParent, approvePendingOrder);
router.post("/:id/reject", protectParent, rejectPendingOrder);

export default router;
