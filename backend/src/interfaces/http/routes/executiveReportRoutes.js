import express from 'express';
import { protectSuperAdmin } from '../../../../middleware/authMiddleware.js';
import { executiveSalesReport } from '../controllers/executiveReportController.js';
import { asyncHandler } from '../middleware/asyncHandler.js';

const router = express.Router();

router.get('/', ...protectSuperAdmin, asyncHandler(executiveSalesReport));

export default router;
