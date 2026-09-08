import express from 'express';

import { protectWarehouse } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/fulfillmentOrderController.js';
import { createWarehouseOrderIssue } from '../controllers/staffReportController.js';

const router = express.Router();

/* Every route here is storeroom work, so they all sit behind the same gate.
   Fixed paths are declared before anything that could read as an id, so names
   such as 'history' and 'warehouse-reports' are never mistaken for one. */
router.get('/', protectWarehouse, asyncHandler(controller.list));
router.get('/alerts', protectWarehouse, asyncHandler(controller.alerts));
router.get('/history', protectWarehouse, asyncHandler(controller.history));
router.get('/report', protectWarehouse, asyncHandler(controller.report));
router.get('/print', protectWarehouse, asyncHandler(controller.print));
router.post('/warehouse-reports', protectWarehouse, asyncHandler(createWarehouseOrderIssue));
router.post('/:id/transition', protectWarehouse, asyncHandler(controller.transition));
router.post('/:id/alerts/acknowledge', protectWarehouse, asyncHandler(controller.acknowledgeAlert));

export default router;
