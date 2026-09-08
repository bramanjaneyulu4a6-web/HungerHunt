/* Whether the PhonePe configuration is complete enough to serve a checkout.
 *
 * Answered before the service accepts a request, because the alternative is a
 * parent reaching a Pay button that creates half an intent and then fails on a
 * value nobody set. In production a problem here stops the boot; anywhere else
 * it is a warning, so local work carries on without credentials.
 *
 * Kept out of app.js so it can be exercised without booting a server — this is
 * the conditional that decides whether production comes up at all.
 */

import { allowlistedPhones } from './paymentAccess.js';

/* Every one of these is needed to take a payment and hear the outcome. Note
 * what is NOT here: PHONEPE_IOS_APP_ID belongs to the iOS SDK contract alone
 * — PhonePe issues it only once an Apple Team ID is registered, and neither
 * the web QR checkout nor the Android intent flow reads it. Requiring it to
 * boot would hold a web launch hostage to a credential for a platform that is
 * not shipping. A native iOS checkout attempted without it is refused by the
 * app, at the point of payment, where it is the only thing that breaks.
 */
const REQUIRED = Object.freeze([
  'PHONEPE_MERCHANT_ID',
  'PHONEPE_CLIENT_ID',
  'PHONEPE_CLIENT_SECRET',
  'PHONEPE_WEBHOOK_USERNAME',
  'PHONEPE_WEBHOOK_PASSWORD',
  'PHONEPE_REDIRECT_BASE_URL',
]);

/* A sandbox gateway on a production service would put a checkout that moves
 * no money in front of parents who believe it does. That is the whole danger,
 * and it needs an audience: PHONEPE_TEST_PARENT_PHONES removes one, because
 * every parent not named there is shown no UPI at all.
 *
 * So the rule is not "never", it is "only while nobody real can reach it".
 * PhonePe reviews the app in Test Mode before it will approve the merchant,
 * and until it does there are no production credentials to run — the live
 * host answers a Test Mode client id with 404 Key_not_configured, which is a
 * checkout that fails rather than one that pretends.
 *
 * The direction that matters is the other one: deleting the phones is how
 * payments are opened to the school, and if that ever happens while the
 * gateway is still sandbox, this refuses the boot instead of selling 222
 * families food with test money. Switching PHONEPE_ENV to production, with
 * live credentials, is the thing that has to happen first.
 */
const sandboxGatewayProblems = (env) => {
  if (env.NODE_ENV !== 'production' || env.PHONEPE_ENV === 'production') return [];

  if (env.PHONEPE_ENV === 'sandbox') {
    return allowlistedPhones(env).size > 0
      ? []
      : [
        'PHONEPE_ENV=sandbox on a production service is only allowed while '
          + 'PHONEPE_TEST_PARENT_PHONES names the accounts that may pay; set it, '
          + 'or move to PHONEPE_ENV=production with live credentials',
      ];
  }

  return ['PHONEPE_ENV must be production'];
};

/* What the boot banner is printed on — see app.js. A sandbox gateway that
   boots looking like every other boot is how a service is left taking test
   money for a week without anyone noticing. */
export const sandboxOnProductionService = (env = process.env) =>
  env.NODE_ENV === 'production' && env.PHONEPE_ENV === 'sandbox';

export const paymentConfigurationProblems = (env = process.env) => {
  const missing = REQUIRED.filter((name) => !env[name]?.trim());
  const production = env.NODE_ENV === 'production';

  const redirectValid = (() => {
    try {
      const url = new URL(env.PHONEPE_REDIRECT_BASE_URL);
      return !production || url.protocol === 'https:';
    } catch {
      return false;
    }
  })();

  return [
    ...(missing.length ? [`missing ${missing.join(', ')}`] : []),
    ...(!['sandbox', 'production'].includes(env.PHONEPE_ENV)
      ? ['PHONEPE_ENV must be sandbox or production']
      : []),
    ...sandboxGatewayProblems(env),
    ...(!redirectValid
      ? ['PHONEPE_REDIRECT_BASE_URL must be a valid HTTPS URL in production']
      : []),
  ];
};
