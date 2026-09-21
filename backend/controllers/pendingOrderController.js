import PendingOrder, { pendingOrderExpiry } from "../models/PendingOrder.js";
import Student from "../models/Student.js";
import Parent from "../models/Parent.js";
import Admin from "../models/Admin.js";
import Inventory from "../models/Inventory.js";
import Transaction from "../models/Transaction.js";
import { sendToParent } from "../utils/sendNotification.js";
import { chargeCart } from "../utils/checkout.js";
import { isDemoStudent } from "../utils/demoAccount.js";
import { checkPurchaseLimits } from "../utils/purchaseLimits.js";
import { sessionOptions, withMongoTransaction } from "../utils/mongoTransaction.js";
import {
  healDemoAccount,
  resetDemoRequest,
  seedDemoBasketAfterApproval,
} from "../utils/demoParentReset.js";
import {
  CARETAKER_HOLDS_MESSAGE,
  caretakerHoldsApproval,
} from "../utils/caretakerApproval.js";
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

class ApprovalError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const approvalKeyFrom = (req) =>
  String(req.get("Idempotency-Key") || req.body?.idempotencyKey || "").trim();

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
const priceCart = async (items, studentId) => {
  let totalAmount = 0;
  const orderItems = [];
  const limitedEntries = [];

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

    limitedEntries.push({ product: inventory.productId, quantity: item.quantity });
  }

  // Same reason the archived check is here rather than left to chargeCart: a
  // limit caught now is explained at the counter while the student is still
  // standing there, instead of surfacing days later as a parent's approval
  // failing for reasons they cannot act on. chargeCart checks again at the
  // moment money moves, which is the answer that actually binds.
  const withinLimits = await checkPurchaseLimits({ studentId, entries: limitedEntries });

  if (!withinLimits.ok) {
    return { ok: false, status: withinLimits.status, message: withinLimits.message };
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

    if (!student || student.active === false) {
      return res.status(404).json({ message: "Student record not found." });
    }

    /* The demo account cannot raise an approval request. It should never get
       here — requiresParentApproval is off on that row and the check below
       would turn a kiosk away anyway — but the console can raise an order for
       any student it can see, and this route's whole purpose is to send a
       notification to a parent. The one thing a demo must never do is make
       somebody's phone buzz, so it is refused by name rather than left to be
       caught by a setting somebody could change. */
    if (await isDemoStudent(student)) {
      return res.status(400).json({
        message: 'This is a demo account. It cannot raise an order for approval.',
      });
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

    const priced = await priceCart(items, student._id);

    if (!priced.ok) {
      return res.status(priced.status).json({ message: priced.message });
    }

    let pendingOrder;

    try {
      pendingOrder = await PendingOrder.create({
        studentId: student._id,
        parentId: parent._id,
        items: priced.orderItems,
        totalAmount: priced.totalAmount,
        expiresAt: pendingOrderExpiry(),
        raisedBy: req.staff?.id ?? null,
      });
    } catch (err) {
      // The unique active-order index closes the race between the friendly
      // pre-check above and two tills creating at the same instant.
      if (err?.code === 11000) {
        return res.status(409).json({
          message: `${student.name} already has an order waiting for approval.`,
        });
      }
      throw err;
    }

    // The caretaker answers this one if the parent has handed it to them; the
    // parent is still told, but told it is being looked after.
    const caretakerReviews = Boolean(
      student.requiresParentApproval && student.caretakerMayApprove
    );

    // Not awaited: the counter gets its answer now. sendToParent never rejects.
    sendToParent(
      parent,
      caretakerReviews ? "Order for the caretaker to review" : "Approval needed",
      caretakerReviews
        ? `${student.name} wants to spend ₹${priced.totalAmount}. The room caretaker will review it. Tap to view.`
        : `${student.name} wants to spend ₹${priced.totalAmount}. Tap to review.`,
      {
        type: "PENDING_ORDER",
        orderId: pendingOrder._id.toString(),
        studentId: student._id.toString(),
      }
    );

    /* The kiosk also opens WhatsApp addressed to this parent, with the basket
       typed out, so the request arrives somewhere they are already looking —
       a push can be switched off or never registered. The number goes only to
       whoever raised this request: the student's own session or the console. */
    res.status(201).json({
      message: "Approval request sent to the parent.",
      pendingOrder,
      parentPhone: parent.phone || null,
      caretakerReviews,
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
    /* The showroom parent's account repairs itself here, before it is read:
       a rejected or lapsed basket leaves nothing waiting, and this is the
       moment a visitor would notice. No-op for every real family — it answers
       on the phone alone before touching the database. See
       utils/demoParentReset.js. */
    await healDemoAccount({ parentId: req.parent.id, phone: req.parent.phone });

    const orders = await PendingOrder.find({
      parentId: req.parent.id,
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    })
      .populate("studentId", "name className section grade roomNumber pocketMoney caretakerMayApprove")
      .sort({ createdAt: -1 });

    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// The answerer's copy of the order, or an explanation of why it cannot be
// acted on. Every route below needs the same three checks. `owner` narrows the
// lookup to what this answerer may see — the parent's own orders, or one
// student's for a caretaker (see caretakerOwner).
const loadAnswerable = async (req, res, owner = { parentId: req.parent.id }) => {
  const order = await PendingOrder.findOne({
    _id: req.params.id,
    ...owner,
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
const updateAs = async (req, res, { owner }) => {
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

    const order = await loadAnswerable(req, res, owner);
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

    const priced = await priceCart(kept, order.studentId);

    if (!priced.ok) {
      return res.status(priced.status).json({ message: priced.message });
    }

    const updated = await PendingOrder.findOneAndUpdate(
      {
        _id: order._id,
        ...owner,
        status: "PENDING",
        expiresAt: { $gt: new Date() },
      },
      { $set: { items: priced.orderItems, totalAmount: priced.totalAmount } },
      { new: true, runValidators: true }
    );

    if (!updated) {
      return res.status(409).json({
        message: "This order changed while it was being edited. Refresh and try again.",
      });
    }

    res.json({ message: "Order updated.", order: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const approveAs = async (req, res, { owner, caretaker = null }) => {
  let claimedOrderId = null;
  let committed = false;

  /* A caretaker is told it went through and nothing more. The charge carries
     the wallet's balance before and after and is the family's receipt; the
     caretaker answered for the parent, they are not owed the paperwork. */
  const reply = (body) =>
    res.json(caretaker ? { message: body.message, ...(body.replayed ? { replayed: true } : {}) } : body);

  try {
    const approvalKey = approvalKeyFrom(req);

    if (!approvalKey || approvalKey.length > 100) {
      return res.status(400).json({
        message: "A valid Idempotency-Key is required to approve an order.",
      });
    }

    const existing = await PendingOrder.findOne({
      _id: req.params.id,
      ...owner,
    });

    if (!existing) {
      return res.status(404).json({ message: "This order could not be found." });
    }

    if (existing.status === "APPROVED" && existing.approvalKey === approvalKey) {
      const transaction = existing.transactionId
        ? await Transaction.findById(existing.transactionId)
        : await Transaction.findOne({ sourceType: "PARENT_APPROVAL", sourceId: existing._id });

      return reply({ message: "Order already approved.", transaction, replayed: true });
    }

    await expireIfLapsed(existing);

    if (existing.status === "EXPIRED") {
      return res.status(410).json({ message: "This request expired before it was answered." });
    }

    if (existing.status !== "PENDING") {
      return res.status(409).json({
        message:
          existing.status === "PROCESSING"
            ? "This order is already being processed. Retry with the same key shortly."
            : `This order has already been ${existing.status.toLowerCase()}.`,
      });
    }

    const result = await withMongoTransaction(async (session) => {
      const now = new Date();
      const order = await PendingOrder.findOneAndUpdate(
        {
          _id: existing._id,
          ...owner,
          status: "PENDING",
          expiresAt: { $gt: now },
        },
        {
          $set: {
            status: "PROCESSING",
            approvalKey,
            processingAt: now,
          },
        },
        { new: true, runValidators: true, ...sessionOptions(session) }
      );

      if (!order) {
        throw new ApprovalError(
          409,
          "This order changed while approval was being processed. Refresh and try again."
        );
      }

      claimedOrderId = order._id;

      // The price is the immutable snapshot the parent saw. Stock and product
      // availability are still checked live by chargeCart.
      const charge = await chargeCart({
        studentId: order.studentId,
        items: order.items.map((item) => ({
          productId: item.productId,
          quantity: item.quantity,
          price: item.price,
        })),
        session,
        sourceType: "PARENT_APPROVAL",
        sourceId: order._id,
        idempotencyKey: approvalKey,
        performedBy: caretaker?.id ?? null,
      });

      if (!charge.ok) {
        throw new ApprovalError(charge.status, charge.message);
      }

      const approved = await PendingOrder.findOneAndUpdate(
        { _id: order._id, status: "PROCESSING", approvalKey },
        {
          $set: {
            status: "APPROVED",
            approvedAt: new Date(),
            transactionId: charge.transaction._id,
            answeredBy: caretaker?.id ?? null,
          },
          $unset: { processingAt: 1 },
        },
        { new: true, runValidators: true, ...sessionOptions(session) }
      );

      if (!approved) {
        throw new ApprovalError(409, "The order could not be finalized safely.");
      }

      return { order: approved, ...charge };
    });

    committed = true;
    const { order, student, transaction, fulfillmentOrder } = result;
    const parent = await Parent.findById(order.parentId);

    if (parent) {
      sendToParent(
        parent,
        caretaker ? `Order approved by ${caretaker.name}` : "Order approved",
        `₹${transaction.totalAmount} spent. Balance ₹${student.pocketMoney}.`,
        {
          type: "ORDER_APPROVED",
          orderId: order._id.toString(),
          studentId: String(order.studentId),
        }
      );
    }

    /* The showroom parent's next basket goes up the moment this one is paid
       for, beside the confirmed package. After the commit, so the charge is
       settled before anything new is created. No-op for every real family. */
    await seedDemoBasketAfterApproval(order);

    reply({
      message: "Order approved.",
      transaction,
      fulfillmentOrder,
    });
  } catch (err) {
    // With MongoDB this write is normally unnecessary because the transaction
    // abort restores PENDING. It also makes the deliberately sessionless unit
    // test path, and a deployment accidentally connected to standalone Mongo,
    // fail open for a safe retry instead of leaving PROCESSING forever.
    if (claimedOrderId && !committed) {
      await PendingOrder.updateOne(
        { _id: claimedOrderId, status: "PROCESSING" },
        {
          $set: { status: "PENDING" },
          $unset: { approvalKey: 1, processingAt: 1 },
        }
      ).catch(() => {});
    }

    res.status(err.status || 500).json({
      message: caretaker ? caretakerSafeMessage(err.message) : err.message,
    });
  }
};

/* A wallet refusal names what is left — the balance, the remaining weekly
   limit — which is the family's to know, not the caretaker's. */
const caretakerSafeMessage = (message = "") =>
  /limit exceeded|pocket money|balance/i.test(message)
    ? "The student's wallet or spending limit does not cover this order. Ask the parent to top up or change the limit."
    : message;

const rejectAs = async (req, res, { owner, caretaker = null }) => {
  try {
    const order = await loadAnswerable(req, res, owner);
    if (!order) return;

    const rejected = await PendingOrder.findOneAndUpdate(
      {
        _id: order._id,
        ...owner,
        status: "PENDING",
        expiresAt: { $gt: new Date() },
      },
      {
        $set: {
          status: "REJECTED",
          rejectedAt: new Date(),
          answeredBy: caretaker?.id ?? null,
        },
      },
      { new: true, runValidators: true }
    );

    if (!rejected) {
      return res.status(409).json({
        message: "This order changed while it was being rejected. Refresh and try again.",
      });
    }

    // A demo basket said no to is cleared and the next one put in its place.
    await resetDemoRequest(rejected);

    // The parent declining their own request needs no telling; a caretaker
    // declining it on their behalf does.
    if (caretaker) {
      const parent = await Parent.findById(rejected.parentId);
      if (parent) {
        sendToParent(
          parent,
          `Order declined by ${caretaker.name}`,
          `₹${rejected.totalAmount} request declined. Nothing was charged.`,
          {
            type: "ORDER_REJECTED",
            orderId: rejected._id.toString(),
            studentId: String(rejected.studentId),
          }
        );
      }
    }

    res.json({ message: "Order rejected." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const parentOwner = (req) => ({ owner: { parentId: req.parent.id } });

/* The parent's three answers, each refused while the caretaker holds the
   approval — see utils/caretakerApproval.js. A missing order falls through to
   the handler, which says so in its own words. */
const asParent = (answer) => async (req, res) => {
  try {
    const order = await PendingOrder.findOne(
      { _id: req.params.id, parentId: req.parent.id },
      "studentId"
    );
    if (order && (await caretakerHoldsApproval(order.studentId))) {
      return res.status(409).json({ message: CARETAKER_HOLDS_MESSAGE, code: "CARETAKER_REVIEWS" });
    }
    await answer(req, res, parentOwner(req));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updatePendingOrder = asParent(updateAs);

export const approvePendingOrder = asParent(approveAs);

export const rejectPendingOrder = asParent(rejectAs);

/* =========================================================
   ANSWERED BY THE CARETAKER, WHEN THE PARENT ALLOWS IT
========================================================= */
/* The students whose requests this caretaker may answer: in one of their rooms,
   and with the parent's permission standing right now. Asked afresh on every
   request rather than remembered, so a parent withdrawing it — or approval
   being turned off, which withdraws it too — lands on the caretaker's next
   tap, not the next sign-in. */
const caretakerStudentFilter = (req) => ({
  roomId: { $in: req.staff.roomIds },
  active: { $ne: false },
  requiresParentApproval: true,
  caretakerMayApprove: true,
});

// One order's scope for a caretaker, or a 404 that does not say whether the
// order exists — an order they may not answer is not theirs to know about.
const caretakerOwner = async (req, res) => {
  const order = await PendingOrder.findById(req.params.id).select("studentId").lean();
  const allowed =
    order &&
    (await Student.exists({ _id: order.studentId, ...caretakerStudentFilter(req) }));

  if (!allowed) {
    res.status(404).json({ message: "This order could not be found." });
    return null;
  }

  const account = await Admin.findById(req.staff.id).select("name").lean();

  return {
    owner: { studentId: order.studentId },
    caretaker: { id: req.staff.id, name: account?.name || "the caretaker" },
  };
};

export const getCaretakerPendingOrders = async (req, res) => {
  try {
    const students = await Student.find(caretakerStudentFilter(req)).select("_id").lean();

    if (students.length === 0) return res.json({ count: 0, orders: [] });

    const orders = await PendingOrder.find({
      studentId: { $in: students.map((student) => student._id) },
      status: "PENDING",
      expiresAt: { $gt: new Date() },
    })
      // pocketMoney: the caretaker sees the wallet balance beside the cart, as
      // the parent does, to know whether accepting it can go through.
      .populate("studentId", "name admissionNumber className section grade roomNumber pocketMoney")
      .sort({ createdAt: -1 });

    res.json({ count: orders.length, orders });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const caretakerApprovePendingOrder = async (req, res) => {
  try {
    const scope = await caretakerOwner(req, res);
    if (!scope) return;
    await approveAs(req, res, scope);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* A caretaker may cut the basket down before accepting it, as the parent
   could — the parent now sends changes through them. Same rule: reduce only,
   never add. */
export const caretakerUpdatePendingOrder = async (req, res) => {
  try {
    const scope = await caretakerOwner(req, res);
    if (!scope) return;
    await updateAs(req, res, scope);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const caretakerRejectPendingOrder = async (req, res) => {
  try {
    const scope = await caretakerOwner(req, res);
    if (!scope) return;
    await rejectAs(req, res, scope);
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
