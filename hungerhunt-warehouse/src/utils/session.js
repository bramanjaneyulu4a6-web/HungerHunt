/* Reading a stored session without trusting it.
 *
 * A JWT carries its own expiry, so a client can tell a dead session from a live
 * one before spending a request to find out. That matters most at start-up,
 * where the app is restored from storage: without this, an expired token still
 * looks like a session to a route guard, the guard admits it, and every screen
 * behind it renders while its requests 401 — a broken app rather than a
 * signed-out one. It matters twice over on a device with no signal, where the
 * request that would have revealed the truth never completes at all.
 *
 * The signature is not checked and cannot be: only the server holds the key.
 * This is a courtesy check that catches the ordinary case — a token left to sit
 * past its own expiry — early and locally. Everything else is still the
 * server's call, which is why the 401 handling in utils/api.js exists alongside
 * this rather than instead of it.
 *
 * Duplicated byte-for-byte into the apps that hold a staff session; the copies
 * are checked by scripts/check-shared-files.mjs. The storage key is a parameter
 * precisely so they can stay identical.
 */

/* exp is seconds since the epoch, Date.now() is milliseconds, and getting that
   wrong in the safe direction would expire every session instantly. */
const expiryMs = (token) => {
  const claims = token?.split('.')[1];
  if (!claims) return null;

  try {
    // JWT uses base64url. atob wants the two substituted characters put back,
    // and the '=' padding the encoder dropped.
    const json = atob(claims.replace(/-/g, '+').replace(/_/g, '/'));
    const { exp } = JSON.parse(json);

    return typeof exp === 'number' ? exp * 1000 : null;
  } catch {
    return null;
  }
};

/* Anything this cannot read is reported as live, not as expired. A token whose
   shape this does not recognise is not evidence of anything, and guessing
   against it would make this a second gate, less informed than the server's,
   that could sign someone out on its own authority. */
export const isLiveToken = (token) => {
  if (!token) return false;

  const ms = expiryMs(token);
  return ms === null || ms > Date.now();
};

export const clearSession = (keys) => keys.forEach((key) => localStorage.removeItem(key));

/* The one place that decides whether a stored session may be offered to a route
   guard. Returns the token if it is still live; otherwise clears it, along with
   whatever was stored beside it, and says whether there had been one — so the
   login screen can explain itself rather than appearing for no stated reason. */
export const readSession = (key, companions = []) => {
  const token = localStorage.getItem(key);

  if (!token) return { token: null, expired: false };
  if (isLiveToken(token)) return { token, expired: false };

  clearSession([key, ...companions]);
  return { token: null, expired: true };
};
