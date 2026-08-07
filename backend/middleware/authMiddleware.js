import jwt from 'jsonwebtoken';

import Admin from '../models/Admin.js';
import { authBypassEnabled, resolveBypassAdmin, resolveBypassParent } from './devBypass.js';

const readToken = (req) => req.headers.authorization?.split(' ')[1];

// Verifying the signature is not enough to call someone an admin. Admin and
// parent tokens are signed with the same JWT_SECRET and both carry a bare
// { id }, so a parent's token satisfies jwt.verify on an admin route just as
// well as an admin's does. Confirming the subject is an Admin document is what
// actually tells the two apart — and it is also the only thing that stops a
// deleted admin's unexpired token from continuing to work.
//
// This mirrors assertOwnsStudent, which is why the reverse attack — an admin
// token on a parent route — already fails.
const resolveAdminId = async (token) => {
  const { id } = jwt.verify(token, process.env.JWT_SECRET);
  return (await Admin.exists({ _id: id })) ? id : null;
};

export const protectAdmin = async (req, res, next) => {
  if (authBypassEnabled) {
    const adminId = await resolveBypassAdmin();
    if (!adminId) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no admin account to impersonate'
      });
    }

    req.adminId = adminId;
    return next();
  }

  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const adminId = await resolveAdminId(token);
    if (!adminId) return res.status(401).json({ message: 'Not authorized' });

    req.adminId = adminId;
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};

// Admin registration is open only long enough to create the very first account.
// Once one exists it demands a signed-in admin, so that authorization is decided
// here rather than inferred inside the controller from a merely-truthy req.adminId.
export const protectAdminUnlessBootstrap = async (req, res, next) => {
  let adminCount;

  try {
    adminCount = await Admin.countDocuments();
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }

  if (adminCount === 0) return next();

  // Answer the common case in the caller's own terms; protectAdmin's generic
  // "no token" would not explain why a registration form stopped accepting.
  if (!authBypassEnabled && !readToken(req)) {
    return res.status(401).json({
      message: 'Only a signed-in admin can create additional admin accounts.'
    });
  }

  return protectAdmin(req, res, next);
};

export const protectParent = async (req, res, next) => {
  if (authBypassEnabled) {
    const parent = await resolveBypassParent();
    if (!parent) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no parent account to impersonate'
      });
    }

    req.parent = parent;
    return next();
  }

  const token = readToken(req);
  if (!token) return res.status(401).json({ message: 'Not authorized, no token' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.parent = {
      id: decoded.id,
      phone: decoded.phone
    };
    next();
  } catch (error) {
    res.status(401).json({ message: 'Token failed, invalid authorization' });
  }
};
