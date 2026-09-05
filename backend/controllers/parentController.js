import FulfillmentOrder from "../models/FulfillmentOrder.js";
import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import WalletReversal from '../models/WalletReversal.js';
import Parent from "../models/Parent.js";
import PendingOrder from "../models/PendingOrder.js";

import bcrypt from "bcryptjs";
import { isOverdue, OPEN_STATUSES } from "../src/domain/fulfillment/overdue.js";
import { signParentToken } from "../utils/tokens.js";
import { assertOwnsStudent } from "../middleware/ownership.js";
import { sendPasswordResetMail } from "../utils/mailer.js";
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "../utils/resetToken.js";
import { flushQueuedPushes } from "../utils/sendNotification.js";
import { syncStudentRegistration } from "../utils/studentRegistration.js";
import firebasePhoneAuth from '../utils/firebasePhoneAuth.js';
import {
  passwordProblem,
  phoneProblem,
  purchaseCodeProblem,
} from "../utils/validation.js";

const parentSessionView = (parent) => ({
  id: parent._id,
  fatherName: parent.fatherName,
  phone: parent.phone,
  email: parent.email || '',
  studentIds: parent.studentIds,
});

/* The first screen asks this question only after Continue, and answers with
   one of three steps:
     PASSWORD     — an active account that has set its password.
     VERIFY_PHONE — an active account still waiting on first-time setup.
     NO_ACCOUNT   — no account, or an archived one; the app shows "contact
                    the school" instead of a password box that cannot work.

   NO_ACCOUNT is an owner-chosen trade-off (2026-09-05): it tells a caller
   which numbers have live accounts, which the earlier design deliberately
   hid. Chosen anyway so a typo'd or de-registered number gets an honest
   answer at the first step rather than a password prompt that can only end
   in "invalid credentials". authLimiter bounds how fast anyone can probe,
   and loginParent keeps its own single generic answer regardless. */
export const getParentLoginStep = async (req, res) => {
  try {
    const phone = String(req.body?.parentPhoneNumber ?? '').trim();
    const problem = phoneProblem(phone);
    if (problem) return res.status(400).json({ message: problem });

    const parent = await Parent.findOne({ phone });
    if (!parent || parent.active === false) return res.json({ next: 'NO_ACCOUNT' });

    const needsFirstPassword = Boolean(parent.activationRequired || !parent.password);
    res.json({ next: needsFirstPassword ? 'VERIFY_PHONE' : 'PASSWORD' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

/* A phone number is not a credential. Firebase sends and verifies the SMS
   code, then signs an ID token containing the proved E.164 phone number. Only
   that signed proof may claim a provisioned account and create its password. */
export const setFirstParentPassword = async (req, res) => {
  try {
    const phone = String(req.body?.parentPhoneNumber ?? '').trim();
    const idToken = String(req.body?.firebaseIdToken ?? '').trim();
    const problem = phoneProblem(phone) || passwordProblem(req.body?.password) ||
      (!idToken ? 'Phone verification is required.' : null);
    if (problem) return res.status(400).json({ message: problem });

    let proof;
    try {
      proof = await firebasePhoneAuth.verifyPhoneIdToken(idToken);
    } catch {
      return res.status(401).json({ message: 'Phone verification expired or is invalid. Request a new code.' });
    }

    const expectedPhone = `+91${phone}`;
    if (
      proof.phone_number !== expectedPhone ||
      proof.firebase?.sign_in_provider !== 'phone'
    ) {
      return res.status(401).json({ message: 'The verified phone number does not match this account.' });
    }

    const parent = await Parent.findOne({
      phone,
      active: { $ne: false },
      $or: [{ activationRequired: true }, { password: { $exists: false } }, { password: null }],
    });

    if (!parent) {
      return res.status(409).json({
        message: 'This account is not waiting for first-time password setup.',
      });
    }

    parent.password = await bcrypt.hash(req.body.password, 10);
    parent.activationRequired = false;
    parent.activationCodeHash = undefined;
    parent.activationCodeExpire = undefined;
    parent.activatedAt = new Date();
    parent.resetPasswordToken = undefined;
    parent.resetPasswordExpire = undefined;
    parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;
    await parent.save();

    const token = signParentToken(parent._id, parent.phone, parent.tokenVersion);
    res.json({ token, parent: parentSessionView(parent), message: 'Password created.' });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    if (!parent || parent.active === false || parent.activationRequired || !parent.password) return invalid();

    const isMatch = password && await bcrypt.compare(password, parent.password);

    if (!isMatch) return invalid();

    const token = signParentToken(parent._id, parent.phone, parent.tokenVersion ?? 0);

    res.json({
      token,
      parent: parentSessionView(parent),
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
      select: "name grade roomNumber pocketMoney"
    });

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    const childIds = parent.studentIds.map((student) => student._id);
    const orders = childIds.length
      ? await FulfillmentOrder.find({
          studentId: { $in: childIds },
          status: { $in: OPEN_STATUSES },
        }).sort({ orderedAt: -1 }).lean()
      : [];

    const now = new Date();

    res.json({
      children: parent.studentIds,
      ongoingOrders: orders.map((order) => parentPackageView(order, now)),
    });

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
      active: { $ne: false },
      activationRequired: { $ne: true },
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
    } catch (_mailError) {
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
      active: { $ne: false },
      activationRequired: { $ne: true },
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

    const [refunds, charges] = await Promise.all([
      WalletReversal.find({ studentId: req.params.id })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
      // The wallet's outgoings. UPI-funded orders are excluded because that
      // money never touched the wallet — its balance snapshots are equal and
      // a "deduction" of it would be a lie.
      Transaction.find({
        studentId: req.params.id,
        sourceType: { $ne: 'UPI_ORDER_PAYMENT' },
      })
        .sort({ createdAt: -1 })
        .limit(500)
        .lean(),
    ]);

    // The order each charge paid for, so the ledger line can name it the way
    // the orders tab does.
    const orders = charges.length
      ? await FulfillmentOrder.find({
          transactionId: { $in: charges.map((charge) => charge._id) },
        })
          .select('transactionId')
          .lean()
      : [];
    const orderIdByTransaction = new Map(
      orders.map((order) => [String(order.transactionId), String(order._id)])
    );

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
      ...charges.map((entry) => {
        const orderId = orderIdByTransaction.get(String(entry._id));
        return {
          _id: entry._id,
          kind: 'ORDER_PAYMENT',
          amount: entry.totalAmount,
          previousBalance: entry.previousBalance,
          newBalance: entry.remainingBalance,
          date: entry.createdAt,
          reason: orderId
            ? `Order: #${orderId.slice(-6).toUpperCase()}`
            : 'Order',
        };
      }),
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
 * package and when is it due", so it is answered with states and times, and
 * the staff accounts stay inside the storeroom. So does the room receiver:
 * who is holding a handed-over package is the back office's detail, and to a
 * parent that package is simply still out for delivery.
 *
 * deliverBy is read from the order rather than recalculated here: it was
 * stored at payment for exactly this reason, so the deadline the parent reads
 * is the deadline the storeroom is working to, and no client has to know the
 * 48-hour rule or the business timezone to display it. */
const parentPackageView = (order, now) => ({
  id: String(order._id),
  studentId: String(order.studentId),
  studentName: order.studentSnapshot?.name || "",
  status: order.status,
  items: (order.items || []).map(({ name, quantity, price }) => ({ name, quantity, price })),
  totalAmount: order.totalAmount,
  roomNumber: order.studentSnapshot?.roomNumber || "",
  orderedAt: order.orderedAt,
  deliverBy: order.deliverBy,
  packedAt: order.packedAt || null,
  dispatchedAt: order.dispatchedAt || null,
  deliveredAt: order.deliveredAt || null,
  /* Two different facts, and a parent wants both: deliveredAt is when the
     warehouse handed the package to the room's caretaker, collectedAt is
     when their child actually took it from them. Until the second exists the
     package is at the dorm, not with the child. */
  collectedAt: order.collectedAt || null,
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

    // New limits are weekly only, between ₹30 and ₹250. Controls saved under
    // the old rules may still be daily or monthly and keep working until the
    // parent next saves — checkout reads whatever is stored — but this route
    // no longer writes anything else.
    if (limitType && limitType !== "WEEKLY") {
      return res.status(400).json({
        message: "Only a weekly spending limit is supported",
      });
    }

    if (
      enabled &&
      !(Number.isFinite(Number(limitAmount)) && limitAmount >= 30 && limitAmount <= 250)
    ) {
      return res.status(400).json({
        message: "Weekly limit must be between ₹30 and ₹250",
      });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    student.walletControl = { enabled, limitAmount, limitType: "WEEKLY" };

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

/* =========================================================
   ✅ DELETE PARENT ACCOUNT
   The parent's own route out. Both stores require one for any app that has
   accounts, and the office's archive route is not it: that needs a member of
   staff.

   Server-side this is the same transition archiveParent performs. The row
   survives because approvals, notifications and the students' ledger all
   resolve a parent id — what goes is everything that gets anyone back into
   the account, and every device it was reaching. The privacy policy says so
   in as many words; if that stops being true, that page changes too.
========================================================= */
export const deleteParentAccount = async (req, res) => {
  try {
    const { password } = req.body || {};

    if (!password) {
      return res.status(400).json({
        message: "Your account password is required to delete your account.",
      });
    }

    const parent = await Parent.findById(req.parent.id);

    /* Same 401-without-a-code as resetPurchasePassword: a mistyped password is
       a form error, and the app signs out on AUTH_REQUIRED alone. */
    if (!parent || !parent.password || !(await bcrypt.compare(password, parent.password))) {
      return res.status(401).json({ message: "Your account password is incorrect." });
    }

    /* The same refusal the office gets, in the parent's words. Answering the
       request is a movement of money, and a deletion route is the wrong place
       to decide it either way.

       This check and the save below are not one transaction, so an approval
       raised in the gap between them survives against an archived parent, with
       nobody able to answer it. The race is accepted, not missed: the window is
       the few milliseconds between two queries, the till only raises an order
       against a parent it just read as active, and the cost of closing it — a
       transaction, or a second check after the write with a rollback behind
       it — buys less than it complicates. An order stranded that way is
       recoverable from the office; the deletion is not undone by leaving it. */
    if (await PendingOrder.exists({
      parentId: parent._id,
      status: { $in: ['PENDING', 'PROCESSING'] },
    })) {
      return res.status(409).json({
        message: "You have a purchase waiting for your answer. Answer it before deleting your account.",
      });
    }

    parent.active = false;
    parent.archivedAt = new Date();
    parent.archivedBy = null;
    parent.archivedReason = 'parent';
    parent.password = undefined;
    parent.pushTokens = [];
    parent.fcmToken = null;
    parent.resetPasswordToken = undefined;
    parent.resetPasswordExpire = undefined;
    /* Ends every session this account has on every device at once, including
       the one that sent this request. */
    parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;

    await parent.save();

    /* The deletion is done at the line above. What follows only puts the
       students' cached `isParentRegistered` back in step, and it must never be
       able to fail the request: the account is already archived and its
       password already gone, so a 500 here would tell the parent to try again,
       and the retry would answer "Your account password is incorrect" before
       the next navigation dropped them on the expired-session screen. That is
       the exact sentence this screen exists to avoid.

       So the parent is told the truth — it worked — and the stale flag is
       logged instead. A roster row reading `isParentRegistered: true` with no
       active parent behind it is a cosmetic lie the office can correct; either
       archive route re-running this sync repairs it. */
    try {
      await syncStudentRegistration((parent.studentIds || []).map(String));
    } catch (syncError) {
      console.error(
        "Parent account deleted, but student registration flags are now stale for parent",
        String(parent._id),
        syncError,
      );
    }

    res.json({ message: "Your account has been deleted." });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
