/* One number the whole process agrees on: how many times the data has moved.
 *
 * A read cache needs to know when what it holds stopped being true, and on a
 * single-instance deployment the cheapest honest answer is a counter that
 * every successful write moves on. It is deliberately coarse — one number for
 * the whole database, no per-collection granularity — because a cache that
 * throws away too much is only slower, while one that keeps a row somebody
 * has since changed is wrong.
 *
 * The bump waits for the response to finish and reads its status, so a write
 * that was refused or blew up counts for nothing: it changed no data, and
 * invalidating on it would let any client that can provoke a 403 keep the
 * caches permanently cold. */
let revision = 0;

export const currentDataRevision = () => revision;

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const trackDataRevision = (req, res, next) => {
  if (READ_METHODS.has(req.method)) return next();

  res.on('finish', () => {
    if (res.statusCode < 400) revision += 1;
  });

  return next();
};
