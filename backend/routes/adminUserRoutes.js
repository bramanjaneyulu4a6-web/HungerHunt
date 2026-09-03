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
import { protectAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../src/interfaces/http/middleware/asyncHandler.js';

const router = express.Router();
router.use(protectAdmin);

router.route('/parents').get(asyncHandler(listParents)).post(asyncHandler(createParent));
router.route('/parents/:id').put(asyncHandler(updateParent)).delete(asyncHandler(archiveParent));
router.post('/parents/:id/require-password-setup', asyncHandler(requireParentPasswordSetup));
router.get('/staff', asyncHandler(listStaff));
router.route('/staff/:id').put(asyncHandler(updateStaff)).delete(asyncHandler(archiveStaff));

export default router;
