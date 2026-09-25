/* Which push token this device has already handed to the backend, and under
 * which sign-in.
 *
 * This used to be a module-level variable, which is wiped by exactly the thing
 * it guarded against: a page reload gives the app a fresh module with no
 * memory, so every boot re-POSTed the same token. Each POST was a write, and
 * every other open screen in the fleet reloaded on it — so two parent devices
 * with notifications on kept reloading each other.
 *
 * The record is keyed to the session so that a different parent signing in on
 * the same phone still attaches the device to their account: same token, new
 * JWT, sent again once. Withdrawal is not keyed, because an expired session is
 * cleared before logout gets a chance to ask what to withdraw. */

const KEY = 'pushTokenSent';

const currentSession = () => {
  try {
    return localStorage.getItem('parentToken') || null;
  } catch {
    return null;
  }
};

const read = () => {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed?.token === 'string' ? parsed : null;
  } catch {
    return null;
  }
};

export const alreadySent = (token) => {
  const sent = read();
  const session = currentSession();
  return Boolean(sent && session && sent.token === token && sent.session === session);
};

// The settings card does not know the device token, but it still needs to
// distinguish OS/browser permission from a token this signed-in parent has
// actually registered with the backend.
export const hasSentToken = () => {
  const sent = read();
  const session = currentSession();
  return Boolean(sent && session && sent.session === session);
};

export const markSent = (token) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ token, session: currentSession() }));
  } catch {
    // Without storage the next boot re-sends once, which is the old behaviour
    // on this one device rather than a broken one.
  }
};

export const takeSent = () => {
  const sent = read();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Nothing to clear if nothing could be stored.
  }
  return sent?.token ?? null;
};
