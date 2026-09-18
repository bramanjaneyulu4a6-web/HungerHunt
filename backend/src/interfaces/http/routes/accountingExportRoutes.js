import express from 'express';
import { protectAdmin } from '../../../../middleware/authMiddleware.js';
import { requireFeature } from '../../../../middleware/featureGate.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import { deleteMovement, movements, staff, tallyCsv, tallyXml } from '../controllers/accountingExportController.js';

const router = express.Router();
router.get('/tally.xml', protectAdmin, asyncHandler(tallyXml));
router.get('/tally.csv', protectAdmin, asyncHandler(tallyCsv));
// The rows behind both files, for the Transactions page — same period rules.
router.get('/movements', protectAdmin, asyncHandler(movements));
// Who an export can be narrowed to with ?processedBy=.
router.get('/staff', protectAdmin, asyncHandler(staff));
// Marks one deposit or charge deleted and moves its money back.
// A super admin can switch it off per role or per account on /features.
router.post(
  '/movements/:id/delete',
  protectAdmin,
  requireFeature('transactions.delete'),
  asyncHandler(deleteMovement)
);
export default router;

