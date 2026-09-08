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

const allowlist = () =>
  new Set(
    String(process.env.PHONEPE_TEST_PARENT_PHONES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

export const paymentsAllowedFor = (phone) => {
  const allowed = allowlist();
  if (allowed.size === 0) return true;
  return allowed.has(String(phone ?? '').trim());
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
