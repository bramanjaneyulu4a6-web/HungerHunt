let revision = Date.now();

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export const currentDataRevision = () => revision;

/* A deliberately data-free change signal. Successful writes advance one
 * process-wide number; clients use it to decide when their current read model
 * is stale. It carries no record names, ids, or user information. */
export const dataRevision = (req, res, next) => {
  if (!MUTATING_METHODS.has(req.method)) return next();

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
