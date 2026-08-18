import Admin, { FULL_ADMIN } from '../models/Admin.js';
import bcrypt from 'bcryptjs';
import { signStaffToken, STAFF_ROLES } from '../utils/tokens.js';
import { sendPasswordResetMail } from '../utils/mailer.js';
import { createResetToken, hashResetToken, RESET_TOKEN_TTL_MS } from '../utils/resetToken.js';
import Hostel from '../models/Hostel.js';
import Student from '../models/Student.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';

export const registerAdmin = async (req, res) => {
  try {
    const name = String(req.body?.name ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = req.body?.password;

    if (!name || !phone || !email || !password) {
      return res.status(400).json({
        message: "Name, phone, email and password are required"
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
    // cannot be founded on a storekeeper — there would be nobody left who
    // could create the admin.
    const LIMITS = {
      admin: parseInt(process.env.MAX_ADMIN_ACCOUNTS) || 3,
      warehouse: parseInt(process.env.MAX_WAREHOUSE_ACCOUNTS) || 5,
      caretaker: parseInt(process.env.MAX_CARETAKER_ACCOUNTS) || 20,
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

    let hostelId = null;
    if (role === 'caretaker') {
      hostelId = req.body?.hostelId;
      const hostel = hostelId ? await Hostel.findOne({ _id: hostelId, active: true }) : null;
      if (!hostel) {
        return res.status(400).json({ message: 'Choose an active hostel for the caretaker.' });
      }
      hostelId = hostel._id;

      const [unlinkedStudent, unlinkedOrder] = await Promise.all([
        Student.exists({ hostelId: { $exists: false } }),
        FulfillmentOrder.exists({ 'studentSnapshot.hostelId': { $exists: false } }),
      ]);
      if (unlinkedStudent || unlinkedOrder) {
        return res.status(409).json({
          message: 'Run and verify the hostel backfill before creating a caretaker account.',
        });
      }
    } else if (req.body?.hostelId) {
      return res.status(400).json({ message: 'Only caretaker accounts may be assigned a hostel.' });
    }

    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      return res.status(400).json({
        message: "Admin already exists"
      });
    }

    const admin = new Admin({ name, phone, email, password, role, hostelId });
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
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const password = req.body?.password;
    const admin = await Admin.findOne({ email });
    if (!admin || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    // Accounts created before roles existed have no role and are admins.
    const role = admin.role || 'admin';

    /* A role that is no longer issued — a cashier row left over from before
       the counter went self-serve. signStaffToken would throw on it and the
       catch below would answer 500, which tells whoever is standing there
       nothing. This is not a broken server; it is an account that no longer
       means anything, and it says so. */
    if (!STAFF_ROLES.includes(role)) {
      return res.status(403).json({
        message:
          'This account type has been retired. Ask an admin to create you a new account.',
      });
    }

    if (!admin.name?.trim() || !admin.phone?.trim()) {
      return res.status(403).json({
        message: 'This staff account needs a name and phone number before it can sign in.',
      });
    }

    // The role is returned as well as signed in, so each front door can turn
    // away an account that belongs at a different one, rather than signing it
    // in to a console where every screen answers 403.
    let hostel = null;
    if (role === 'caretaker') {
      if (!admin.hostelId) {
        return res.status(403).json({ message: 'This caretaker account has no hostel assignment.' });
      }

      hostel = await Hostel.findById(admin.hostelId).select('code name').lean();
      if (!hostel) {
        return res.status(403).json({ message: 'This caretaker account is assigned to a missing hostel.' });
      }
    }

    const staff = {
      name: admin.name,
      phone: admin.phone,
      email: admin.email,
      role,
      ...(hostel ? {
        hostel: { id: String(hostel._id), code: hostel.code, name: hostel.name || '' },
      } : {}),
    };

    res.json({
      token: signStaffToken(admin._id, role),
      email: admin.email,
      role,
      name: admin.name,
      phone: admin.phone,
      staff,
      ...(hostel ? {
        hostelId: String(hostel._id),
        hostel: staff.hostel,
      } : {}),
    });
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
