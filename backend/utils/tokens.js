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

// 7 minutes 30 seconds — the kiosk session's hard cap. The terminal counts it
// down on screen, but this is what enforces it: the session cannot be extended
// by reloading the page, because a reload does not mint a new token.
export const STUDENT_SESSION_SECONDS = 450;

// Staff sign in on two terminals with very different reach. The back office
// edits the catalogue, tops up wallets and creates accounts; the till only
// needs to find a student and take their money. Both are staff and both are
// signed with the admin key — the secret split is between staff and parents,
// not within staff — so what separates them is the role claim, checked against
// the account row on every request.
//
// The till is the most physically exposed device in the system: it sits on a
// counter, unattended between customers, with a token in its browser storage.
// A cashier account is what that token is worth.
export const STAFF_ROLES = ['admin', 'cashier', 'warehouse'];

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

// Tokens issued before this change carry no role and were signed with
// JWT_SECRET. Rejecting them outright would sign out every parent and admin the
// moment this deploys, including the till mid-sale, so they stay acceptable
// until the date below, by which point every one of them has expired on its own.
//
// The date has to be one parent-token lifetime past the *deploy*, not past the
// change: until this reaches production, production is still handing out
// roleless tokens, and the clock has not started. It was originally 2026-08-14,
// seven days after the change was written. That assumed a same-day deploy, which
// did not happen — so it is the 20th, and it should move again if the deploy
// does. LEGACY_TOKEN_GRACE_UNTIL is how, without a release.
//
// This is a scheduled cutover, not a flag: it ends by itself, and nothing has
// to be remembered. Once the date has passed, this whole branch and
// legacyAccepted can be deleted.
const DEFAULT_GRACE_UNTIL = '2026-08-20T00:00:00Z';

export const legacyGraceUntil = () =>
  new Date(process.env.LEGACY_TOKEN_GRACE_UNTIL || DEFAULT_GRACE_UNTIL);

export const legacyTokensAccepted = () => Date.now() < legacyGraceUntil().getTime();

const legacyAccepted = legacyTokensAccepted;

// The second key and the legacy window are ordered, and the order is easy to
// get wrong because neither setting mentions the other.
//
// Setting PARENT_JWT_SECRET invalidates every parent token signed with
// JWT_SECRET — which, while it is unset, is all of them. The legacy window is
// the only thing that carries those across: inside it verifyToken also tries
// the admin key for parent tokens, so the changeover costs nobody their
// session. Outside it, the same change signs out every parent at once.
//
// That makes the grace date a deadline for setting the key, not only a date for
// deleting dead code. So "PARENT_JWT_SECRET is not set" means two different
// things either side of it, and the startup warning has to say which — a note
// in a document is read when somebody goes looking, which is not the moment
// this matters.
export const parentSecretChangeover = () => ({
  pending: parentSecretIsShared(),
  free: legacyTokensAccepted(),
  deadline: legacyGraceUntil(),
});

// Returns the payload when the token is a valid token *for this role*, and null
// otherwise. Callers treat null as "not authorized" and never see why.
//
// `role` is one of the concrete roles, or 'staff' for "either kind of staff" —
// the till's routes do not care which of the two is standing at it, only that
// the token is not a parent's.
export const verifyToken = (token, role) => {
  const wantsStaff = role === 'staff' || isStaffRole(role);
  const secrets = [
    wantsStaff
      ? adminSecret()
      : role === 'student'
        ? studentSecret()
        : parentSecret(),
  ];

  // A legacy parent token was signed with JWT_SECRET, which is a different key
  // from the parent one once PARENT_JWT_SECRET is set. Nothing equivalent is
  // needed for staff: their secret has not changed.
  if (role === 'parent' && legacyAccepted() && parentSecret() !== adminSecret()) {
    secrets.push(adminSecret());
  }

  const accepts = (claimed) =>
    role === 'staff' ? isStaffRole(claimed) : claimed === role;

  for (const secret of secrets) {
    let payload;

    try {
      payload = jwt.verify(token, secret);
    } catch {
      continue;
    }

    if (accepts(payload.role)) return payload;

    // Signed correctly but claiming to be something else, or issued before the
    // claim existed. Either way the answer is settled — do not try the next key.
    //
    // A roleless staff token is a full admin's: cashiers did not exist when any
    // of them was issued, so there is no reading of one that grants less.
    //
    // The student role is excluded outright rather than left to the date. No
    // student token predates the claim, so a roleless one is never a student's
    // — and while STUDENT_JWT_SECRET is unset the student key *is* the admin
    // key, which is what those legacy tokens were signed with. Without this,
    // every legacy admin token would open a kiosk session as whatever student
    // its id happened to name.
    return payload.role === undefined && role !== 'student' && legacyAccepted()
      ? payload
      : null;
  }

  return null;
};
