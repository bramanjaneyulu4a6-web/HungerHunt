import express from "express";

import {
  approvePendingOrder,
  createPendingOrder,
  getParentPendingOrders,
  getPendingOrderStatus,
  rejectPendingOrder,
  updatePendingOrder,
} from "../controllers/pendingOrderController.js";

import { orStudent, protectParent, protectStaff } from "../middleware/authMiddleware.js";

const router = express.Router();

/* Two audiences on one router, so each route names the token it takes rather
   than inheriting one. The till raises requests and asks after them; the parent
   reads and answers their own. Neither side's token opens the other's routes —
   the gates check the role claim, not just the signature, so no till token can
   approve a purchase on a parent's behalf.

   The till is two things now: a student at the kiosk, holding a session of
   their own, and the admin console. */

router.post("/", orStudent(protectStaff), createPendingOrder);
router.get("/:id/status", orStudent(protectStaff), getPendingOrderStatus);

router.get("/parent", protectParent, getParentPendingOrders);
router.put("/:id", protectParent, updatePendingOrder);
router.post("/:id/approve", protectParent, approvePendingOrder);
router.post("/:id/reject", protectParent, rejectPendingOrder);

export default router;
