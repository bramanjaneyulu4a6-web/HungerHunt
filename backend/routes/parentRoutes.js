// import express from 'express';
// import {
//   registerParent,
//   loginParent,
//   getParentDashboardDetails,
//   getChildDetails,
//   setPurchasePassword,
//   changePurchasePassword,
//   resetPurchasePassword
// } from "../controllers/parentController.js";


// // import {
// //   registerParent,
// //   loginParent,
// //   getParentDashboardDetails,
// //   getChildDetails
// // } from '../controllers/parentController.js';
// // import { registerParent, loginParent, getParentDashboardDetails } from '../controllers/parentController.js';
// import { protectParent } from '../middleware/authMiddleware.js';
// import {
//   forgotPassword,
//   resetPassword
// } from "../controllers/parentController.js";
// import Parent from "../models/Parent.js";
// // import { setPurchasePassword } from "../controllers/parentController.js";



// console.log("✅ Parent routes loaded");
// const router = express.Router();

// // @route   POST /api/parent/register
// // @desc    Register parent portal (Matches fatherName & phone pre-configured by admin)
// router.post('/register', registerParent);

// // @route   POST /api/parent/login
// // @desc    Authenticate parent phone and password
// router.post('/login', loginParent);

// // @route   GET /api/parent/dashboard
// // @desc    Fetch balance and live purchase histories for all linked children
// router.get('/dashboard', protectParent, getParentDashboardDetails);
// router.get('/child/:id', protectParent, getChildDetails);
// router.post("/forgot-password", forgotPassword);
// router.post("/reset-password/:token", resetPassword);
// router.post("/save-fcm-token", protectParent, async (req, res) => {
//   try {
//     const { token } = req.body;

//     console.log("Logged Parent:", req.parent);
//     console.log("Received Token:", token);

//     await Parent.findByIdAndUpdate(
//       req.parent.id,
//       {
//         fcmToken: token,
//       }
//     );

//     console.log("✅ Token saved");

//     res.json({
//       message: "FCM token saved successfully",
//     });

//   } catch (err) {
//     console.log(err);
//     res.status(500).json({
//       error: err.message,
//     });
//   }
// });
// router.get('/test', (req, res) => {
//   res.send("Parent route working");
// });


// // Create purchase password
// router.post(
//   "/set-purchase-password",
//   protectParent,
//   setPurchasePassword
// );

// // Change purchase password
// router.post(
//   "/change-purchase-password",
//   protectParent,
//   changePurchasePassword
// );

// // Reset purchase password
// router.post(
//   "/reset-purchase-password",
//   protectParent,
//   resetPurchasePassword
// );

// router.post(
//   "/change-purchase-password",
//   protectParent,
//   changePurchasePassword
// );

// router.post(
//   "/reset-purchase-password",
//   protectParent,
//   resetPurchasePassword
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