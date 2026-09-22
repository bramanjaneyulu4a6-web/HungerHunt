import express from "express";

import {
  approvePendingOrder,
  caretakerApprovePendingOrder,
  caretakerRejectPendingOrder,
  caretakerUpdatePendingOrder,
  createPendingOrder,
  getCaretakerPendingOrders,
  getParentPendingOrders,
  getPendingOrderStatus,
  markParentNotified,
  rejectPendingOrder,
  updatePendingOrder,
} from "../controllers/pendingOrderController.js";

import { orStudent, protectCaretaker, protectParent, protectStaff } from "../middleware/authMiddleware.js";
import { requireKioskOpenForStudents } from "../middleware/kioskOpen.js";

const router = express.Router();

/* Two audiences on one router, so each route names the token it takes rather
   than inheriting one. The till raises requests and asks after them; the parent
   reads and answers their own. Neither side's token opens the other's routes —
   the gates check the role claim, not just the signature, so no till token can
   approve a purchase on a parent's behalf.

   The till is two things now: a student at the kiosk, holding a session of
   their own, and the admin console. */

router.post("/", orStudent(protectStaff), requireKioskOpenForStudents, createPendingOrder);
router.get("/:id/status", orStudent(protectStaff), getPendingOrderStatus);

router.get("/parent", protectParent, getParentPendingOrders);
router.put("/:id", protectParent, updatePendingOrder);
router.post("/:id/approve", protectParent, approvePendingOrder);
router.post("/:id/reject", protectParent, rejectPendingOrder);

// The caretaker's door, for students whose parent has handed them the answer.
// Scoped per request to the caretaker's rooms and that standing permission.
router.get("/caretaker", protectCaretaker, getCaretakerPendingOrders);
router.post("/:id/caretaker-approve", protectCaretaker, caretakerApprovePendingOrder);
router.post("/:id/caretaker-reject", protectCaretaker, caretakerRejectPendingOrder);
router.put("/:id/caretaker", protectCaretaker, caretakerUpdatePendingOrder);

// "Notify Parent via WhatsApp" was tapped: once per order, from the kiosk (the
// student's own order) or the caretaker app (an order from their rooms).
router.post("/:id/parent-notified", orStudent(protectCaretaker), markParentNotified);

export default router;
