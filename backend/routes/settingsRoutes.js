import express from 'express';

import { getOrderingSettings, setOrderingSettings } from '../controllers/orderingSettingsController.js';
import { protectAdmin, requireSuperAdmin } from '../middleware/authMiddleware.js';
import { asyncHandler } from '../src/interfaces/http/middleware/asyncHandler.js';

// School-wide rules. The super admin's alone.
const router = express.Router();
router.use(protectAdmin, requireSuperAdmin);

router.get('/ordering', asyncHandler(getOrderingSettings));
router.put('/ordering', asyncHandler(setOrderingSettings));

export default router;
