import Admin, { FULL_ADMIN } from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import { signStaffToken } from '../utils/tokens.js';
import { sendPasswordResetMail } from '../utils/mailer.js';
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from '../utils/resetToken.js';

export const registerAdmin = async (req, res) => {
  try {
    const email = req.body?.email;
    const password = req.body?.password;

    if (!email || !password) {
      return res.status(400).json({
        message: "Email and password are required"
      });
    }

    if (password.length < 8) {
      return res.status(400).json({
        message: "Password must be at least 8 characters"
      });
    }

    const adminCount = await Admin.countDocuments(FULL_ADMIN);

    // Who may call this is settled by protectAdminUnlessBootstrap on the route:
    // open while no account exists, signed-in full admins only thereafter.
    //
    // The bootstrap call is the exception that has to be forced rather than
    // trusted: it is the one unauthenticated path in here, and a deployment
    // cannot be founded on a cashier or a storekeeper — there would be nobody
    // left who could create the admin.
    const LIMITS = {
      admin: parseInt(process.env.MAX_ADMIN_ACCOUNTS) || 3,
      cashier: parseInt(process.env.MAX_CASHIER_ACCOUNTS) || 10,
      warehouse: parseInt(process.env.MAX_WAREHOUSE_ACCOUNTS) || 5,
    };

    const requested = req.body?.role;
    const role = adminCount > 0 && LIMITS[requested] ? requested : 'admin';

    const existing = role === 'admin'
      ? adminCount
      : await Admin.countDocuments({ role });

    if (existing >= LIMITS[role]) {
      return res.status(400).json({
        message: `Registration limited. Max ${LIMITS[role]} ${role} accounts allowed.`
      });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        message: "Admin already exists"
      });
    }

    const admin = new Admin({ email, password, role });
    await admin.save();

    return res.status(201).json({
      message: role === 'admin'
        ? "Admin registered successfully"
        : `${role[0].toUpperCase()}${role.slice(1)} account created successfully`,
      role,
    });

  } catch (error) {
    return res.status(500).json({
      message: error.message
    });
  }
};

export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Accounts created before cashiers existed have no role and are admins.
    const role = admin.role || 'admin';

    // The role is returned as well as signed in, so the back office can turn a
    // cashier away at its own front door rather than signing them in to a
    // console where every screen answers 403.
    res.json({ token: signStaffToken(admin._id, role), email: admin.email, role });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email required' });
    }

    const admin = await Admin.findOne({ email: email.toLowerCase().trim() });

    // Always report success so this endpoint cannot be used to enumerate admins.
    const genericResponse = {
      message: 'If that email is registered, a reset link has been sent.'
    };

    if (!admin) return res.json(genericResponse);

    const { raw, hashed } = createResetToken();
    admin.resetPasswordToken = hashed;
    admin.resetPasswordExpire = new Date(Date.now() + RESET_TOKEN_TTL_MS);
    await admin.save();

    const baseUrl = process.env.ADMIN_CLIENT_URL || 'http://localhost:5174';

    try {
      await sendPasswordResetMail({
        to: admin.email,
        resetUrl: `${baseUrl}/reset-password/${raw}`,
      });
    } catch (mailError) {
      admin.resetPasswordToken = undefined;
      admin.resetPasswordExpire = undefined;
      await admin.save();
      return res.status(500).json({ message: 'Could not send the reset email. Try again later.' });
    }

    res.json(genericResponse);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const resetPassword = async (req, res) => {
  try {
    const { password } = req.body;

    if (!password || password.length < 8) {
      return res.status(400).json({ message: 'Password must be at least 8 characters' });
    }

    const admin = await Admin.findOne({
      resetPasswordToken: hashResetToken(req.params.token),
      resetPasswordExpire: { $gt: new Date() },
    });

    if (!admin) {
      return res.status(400).json({ message: 'Reset link is invalid or has expired' });
    }

    admin.password = password;
    admin.resetPasswordToken = undefined;
    admin.resetPasswordExpire = undefined;
    await admin.save();

    res.json({ message: 'Password reset successful' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
