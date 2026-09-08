/* The check that decides whether the service starts.
 *
 * It is the highest-consequence conditional in the codebase: get it wrong in
 * one direction and a production deploy publishes a checkout that cannot
 * finish; get it wrong in the other and the entire backend refuses to boot
 * over a credential the deployment does not use. It lived inline in app.js,
 * where the only way to exercise it was to boot a server.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { paymentConfigurationProblems } = await import('../config/paymentConfig.js');

const COMPLETE = Object.freeze({
  NODE_ENV: 'production',
  PHONEPE_ENV: 'production',
  PHONEPE_MERCHANT_ID: 'M22',
  PHONEPE_CLIENT_ID: 'M22_1',
  PHONEPE_CLIENT_SECRET: 'secret',
  PHONEPE_WEBHOOK_USERNAME: 'hook',
  PHONEPE_WEBHOOK_PASSWORD: 'pass',
  PHONEPE_REDIRECT_BASE_URL: 'https://parent.example',
});

describe('paymentConfigurationProblems', () => {
  /* The web QR checkout and the Android intent flow never read it: it belongs
     to the iOS SDK contract alone, and PhonePe only issues it once an Apple
     Team ID has been registered. Demanding it to boot would hold a web launch
     hostage to a credential for a platform that is not shipping. */
  test('does not demand an iOS application id', () => {
    assert.deepEqual(paymentConfigurationProblems(COMPLETE), []);
    assert.deepEqual(
      paymentConfigurationProblems({ ...COMPLETE, PHONEPE_IOS_APP_ID: '' }),
      []
    );
  });

  test('names every credential a payment genuinely cannot be made without', () => {
    const [problem] = paymentConfigurationProblems({
      ...COMPLETE,
      PHONEPE_CLIENT_SECRET: '',
      PHONEPE_WEBHOOK_PASSWORD: '   ',
    });

    assert.match(problem, /missing/);
    assert.match(problem, /PHONEPE_CLIENT_SECRET/);
    assert.match(problem, /PHONEPE_WEBHOOK_PASSWORD/);
  });

  test('refuses the sandbox gateway on a production service', () => {
    const problems = paymentConfigurationProblems({ ...COMPLETE, PHONEPE_ENV: 'sandbox' });

    assert.ok(problems.some((p) => /must be production/.test(p)), problems.join('; '));
  });

  test('allows the sandbox gateway anywhere else', () => {
    assert.deepEqual(
      paymentConfigurationProblems({ ...COMPLETE, NODE_ENV: 'development', PHONEPE_ENV: 'sandbox' }),
      []
    );
  });

  test('rejects an environment name that is neither', () => {
    const problems = paymentConfigurationProblems({ ...COMPLETE, PHONEPE_ENV: 'uat' });

    assert.ok(problems.some((p) => /sandbox or production/.test(p)), problems.join('; '));
  });

  /* An unset return URL registers the literal string "undefined/payment-return"
     with PhonePe as where to send the parent afterwards. */
  test('insists the return URL is a real HTTPS origin in production', () => {
    for (const PHONEPE_REDIRECT_BASE_URL of ['http://parent.example', 'not-a-url']) {
      const problems = paymentConfigurationProblems({ ...COMPLETE, PHONEPE_REDIRECT_BASE_URL });
      assert.ok(problems.some((p) => /HTTPS/.test(p)), `accepted ${PHONEPE_REDIRECT_BASE_URL}`);
    }
  });
});
