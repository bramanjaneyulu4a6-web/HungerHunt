/* How many connections the app keeps open to MongoDB, and how it behaves when
 * they are all busy.
 *
 * Mongoose has always pooled; what was missing was any opinion about the pool.
 * The driver's stock settings are tuned for a dedicated cluster with CPU to
 * spare, and this deployment is the opposite of that: one small Render
 * instance in front of a shared Atlas tier.
 *
 * On a shared tier a LARGE pool is the slower choice, which is the part that
 * reads backwards. Atlas throttles the cluster, so a hundred concurrent
 * queries do not run a hundred at a time — they queue inside Atlas, where the
 * wait is invisible, unfair, and eventually an error. Held to twenty, the same
 * burst queues in the driver instead: in memory, in order, and measurable.
 *
 * Kept out of server.js so the numbers can be exercised without opening a
 * connection, and read from an env so they can be retuned from the hosting
 * dashboard during an incident rather than through a deploy.
 */

/* Twenty is well inside what the shared tier will service, and far more
   concurrency than ~200 families browsing actually asks for. Raise it only
   with evidence of driver-side queueing; the cluster, not the pool, is the
   ceiling that matters. */
export const MAX_POOL_DEFAULT = 20;

/* The floor is what removes the first-request-after-idle stall. Connections
   above it are closed when traffic drops; these five stay handshaked, so a
   parent opening the app at a quiet moment does not wait on TLS to Atlas
   before any query runs. */
export const MIN_POOL_DEFAULT = 5;

/* How long a request waits for a free connection before giving up. The
   driver's default is 0 — wait forever — which turns a busy minute into
   requests that never resolve at all, so there is a bound here.
 *
 * Thirty seconds, and the size of it is measured rather than guessed. This
 * started at 8s and a 200-parent sign-in burst turned 48 of them into 500s:
 * "Timed out while checking out a connection from connection pool". The pool
 * was not the problem. The SAME burst without password hashing finished in
 * 118ms at 1700 req/sec on a pool of twenty — the database work is nothing.
 *
 * What fills the seconds is bcryptjs on the login path, which is pure
 * JavaScript and starves the event loop under a burst. Connection checkout is
 * timed in wall clock, so event-loop starvation is charged against this budget
 * even though no connection is actually scarce. A short value here does not
 * protect anybody: it converts logins that would have succeeded slowly into
 * logins that fail.
 *
 * So this is sized above the worst congestion measured (13s at 200 concurrent)
 * with room over it. It is a backstop against a genuinely wedged pool, not a
 * latency control — the latency fix is to stop doing bcrypt on the event loop,
 * which is a bigger change than a launch eve deserves. */
export const WAIT_QUEUE_TIMEOUT_MS = 30_000;

/* Atlas TLS handshakes are slow enough that a tighter bound here fails healthy
   boots. Unchanged from what server.js already used. */
export const SERVER_SELECTION_TIMEOUT_MS = 10_000;

/* Scripts and the reconcile cron run beside the live service against the same
   cluster. Five is enough for a sweep to make progress and small enough that
   it cannot crowd out the parents. */
export const SCRIPT_MAX_POOL = 5;

/* Anything that is not a whole number above zero is a typo, not an intention.
   Falling back beats honouring "twenty" as NaN and beats refusing to boot. */
const positiveInt = (raw, fallback) => {
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
};

export const mongoConnectOptions = (env = process.env) => {
  const maxPoolSize = positiveInt(env.MONGO_MAX_POOL, MAX_POOL_DEFAULT);

  /* The driver refuses to connect when the floor is above the ceiling. Someone
     shrinking the pool under pressure edits one variable, not two, so clamp:
     a smaller pool is what they asked for and a backend that will not start is
     not. */
  const minPoolSize = Math.min(positiveInt(env.MONGO_MIN_POOL, MIN_POOL_DEFAULT), maxPoolSize);

  return {
    serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
    maxPoolSize,
    minPoolSize,
    waitQueueTimeoutMS: positiveInt(env.MONGO_WAIT_QUEUE_MS, WAIT_QUEUE_TIMEOUT_MS),
  };
};

/* No floor: a script connects, does its work and exits, so warm sockets would
   only hold part of the cluster's connection budget for nothing. */
export const scriptConnectOptions = () => ({
  serverSelectionTimeoutMS: SERVER_SELECTION_TIMEOUT_MS,
  maxPoolSize: SCRIPT_MAX_POOL,
});
