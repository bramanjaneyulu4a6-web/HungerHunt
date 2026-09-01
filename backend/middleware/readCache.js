import { currentDataRevision } from './dataRevision.js';

/* A per-process cache for staff reads of catalogue-shaped data.
 *
 * The whole cache keys its validity on the data-revision counter: any
 * successful write anywhere bumps it, so nothing here can outlive the data it
 * was read from by more than one in-flight request. That is why there is no
 * TTL and no eviction policy — entries die the moment the world changes, and
 * the two things below are only there to make that literally true of the map's
 * memory as well as of its answers.
 *
 * Student requests bypass everything, both reading and writing the cache:
 * the student inventory payload embeds per-student purchase allowances, and a
 * cache that could show one student another's allowance — or a stale one
 * right after their own purchase — is worse than no cache. Money and package
 * state never pass through here at all; do not mount this middleware on
 * routes that carry them.
 *
 * revisionSource exists for tests, which need to move the revision without
 * performing a real write. Production callers never pass it. */

/* Entries are keyed by URL, so a signed-in client varying the query string can
   mint as many of them as it likes. Far more than the handful of catalogue
   URLs this actually guards, and small enough that dropping the lot costs one
   uncached read each. */
const MAX_ENTRIES = 64;

export const readCache = ({
  maxAgeSeconds = 30,
  staleWhileRevalidateSeconds = 60,
  revisionSource = currentDataRevision,
} = {}) => {
  const entries = new Map();
  let builtAt = null;
  const cacheControl =
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;

  return (req, res, next) => {
    if (req.method !== 'GET' || req.student) return next();

    const key = req.originalUrl;
    const revision = revisionSource();

    // Everything stored under an older revision is dead, and nothing will ever
    // come looking for most of it again — so drop it here rather than leave it
    // in the map to be skipped over one URL at a time.
    if (builtAt !== revision) {
      entries.clear();
      builtAt = revision;
    }

    const entry = entries.get(key);
    // The per-entry revision still decides. A read that began before a write
    // can store its body after the sweep above, under the revision it actually
    // read from, and that body must not be served.
    if (entry && entry.revision === revision) {
      res.set('Cache-Control', cacheControl);
      res.set('X-Read-Cache', 'hit');
      return res.type('application/json').send(entry.body);
    }

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (entries.size >= MAX_ENTRIES) entries.clear();
        entries.set(key, { revision, body: JSON.stringify(body) });
        res.set('Cache-Control', cacheControl);
      }
      return json(body);
    };

    return next();
  };
};
