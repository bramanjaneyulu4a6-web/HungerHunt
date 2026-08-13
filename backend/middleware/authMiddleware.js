import Admin from '../models/Admin.js';
import Parent from '../models/Parent.js';
import Student from '../models/Student.js';
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

// A signed-in warehouse account reaching an admin-only route is not a broken
// session, and answering it with 401 would sign the storeroom out for doing
// nothing wrong. 403 says the token is fine and the account does not reach here.
const forbidden = (res, message) => res.status(403).json({ message });

// One row filter per gate: the account's stored role must be in the gate's
// allow-list. A row with no role at all predates roles entirely and is a full
// admin, which outranks every gate — so the missing field is accepted
// everywhere, spelled out because Mongo will not infer it.
const roleFilter = (allowed) => ({
  $or: [{ role: { $in: allowed } }, { role: { $exists: false } }],
});

const staffGate = (allowed, needsMessage) => async (req, res, next) => {
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

    if (!allowed.includes(role)) {
      return forbidden(res, needsMessage);
    }

    if (!(await Admin.exists({ _id: payload.id, ...roleFilter(allowed) }))) {
      return denied(res, 'Not authorized');
    }

    req.adminId = payload.id;
    req.staff = { id: payload.id, role };
    next();
  } catch (error) {
    denied(res, 'Token failed, invalid authorization');
  }
};

// The back office: everything that changes the shop, the money supply, or who
// may sign in. Strict on purpose — a route nobody thought about keeps the
// narrower audience rather than quietly gaining a wider one.
export const protectAdmin = staffGate(['admin'], 'This action needs a full admin account.');

/* The till's routes: look a student up, verify a code, take the payment, raise
   an approval request.
 *
 * These admitted cashiers as well until the counter went self-serve. With that
 * role withdrawn the list is exactly protectAdmin's, and the two are the same
 * gate under two names — kept apart because they answer different questions
 * ("may this account run a till" against "may it run the back office") and a
 * route that gains a role should gain it on the right one. If nothing ever
 * takes the till but an admin, this should collapse into protectAdmin rather
 * than sit here implying a wider audience than it has. */
export const protectStaff = staffGate(['admin'], 'This action needs a till account.');

// The storeroom's routes: see and raise purchase orders, receive deliveries,
// read stock and suppliers.
export const protectWarehouse = staffGate(['admin', 'warehouse'], 'This action needs a warehouse account.');

/* Read-only surfaces every kind of staff needs (live stock).
 *
 * Now that cashier is gone this holds the same roles as protectWarehouse, by
 * coincidence rather than by meaning: that one names who may work the
 * storeroom, this one names everybody. They part again the moment a fourth
 * staff role appears, so they stay separate. */
export const protectAnyStaff = staffGate(
  ['admin', 'warehouse'],
  'This action needs a staff account.'
);

/* The kiosk's student session.
 *
 * The token settles who it is for. The lookup settles that the row is still
 * there, which is the only thing that retires an unexpired token inside its
 * 450 seconds — the same price protectParent pays, for the same reason.
 *
 * Note what this gate does *not* prove: the student typed no secret to get
 * here. It says which student the session belongs to, not that they are who
 * they say. What guards the money is the purchase code at checkout. */
export const protectStudent = async (req, res, next) => {
  const token = readToken(req);
  if (!token) return denied(res, 'Not authorized, no token');

  const payload = verifyToken(token, 'student');
  if (!payload) return denied(res, 'Not authorized');

  try {
    if (!(await Student.exists({ _id: payload.id, active: { $ne: false } }))) {
      return denied(res, 'Not authorized');
    }
  } catch (error) {
    return denied(res, 'Token failed, invalid authorization');
  }

  req.student = { id: payload.id, admissionNumber: payload.admissionNumber };
  next();
};

/* The till's routes now serve two audiences: the admin console, holding a
 * staff token, and the kiosk, holding a student session. This wraps whichever
 * staff gate a route already has rather than replacing it, so a route keeps
 * its own answer for staff — protectStaff and protectAnyStaff say different
 * things to a warehouse account, and that distinction survives.
 *
 * A student-signed token takes the student path; everything else, including a
 * missing or unreadable one, falls through to the staff gate so its errors and
 * its bypass behaviour are unchanged. */
export const orStudent = (staffGate) => (req, res, next) => {
  if (authBypassEnabled) return staffGate(req, res, next);

  const token = readToken(req);

  if (token && verifyToken(token, 'student')) {
    return protectStudent(req, res, next);
  }

  return staffGate(req, res, next);
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
