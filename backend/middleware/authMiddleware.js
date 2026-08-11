import Admin, { FULL_ADMIN } from '../models/Admin.js';
import Parent from '../models/Parent.js';
import { verifyToken } from '../utils/tokens.js';
import { authBypassEnabled, resolveBypassAdmin, resolveBypassParent } from './devBypass.js';

const readToken = (req) => req.headers.authorization?.split(' ')[1];

// Marks the 401s that mean "this session is no longer good", as opposed to the
// ones a controller returns for a password typed into a form — resetPurchase-
// Password answers a wrong account password with 401 too. The clients sign out
// on this code, so it must appear on exactly the token failures.
const AUTH_REQUIRED = 'AUTH_REQUIRED';

const denied = (res, message) =>
  res.status(401).json({ message, code: AUTH_REQUIRED });

// A signed-in cashier reaching an admin-only route is not a broken session, and
// answering it with 401 would sign the till out mid-sale for doing nothing
// wrong. 403 says the token is fine and the account simply does not reach here.
const forbidden = (res, message) => res.status(403).json({ message });

// Two independent checks stand between a token and staff access, and a third
// between a token and the admin-only half of it.
//
// verifyToken settles what the token is: signed with the admin key, and
// claiming a staff role. Tokens predating the role claim have none, and are
// accepted as full admins until the grace date in utils/tokens.js.
//
// The lookup below settles who it is for, and what that account is *now*. It is
// what makes a parent's token useless here during that grace period, when the
// claim cannot distinguish them; it is the only thing that revokes a deleted
// admin's unexpired token at any time; and by asking whether the row is still a
// full admin rather than merely present, it is what makes demoting someone in
// the back office take effect on their next request instead of whenever their
// token happens to expire.
const staffGate = (required) => async (req, res, next) => {
  if (authBypassEnabled) {
    const adminId = await resolveBypassAdmin();
    if (!adminId) {
      return res.status(503).json({
        message: 'AUTH_BYPASS is on but there is no admin account to impersonate'
      });
    }

    req.adminId = adminId;
    req.staff = { id: adminId, role: 'admin' };
    return next();
  }

  const token = readToken(req);
  if (!token) return denied(res, 'Not authorized, no token');

  try {
    const payload = verifyToken(token, 'staff');
    if (!payload) return denied(res, 'Not authorized');

    const role = payload.role || 'admin';

    if (required === 'admin' && role !== 'admin') {
      return forbidden(res, 'This action needs a full admin account.');
    }

    const filter = required === 'admin'
      ? { _id: payload.id, ...FULL_ADMIN }
      : { _id: payload.id };

    if (!(await Admin.exists(filter))) return denied(res, 'Not authorized');

    req.adminId = payload.id;
    req.staff = { id: payload.id, role };
    next();
  } catch (error) {
    denied(res, 'Token failed, invalid authorization');
  }
};

// The back office: everything that changes the shop, the money supply, or who
// may sign in. This is the strict one on purpose — a route that nobody thought
// about keeps the narrower audience rather than quietly gaining a wider one.
export const protectAdmin = staffGate('admin');

// The till's routes, open to both kinds of staff. Deliberately few: look a
// student up, verify their code, take the payment, raise an approval request.
export const protectStaff = staffGate('staff');

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
    return denied(res, 'Only a signed-in admin can create additional admin accounts.');
  }

  return protectAdmin(req, res, next);
};

// A parent token is good for seven days, and until tokenVersion existed that
// was unconditional: resetting the password after a lost or stolen phone left
// every session already issued working to the day it expired, and there was
// nothing to revoke them with. Now the number the token was stamped with has to
// still match the account, so moving it ends every older session at once.
//
// Both defaults are 0 — a token issued before the claim existed carries no v,
// and an account predating the field has no tokenVersion — so they agree, and
// introducing this signs nobody out. Only a reset moves them apart.
const atTokenVersion = ({ id, v }) => {
  const version = v ?? 0;

  return version === 0
    ? { _id: id, $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
    : { _id: id, tokenVersion: version };
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
  if (!token) return denied(res, 'Not authorized, no token');

  const payload = verifyToken(token, 'parent');
  if (!payload) return denied(res, 'Not authorized');

  try {
    // Costs a query per request, which protectAdmin has always paid. It buys
    // revocation, and it retires a deleted parent's token for the same reason
    // the Admin lookup retires a deleted admin's.
    if (!(await Parent.exists(atTokenVersion(payload)))) {
      return denied(res, 'Not authorized');
    }
  } catch (error) {
    return denied(res, 'Token failed, invalid authorization');
  }

  req.parent = {
    id: payload.id,
    phone: payload.phone
  };

  next();
};
