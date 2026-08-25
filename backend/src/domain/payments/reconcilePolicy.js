/* Decisions the reconcile sweep makes, kept pure and testable here the same
 * way utils/scriptTarget.js keeps the database-target decision out of
 * scripts/lib/connect.mjs. The script stays a thin loop; what counts as
 * "give up on this row" and "this row needs a human" lives where a test can
 * reach it. */

/* Every state settlePaymentIntent knows how to handle. Anything else written
 * to providerState came from the unknown-state path in settle, which leaves
 * the intent open (never terminal — see the comment there) and relies on the
 * sweep to surface it to an operator alongside AMOUNT_MISMATCH. */
export const KNOWN_PROVIDER_STATES = ['PENDING', 'COMPLETED', 'FAILED', 'EXPIRED'];

/* The sweep's query for open intents stuck on a provider state settle does
 * not recognise: still CREATED/PENDING (settle keeps consulting PhonePe about
 * them every run) but flagged with a state outside the known vocabulary. */
export const unknownProviderStateFilter = () => ({
  status: { $in: ['CREATED', 'PENDING'] },
  providerState: { $nin: [...KNOWN_PROVIDER_STATES, null] },
});

/* How long the sweep keeps retrying an intent whose status read PhonePe
 * answers with "no such order" before writing it off as FAILED.
 *
 * Seven days, because of what such a row can and cannot be. A PhonePe order,
 * once created, expires in 20 minutes (createPayment sets expireAfter: 1200)
 * and from then on the status API answers EXPIRED — a real, terminal answer
 * settle handles. So an intent still drawing "no such order" is one whose
 * create call never registered with PhonePe at all (a crash between our DB
 * write and the API call, or a create the provider rejected): no order, no
 * checkout page, no way the parent's money was ever captured against it.
 * Nothing is at stake but noise. Seven days still gives that conclusion a
 * full week of nightly sweeps to be wrong in — a provider-side lag, a
 * sandbox/production mixup an operator is mid-way through untangling — and
 * lines up with how long a human plausibly needs to notice a recurring
 * report line before the row is filed away with its reason attached. */
export const AGE_OUT_DAYS = 7;

const AGE_OUT_MS = AGE_OUT_DAYS * 24 * 60 * 60 * 1000;

/* True when PhonePe's own API answered "this order does not exist" — a 4xx
 * from the status endpoint, carried on the error by the provider adapter.
 * Network failures, 5xx and token trouble carry no statusCode and stay
 * retryable forever. */
export const isProviderOrderMissing = (err) =>
  err?.statusCode === 400 || err?.statusCode === 404;

/* Give up on a row only when BOTH are true: the provider says the order does
 * not exist, and the intent is old enough that "does not exist yet" is no
 * longer a possible reading. Age is measured from createdAt — the moment the
 * order should have been registered — not updatedAt, which every sweep run
 * touches. */
export const shouldAgeOut = (intent, err, now = new Date()) => {
  if (!isProviderOrderMissing(err)) return false;
  if (!intent?.createdAt) return false;
  return now.getTime() - new Date(intent.createdAt).getTime() >= AGE_OUT_MS;
};

export default {
  KNOWN_PROVIDER_STATES,
  unknownProviderStateFilter,
  AGE_OUT_DAYS,
  isProviderOrderMissing,
  shouldAgeOut,
};
