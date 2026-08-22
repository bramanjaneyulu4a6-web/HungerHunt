import express from 'express';

import { protectCaretaker } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/staffReportController.js';

const router = express.Router();

/* A caretaker may raise a report and read their own. There is no route here
   that reads anybody else's, and none that answers one — being able to mark
   your own complaint resolved would make the channel worthless. */
router.post('/', protectCaretaker, asyncHandler(controller.create));
router.get('/', protectCaretaker, asyncHandler(controller.mine));

export default router;
