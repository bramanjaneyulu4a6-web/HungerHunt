import express from 'express';

import {
  getFeatureSettings,
  setAccountFeatures,
  setRoleFeatures,
} from '../controllers/featureController.js';
import { protectAdmin, requireSuperAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../src/interfaces/http/middleware/asyncHandler.js';

// Which console features each role and account sees. The super admin's alone.
const router = express.Router();
router.use(protectAdmin, requireSuperAdmin);

router.get('/', asyncHandler(getFeatureSettings));
router.put('/roles/:role', asyncHandler(setRoleFeatures));
router.put('/accounts/:id', asyncHandler(setAccountFeatures));

export default router;
