import express from 'express';
import { protectWarehouse } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/replenishmentDraftController.js';

const router = express.Router();
router.post('/', protectWarehouse, asyncHandler(controller.generate));
router.post('/:id/submit', protectWarehouse, asyncHandler(controller.submit));
export default router;

