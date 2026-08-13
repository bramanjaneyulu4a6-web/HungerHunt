import express from 'express';

import { protectWarehouse } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/fulfillmentOrderController.js';

const router = express.Router();

/* Every route here is storeroom work, so they all sit behind the same gate.
   The three fixed paths are declared before anything that could read as an id
   so 'alerts' is never taken for one. */
router.get('/', protectWarehouse, asyncHandler(controller.list));
router.get('/alerts', protectWarehouse, asyncHandler(controller.alerts));
router.get('/history', protectWarehouse, asyncHandler(controller.history));
router.get('/report', protectWarehouse, asyncHandler(controller.report));
router.post('/:id/transition', protectWarehouse, asyncHandler(controller.transition));
router.post('/:id/alerts/acknowledge', protectWarehouse, asyncHandler(controller.acknowledgeAlert));

export default router;
