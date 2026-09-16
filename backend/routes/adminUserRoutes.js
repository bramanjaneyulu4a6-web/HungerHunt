import express from 'express';

import {
  archiveParent,
  archiveStaff,
  createParent,
  requireParentPasswordSetup,
  listParents,
  listStaff,
  updateParent,
  updateStaff,
} from '../controllers/adminUserController.js';
import { protectAdmin, requireSuperAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../src/interfaces/http/middleware/asyncHandler.js';

const router = express.Router();
router.use(protectAdmin);

router.route('/parents').get(asyncHandler(listParents)).post(asyncHandler(createParent));
router.route('/parents/:id').put(asyncHandler(updateParent)).delete(asyncHandler(archiveParent));
router.post('/parents/:id/require-password-setup', asyncHandler(requireParentPasswordSetup));
// The roster is the super admin's alone; parents stay with every admin.
router.get('/staff', requireSuperAdmin, asyncHandler(listStaff));
router.route('/staff/:id')
  .put(requireSuperAdmin, asyncHandler(updateStaff))
  .delete(requireSuperAdmin, asyncHandler(archiveStaff));

export default router;
