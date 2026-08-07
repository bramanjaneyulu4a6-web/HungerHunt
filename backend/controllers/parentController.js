import Student from "../models/Student.js";
import Transaction from "../models/Transaction.js";
import Parent from "../models/Parent.js";

import bcrypt from "bcryptjs";
import { signParentToken } from "../utils/tokens.js";
import { assertOwnsStudent } from "../middleware/ownership.js";
import { sendPasswordResetMail } from "../utils/mailer.js";
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from "../utils/resetToken.js";

/* =========================================================
   ✅ REGISTER PARENT
========================================================= */
export const registerParent = async (req, res) => {
  try {
    const { fatherName, parentPhoneNumber, password, email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find students (initial linking step)
    const kids = await Student.find({
      fatherName,
      parentPhoneNumber,
    });

    if (kids.length === 0) {
      return res.status(400).json({
        message: "No matching student found",
      });
    }

    const existingParent = await Parent.findOne({
      phone: parentPhoneNumber,
    });

    if (existingParent) {
      return res.status(400).json({
        message: "Parent already registered",
      });
    }

    const hashedPwd = await bcrypt.hash(password, 10);

    await Parent.create({
      fatherName,
      phone: parentPhoneNumber,
      email: email.toLowerCase().trim(),
      password: hashedPwd,
      studentIds: kids.map((k) => k._id),
    });

    await Student.updateMany(
      { fatherName, parentPhoneNumber },
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

    const parent = await Parent.findOne({ phone: parentPhoneNumber });

    if (!parent) {
      return res.status(401).json({ message: "Parent not found" });
    }

    const isMatch = await bcrypt.compare(password, parent.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const token = signParentToken(parent._id, parent.phone);

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
    const parent = await Parent.findById(req.parent.id).populate("studentIds");

    if (!parent) {
      return res.status(404).json({ message: "Parent not found" });
    }

    const children = parent.studentIds; // ✅ ONLY LINKED STUDENTS

    const childrenIds = children.map((c) => c._id);

    const history = await Transaction.find({
      studentId: { $in: childrenIds },
    })
      .populate("studentId", "name")
      .sort({ createdAt: -1 });

    res.json({ children, history });

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
    if (!req.body.password || req.body.password.length < 6) {
      return res.status(400).json({
        message: "Password must be at least 6 characters",
      });
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

    await parent.save();

    res.json({ message: "Password reset successful" });

  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   ✅ CHILD DETAILS
========================================================= */
export const getChildDetails = async (req, res) => {
  try {
    if (!(await assertOwnsStudent(req, res, req.params.id))) return;

    const student = await Student.findById(req.params.id);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const bills = await Transaction.find({
      studentId: req.params.id,
    }).sort({ createdAt: -1 });

    // Asked as a question about the document rather than by loading the hash,
    // since the whole student is part of this response.
    const hasPurchasePassword = await Student.exists({
      _id: req.params.id,
      purchasePassword: { $ne: null },
    });

    res.json({
      student,
      bills,
      recharges: student.rechargeHistory || [],
      hasPurchasePassword: !!hasPurchasePassword,
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

    if (!password || password.length < 4) {
      return res.status(400).json({
        message: "Password must be at least 4 characters.",
      });
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

    if (newPassword.length < 4) {
      return res.status(400).json({
        message: "Password must be at least 4 characters.",
      });
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

    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({
        message: "Password must be at least 4 characters.",
      });
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

    await student.save();

    res.json({ message: "Purchase password reset successfully." });

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
