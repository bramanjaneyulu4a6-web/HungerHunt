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
