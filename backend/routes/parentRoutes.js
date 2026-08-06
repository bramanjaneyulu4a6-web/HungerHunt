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
  resetPassword
} from "../controllers/parentController.js";

import { protectParent } from '../middleware/authMiddleware.js';
import { authLimiter } from '../middleware/rateLimit.js';
import Parent from "../models/Parent.js";

const router = express.Router();

router.post('/register', authLimiter, registerParent);
router.post('/login', authLimiter, loginParent);
router.post('/forgot-password', authLimiter, forgotPassword);
router.post('/reset-password/:token', authLimiter, resetPassword);

router.get('/dashboard', protectParent, getParentDashboardDetails);
router.get('/child/:id', protectParent, getChildDetails);

router.post('/save-fcm-token', protectParent, async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "FCM token is required" });
    }

    await Parent.findByIdAndUpdate(req.parent.id, { fcmToken: token });

    res.json({ message: "FCM token saved successfully" });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/set-purchase-password', protectParent, setPurchasePassword);
router.post('/change-purchase-password', protectParent, changePurchasePassword);
router.post('/reset-purchase-password', protectParent, resetPurchasePassword);

router.put('/wallet-control/:studentId', protectParent, updateWalletControl);

export default router;
