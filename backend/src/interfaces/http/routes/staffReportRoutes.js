import express from 'express';

import { protectAdmin } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/staffReportController.js';

const router = express.Router();

/* The office side, behind protectAdmin and deliberately not protectAnyStaff.
   A caretaker's complaint may be about the warehouse or about a colleague, and
   a channel the subject of a complaint can read is not one anybody will use
   twice. Nothing here is reachable by a warehouse or caretaker account. */
router.get('/', protectAdmin, asyncHandler(controller.list));
router.post('/:id/status', protectAdmin, asyncHandler(controller.transition));

export default router;
