let revision = Date.now();

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/* Writes that succeed but change only the requester's own session or device:
 * signing in, resetting a password, a kiosk opening a student's till, a phone
 * (re)sending its push token. No other screen reads any of it, so counting
 * them only reloaded every open tab in the fleet for nothing — and because the
 * parent app re-sends its push token on every boot, two parent devices could
 * reload each other in a loop. Nothing the read cache serves lives behind
 * these paths, so leaving them out is safe for it.
 *
 * Prefix-matched, because the reset routes carry their token in the path. A
 * route that changes a wallet, an order, or stock never belongs here. */
const SESSION_ONLY_PATHS = [
  '/api/admin/login',
  '/api/admin/register',
  '/api/admin/forgot-password',
  '/api/admin/reset-password/',
  '/api/parent/login',
  '/api/parent/login-step',
  '/api/parent/forgot-password',
  '/api/parent/reset-password/',
  '/api/parent/save-fcm-token',
  '/api/parent/remove-fcm-token',
  '/api/students/kiosk-session',
];

const isSessionOnly = (path) =>
  SESSION_ONLY_PATHS.some((prefix) =>
    prefix.endsWith('/') ? path.startsWith(prefix) : path === prefix
  );

export const currentDataRevision = () => revision;

/* A deliberately data-free change signal. Successful writes advance one
 * process-wide number; clients use it to decide when their current read model
 * is stale. It carries no record names, ids, or user information.
 *
 * It has a second reader now: middleware/readCache.js keys every entry it
 * holds on this number, so anything that stops the counter moving on a real
 * write also serves stale catalogue data. Widening MUTATING_METHODS is safe —
 * an extra bump only costs an uncached read — but narrowing it, or bumping
 * before the write has actually succeeded, is not. */
export const dataRevision = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method) || isSessionOnly(req.path)) return next();

  const end = res.end.bind(res);
  let recorded = false;
  res.end = (...args) => {
    if (!recorded && res.statusCode >= 200 && res.statusCode < 400) {
      recorded = true;
      revision += 1;
      res.set('X-Data-Revision', String(revision));
    }
    return end(...args);
  };

  return next();
};
