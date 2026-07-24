// import Student from '../models/Student.js';
// import Product from '../models/Product.js';
// import Transaction from '../models/Transaction.js';
// // import admin from "../config/firebase.js";
// import Parent from "../models/Parent.js";
// import Inventory from "../models/Inventory.js";
// import bcrypt from "bcryptjs";
// import { sendNotification } from "../utils/sendNotification.js";

// export const generateBill = async (req, res) => {
//   const { studentId, items } = req.body; // items syntax: [{ productId, quantity }]
  
//   try {
//     const student = await Student.findById(studentId);
//     if (!student) return res.status(404).json({ message: 'Student record not found.' });

//     let totalAmount = 0;
//     let transactionItems = [];

//     // Verify stock availability & Calculate costs
//    for (const orderItem of items) {

//   const inventory = await Inventory.findOne({
//     productId: orderItem.productId
//   }).populate("productId");

//   if (!inventory) {
//     return res.status(404).json({
//       message: "Inventory record not found."
//     });
//   }

//   if (inventory.stock < orderItem.quantity) {
//     return res.status(400).json({
//       message: `Insufficient stock for ${inventory.productId.name}`
//     });
//   }

//   totalAmount += inventory.productId.price * orderItem.quantity;

//   transactionItems.push({
//     productId: inventory.productId._id,
//     name: inventory.productId.name,
//     quantity: orderItem.quantity,
//     price: inventory.productId.price
//   });
// }

//     // Wallet Balance Check
//     if (student.pocketMoney < totalAmount) {
//       return res.status(400).json({ message: 'Insufficient pocket money balance!' });
//     }

//     // Atomic adjustments alternative manual processing
//     for (const orderItem of items) {

//   await Inventory.findOneAndUpdate(
//     {
//       productId: orderItem.productId
//     },
//     {
//       $inc: {
//         stock: -orderItem.quantity
//       }
//     }
//   );

// }

//     const previousBalance = student.pocketMoney;
//     student.pocketMoney -= totalAmount;
//     await student.save();

//     const transaction = await Transaction.create({
      
//       studentId,
//       items: transactionItems,
//       totalAmount,
//       previousBalance,
//       remainingBalance: student.pocketMoney
//     });
//     const parent = await Parent.findOne({
//   studentIds: studentId
// });

// if (parent?.fcmToken) {
//   await sendNotification(
//     parent.fcmToken,
//     "🛒 Purchase Alert",
//     `Spent ₹${totalAmount}. Balance ₹${student.pocketMoney}`,
//     {
//       type: "TRANSACTION",
//       studentId: studentId.toString(),
//     }
//   );
// }

//     res.status(201).json({ message: 'Checkout successful!', transaction });
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };

// export const getAllTransactions = async (req, res) => {
//   try {
//     const transactions = await Transaction.find().populate('studentId', 'name grade').sort({ createdAt: -1 });
//     res.json(transactions);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// };





// export const verifyPayment = async (req, res) => {

//     try {

//         const {
//             studentId,
//             phone,
//             password
//         } = req.body;

//         const student = await Student.findById(studentId);

//         if (!student)
//             return res.status(404).json({
//                 message:"Student not found"
//             });

//         if (student.parentPhoneNumber !== phone)
//             return res.status(400).json({
//                 message:"Wrong mobile number"
//             });

//         const matched = await bcrypt.compare(
//             password,
//             student.purchasePassword
//         );

//         if (!matched)
//             return res.status(400).json({
//                 message:"Wrong purchase password"
//             });

//         res.json({
//             success:true
//         });

//     } catch(err){

//         res.status(500).json({
//             message:err.message
//         });

//     }

// };






// 24-07-2026-for wallet control










import Student from '../models/Student.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
// import admin from "../config/firebase.js";
import Parent from "../models/Parent.js";
import Inventory from "../models/Inventory.js";
import bcrypt from "bcryptjs";
import { sendNotification } from "../utils/sendNotification.js";

export const generateBill = async (req, res) => {
  
  const { studentId, items } = req.body; // items syntax: [{ productId, quantity }]
  console.log("========== BILL ==========");
console.log("studentId:", studentId);
console.log("items:", items);
  try {
    const student = await Student.findById(studentId);
    console.log("Student:", student?.name);
console.log("Wallet:", student?.pocketMoney);
console.log("Wallet Control:", student?.walletControl);
    if (!student) return res.status(404).json({ message: 'Student record not found.' });

    let totalAmount = 0;
    let transactionItems = [];

    // Verify stock availability & Calculate costs
   for (const orderItem of items) {

  const inventory = await Inventory.findOne({
    productId: orderItem.productId
  }).populate("productId");

  if (!inventory) {
    return res.status(404).json({
      message: "Inventory record not found."
    });
  }

  if (inventory.stock < orderItem.quantity) {
    return res.status(400).json({
      message: `Insufficient stock for ${inventory.productId.name}`
    });
  }

  totalAmount += inventory.productId.price * orderItem.quantity;

  transactionItems.push({
    productId: inventory.productId._id,
    name: inventory.productId.name,
    quantity: orderItem.quantity,
    price: inventory.productId.price
  });
}
// Wallet Control Check
if (student.walletControl?.enabled) {

  const now = new Date();
  let startDate;

  if (student.walletControl.limitType === "DAILY") {

    startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate()
    );

  } else if (
    student.walletControl.limitType === "WEEKLY"
  ) {

    startDate = new Date(now);

    startDate.setDate(
      now.getDate() - now.getDay()
    );

    startDate.setHours(0,0,0,0);

  } else {

    startDate = new Date(
      now.getFullYear(),
      now.getMonth(),
      1
    );

  }

  const spent = await Transaction.aggregate([
    {
      $match: {
        studentId: student._id,
        createdAt: {
          $gte: startDate
        }
      }
    },
    {
      $group: {
        _id: null,
        total: {
          $sum: "$totalAmount"
        }
      }
    }
  ]);

  const alreadySpent =
  spent.length > 0
    ? spent[0].total
    : 0;

const remainingLimit = Math.max(
  0,
  student.walletControl.limitAmount - alreadySpent
);

console.log("Already Spent:", alreadySpent);
console.log("Limit:", student.walletControl.limitAmount);
console.log("Remaining:", remainingLimit);
console.log("Current Purchase:", totalAmount);

if (
  totalAmount > remainingLimit
) {

  return res.status(400).json({
  message:
    `${student.walletControl.limitType} limit exceeded. Remaining limit ₹${remainingLimit}`
});

}
}
console.log("Total Amount:", totalAmount);
    // Wallet Balance Check
    if (student.pocketMoney < totalAmount) {
      return res.status(400).json({ message: 'Insufficient pocket money balance!' });
    }

    // Atomic adjustments alternative manual processing
    for (const orderItem of items) {

  await Inventory.findOneAndUpdate(
    {
      productId: orderItem.productId
    },
    {
      $inc: {
        stock: -orderItem.quantity
      }
    }
  );

}

    const previousBalance = student.pocketMoney;
    student.pocketMoney -= totalAmount;
    await student.save();

    const transaction = await Transaction.create({
      
      studentId,
      items: transactionItems,
      totalAmount,
      previousBalance,
      remainingBalance: student.pocketMoney
    });
    const parent = await Parent.findOne({
  studentIds: studentId
});

if (parent?.fcmToken) {
  await sendNotification(
    parent.fcmToken,
    "🛒 Purchase Alert",
    `Spent ₹${totalAmount}. Balance ₹${student.pocketMoney}`,
    {
      type: "TRANSACTION",
      studentId: studentId.toString(),
    }
  );
}

    res.status(201).json({ message: 'Checkout successful!', transaction });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const getAllTransactions = async (req, res) => {
  try {
    const transactions = await Transaction.find().populate('studentId', 'name grade').sort({ createdAt: -1 });
    res.json(transactions);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};





export const verifyPayment = async (req, res) => {

    try {

        const {
            studentId,
            phone,
            password
        } = req.body;

        const student = await Student.findById(studentId);

        if (!student)
            return res.status(404).json({
                message:"Student not found"
            });

        if (student.parentPhoneNumber !== phone)
            return res.status(400).json({
                message:"Wrong mobile number"
            });

        const matched = await bcrypt.compare(
            password,
            student.purchasePassword
        );

        if (!matched)
            return res.status(400).json({
                message:"Wrong purchase password"
            });

        res.json({
            success:true
        });

    } catch(err){

        res.status(500).json({
            message:err.message
        });

    }

};



export const updateWalletControl = async (req, res) => {

  try {

    const { studentId } = req.params;

   const {
  enabled,
  limitAmount,
  limitType
} = req.body;

if (
  enabled &&
  (!limitAmount || limitAmount <= 0)
) {
  return res.status(400).json({
    message: "Limit amount must be greater than 0"
  });
}

    const student =
      await Student.findByIdAndUpdate(
        studentId,
        {
          walletControl: {
            enabled,
            limitAmount,
            limitType
          }
        },
        { new: true }
      );

    res.json(student);

  } catch (err) {

    res.status(500).json({
      message: err.message
    });

  }

};