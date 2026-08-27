import express from 'express';
import { protectParent } from '../middleware/authMiddleware.js';
import {
  paymentCreateLimiter,
  paymentReturnLimiter,
  paymentStatusLimiter,
} from '../middleware/rateLimit.js';
import {
  createPaymentIntent,
  getPaymentIntent,
  getPublicPaymentIntent,
  phonepeWebhook,
} from '../controllers/paymentController.js';

const router = express.Router();

/* Parents start and watch payments. Nobody — parent, admin, or PhonePe's
   webhook — has a route that marks money received; that is settle's job,
   fed by the provider's own status API.

   Both routes cost a server-to-server PhonePe call on the merchant's
   credentials, so both carry a per-parent limiter (mounted after the auth
   gate, so the key is the account, not a shared NAT address): one hammering
   client must not get the whole account throttled by PhonePe — settlement
   itself runs on that same API. The limits are sized in rateLimit.js so a
   real payment flow, polling included, never comes near them. */
router.post('/intents', protectParent, paymentCreateLimiter, createPaymentIntent);
router.get('/intents/:id', protectParent, paymentStatusLimiter, getPaymentIntent);

/* Deliberately outside protectParent. PhonePe redirects the parent into
   whichever browser their UPI app was holding — on a phone a Custom Tab with
   none of the app's session — so the page that lands there has no token to
   poll with, and the authenticated route above would bounce it to a login
   screen at the end of a payment. The intent's returnToken, checked in the
   handler and carried only in that redirect URL, stands in for the session
   and scopes the answer to one payment. It still moves no money: the reply
   is a verdict settlePaymentIntent got from PhonePe's own server. */
router.get('/public/intents/:id', paymentReturnLimiter, getPublicPaymentIntent);

// Authenticated inside the handler by the SHA256 credential hash PhonePe
// sends; there is no bearer token to check here. Deliberately NO rate
// limiter: PhonePe's own retries must always get through — throttling the
// webhook would degrade settlement to poll/sweep for no gain.
router.post('/phonepe/webhook', phonepeWebhook);

export default router;
