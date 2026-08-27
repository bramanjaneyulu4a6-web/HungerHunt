import jwt from 'jsonwebtoken';

// Admin and parent tokens used to be indistinguishable: one secret, and a
// payload of nothing but { id }. Two things separate them now.
//
// A role claim, asserted on every route, so a token says what it is for.
//
// And a secret per identity, so the separation does not depend on that
// assertion being remembered in the next middleware somebody writes — a parent
// token presented on an admin route fails at the signature, before any claim is
// read. PARENT_JWT_SECRET is optional and falls back to JWT_SECRET, because a
// deploy that has not set it should keep working rather than lock every parent
// out; the role check still holds in that case.
const adminSecret = () => process.env.JWT_SECRET;
const parentSecret = () => process.env.PARENT_JWT_SECRET || adminSecret();

export const parentSecretIsShared = () => !process.env.PARENT_JWT_SECRET;

// The kiosk's student session. Third instance of the same pattern, with the
// same fallback and for the same reason: a deploy that has not set the key
// should keep working rather than turn every kiosk away, and the role claim
// still holds while it is shared.
const studentSecret = () => process.env.STUDENT_JWT_SECRET || adminSecret();

/* Whether student sessions are still being signed with the admin key.
 *
 * Reported at boot, because this one is easy to leave undone forever: unlike
 * the parent key there is no date to miss and nothing visibly breaks, so the
 * only thing that ever raises it is a warning nobody has silenced.
 *
 * And it matters more here than for parents, because of where student tokens
 * come from. /students/kiosk-session is open — an admission number and no
 * secret — so while the key is shared, a route anyone on the internet can
 * reach is minting tokens signed with the key that also signs staff. The role
 * claim is what keeps them apart today. A second key is what stops that being
 * the only thing keeping them apart. */
export const studentSecretIsShared = () => !process.env.STUDENT_JWT_SECRET;

// 7 minutes 30 seconds — the kiosk session's hard cap. The terminal counts it
// down on screen, but this is what enforces it: the session cannot be extended
// by reloading the page, because a reload does not mint a new token.
export const STUDENT_SESSION_SECONDS = 450;

// Staff sign in on terminals with very different reach. The back office edits
// the catalogue, tops up wallets and creates accounts; the storeroom receives
// deliveries and raises purchase orders, and touches no student and no money.
// Both are staff and both are signed with the admin key — the secret split is
// between staff and parents, not within staff — so what separates them is the
// role claim, checked against the account row on every request.
//
// There was a third, 'cashier', for the till. The till is not a place anybody
// stands any more: students serve themselves at the kiosk holding a session of
// their own, and the admin console raises orders for parents to approve. An
// account for a counter with nobody behind it protects nothing, and the most
// physically exposed device in the system no longer holds a staff token at all.
export const STAFF_ROLES = ['admin', 'warehouse', 'caretaker'];

const isStaffRole = (role) => STAFF_ROLES.includes(role);

export const signStaffToken = (id, role = 'admin') => {
  if (!isStaffRole(role)) {
    throw new Error(`Unknown staff role: ${role}`);
  }

  return jwt.sign({ id, role }, adminSecret(), { expiresIn: '1d' });
};

export const signAdminToken = (id) => signStaffToken(id, 'admin');

// The student standing at the kiosk. admissionNumber rides along so the
// terminal can name whose session it is without a second lookup; it is the
// id that authorizes anything.
export const signStudentToken = (id, admissionNumber) =>
  jwt.sign({ id, admissionNumber, role: 'student' }, studentSecret(), {
    expiresIn: STUDENT_SESSION_SECONDS,
  });

// v carries the account's tokenVersion, which is what makes a parent session
// revocable before its seven days are up. See atTokenVersion in the auth
// middleware for what it is compared against and why 0 is the quiet default.
export const signParentToken = (id, phone, tokenVersion = 0) =>
  jwt.sign({ id, phone, role: 'parent', v: tokenVersion }, parentSecret(), { expiresIn: '7d' });

// Returns the payload when the token is a valid token *for this role*, and null
// otherwise. Callers treat null as "not authorized" and never see why.
//
// `role` is one of the concrete roles, or 'staff' for "either kind of staff" —
// the till's routes do not care which of the two is standing at it, only that
// the token is not a parent's.
export const verifyToken = (token, role) => {
  const wantsStaff = role === 'staff' || isStaffRole(role);
  const secret = wantsStaff
    ? adminSecret()
    : role === 'student'
      ? studentSecret()
      : parentSecret();

  const accepts = (claimed) =>
    role === 'staff' ? isStaffRole(claimed) : claimed === role;

  try {
    const payload = jwt.verify(token, secret);
    return accepts(payload.role) ? payload : null;
  } catch {
    return null;
  }
};
