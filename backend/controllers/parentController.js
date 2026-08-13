import FulfillmentOrder from "../models/FulfillmentOrder.js";
import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import WalletReversal from '../models/WalletReversal.js';
import Parent from "../models/Parent.js";

import bcrypt from "bcryptjs";
import { isOverdue } from "../src/domain/fulfillment/overdue.js";
import { signParentToken } from "../utils/tokens.js";
import { assertOwnsStudent } from "../middleware/ownership.js";
import { sendPasswordResetMail } from "../utils/mailer.js";
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "../utils/resetToken.js";
import { flushQueuedPushes } from "../utils/sendNotification.js";
import {
  passwordProblem,
  phoneProblem,
  emailProblem,
  purchaseCodeProblem,
} from "../utils/validation.js";

/* =========================================================
   ✅ REGISTER PARENT
========================================================= */
export const registerParent = async (req, res) => {
  try {
    const { fatherName, parentPhoneNumber, password, email } = req.body;

    if (!fatherName?.trim()) {
      return res.status(400).json({ message: "Father's name is required" });
    }

    const problem =
      phoneProblem(parentPhoneNumber) ||
      emailProblem(email) ||
      passwordProblem(password);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const phone = String(parentPhoneNumber).trim();

    // Find students (initial linking step)
    const kids = await Student.find({
      fatherName,
      parentPhoneNumber: phone,
      active: { $ne: false },
    });

    if (kids.length === 0) {
      return res.status(400).json({
        message: "No matching student found",
      });
    }

    const existingParent = await Parent.findOne({ phone });

    if (existingParent) {
      return res.status(400).json({
        message: "Parent already registered",
      });
    }

    const hashedPwd = await bcrypt.hash(password, 10);

    await Parent.create({
      fatherName,
      phone,
      email: email.toLowerCase().trim(),
      password: hashedPwd,
      studentIds: kids.map((k) => k._id),
    });

    await Student.updateMany(
      { fatherName, parentPhoneNumber: phone, active: { $ne: false } },
      { isParentRegistered: true }
    );

    res.status(201).json({
      message: "Parent registered successfully",
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* =========================================================
   ✅ LOGIN PARENT
========================================================= */
export const loginParent = async (req, res) => {
  try {
    const { parentPhoneNumber, password } = req.body;

    const parent = await Parent.findOne({ phone: String(parentPhoneNumber ?? "").trim() });

    /* One answer for "no such number" and for "wrong password". Two different
       ones let anybody discover which phone numbers have accounts by watching
       which reply comes back — the same reason forgotPassword is deliberately
       vague, undone here. */
    const invalid = () =>
      res.status(401).json({ message: "Invalid phone number or password" });

    if (!parent) return invalid();

    const isMatch = password && await bcrypt.compare(password, parent.password);

    if (!isMatch) return invalid();

    const token = signParentToken(parent._id, parent.phone, parent.tokenVersion ?? 0);

    res.json({
      token,
      parent: {
        id: parent._id,
        fatherName: parent.fatherName,
        phone: parent.phone,
        email: parent.email,
        studentIds: parent.studentIds,
      },
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
   ✅ DASHBOARD (FIXED - IMPORTANT)
========================================================= */
export const getParentDashboardDetails = async (req, res) => {
  try {
    /* The dashboard lists children and their balances, and that is all it has
       ever rendered. It was also sent every transaction any of them had ever
       made — unread, unbounded, and growing for as long as the child is
       enrolled — and full student documents carrying their whole
       rechargeHistory alongside. Both are gone; what is left is the four
       fields the cards actually show. */
    const parent = await Parent.findById(req.parent.id).populate({
      path: "studentIds",
      select: "name grade hostelNumber pocketMoney"
    });

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    res.json({ children: parent.studentIds });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* =========================================================
   ✅ FORGOT PASSWORD
========================================================= */
export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email required" });
    }

    const parent = await Parent.findOne({
      email: email.toLowerCase().trim(),
    });

    // Always report success so this endpoint cannot be used to enumerate accounts.
    const genericResponse = {
      message: "If that email is registered, a reset link has been sent.",
    };

    if (!parent) return res.json(genericResponse);

    const { raw, hashed } = createResetToken();

    parent.resetPasswordToken = hashed;
    parent.resetPasswordExpire = new Date(Date.now() + RESET_TOKEN_TTL_MS);

    await parent.save();

    const baseUrl = process.env.PARENT_CLIENT_URL || "http://localhost:5173";

    try {
      await sendPasswordResetMail({
        to: parent.email,
        resetUrl: `${baseUrl}/reset-password/${raw}`,
      });
    } catch (mailError) {
      parent.resetPasswordToken = undefined;
      parent.resetPasswordExpire = undefined;
      await parent.save();
      return res.status(500).json({ message: "Could not send the reset email. Try again later." });
    }

    res.json(genericResponse);

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ RESET PASSWORD
========================================================= */
export const resetPassword = async (req, res) => {
  try {
    const problem = passwordProblem(req.body.password);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const parent = await Parent.findOne({
      resetPasswordToken: hashResetToken(req.params.token),
      resetPasswordExpire: { $gt: new Date() },
    });

    if (!parent) {
      return res.status(400).json({
        message: "Token invalid or expired",
      });
    }

    parent.password = await bcrypt.hash(req.body.password, 10);
    parent.resetPasswordToken = undefined;
    parent.resetPasswordExpire = undefined;

    /* The reason somebody resets a password is usually that someone else has
       it, or has the phone it is signed in on. Changing it did nothing to the
       sessions already open on that phone: they are good for seven days from
       when they were issued and were never asked about the password again.

       Moving tokenVersion is what closes them. Every token carries the number
       it was signed under, protectParent compares it to this one, and the
       older ones stop verifying on their next request. */
    parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;

    await parent.save();

    res.json({
      message: "Password reset successful. Any other devices signed in to this account have been signed out.",
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ CHILD DETAILS
========================================================= */
/* One page of history, and never the whole of it. A child buying lunch daily
   accumulates hundreds of transactions across a school year, and both screens
   that read them show a list the parent scrolls. */
const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

const readPaging = (req) => {
  const page = Math.max(parseInt(req.query.page) || 1, 1);
  const limit = Math.min(
    Math.max(parseInt(req.query.limit) || PAGE_SIZE, 1),
    MAX_PAGE_SIZE
  );

  return { page, limit, skip: (page - 1) * limit };
};

const paged = (total, page, limit) => ({
  total,
  page,
  pages: Math.ceil(total / limit) || 1,
  hasMore: page * limit < total
});

/* Who the child is, and nothing about what they have bought. The lists moved to
   their own endpoints below: this response was carrying every transaction ever
   made and the entire rechargeHistory, which the purchase-password screen also
   downloaded in full in order to render a form with a name on it. */
export const getChildDetails = async (req, res) => {
  try {
    if (!(await assertOwnsStudent(req, res, req.params.id))) return;

    const student = await Student.findById(req.params.id).select("-rechargeHistory");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    // Asked as a question about the document rather than by loading the hash,
    // which select: false keeps out of this query anyway.
    const hasPurchasePassword = await Student.exists({
      _id: req.params.id,
      purchasePassword: { $ne: null },
    });

    res.json({
      student,
      hasPurchasePassword: !!hasPurchasePassword,
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getChildBills = async (req, res) => {
  try {
    if (!(await assertOwnsStudent(req, res, req.params.id))) return;

    const { page, limit, skip } = readPaging(req);
    const filter = { studentId: req.params.id };

    const [bills, total] = await Promise.all([
      Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
      Transaction.countDocuments(filter)
    ]);

    res.json({ bills, ...paged(total, page, limit) });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getChildRecharges = async (req, res) => {
  try {
    if (!(await assertOwnsStudent(req, res, req.params.id))) return;

    const { page, limit, skip } = readPaging(req);

    const student = await Student.findById(req.params.id).select("rechargeHistory");

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const refunds = await WalletReversal.find({ studentId: req.params.id })
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();
    const all = [
      ...(student.rechargeHistory || []).slice().reverse().map((entry) => ({
        ...(entry.toObject?.() || entry),
        kind: 'TOP_UP',
      })),
      ...refunds.map((entry) => ({
        _id: entry._id,
        kind: 'ORDER_CANCELLATION_REFUND',
        amount: entry.amount,
        previousBalance: entry.previousBalance,
        newBalance: entry.newBalance,
        date: entry.createdAt,
        reason: entry.reason,
      })),
    ].sort((left, right) => new Date(right.date) - new Date(left.date));

    res.json({
      recharges: all.slice(skip, skip + limit),
      ...paged(all.length, page, limit)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* What the parent is shown about a package, and no more.
 *
 * The order snapshot also carries the packing staff, the dispatching staff,
 * the transition trail and the internal operational notes. None of that is a
 * parent's business — the question this screen answers is "where is my child's
 * package and when is it due", so it is answered with states, times and the
 * short receiver note, and the staff accounts stay inside the storeroom.
 *
 * deliverBy is read from the order rather than recalculated here: it was
 * stored at payment for exactly this reason, so the deadline the parent reads
 * is the deadline the storeroom is working to, and no client has to know the
 * 48-hour rule or the business timezone to display it. */
const parentPackageView = (order, now) => ({
  id: String(order._id),
  status: order.status,
  items: (order.items || []).map(({ name, quantity, price }) => ({ name, quantity, price })),
  totalAmount: order.totalAmount,
  hostelNumber: order.studentSnapshot?.hostelNumber || "",
  orderedAt: order.orderedAt,
  deliverBy: order.deliverBy,
  packedAt: order.packedAt || null,
  dispatchedAt: order.dispatchedAt || null,
  deliveredAt: order.deliveredAt || null,
  receivedBy: order.proofOfDelivery?.receivedBy || "",
  overdue: isOverdue(order, now),
});

export const getChildPackages = async (req, res) => {
  try {
    if (!(await assertOwnsStudent(req, res, req.params.id))) return;

    const { page, limit, skip } = readPaging(req);
    const filter = { studentId: req.params.id };

    const [orders, total] = await Promise.all([
      FulfillmentOrder.find(filter).sort({ orderedAt: -1 }).skip(skip).limit(limit).lean(),
      FulfillmentOrder.countDocuments(filter)
    ]);

    const now = new Date();

    res.json({
      packages: orders.map((order) => parentPackageView(order, now)),
      ...paged(total, page, limit)
    });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* =========================================================
   ✅ SET PURCHASE PASSWORD
========================================================= */
export const setPurchasePassword = async (req, res) => {
  try {
    const { studentId, password } = req.body;

    if (!(await assertOwnsStudent(req, res, studentId))) return;

    const problem = purchaseCodeProblem(password);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const student = await Student.findById(studentId).select('+purchasePassword');

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    if (student.purchasePassword) {
      return res.status(400).json({
        message: "Purchase password already exists. Use Change Password.",
      });
    }

    student.purchasePassword = await bcrypt.hash(password, 10);
    student.purchaseCodeIsPin = true;

    await student.save();

    res.json({ message: "Purchase password saved successfully." });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ CHANGE PURCHASE PASSWORD
========================================================= */
export const changePurchasePassword = async (req, res) => {
  try {
    const { studentId, currentPassword, newPassword } = req.body;

    if (!(await assertOwnsStudent(req, res, studentId))) return;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        message: "Current password and new password are required.",
      });
    }

    // Only the new code is held to the rule. A student set up before it was
    // four digits still has whatever they were given, and has to be able to
    // type it here — refusing it is refusing them the way out.
    const problem = purchaseCodeProblem(newPassword);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const student = await Student.findById(studentId).select('+purchasePassword');

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    if (!student.purchasePassword) {
      return res.status(400).json({
        message: "Purchase password has not been set yet.",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, student.purchasePassword);

    if (!isMatch) {
      return res.status(400).json({ message: "Current password is incorrect." });
    }

    student.purchasePassword = await bcrypt.hash(newPassword, 10);
    student.purchaseCodeIsPin = true;

    await student.save();

    res.json({ message: "Purchase password changed successfully." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ RESET PURCHASE PASSWORD
   Requires the parent's own account password — otherwise anyone
   holding a parent session could silently rewrite the spend gate.
========================================================= */
export const resetPurchasePassword = async (req, res) => {
  try {
    const { studentId, parentPassword, newPassword } = req.body;

    if (!(await assertOwnsStudent(req, res, studentId))) return;

    const problem = purchaseCodeProblem(newPassword);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    if (!parentPassword) {
      return res.status(400).json({
        message: "Your account password is required to reset the purchase password.",
      });
    }

    const parent = await Parent.findById(req.parent.id);

    if (!parent || !(await bcrypt.compare(parentPassword, parent.password))) {
      return res.status(401).json({ message: "Your account password is incorrect." });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    student.purchasePassword = await bcrypt.hash(newPassword, 10);
    student.purchaseCodeIsPin = true;

    await student.save();

    res.json({ message: "Purchase password reset successfully." });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ PUSH TOKEN REGISTRATION
========================================================= */
const PLATFORMS = new Set(["ios", "android", "web"]);

export const savePushToken = async (req, res) => {
  try {
    const { token, platform } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Push token is required" });
    }

    // A device is one physical phone or browser, and FCM issues it one token.
    // Detaching it from everyone first covers two cases at once: a shared
    // family phone whose previous parent would otherwise keep receiving
    // notifications about a child who is not theirs, and this same parent
    // re-registering on every app start, which would otherwise stack duplicates.
    await Parent.updateMany(
      { "pushTokens.token": token },
      { $pull: { pushTokens: { token } } }
    );

    // Same device, recorded in the field that predates pushTokens. Matched on
    // the token rather than cleared outright: a parent whose legacy token is a
    // *different* device still needs it until that device re-registers.
    await Parent.updateMany({ fcmToken: token }, { $set: { fcmToken: null } });

    await Parent.updateOne(
      { _id: req.parent.id },
      {
        $push: {
          pushTokens: {
            token,
            platform: PLATFORMS.has(platform) ? platform : "web",
            updatedAt: new Date()
          }
        }
      }
    );

    res.json({ message: "Device registered for notifications" });

    // A new device is the moment to hand over anything still owed — this is
    // what carries missed notifications across an uninstall or a fresh
    // sign-in. After the response, and not awaited: registration is complete
    // whether or not the backlog goes out now or on the next sweep.
    flushQueuedPushes(req.parent.id);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const removePushToken = async (req, res) => {
  try {
    const { token } = req.body;

    if (!token) {
      return res.status(400).json({ message: "Push token is required" });
    }

    await Parent.updateOne(
      { _id: req.parent.id },
      { $pull: { pushTokens: { token } } }
    );

    res.json({ message: "Device unregistered" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ WALLET CONTROL
========================================================= */
export const updateWalletControl = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertOwnsStudent(req, res, studentId))) return;

    const { enabled, limitAmount, limitType } = req.body;

    if (enabled && (!limitAmount || limitAmount <= 0)) {
      return res.status(400).json({
        message: "Limit amount must be greater than 0",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    student.walletControl = { enabled, limitAmount, limitType };

    await student.save();

    res.json({ message: "Wallet control updated", student });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ PURCHASE APPROVAL
========================================================= */
// Turning this on stops the counter charging this student directly: their
// purchases become requests this parent answers in the app. It is deliberately
// its own route rather than a field on wallet control — a spending limit and
// having to approve every packet of biscuits are different decisions, and a
// parent changing one should not have to restate the other.
export const updatePurchaseApproval = async (req, res) => {
  try {
    const { studentId } = req.params;

    if (!(await assertOwnsStudent(req, res, studentId))) return;

    const { required } = req.body;

    if (typeof required !== "boolean") {
      return res.status(400).json({
        message: "required must be true or false",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    student.requiresParentApproval = required;

    await student.save();

    res.json({
      message: required
        ? "Purchases will now wait for your approval"
        : "Purchases no longer need your approval",
      requiresParentApproval: student.requiresParentApproval,
    });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
