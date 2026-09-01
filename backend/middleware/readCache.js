import { currentDataRevision } from './dataRevision.js';

/* A per-process cache for staff reads of catalogue-shaped data.
 *
 * An entry is served only while two things hold: the data-revision counter has
 * not moved since it was stored, and it is younger than maxAgeSeconds. The
 * counter is the sharp answer — any successful write through this process
 * bumps it, so a change made over the API is invisible for no longer than the
 * requests already in flight. The age ceiling is the floor under that: the
 * maintenance scripts in backend/scripts write Product and Inventory straight
 * to Mongo without ever completing an HTTP response here, and they are run
 * against production. Without a ceiling their changes would stay hidden until
 * somebody happened to write through the API — unbounded staleness, where the
 * Cache-Control header this already sends promises thirty seconds.
 *
 * The ceiling is also what makes it safe that the counter bumps from inside
 * res.end: a write that reached Mongo but whose response never ended is not
 * counted, and this is the only thing that bounds it. Do not remove the
 * ceiling without giving dataRevision a close-event backstop first.
 *
 * Neither of those bounds the map's *memory*, so two more lines below do:
 * a superseded revision empties it, and so does reaching MAX_ENTRIES. There is
 * still no LRU and no sweeper — nothing here is worth the bookkeeping, and
 * throwing the lot away costs one uncached read per URL.
 *
 * Student requests bypass everything, both reading and writing the cache:
 * the student inventory payload embeds per-student purchase allowances, and a
 * cache that could show one student another's allowance — or a stale one
 * right after their own purchase — is worse than no cache. Money and package
 * state never pass through here at all; do not mount this middleware on
 * routes that carry them.
 *
 * revisionSource and clock exist for tests, which need to move the revision
 * without performing a real write and to cross the age ceiling without
 * sleeping through it. Production callers never pass either. */

/* Entries are keyed by URL, so a signed-in client varying the query string can
   mint as many of them as it likes. Far more than the handful of catalogue
   URLs this actually guards, and small enough that dropping the lot costs one
   uncached read each. */
const MAX_ENTRIES = 64;

export const readCache = ({
  maxAgeSeconds = 30,
  staleWhileRevalidateSeconds = 60,
  revisionSource = currentDataRevision,
  clock = Date.now,
} = {}) => {
  const entries = new Map();
  let builtAt = null;
  const maxAgeMs = maxAgeSeconds * 1000;
  const cacheControl =
    `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${staleWhileRevalidateSeconds}`;

  return (req, res, next) => {
    if (req.method !== 'GET' || req.student) return next();

    const key = req.originalUrl;
    const revision = revisionSource();
    const now = clock();

    // Everything stored under an older revision is dead, and nothing will ever
    // come looking for most of it again — so drop it here rather than leave it
    // in the map to be skipped over one URL at a time.
    if (builtAt !== revision) {
      entries.clear();
      builtAt = revision;
    }

    const entry = entries.get(key);
    // The per-entry revision still decides, alongside the age. A read that
    // began before a write can store its body after the sweep above, under the
    // revision it actually read from, and that body must not be served.
    if (entry && entry.revision === revision && now - entry.storedAt < maxAgeMs) {
      res.set('Cache-Control', cacheControl);
      res.set('X-Read-Cache', 'hit');
      return res.type('application/json').send(entry.body);
    }

    const json = res.json.bind(res);
    res.json = (body) => {
      if (res.statusCode === 200) {
        if (entries.size >= MAX_ENTRIES) entries.clear();
        entries.set(key, { revision, storedAt: now, body: JSON.stringify(body) });
        res.set('Cache-Control', cacheControl);
      }
      return json(body);
    };

    return next();
  };
};
