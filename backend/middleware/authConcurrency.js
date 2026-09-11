/* A bounded queue in front of the sign-in routes.
 *
 * Signing in is CPU work, not database work. Measured on 2026-09-11: the
 * database half of a login burst runs at ~1700 requests a second on a pool of
 * twenty, while bcryptjs costs ~64ms of event loop per password check and
 * cannot be parallelised — it is pure JavaScript on a single thread, so two
 * hundred at once do not go faster, they merely interleave and all finish
 * together about thirteen seconds later.
 *
 * Nothing above this layer bounds that wait. Axios sets no timeout, Node's
 * requestTimeout bounds receiving a request rather than serving it, and the
 * only timer that can fire is the Mongo checkout budget, which answers with a
 * 500 that reads as "broken". So a parent waits on a spinner, concludes it is
 * stuck, and taps Login again — adding more hashing to the exact thing that is
 * already the bottleneck. That is how a slow launch becomes a stalled one.
 *
 * The fix is to stop pretending the queue is unbounded. A few requests hash at
 * a time, a few more wait their turn, and everything past that is told
 * immediately to come back in a moment. Serving them in near-order also makes
 * the served ones fast: interleaving two hundred hashes gives everybody the
 * worst case, where a queue gives most people the best one.
 *
 * What makes refusing safe is that it is nearly free — the refusal happens
 * before any hashing and before the database is touched, so a parent who
 * retries costs the server almost nothing. That is the property to preserve if
 * this is ever changed: the gate must stay in front of the work.
 */

export const BUSY_MESSAGE = 'Please try again in a few seconds.';

/* Seconds. Advisory for well-behaved clients, and what the parent app greys
   its button for, so a retry lands after the burst rather than inside it. */
export const RETRY_AFTER_SECONDS = 3;

export const createAuthGate = ({ maxConcurrent, maxQueued, name }) => {
  let running = 0;
  const waiting = [];

  const pump = () => {
    while (running < maxConcurrent && waiting.length > 0) {
      const next = waiting.shift();
      if (next.abandoned) continue; // gave up while queued; its slot is free
      admit(next.res, next.next);
    }
  };

  function admit(res, next) {
    running += 1;

    /* Released once, whether the response completed or the client hung up
       mid-request. Missing the 'close' case would leak a slot per abandoned
       request until the gate wedged shut — a self-inflicted outage that only
       appears under the load this exists to survive. */
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      running -= 1;
      pump();
    };

    res.on('finish', release);
    res.on('close', release);

    next();
  }

  const gate = (req, res, next) => {
    if (running < maxConcurrent) return admit(res, next);

    if (waiting.length < maxQueued) {
      const ticket = { res, next, abandoned: false };
      // A parent who closes the tab while queued must not be handed a slot.
      res.on('close', () => { ticket.abandoned = true; });
      waiting.push(ticket);
      return undefined;
    }

    res.set('Retry-After', String(RETRY_AFTER_SECONDS));
    return res.status(503).json({ message: BUSY_MESSAGE });
  };

  // Named and inspectable so a busy service can be understood from a log line
  // rather than guessed at.
  gate.stats = () => ({ name, running, queued: waiting.length, maxConcurrent, maxQueued });

  return gate;
};

const positiveInt = (raw, fallback) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

/* Parents. Four at a time because more does not hash FASTER — bcryptjs is one
   thread, so raising this only spreads the same event loop thinner and gives
   everybody the worst case instead of most people the best one.
 *
 * The queue length is the number that needs tuning per machine, and the
 * arithmetic is: a waiting parent's delay is roughly
 *
 *     maxQueued / (logins per second this hardware sustains)
 *
 * Measured 2026-09-11: ~15 logins/sec on an M2 Pro, so twelve deep is under a
 * second there. Render's free tier has a small fraction of that CPU, so the
 * same twelve is several seconds — which is why this is an env var and not a
 * constant. If parents report long waits, LOWER it (more are told to retry,
 * sooner); if they report too many retries and the waits are short, raise it.
 *
 * Neither direction creates capacity. Password hashing is the ceiling, and the
 * only real fix is moving off bcryptjs onto something that uses the threadpool. */
export const parentAuthGate = createAuthGate({
  maxConcurrent: positiveInt(process.env.PARENT_AUTH_CONCURRENCY, 4),
  maxQueued: positiveInt(process.env.PARENT_AUTH_QUEUE, 12),
  name: 'parent-auth',
});

/* Staff get their OWN gate, and that separation is the point rather than a
   detail. Wallet recharges are done by an admin, so the launch-day scenario is
   two hundred parents signing in at the same moment an admin needs to top a
   wallet up. Sharing one queue would put staff behind the flood and make the
   office unable to work exactly when it is most needed. Small numbers: there
   are at most a handful of admins. */
export const adminAuthGate = createAuthGate({ maxConcurrent: 2, maxQueued: 10, name: 'admin-auth' });
