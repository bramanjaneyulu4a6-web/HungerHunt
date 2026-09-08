// Extension included so this module runs under `node --test` as well as Vite.
import { normalizeVpa } from './demoUpi.js';

/* Which PhonePe checkout a payment should use, given what the parent picked
 * and what the app is running on. Kept apart from services/payments.js so the
 * decision can be read and tested on its own — that file cannot even be
 * imported outside a Vite build, and this is the part of it most likely to be
 * got quietly wrong.
 *
 * The result is spread straight into the POST body of /payments/intents. The
 * backend re-derives everything that matters from it (which app package to
 * target, whether the address is even a UPI address) — nothing here is
 * trusted there, and nothing here decides money. */
export const checkoutContext = (choice, { native, sdkEnabled, platform }) => {
  /* A typed UPI ID first, and deliberately ahead of any app id: collect is
     the one mode that needs nothing launched — PhonePe rings whatever app
     owns the address — so it works the same in a browser as on a phone, and
     a leftover app selection must never quietly redirect a payment the
     parent addressed by hand. */
  const vpa = normalizeVpa(choice?.vpa);
  if (vpa) return { checkoutMode: 'UPI_COLLECT', vpa };

  /* Opening a named app is a phone-only trick. A browser has nothing to
     intent into, so it falls through to PhonePe's hosted page, which offers
     its own picker and a QR code for a desktop with no UPI app at all. */
  if (native && choice?.app) {
    return {
      checkoutMode: 'UPI_INTENT',
      upiApp: choice.app,
      deviceOS: platform === 'ios' ? 'IOS' : 'ANDROID',
    };
  }

  if (native && sdkEnabled) return { checkoutMode: 'SDK' };

  return { checkoutMode: 'REDIRECT' };
};
