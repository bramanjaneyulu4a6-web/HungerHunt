import express from 'express';
import { protectAdmin, protectWarehouse } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/purchaseOrderController.js';

const router = express.Router();

router.post('/', protectWarehouse, asyncHandler(controller.create));
router.get('/', protectWarehouse, asyncHandler(controller.list));
router.post('/:id/decision', protectAdmin, asyncHandler(controller.review));

export default router;

