/* Which parents are showroom accounts — the family a visitor is handed at an
 * open day so they can drive the parent app themselves.
 *
 * Declared by DEMO_PARENT_PHONES and nothing else, deliberately mirroring
 * PHONEPE_TEST_PARENT_PHONES in config/paymentAccess.js rather than putting a
 * flag on the Parent row. A demo parent's orders are deleted the moment they
 * are collected and their child's wallet is put back — so a real family marked
 * as one would watch their purchases and their balance quietly undo
 * themselves. A variable cannot be set by anything that writes parents, and
 * deleting it turns every demo account off at once.
 *
 * Read from process.env on every call, like allowlistedPhones(), so a test can
 * set the list without fighting module-load caching.
 *
 * "No list, no demo account" is the whole safety property. An empty or absent
 * variable must never mean "everyone", because everything hung off this answer
 * — a parent walking their own package through the warehouse, orders deleting
 * themselves, a wallet resetting — has to be unreachable by a real family.
 */
export const demoParentPhones = (env = process.env) =>
  new Set(
    String(env.DEMO_PARENT_PHONES ?? '')
      .split(',')
      .map((entry) => entry.trim())
      .filter(Boolean)
  );

export const isDemoParentPhone = (phone) => {
  const declared = demoParentPhones();
  return declared.size > 0 && declared.has(String(phone ?? '').trim());
};

/* Printed once at boot beside paymentAccessSummary(). A demo account that is
   silently on in production is the dangerous direction here, so the count is
   said out loud rather than inferred from behaviour. */
export const demoAccessSummary = () => {
  const count = demoParentPhones().size;
  return count === 0
    ? 'Demo parent accounts: none.'
    : `Demo parent accounts: ${count} declared — their orders reset on collection.`;
};
