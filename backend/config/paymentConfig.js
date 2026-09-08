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
    // A sandbox gateway on a production service would put a checkout that
    // moves no money in front of parents who believe it does.
    ...(production && env.PHONEPE_ENV !== 'production'
      ? ['PHONEPE_ENV must be production']
      : []),
    ...(!redirectValid
      ? ['PHONEPE_REDIRECT_BASE_URL must be a valid HTTPS URL in production']
      : []),
  ];
};
