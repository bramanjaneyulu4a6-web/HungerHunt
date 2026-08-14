import express from 'express';
import {
  registerParent,
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
  removePushToken
} from "../controllers/parentController.js";
import { getWalletBalance } from '../controllers/walletController.js';

import { protectParent } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register', authLimiter, registerParent);
router.post('/login', authLimiter, loginParent);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

router.get('/dashboard', protectParent, getParentDashboardDetails);
router.get('/child/:id', protectParent, getChildDetails);
router.get('/child/:id/wallet', protectParent, getWalletBalance);
router.get('/child/:id/bills', protectParent, getChildBills);
router.get('/child/:id/recharges', protectParent, getChildRecharges);
router.get('/child/:id/packages', protectParent, getChildPackages);

router.post('/save-fcm-token', protectParent, savePushToken);
router.post('/remove-fcm-token', protectParent, removePushToken);

router.post('/set-purchase-password', protectParent, setPurchasePassword);
router.post('/change-purchase-password', protectParent, changePurchasePassword);
router.post('/reset-purchase-password', protectParent, resetPurchasePassword);

router.put('/wallet-control/:studentId', protectParent, updateWalletControl);
router.put('/purchase-approval/:studentId', protectParent, updatePurchaseApproval);

export default router;
