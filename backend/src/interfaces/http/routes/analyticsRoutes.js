import express from 'express';
import { protectWarehouse } from '../../../../middleware/authMiddleware.js';
import { inventory } from '../controllers/analyticsController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/inventory', protectWarehouse, asyncHandler(inventory));

export default router;

