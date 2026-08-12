import PendingOrder, { pendingOrderExpiry } from "../models/PendingOrder.js";
import Student from "../models/Student.js";
import Parent from "../models/Parent.js";
import Inventory from "../models/Inventory.js";
import { sendToParent } from "../utils/sendNotification.js";
import { chargeCart } from "../utils/checkout.js";
import {
  AUTHORIZATION_MESSAGES,
  consumeAuthorization,
} from "../utils/purchaseAuthorization.js";

/* Purchases that need the parent to say yes before the wallet is touched.
 *
 * The password and the approval answer different questions and both are asked.
 * The purchase password, taken at the counter, says this order really is for
 * this student — without it anyone who knows a name could raise requests
 * against a stranger's child and fill a parent's phone with them. The approval,
 * given in the parent's own signed-in app, is what spends the money.
 *
 * So the till's authorisation token is consumed here, when the request is
 * raised, not when it is charged: it is bound to a cart and lives two minutes,
 * which is the right shape for "the password was just entered for this basket"
 * and the wrong shape for "a parent will get to this by Monday".
 */

const asItems = (items) =>
  items.map((item) => ({
    productId: item.productId,
    quantity: Number(item.quantity),
  }));

const isLive = (order) =>
  order.status === "PENDING" && order.expiresAt > new Date();

// A request nobody answered is not pending any more, whatever the column says.
// Writing it down at the moment someone looks keeps the record honest without a
// scheduled job, and means the student is free the instant the window passes.
const expireIfLapsed = async (order) => {
  if (order.status !== "PENDING" || order.expiresAt > new Date()) return order;

  order.status = "EXPIRED";
  await order.save();

  return order;
};

const findLiveOrderForStudent = async (studentId) => {
  const existing = await PendingOrder.findOne({ studentId, status: "PENDING" });

  if (!existing) return null;

  await expireIfLapsed(existing);

  return isLive(existing) ? existing : null;
};

const validItems = (items) =>
  Array.isArray(items) &&
  items.length > 0 &&
  items.every(
    (i) => i.productId && Number.isInteger(Number(i.quantity)) && Number(i.quantity) > 0
  );

/* Prices a cart against inventory without touching it. Approval re-does this
   against live stock; here it is only so the parent is shown real numbers. */
const priceCart = async (items) => {
  let totalAmount = 0;
  const orderItems = [];

  for (const item of items) {
    const inventory = await Inventory.findOne({
      productId: item.productId,
    }).populate("productId");

    if (!inventory || !inventory.productId) {
      return { ok: false, status: 404, message: "Inventory record not found." };
    }

    // Archived is off sale everywhere, including a console screen that loaded
    // its menu this morning and still shows the product. Caught here, the
    // refusal lands at the counter while the student is still standing
    // there — approvePendingOrder re-checks against live stock, but by then
    // the wrong person (the parent, days later) is the one being told.
    if (inventory.productId.active === false) {
      return {
        ok: false,
        status: 400,
        message: `${inventory.productId.name} is no longer sold.`,
      };
    }

    if (inventory.stock < item.quantity) {
      return {
        ok: false,
        status: 400,
        message: `Insufficient stock for ${inventory.productId.name}`,
      };
    }

    totalAmount += inventory.productId.price * item.quantity;

    orderItems.push({
      productId: inventory.productId._id,
      name: inventory.productId.name,
      quantity: item.quantity,
      price: inventory.productId.price,
    });
  }

  return { ok: true, totalAmount, orderItems };
};

/* =========================================================
   RAISED BY THE TILL
========================================================= */
export const createPendingOrder = async (req, res) => {
  try {
    // A student session names its own student; the admin console says which
    // one it is serving. Same rule as the two transaction routes.
    const studentId = req.student?.id ?? req.body.studentId;
    const { purchaseToken } = req.body;

    if (!studentId || !validItems(req.body.items)) {
      return res.status(400).json({
        message: "A student and at least one item are required.",
      });
    }

    const items = asItems(req.body.items);

    /* Two callers, and what authorizes them differs.

       A student at the kiosk presents a purchase token, which is what their
       four-digit code bought a moment ago. That is the only thing standing
       between an unattended terminal and somebody else's wallet, so it stays.

       An admin at the console presents nothing but their own sign-in, and that
       is deliberate: the console stopped asking children for their code, and
       what replaced it is stronger — every order an admin raises goes to the
       parent, who sees the exact items and answers. Nothing is charged here
       either way. */
    const raisedByAdmin = Boolean(req.staff) && !req.student;

    if (!raisedByAdmin) {
      const authorization = await consumeAuthorization({
        token: purchaseToken,
        studentId,
        items,
      });

      if (!authorization.ok) {
        // Not 401: the till is properly signed in, it is this request that is
        // unauthorised. No grace window — nothing older than this endpoint
        // exists to be kind to.
        return res
          .status(403)
          .json({ message: AUTHORIZATION_MESSAGES[authorization.reason] });
      }
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student record not found." });
    }

    /* The setting binds the kiosk, not the console. A student who needs no
       approval pays at the kiosk with their code and is charged there, so
       reaching this route is a mistake worth naming. An admin-raised order
       waits for the parent regardless — that is the whole of what replaced the
       code at the console. */
    if (!raisedByAdmin && !student.requiresParentApproval) {
      return res.status(400).json({
        message:
          "This student does not need parent approval. Charge the sale at the counter instead.",
      });
    }

    const parent = await Parent.findOne({ studentIds: student._id });

    if (!parent) {
      // Named with a code as well as a message: the console disables its own
      // pay button on this, and matching on prose is not a contract.
      return res.status(404).json({
        code: "NO_PARENT",
        message:
          "No parent account is linked to this student, so there is nobody to approve the order." +
          " The student can still buy at the kiosk with their purchase code.",
      });
    }

    const live = await findLiveOrderForStudent(student._id);

    if (live) {
      return res.status(409).json({
        message:
          `${student.name} already has an order waiting for approval.` +
          ` No new order can be placed until ${live.expiresAt.toLocaleString("en-IN")}.`,
        expiresAt: live.expiresAt,
      });
    }

    const priced = await priceCart(items);

    if (!priced.ok) {
      return res.status(priced.status).json({ message: priced.message });
    }

    const pendingOrder = await PendingOrder.create({
      studentId: student._id,
      parentId: parent._id,
      items: priced.orderItems,
      totalAmount: priced.totalAmount,
      expiresAt: pendingOrderExpiry(),
      raisedBy: req.staff?.id ?? null,
    });

    // Not awaited: the counter gets its answer now. sendToParent never rejects.
    sendToParent(
      parent,
      "Approval needed",
      `${student.name} wants to spend ₹${priced.totalAmount}. Tap to review.`,
      {
        type: "PENDING_ORDER",
        orderId: pendingOrder._id.toString(),
        studentId: student._id.toString(),
      }
    );

    res.status(201).json({
      message: "Approval request sent to the parent.",
      pendingOrder,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   READ AND ANSWERED BY THE PARENT
========================================================= */
export const getParentPendingOrders = async (req, res) => {
  try {
    const orders = await PendingOrder.find({
      parentId: req.parent.id,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    })
      .populate("studentId", "name grade hostelNumber pocketMoney")
      .sort({ createdAt: -1 });

    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The parent's own copy of the order, or an explanation of why it cannot be
// acted on. Every route below needs the same three checks.
const loadAnswerable = async (req, res) => {
  const order = await PendingOrder.findOne({
    _id: req.params.id,
    parentId: req.parent.id,
  });

  if (!order) {
    res.status(404).json({ message: "This order could not be found." });
    return null;
  }

  await expireIfLapsed(order);

  if (order.status === "EXPIRED") {
    res.status(410).json({
      message: "This request expired before it was answered.",
    });
    return null;
  }

  if (order.status !== "PENDING") {
    res.status(409).json({
      message: `This order has already been ${order.status.toLowerCase()}.`,
    });
    return null;
  }

  return order;
};

/* A parent can trim the order before agreeing to it — drop the fizzy drink,
   halve the quantity — so that answering is not all-or-nothing. Prices are
   re-read rather than carried over from the till's version, so an edit cannot
   be used to hold an old price. */
export const updatePendingOrder = async (req, res) => {
  try {
    if (!Array.isArray(req.body.items) || req.body.items.length === 0) {
      return res.status(400).json({ message: "An order needs at least one item." });
    }

    // A quantity of zero is how the app says "remove this line".
    const kept = asItems(req.body.items).filter((item) => item.quantity > 0);

    if (kept.length === 0) {
      return res.status(400).json({
        message: "An order needs at least one item. Reject it instead to cancel it.",
      });
    }

    if (kept.some((item) => !Number.isInteger(item.quantity))) {
      return res.status(400).json({ message: "Quantities must be whole numbers." });
    }

    const order = await loadAnswerable(req, res);
    if (!order) return;

    // Only lines the till rang up may be adjusted. Without this a parent could
    // add anything in the catalogue to an order the student never asked for,
    // and the counter would have no idea the basket had changed.
    const rung = new Set(order.items.map((item) => String(item.productId)));

    if (kept.some((item) => !rung.has(String(item.productId)))) {
      return res.status(400).json({
        message: "An order can only be reduced, not added to.",
      });
    }

    const priced = await priceCart(kept);

    if (!priced.ok) {
      return res.status(priced.status).json({ message: priced.message });
    }

    order.items = priced.orderItems;
    order.totalAmount = priced.totalAmount;

    await order.save();

    res.json({ message: "Order updated.", order });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const approvePendingOrder = async (req, res) => {
  try {
    const order = await loadAnswerable(req, res);
    if (!order) return;

    // Priced and charged against live inventory, not against the totals stored
    // on the order: between the till and this tap, stock and prices move.
    const charge = await chargeCart({
      studentId: order.studentId,
      items: order.items.map((item) => ({
        productId: item.productId,
        quantity: item.quantity,
      })),
    });

    if (!charge.ok) {
      // The order stays open on a refusal — a balance too low today may be
      // enough tomorrow, and the parent still has until it expires.
      return res.status(charge.status).json({ message: charge.message });
    }

    order.status = "APPROVED";
    order.approvedAt = new Date();

    await order.save();

    const student = charge.student;
    const parent = await Parent.findById(order.parentId);

    if (parent) {
      sendToParent(
        parent,
        "Order approved",
        `₹${charge.transaction.totalAmount} spent. Balance ₹${student.pocketMoney}.`,
        {
          type: "ORDER_APPROVED",
          orderId: order._id.toString(),
          studentId: String(order.studentId),
        }
      );
    }

    res.json({
      message: "Order approved.",
      transaction: charge.transaction,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const rejectPendingOrder = async (req, res) => {
  try {
    const order = await loadAnswerable(req, res);
    if (!order) return;

    order.status = "REJECTED";
    order.rejectedAt = new Date();

    await order.save();

    res.json({ message: "Order rejected." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   POLLED BY THE TILL
========================================================= */
// The counter prints its slip and moves on rather than waiting, so nothing
// calls this today. It is kept, and behind the till's own token rather than
// open, because "did that order go through?" is the obvious next question and
// an order id should not be enough on its own to answer it.
export const getPendingOrderStatus = async (req, res) => {
  try {
    const order = await PendingOrder.findById(req.params.id);

    if (!order) {
      return res.status(404).json({ message: "Order not found." });
    }

    await expireIfLapsed(order);

    res.json({
      status: order.status,
      expiresAt: order.expiresAt,
      approvedAt: order.approvedAt,
      rejectedAt: order.rejectedAt,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
