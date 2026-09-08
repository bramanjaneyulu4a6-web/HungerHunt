// Extension included on the import in the test so this module runs under
// `node --test` as well as Vite.

/* Whether to offer a checkout, given the two facts that decide it.
 *
 * `buildFlag` is VITE_PAYMENTS_ENABLED — whether this bundle carries the
 * payment code at all. `serverAnswer` is GET /payments/availability for the
 * signed-in parent: the gateway switch and the test-account allowlist, both
 * decided on the server so that adding a reviewer's account is an
 * environment edit rather than four rebuilt frontends.
 *
 * Anything that is not exactly `true` reads as no — an unanswered request, a
 * failed one, a truthy string from some future shape of the endpoint. The
 * cost of guessing wrong in the permissive direction is a Pay button in
 * front of a parent who cannot use it, on an app whose whole point right now
 * is that they never see one.
 */
export const paymentsVisible = (buildFlag, serverAnswer) =>
  buildFlag === true && serverAnswer === true;

/* What the payment sheet should offer, as two answers that must not be
 * confused for one another.
 *
 * `canPay` is paymentsVisible's answer for the signed-in parent.
 *
 * `upiEnabled` is about this account: a parent the gateway is not open to is
 * offered the wallet and nothing else. `demo` is about this build, and only
 * this build.
 *
 * They were one expression once — `demo = demoEnabled || !canPay` — and that
 * cost two things. A real parent tapping Pay got the simulated checkout: a
 * confirmation and an invented reference for a payment that never happened,
 * with the order left sitting unapproved behind it. And because it read a
 * value that arrives from the network, the mode could change under a sheet
 * the parent already had open, which cancels the confirmation timer mid-run
 * and strands them on a spinner the sheet will not let them dismiss.
 *
 * Keeping `demo` tied to the build alone makes both impossible: it is a
 * constant, so it cannot flip, and it cannot be reached by not being allowed
 * to pay.
 */
export const upiOffer = ({ canPay, demoEnabled }) => ({
  upiEnabled: canPay === true || demoEnabled === true,
  demo: demoEnabled === true,
});
