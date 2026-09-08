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

const { paymentConfigurationProblems, sandboxOnProductionService } = await import(
  '../config/paymentConfig.js'
);

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

  /* The original rule was absolute: sandbox on a production service, never.
     What it was actually protecting against is narrower — a checkout that
     moves no money appearing in front of families who believe it does — and
     that danger needs an audience. PHONEPE_TEST_PARENT_PHONES removes the
     audience, so sandbox is permitted exactly while it is set, and forbidden
     the moment payments are open to the roll. */
  test('refuses the sandbox gateway on a production service open to every parent', () => {
    const problems = paymentConfigurationProblems({ ...COMPLETE, PHONEPE_ENV: 'sandbox' });

    assert.ok(
      problems.some((p) => /PHONEPE_TEST_PARENT_PHONES/.test(p)),
      problems.join('; ')
    );
  });

  test('allows the sandbox gateway on a production service restricted to test accounts', () => {
    assert.deepEqual(
      paymentConfigurationProblems({
        ...COMPLETE,
        PHONEPE_ENV: 'sandbox',
        PHONEPE_TEST_PARENT_PHONES: '9000000021',
      }),
      []
    );
  });

  /* Deleting the phones is how payments are opened to the school. If that
     leaves a sandbox gateway behind, the service must refuse to start rather
     than sell 222 families food with test money. A list that is only commas
     and spaces names nobody and must not count as a restriction. */
  test('treats an empty or blank allowlist as no restriction at all', () => {
    for (const PHONEPE_TEST_PARENT_PHONES of ['', '   ', ' , ,  ']) {
      const problems = paymentConfigurationProblems({
        ...COMPLETE,
        PHONEPE_ENV: 'sandbox',
        PHONEPE_TEST_PARENT_PHONES,
      });

      assert.ok(
        problems.some((p) => /PHONEPE_TEST_PARENT_PHONES/.test(p)),
        `accepted ${JSON.stringify(PHONEPE_TEST_PARENT_PHONES)}`
      );
    }
  });

  /* The allowlist buys sandbox its exemption and nothing else: a name that is
     neither gateway is still a name PhonePe has no host for. */
  test('does not let the allowlist excuse an unknown environment name', () => {
    const problems = paymentConfigurationProblems({
      ...COMPLETE,
      PHONEPE_ENV: 'uat',
      PHONEPE_TEST_PARENT_PHONES: '9000000021',
    });

    assert.ok(problems.some((p) => /sandbox or production/.test(p)), problems.join('; '));
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

/* What app.js prints the sandbox banner on. A boot that quietly looks like
   every other boot is how a service is left on test money for a week. */
describe('sandboxOnProductionService', () => {
  test('is true only for a sandbox gateway on a production service', () => {
    assert.equal(sandboxOnProductionService(COMPLETE), false);
    assert.equal(sandboxOnProductionService({ ...COMPLETE, PHONEPE_ENV: 'sandbox' }), true);
    assert.equal(
      sandboxOnProductionService({ ...COMPLETE, NODE_ENV: 'development', PHONEPE_ENV: 'sandbox' }),
      false
    );
  });
});
