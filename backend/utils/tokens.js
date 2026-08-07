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

export const signAdminToken = (id) =>
  jwt.sign({ id, role: 'admin' }, adminSecret(), { expiresIn: '1d' });

export const signParentToken = (id, phone) =>
  jwt.sign({ id, phone, role: 'parent' }, parentSecret(), { expiresIn: '7d' });

// Tokens issued before this change carry no role and were signed with
// JWT_SECRET. Rejecting them outright would sign out every parent and admin the
// moment this deploys, including the till mid-sale, so they stay acceptable
// until the date below — one parent-token lifetime, by which point every one of
// them has expired on its own.
//
// This is a scheduled cutover, not a flag: it ends by itself, and nothing has
// to be remembered. Set LEGACY_TOKEN_GRACE_UNTIL to move it if the deploy slips.
// Once the date has passed, this whole branch and legacyAccepted can be deleted.
const DEFAULT_GRACE_UNTIL = '2026-08-14T00:00:00Z';

export const legacyGraceUntil = () =>
  new Date(process.env.LEGACY_TOKEN_GRACE_UNTIL || DEFAULT_GRACE_UNTIL);

export const legacyTokensAccepted = () => Date.now() < legacyGraceUntil().getTime();

const legacyAccepted = legacyTokensAccepted;

// Returns the payload when the token is a valid token *for this role*, and null
// otherwise. Callers treat null as "not authorized" and never see why.
export const verifyToken = (token, role) => {
  const secrets = [role === 'admin' ? adminSecret() : parentSecret()];

  // A legacy parent token was signed with JWT_SECRET, which is a different key
  // from the parent one once PARENT_JWT_SECRET is set. Nothing equivalent is
  // needed for admins: their secret has not changed.
  if (role === 'parent' && legacyAccepted() && parentSecret() !== adminSecret()) {
    secrets.push(adminSecret());
  }

  for (const secret of secrets) {
    let payload;

    try {
      payload = jwt.verify(token, secret);
    } catch {
      continue;
    }

    if (payload.role === role) return payload;

    // Signed correctly but claiming to be something else, or issued before the
    // claim existed. Either way the answer is settled — do not try the next key.
    return payload.role === undefined && legacyAccepted() ? payload : null;
  }

  return null;
};
