import Admin from '../models/Admin.js';
import { verifyToken } from '../utils/tokens.js';
import { authBypassEnabled, resolveBypassAdmin, resolveBypassParent } from './devBypass.js';

const readToken = (req) => req.headers.authorization?.split(' ')[1];

// Two independent checks stand between a token and admin access.
//
// verifyToken settles what the token is: signed with the admin key, and
// claiming the admin role. Tokens predating the role claim have none, and are
// accepted until the grace date in utils/tokens.js.
//
// The lookup below settles who it is for. It is what makes a parent's token
// useless here during that grace period, when the claim cannot distinguish
// them, and it is the only thing that revokes a deleted admin's unexpired
// token at any time. It mirrors assertOwnsStudent, which is why the reverse
// attack — an admin token on a parent route — has always failed.
const resolveAdminId = async (token) => {
  const payload = verifyToken(token, 'admin');
  if (!payload) return null;

  return (await Admin.exists({ _id: payload.id })) ? payload.id : null;
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

  const payload = verifyToken(token, 'parent');
  if (!payload) return res.status(401).json({ message: 'Not authorized' });

  req.parent = {
    id: payload.id,
    phone: payload.phone
  };

  next();
};
