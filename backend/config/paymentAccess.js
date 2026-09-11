/* Which parents may reach the PhonePe checkout.
 *
 * PHONEPE_PAYMENTS_ENABLED decides whether the gateway is wired up at all.
 * This decides who may use it, and exists for one situation: PhonePe has to
 * review a live app, which means payments genuinely enabled in production
 * while the real families on the roll see no checkout at all.
 *
 * Unset means open to all, so a public launch later is deleting a variable
 * rather than changing code. Read from process.env on every call, like
 * phonepeEnabled() in the payment controller, so a test can set the list
 * without fighting module-load caching.
 */

/* Exported because paymentConfig asks the same question for a different
   reason: whether anyone at all is restricted decides, at boot, if a sandbox
   gateway may run on a production service. Takes an env so that check stays
   testable without touching process.env. A list of nothing but commas and
   spaces names nobody, and filter(Boolean) is what makes it an empty set
   rather than a restriction that blocks everyone. */
export const allowlistedPhones = (env = process.env) =>
  new Set(
    String(env.PHONEPE_TEST_PARENT_PHONES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

const allowlist = () => allowlistedPhones();

export const paymentsAllowedFor = (phone) => {
  const allowed = allowlist();
  if (allowed.size === 0) return true;
  return allowed.has(String(phone ?? '').trim());
};

/* Whether this phone belongs to a PhonePe test account — the reviewer's
   family, not a real one. Deliberately the opposite default from
   paymentsAllowedFor: an empty list opens payments to everyone, but it makes
   NOBODY a test account. Everything hung off this answer (limits lifted at the
   kiosk, a parent walking their own package through the warehouse) must be
   unreachable by a real family, and "no list, no test account" is what keeps
   it that way once the variable is deleted at launch. */
export const isTestAccountPhone = (phone) => {
  const allowed = allowlist();
  return allowed.size > 0 && allowed.has(String(phone ?? '').trim());
};

/* Printed once at boot. Without it a mistyped variable name is invisible:
   payments stay open to every parent, which is the dangerous direction for
   this switch to fail in. */
export const paymentAccessSummary = () => {
  const count = allowlist().size;
  return count === 0
    ? 'PhonePe payments: open to all parents.'
    : `PhonePe payments: restricted to ${count} test account(s).`;
};
