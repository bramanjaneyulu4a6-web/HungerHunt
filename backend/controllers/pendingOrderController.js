import PendingOrder from "../models/PendingOrder.js";
import Student from "../models/Student.js";
import Parent from "../models/Parent.js";
import Product from "../models/Product.js";
import Inventory from "../models/Inventory.js";
import Transaction from "../models/Transaction.js";
import { sendNotification } from "../utils/sendNotification.js";


export const createPendingOrder = async (req, res) => {
  try {
    const { studentId, items } = req.body;

    if (!studentId || !items || !items.length) {
      return res.status(400).json({
        message: "Student and items are required."
      });
    }

    // Find student
    const student = await Student.findById(studentId);
    const existingOrder = await PendingOrder.findOne({
    studentId,
    status: "PENDING"
});

if (existingOrder) {
    return res.status(400).json({
        success: false,
        message: "Student already has a pending order."
    });
}

    if (!student) {
      return res.status(404).json({
        message: "Student not found."
      });
    }

    // Find parent linked to student
    const parent = await Parent.findOne({
      studentIds: student._id
    });

    if (!parent) {
      return res.status(404).json({
        message: "Parent not registered."
      });
    }

    let totalAmount = 0;

    const orderItems = [];

    for (const item of items) {

      const product = await Product.findById(item.productId);

      if (!product) {
        return res.status(404).json({
          message: `Product not found`
        });
      }

      const quantity = Number(item.quantity);

      if (quantity <= 0) {
        return res.status(400).json({
          message: "Invalid quantity."
        });
      }

     const inventory = await Inventory.findOne({
  productId: product._id
});

if (!inventory) {
  return res.status(404).json({
    message: `Inventory not found for ${product.name}`
  });
}

if (inventory.stock < quantity) {
  return res.status(400).json({
    message: `Insufficient stock for ${product.name}`
  });
}

const price = product.price;

totalAmount += price * quantity;

      orderItems.push({
        productId: product._id,
        name: product.name,
        quantity,
        price
      });
    }

    const pendingOrder = await PendingOrder.create({
  studentId: student._id,
  parentId: parent._id,
  items: orderItems,
  totalAmount
});

// Send FCM notification to parent
if (parent?.fcmToken) {
  try {
    await sendNotification(
      parent.fcmToken,
      "Purchase Approval Required",
      `${student.name} has requested a purchase of ₹${totalAmount}.`,
      {
        type: "PENDING_ORDER",
        orderId: pendingOrder._id.toString(),
        studentId: student._id.toString(),
      }
    );
  } catch (notificationError) {
    console.error(
      "FCM notification failed:",
      notificationError
    );
  }
}

    return res.status(201).json({
      success: true,
      message: "Approval request sent to parent.",
      pendingOrder
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
};






export const getParentPendingOrders = async (req, res) => {
  try {
    const parentId = req.parent.id;// From auth middleware

    const orders = await PendingOrder.find({
      parentId,
      status: "PENDING"
    })
      .populate("studentId", "name grade hostelNumber pocketMoney")
      .populate("items.productId", "image")
      .sort({ createdAt: -1 });

    return res.status(200).json({
      success: true,
      count: orders.length,
      orders,
    });

  } catch (err) {
    console.error(err);

    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};





export const updatePendingOrder = async (req, res) => {
    try {

        const { id } = req.params;
        const { items } = req.body;

        const order = await PendingOrder.findOne({
            _id: id,
            parentId: req.parent.id,
            status: "PENDING"
        });

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Pending order not found."
            });
        }

        let totalAmount = 0;

        const updatedItems = [];

        for (const item of items) {

            const product = await Product.findById(item.productId);

            if (!product) {
                return res.status(404).json({
                    success: false,
                    message: `Product not found`
                });
            }

            const quantity = Number(item.quantity);

            // Parent removed item
            if (quantity <= 0) continue;

            updatedItems.push({
                productId: product._id,
                name: product.name,
                quantity,
                price: product.price
            });

            totalAmount += product.price * quantity;
        }

        if (!updatedItems.length) {
            return res.status(400).json({
                success: false,
                message: "Order must contain at least one item."
            });
        }

        order.items = updatedItems;
        order.totalAmount = totalAmount;

        await order.save();

        return res.json({
            success: true,
            message: "Order updated successfully.",
            order
        });

    } catch (err) {

        console.error(err);

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};


export const approvePendingOrder = async (req, res) => {
try {

    const { id } = req.params;

   const order = await PendingOrder.findOne({
  _id: id,
  parentId: req.parent.id,
  status: "PENDING"
});

    if (!order) {
        return res.status(404).json({
            message: "Pending order not found."
        });
    }

   

    const student = await Student.findById(order.studentId);

    if (!student) {
        return res.status(404).json({
            message: "Student not found."
        });
    }
let totalAmount = 0;

let transactionItems = [];

for (const orderItem of order.items) {

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
if (student.walletControl?.enabled) {

    const now = new Date();
    let startDate;

    if (student.walletControl.limitType === "DAILY") {

        startDate = new Date(
            now.getFullYear(),
            now.getMonth(),
            now.getDate()
        );

    } else if (student.walletControl.limitType === "WEEKLY") {

        startDate = new Date(now);

        startDate.setDate(
            now.getDate() - now.getDay()
        );

        startDate.setHours(0, 0, 0, 0);

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

    if (totalAmount > remainingLimit) {

        return res.status(400).json({
            message:
                `${student.walletControl.limitType} limit exceeded. Remaining limit ₹${remainingLimit}`
        });

    }

}
if (student.pocketMoney < totalAmount) {
    return res.status(400).json({
        message: "Insufficient pocket money balance!"
    });
}
for (const orderItem of order.items) {

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

    studentId: student._id,

    items: transactionItems,

    totalAmount,

    previousBalance,

    remainingBalance: student.pocketMoney

});
order.status = "APPROVED";
order.approvedAt = new Date();

await order.save();
const parent = await Parent.findById(order.parentId);

if (parent?.fcmToken) {
    await sendNotification(
        parent.fcmToken,
        "Order Approved",
        `₹${totalAmount} has been deducted. Remaining balance ₹${student.pocketMoney}`,
        {
            type: "ORDER_APPROVED",
            orderId: order._id.toString(),
            studentId: student._id.toString()
        }
    );
}
return res.status(200).json({
    success: true,
    message: "Order approved successfully.",
    transaction
});
} catch(err){

    console.log(err);

    res.status(500).json({
        message: err.message
    });

}



}




export const rejectPendingOrder = async (req, res) => {

    try {

        const { id } = req.params;

    const order = await PendingOrder.findOne({
  _id: id,
  parentId: req.parent.id,
  status: "PENDING"
});

        if (!order) {
            return res.status(404).json({
                message: "Pending order not found."
            });
        }

       

        order.status = "REJECTED";
        order.rejectedAt = new Date();

        await order.save();

        const parent = await Parent.findById(order.parentId);

        if (parent?.fcmToken) {
            await sendNotification(
                parent.fcmToken,
                "Order Rejected",
                "Your order request has been rejected.",
                {
                    type: "ORDER_REJECTED",
                    orderId: order._id.toString()
                }
            );
        }

        res.json({
            success: true,
            message: "Order rejected."
        });

    } catch (err) {

        res.status(500).json({
            message: err.message
        });

    }

};


export const getPendingOrderStatus = async (req, res) => {
    try {

        const { id } = req.params;

        const order = await PendingOrder.findById(id);

        if (!order) {
            return res.status(404).json({
                success: false,
                message: "Order not found."
            });
        }

        return res.json({
            success: true,
            status: order.status,
            approvedAt: order.approvedAt,
            rejectedAt: order.rejectedAt
        });

    } catch (err) {

        return res.status(500).json({
            success: false,
            message: err.message
        });

    }
};