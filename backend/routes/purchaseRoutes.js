// import express from "express";

// import {
//   createPurchase,
//   getNewPurchases,
//   getCompletedPurchases,
//   completePurchase
// } from "../controllers/purchaseController.js";

// import { protectAdmin } from "../middleware/authMiddleware.js";

// const router = express.Router();

// router.post("/", protectAdmin, createPurchase);

// router.get("/new", protectAdmin, getNewPurchases);

// router.get(
//   "/completed",
//   protectAdmin,
//   getCompletedPurchases
// );

// router.put(
//   "/complete/:id",
//   protectAdmin,
//   completePurchase
// );

// export default router;




// 24-07-2026-for wallet control








import express from 'express';
import {
  registerParent,
  loginParent,
  getParentDashboardDetails,
  getChildDetails,
  setPurchasePassword,
  changePurchasePassword,
  resetPurchasePassword,
  updateWalletControl
} from "../controllers/parentController.js";


import { protectParent } from '../middleware/authMiddleware.js';
import {
  forgotPassword,
  resetPassword
} from "../controllers/parentController.js";
import Parent from "../models/Parent.js";
// import { setPurchasePassword } from "../controllers/parentController.js";



console.log("✅ Parent routes loaded");
const router = express.Router();


router.post('/register', registerParent);


router.post('/login', loginParent);


router.get('/dashboard', protectParent, getParentDashboardDetails);
router.get('/child/:id', protectParent, getChildDetails);
router.post("/forgot-password", forgotPassword);
router.post("/reset-password/:token", resetPassword);
router.post("/save-fcm-token", protectParent, async (req, res) => {
  try {
    const { token } = req.body;

    console.log("Logged Parent:", req.parent);
    console.log("Received Token:", token);

    await Parent.findByIdAndUpdate(
      req.parent.id,
      {
        fcmToken: token,
      }
    );

    console.log("✅ Token saved");

    res.json({
      message: "FCM token saved successfully",
    });

  } catch (err) {
    console.log(err);
    res.status(500).json({
      error: err.message,
    });
  }
});
router.get('/test', (req, res) => {
  res.send("Parent route working");
});


// Create purchase password
router.post(
  "/set-purchase-password",
  protectParent,
  setPurchasePassword
);

// Change purchase password
router.post(
  "/change-purchase-password",
  protectParent,
  changePurchasePassword
);

// Reset purchase password
router.post(
  "/reset-purchase-password",
  protectParent,
  resetPurchasePassword
);

router.put(
  "/wallet-control/:studentId",
  protectParent,
  updateWalletControl
);

export default router;