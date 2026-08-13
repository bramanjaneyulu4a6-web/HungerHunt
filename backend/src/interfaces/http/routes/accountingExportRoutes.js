import express from 'express';
import { protectAdmin } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { tallyXml } from '../controllers/accountingExportController.js';

const router = express.Router();
router.get('/tally.xml', protectAdmin, asyncHandler(tallyXml));
export default router;

