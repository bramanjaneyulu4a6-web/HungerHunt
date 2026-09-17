import express from 'express';
import { protectAdmin } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { deleteMovement, movements, tallyCsv, tallyXml } from '../controllers/accountingExportController.js';

const router = express.Router();
router.get('/tally.xml', protectAdmin, asyncHandler(tallyXml));
router.get('/tally.csv', protectAdmin, asyncHandler(tallyCsv));
// The rows behind both files, for the Transactions page — same period rules.
router.get('/movements', protectAdmin, asyncHandler(movements));
// Marks one deposit or charge deleted and moves its money back.
router.post('/movements/:id/delete', protectAdmin, asyncHandler(deleteMovement));
export default router;

