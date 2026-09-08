/* Who is allowed to reach the PhonePe checkout.
 *
 * PHONEPE_PAYMENTS_ENABLED says whether the gateway is wired up at all;
 * this says which parents may use it. The two are separate because the
 * period that matters — PhonePe reviewing a live app — needs payments
 * genuinely enabled in production while 222 real families see nothing.
 */
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { paymentsAllowedFor, paymentAccessSummary } = await import('../config/paymentAccess.js');

afterEach(() => {
  delete process.env.PHONEPE_TEST_PARENT_PHONES;
});

describe('paymentsAllowedFor', () => {
  test('allows every parent when no allowlist is set', () => {
    assert.equal(paymentsAllowedFor('9000000021'), true);
    assert.equal(paymentsAllowedFor('9876543210'), true);
  });

  test('restricts to the listed accounts once an allowlist is set', () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = '9000000021,9000000022';

    assert.equal(paymentsAllowedFor('9000000021'), true);
    assert.equal(paymentsAllowedFor('9000000022'), true);
    // The 222 real families this exists to protect.
    assert.equal(paymentsAllowedFor('9959544147'), false);
  });

  // The value is typed into the Render dashboard by hand, where a stray space
  // after a comma is the likeliest slip.
  test('ignores spacing and empty entries around the numbers', () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = ' 9000000021 , ,9000000022,, ';

    assert.equal(paymentsAllowedFor('9000000021'), true);
    assert.equal(paymentsAllowedFor('9000000022'), true);
    assert.equal(paymentsAllowedFor(''), false);
  });

  test('denies a parent with no phone once an allowlist is set', () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = '9000000021';

    assert.equal(paymentsAllowedFor(null), false);
    assert.equal(paymentsAllowedFor(undefined), false);
  });
});

/* What the deploy log says. A mistyped variable name is otherwise invisible:
   payments would simply stay open to everyone, which is the dangerous
   direction to fail in. */
describe('paymentAccessSummary', () => {
  test('says payments are open when no allowlist is set', () => {
    assert.equal(paymentAccessSummary(), 'PhonePe payments: open to all parents.');
  });

  test('counts the accounts when an allowlist is set', () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = '9000000021,9000000022';

    assert.equal(
      paymentAccessSummary(),
      'PhonePe payments: restricted to 2 test account(s).'
    );
  });
});
