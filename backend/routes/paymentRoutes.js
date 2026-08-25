import express from 'express';
import { protectParent } from '../middleware/authMiddleware.js';
import {
  createPaymentIntent,
  getPaymentIntent,
  phonepeWebhook,
} from '../controllers/paymentController.js';

const router = express.Router();

/* Parents start and watch payments. Nobody — parent, admin, or PhonePe's
   webhook — has a route that marks money received; that is settle's job,
   fed by the provider's own status API. */
router.post('/intents', protectParent, createPaymentIntent);
router.get('/intents/:id', protectParent, getPaymentIntent);

// Authenticated inside the handler by the SHA256 credential hash PhonePe
// sends; there is no bearer token to check here.
router.post('/phonepe/webhook', phonepeWebhook);

export default router;
