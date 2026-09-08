import express from 'express';
import {
  getParentLoginStep,
  setFirstParentPassword,
  loginParent,
  getParentDashboardDetails,
  getChildDetails,
  getChildBills,
  getChildPackages,
  getChildRecharges,
  setPurchasePassword,
  changePurchasePassword,
  resetPurchasePassword,
  updateWalletControl,
  updatePurchaseApproval,
  forgotPassword,
  resetPassword,
  savePushToken,
  removePushToken,
  deleteParentAccount
} from "../controllers/parentController.js";
import { getWalletBalance } from '../controllers/walletController.js';
import { getWalletReceipt, getWalletReceiptPdf } from '../controllers/walletReceiptController.js';

import { protectParent } from '../middleware/authMiddleware.js';
import { authLimiter, accountDeleteLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/login-step', authLimiter, getParentLoginStep);
router.post('/first-password', authLimiter, setFirstParentPassword);
router.post('/login', authLimiter, loginParent);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

router.get('/dashboard', protectParent, getParentDashboardDetails);
router.get('/child/:id', protectParent, getChildDetails);
router.get('/child/:id/wallet', protectParent, getWalletBalance);
router.get('/child/:id/bills', protectParent, getChildBills);
router.get('/child/:id/recharges', protectParent, getChildRecharges);
router.get('/child/:id/packages', protectParent, getChildPackages);

// One recharge, printed: the same data as the app's receipt view and the PDF
// the parent saves or shares. Any recharge in the ledger can be reprinted.
router.get('/receipts/:adjustmentId', protectParent, getWalletReceipt);
router.get('/receipts/:adjustmentId/pdf', protectParent, getWalletReceiptPdf);

router.post('/save-fcm-token', protectParent, savePushToken);
router.post('/remove-fcm-token', protectParent, removePushToken);

router.post('/set-purchase-password', protectParent, setPurchasePassword);
router.post('/change-purchase-password', protectParent, changePurchasePassword);
router.post('/reset-purchase-password', protectParent, resetPurchasePassword);

router.put('/wallet-control/:studentId', protectParent, updateWalletControl);
router.put('/purchase-approval/:studentId', protectParent, updatePurchaseApproval);

/* Rate-limited as well as gated: this route checks a password, so it is
   guessable in the way the login route is, and a session alone must not make
   guessing cheap.

   protectParent runs FIRST, and the order is the point. accountDeleteLimiter
   keys by parent account, which it can only do once the gate has put one on
   the request; mounted ahead of it, it would fall back to the IP and one
   parent's ten wrong passwords would lock every parent on the school's NAT out
   of signing in. */
router.delete('/account', protectParent, accountDeleteLimiter, deleteParentAccount);

export default router;
