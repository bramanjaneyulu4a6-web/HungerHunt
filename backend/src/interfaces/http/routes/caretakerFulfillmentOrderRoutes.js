import express from 'express';

import { protectCaretaker } from '../../../../middleware/authMiddleware.js';
import { asyncHandler } from '../middleware/asyncHandler.js';
import * as controller from '../controllers/fulfillmentOrderController.js';

const router = express.Router();

/* A separate door is intentional. Warehouse staff and caretakers operate on
   the same order records, but neither role is admitted through the other's
   route surface. The controller still applies hostel scoping.

   There is no transition route here any more. A caretaker moves a package to
   no status of their own: the warehouse marks it delivered when it is handed
   over at the hostel, and the student's own purchase code — not the
   caretaker's tap — is what marks it collected below. */
router.get('/', protectCaretaker, asyncHandler(controller.list));
router.get('/history', protectCaretaker, asyncHandler(controller.caretakerHistory));
router.post('/:id/collect', protectCaretaker, asyncHandler(controller.confirmCollection));

export default router;
