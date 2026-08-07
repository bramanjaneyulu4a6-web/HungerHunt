import express from 'express';
import {
  registerParent,
  loginParent,
  getParentDashboardDetails,
  getChildDetails,
  setPurchasePassword,
  changePurchasePassword,
  resetPurchasePassword,
  updateWalletControl,
  forgotPassword,
  resetPassword,
  savePushToken,
  removePushToken
} from "../controllers/parentController.js";

import { protectParent } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

router.post('/register', authLimiter, registerParent);
router.post('/login', authLimiter, loginParent);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

router.get('/dashboard', protectParent, getParentDashboardDetails);
router.get('/child/:id', protectParent, getChildDetails);

router.post('/save-fcm-token', protectParent, savePushToken);
router.post('/remove-fcm-token', protectParent, removePushToken);

router.post('/set-purchase-password', protectParent, setPurchasePassword);
router.post('/change-purchase-password', protectParent, changePurchasePassword);
router.post('/reset-purchase-password', protectParent, resetPurchasePassword);

router.put('/wallet-control/:studentId', protectParent, updateWalletControl);

export default router;
