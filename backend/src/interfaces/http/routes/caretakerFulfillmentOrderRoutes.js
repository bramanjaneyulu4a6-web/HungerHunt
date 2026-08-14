import express from 'express';

import { protectCaretaker } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/fulfillmentOrderController.js';

const router = express.Router();

// A separate door is intentional. Warehouse staff and caretakers operate on
// the same order records, but neither role is admitted through the other's
// route surface. The controller still applies hostel and transition scoping.
router.get('/', protectCaretaker, asyncHandler(controller.list));
router.get('/history', protectCaretaker, asyncHandler(controller.caretakerHistory));
router.post('/receive-all', protectCaretaker, asyncHandler(controller.receiveAll));
router.post('/:id/transition', protectCaretaker, asyncHandler(controller.transition));

export default router;
