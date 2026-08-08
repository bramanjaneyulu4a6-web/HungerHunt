import express from "express";

import {
    createPendingOrder,
    getParentPendingOrders,
    updatePendingOrder,
    approvePendingOrder,
    rejectPendingOrder,
    getPendingOrderStatus
} from "../controllers/pendingOrderController.js";

import { protectParent } from "../middleware/parentAuth.js";

const router = express.Router();

router.post("/", createPendingOrder);

router.get(
  "/parent",
  protectParent,
  getParentPendingOrders
);

router.put(
    "/:id",
    protectParent,
    updatePendingOrder
);


router.post(
    "/:id/approve",
    protectParent,
    approvePendingOrder
);

router.post(
    "/:id/reject",
    protectParent,
    rejectPendingOrder
);


router.get(
    "/:id/status",
    getPendingOrderStatus
);

export default router;