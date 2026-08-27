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
 * answers with INVALID_MERCHANT_ORDER_ID before writing it off as FAILED.
 *
 * Seven days, because of what such a row can and cannot be. A PhonePe order,
 * once created, expires in 20 minutes (createPayment sets expireAfter: 1200)
 * and from then on the status API answers EXPIRED — a real, terminal answer
 * settle handles. So an intent still drawing that code is one whose
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

/* PhonePe's own name for "no such order". The Order Status API documents
 * exactly one error body for a merchantOrderId it has never seen:
 *
 *   { "code": "INVALID_MERCHANT_ORDER_ID",
 *     "message": "No entry found for given merchant order id" }
 *
 * (developer.phonepe.com, Standard Checkout v2 Order Status, Aug 2026.) */
export const ORDER_NOT_FOUND_CODES = new Set(['INVALID_MERCHANT_ORDER_ID']);

/* True only when PhonePe named this reason itself. The HTTP status is
 * deliberately not part of the test, though the adapter records it: PhonePe
 * documents 400 as the catch-all for a request it could not parse and 404 as
 * "check the endpoint or resource is correct", so a rotated credential, a
 * sandbox/production mixup or a wrong base URL can all produce a 4xx for an
 * order that exists and has the parent's money against it. Reading the
 * status as "never registered" would retire those rows to FAILED a week
 * later — the one direction this file must never be wrong in.
 *
 * The strict reading fails the safe way. An unknown-order answer that
 * arrives without this code is simply not recognised, so the intent keeps
 * being retried and keeps appearing in the sweep's failure lines (exit code
 * 2) until a human looks at it. That costs noise; the loose reading would
 * have cost a real payment. If a live response ever turns out to carry a
 * different code for the same meaning, add it to the set above — one line,
 * with the response pasted next to it.
 *
 * Network failures, 5xx and token trouble carry no providerCode at all and
 * stay retryable forever. */
export const isProviderOrderMissing = (err) =>
  ORDER_NOT_FOUND_CODES.has(err?.providerCode);

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
  ORDER_NOT_FOUND_CODES,
  isProviderOrderMissing,
  shouldAgeOut,
};
