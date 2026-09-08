import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { PhonePePayment } from '@hungerhunt/phonepe-payment';
import API from './api';
import { checkoutContext } from '../utils/checkoutMode';
import { paymentsVisible } from '../utils/paymentsAccess';
import { wait } from '../utils/resumeAwareWait';

/* THE GOLDEN RULE OF GATEWAYS
 *
 * Nothing in this file — and nothing in this app — decides that money
 * arrived. The checkout browser closing, PhonePe's page saying "success",
 * the redirect coming back: all of it is theatre as far as the ledger is
 * concerned. A client can be killed mid-payment, lie about an outcome, or
 * replay an old one.
 *
 * The truth lives on the backend, which hears it two ways: PhonePe's
 * signed webhook, and its own server-to-server status read every time we
 * poll GET /payments/intents/:id below. Both funnel into one idempotent
 * settle step. So this file's whole job is: start the payment, open the
 * checkout, then ASK THE BACKEND until it says something terminal. */

/* Whether to offer UPI at all. Baked in at build time, and OFF unless the
 * build explicitly says otherwise, because the failure it prevents is a
 * one-way one: with the backend's PHONEPE_* credentials unset every tap
 * reaches PhonePe, fails its token request, and shows the parent "the
 * payment service is not answering". Nothing is charged and no money is at
 * risk — but a button that never works, on the screen where a parent is
 * trying to pay for their child's food, is worse than no button.
 *
 * Default-off also means the flag needs no coordination to be safe: a build
 * that forgets it hides the feature rather than shipping a broken one. Turn
 * it on in the same change that puts the credentials into the backend.
 *
 * This hides the entry points only. The /payment-return page and the polling
 * below stay reachable either way, so a payment already in flight when the
 * flag is turned off still settles and still reports its verdict. */
export const PAYMENTS_ENABLED = import.meta.env.VITE_PAYMENTS_ENABLED === 'true';

// The presentation-only checkout takes priority over the live gateway while
// it is enabled. That makes a demo build safe even if live gateway variables
// happen to exist in its environment: no intent is created until this flag is
// explicitly turned off.
export const DEMO_UPI_ENABLED = import.meta.env.VITE_DEMO_UPI_ENABLED !== 'false';

export const TERMINAL_STATUSES = ['APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'];

/* PhonePe's native Standard Checkout can strand the parent inside its
 * "Confirming Payment" activity when the UAT page/API CORS configuration is
 * out of sync. Hosted checkout still hands UPI links to installed apps and,
 * unlike the SDK activity, lets our app begin polling immediately. Keep the
 * native integration available for a separately certified production build.
 * The custom UPI intent flow below does not use that checkout page: Hunger
 * Hunt chooses the target app first and launches PhonePe's returned URL. */
export const NATIVE_PAYMENT_SDK_ENABLED =
  import.meta.env.VITE_PHONEPE_NATIVE_SDK_ENABLED === 'true';

export const CUSTOM_UPI_INTENT_ENABLED = Capacitor.isNativePlatform();

/* Paying to a UPI ID the parent types needs nothing installed and nothing
 * launched — PhonePe rings whichever app owns that address — so unlike the
 * app picker above it is offered everywhere the gateway itself is. */
export const UPI_COLLECT_ENABLED = PAYMENTS_ENABLED;

/* Whether THIS parent may pay, which the build flag above cannot answer.
 *
 * The gateway can be fully live while only named accounts may reach it —
 * how PhonePe reviews a working checkout in production without one appearing
 * in front of the families on the roll. The allowlist lives in the backend's
 * environment, so adding a reviewer's account is an env edit rather than four
 * rebuilt frontends, and that makes availability a question to ask at runtime.
 *
 * Deliberately not cached across the session: the obvious cache is a
 * module-level promise, and it would outlive a sign-out and hand the next
 * parent to sign in on the same phone the previous parent's answer. The
 * request is two booleans behind the auth gate, asked when a payment surface
 * mounts, so paying for that correctness costs nothing worth counting.
 *
 * A failure resolves to "no". "We could not ask" and "you may not" lead to
 * the same screen, and the alternative is a Pay button that 503s. */
export const usePaymentsAvailable = () => {
  const [answer, setAnswer] = useState(null);

  useEffect(() => {
    if (!PAYMENTS_ENABLED) return undefined;

    let alive = true;
    API.get('/payments/availability')
      .then((res) => { if (alive) setAnswer(res.data?.paymentsEnabled === true); })
      .catch(() => { if (alive) setAnswer(false); });

    return () => { alive = false; };
  }, []);

  return paymentsVisible(PAYMENTS_ENABLED, answer);
};


/* A collect request is approved on a phone that may be in another room, so
 * the ordinary two-minute window would give up on payments that are simply
 * waiting for someone to walk over and enter a PIN. Five minutes is the wait
 * this screen is willing to sit through; past it the payment is not lost, it
 * is described as still processing and the backend's sweep owns it. */
export const COLLECT_POLL_TIMEOUT_MS = 300000;

// The decision itself lives in utils/checkoutMode, where it can be tested
// without a Vite build. This only supplies what the runtime knows.
const paymentContext = (choice) =>
  checkoutContext(choice, {
    native: Capacitor.isNativePlatform(),
    sdkEnabled: NATIVE_PAYMENT_SDK_ENABLED,
    platform: Capacitor.getPlatform(),
  });

/* `choice` is what the parent picked in the sheet: `{ app: 'gpay' }` for one
 * of the listed UPI apps, `{ vpa: 'name@bank' }` for an address they typed,
 * or nothing at all to hand the whole choice to PhonePe's hosted page. */
export const createOrderPayment = (pendingOrderId, choice) =>
  API.post('/payments/intents', {
    purpose: 'ORDER',
    pendingOrderId,
    ...paymentContext(choice),
  }).then((r) => r.data);

export const createTopup = (studentId, amountRupees, choice) =>
  API.post('/payments/intents', {
    purpose: 'TOPUP',
    studentId,
    amountRupees,
    ...paymentContext(choice),
  }).then((r) => r.data);

// The shared axios instance sets no per-request timeout, so a hung
// connection (as opposed to one that fails fast) would otherwise hold a poll
// attempt open for the browser default — minutes, not seconds — which would
// quietly blow past the "4 consecutive failures" bound pollIntent relies on
// to surface something to the parent in a reasonable time.
const POLL_TIMEOUT_MS = 10000;

export const getIntent = (intentId, { signal } = {}) =>
  API.get(`/payments/intents/${intentId}`, { signal, timeout: POLL_TIMEOUT_MS }).then(
    (r) => r.data.intent
  );

/* The same verdict, for the browser PhonePe redirects into. That browser is
 * whichever one the parent's UPI app was holding — on a phone a Custom Tab
 * carrying none of the app's localStorage — so there is no session to poll
 * with, and the authenticated read above would bounce it to a login screen
 * at the end of a payment. The token comes from the redirect URL the backend
 * built; possession of it is the credential.
 *
 * It answers with a verdict and nothing else: no amount, no student. That is
 * all this screen renders, and it keeps a shoulder-surfed URL from being a
 * statement of how much, for whom. */
export const getPublicIntent = (intentId, token, { signal } = {}) =>
  API.get(`/payments/public/intents/${intentId}`, {
    params: { t: token },
    signal,
    timeout: POLL_TIMEOUT_MS,
  }).then((r) => r.data.intent);

/* Browser builds use PhonePe's hosted checkout. The legacy native Standard
 * Checkout helper remains below for explicitly flagged builds; the custom
 * app-picker path launches its intent URL in startPayment instead. */
const openHostedCheckout = async (redirectUrl) => {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: redirectUrl });
    return;
  }

  // This runs after two awaits, so it is outside the call stack that started
  // from the parent's tap — a browser is free to treat it as a popup rather
  // than a user gesture. Safari in particular returns null instead of
  // opening anything, which would otherwise leave the parent staring at a
  // page that visibly did nothing. Same-tab is a safe fallback on web:
  // PhonePe's checkout redirects straight back to /payment-return when it's
  // done, so nothing is lost by not having a separate tab.
  //
  // Deliberately no 'noopener' in the features string: per spec that makes
  // window.open return null even when the popup opens fine, which would
  // make the check below fire on every successful open too — a guaranteed
  // second, same-tab checkout on top of the one that just opened. Instead
  // get the same security benefit by hand: null the new window's opener
  // reference once we know it actually opened.
  const popup = window.open(redirectUrl, '_blank');
  if (popup) {
    popup.opener = null;
  } else {
    window.location.assign(redirectUrl);
  }
};

const closeHostedCheckout = async () => {
  if (!Capacitor.isNativePlatform() || NATIVE_PAYMENT_SDK_ENABLED) return;
  try {
    await Browser.close();
  } catch {
    // The parent may already have dismissed the tab. There is nothing left
    // to close, which is the outcome this helper wanted.
  }
};

const openNativeCheckout = async (sdk, intentId) => {
  if (!sdk?.orderId || !sdk?.token || !sdk?.merchantId || !sdk?.environment) {
    throw new Error('The payment service returned an incomplete PhonePe SDK order.');
  }

  // PhonePe's application id belongs to the iOS SDK contract. Android's
  // init() takes the merchant, flow and environment only, so requiring the
  // iOS value here prevented every Android checkout from reaching the native
  // plugin whenever PHONEPE_IOS_APP_ID was (correctly) unset.
  if (Capacitor.getPlatform() === 'ios' && !sdk.appId) {
    throw new Error('The payment service is missing its PhonePe iOS application id.');
  }

  await PhonePePayment.startCheckout({
    orderId: sdk.orderId,
    token: sdk.token,
    merchantId: sdk.merchantId,
    ...(sdk.appId ? { appId: sdk.appId } : {}),
    environment: sdk.environment,
    flowId: intentId,
    appSchema: 'hungerhuntpay',
  });
};

export const startPayment = async (createFn) => {
  const { intent, redirectUrl, intentUrl, sdk, collect } = await createFn();
  if (sdk) {
    await openNativeCheckout(sdk, intent.id);
  } else if (intentUrl) {
    await PhonePePayment.openUpiIntent({ intentUrl });
  } else if (collect) {
    /* Nothing to open, and that is the whole point of a collect: the request
       has already been pushed to the parent's own UPI app. This app's only
       job now is to wait and keep asking the backend, which the caller does
       next. `collect.vpa` comes back masked, for the waiting screen to name
       who was asked. */
  } else {
    if (!redirectUrl) throw new Error('The payment service did not return a checkout URL.');
    await openHostedCheckout(redirectUrl);
  }
  return { intentId: intent.id, collect: collect || null };
};

const isAuthRequiredError = (err) =>
  err?.response?.status === 401 && err?.response?.data?.code === 'AUTH_REQUIRED';

// A handful of consecutive misses is almost always the phone's radio
// renegotiating as the parent switches back from their UPI app, not a real
// outage. Give that a few beats to pass before surfacing anything — but do
// surface it, rather than spinning forever on "Checking with the bank…".
const MAX_CONSECUTIVE_POLL_FAILURES = 4;

/* Every GET below makes the backend re-check with PhonePe, so polling is
 * also the recovery path for a dropped webhook. 3s cadence, 2 minute cap —
 * a UPI payment that has not resolved by then shows as "still processing"
 * and the backend's reconcile sweep owns it from there.
 *
 * A single network hiccup must not kill this loop — it exists precisely for
 * the moment right after the parent returns from their UPI app, which is
 * exactly when the connection is most likely to hiccup. Transient errors are
 * swallowed and retried; only a run of MAX_CONSECUTIVE_POLL_FAILURES in a
 * row is treated as something the caller needs to know about. An expired
 * session (401 AUTH_REQUIRED) is not transient — the shared axios instance
 * is already logging the parent out and redirecting to /login, so that error
 * is rethrown immediately instead of being retried into a dead token.
 *
 * `fetcher` is how the return page swaps in the public, token-scoped read
 * without duplicating any of the loop's timing, backoff or give-up rules —
 * the two reads differ only in what proves the caller may see the verdict. */
export const pollIntent = async (
  intentId,
  { onUpdate, intervalMs = 3000, timeoutMs = 120000, signal, fetcher = getIntent } = {}
) => {
  const deadline = Date.now() + timeoutMs;
  let failures = 0;

  for (;;) {
    if (signal?.aborted) return null;

    let intent;
    try {
      intent = await fetcher(intentId, { signal });
    } catch (err) {
      if (signal?.aborted) return null;
      if (isAuthRequiredError(err)) throw err;

      failures += 1;
      if (failures >= MAX_CONSECUTIVE_POLL_FAILURES) throw err;

      await wait(intervalMs, signal);
      continue;
    }

    failures = 0;
    onUpdate?.(intent);

    if (TERMINAL_STATUSES.includes(intent.status)) {
      await closeHostedCheckout();
      return intent;
    }
    if (Date.now() >= deadline) {
      // A provider can legitimately remain pending after we stop waiting,
      // especially in PhonePe's sandbox. Do not leave the parent trapped in
      // the Custom Tab: return them to the app, where the non-terminal status
      // is described as still processing. This closes presentation only; the
      // backend remains the sole authority that can settle the payment.
      await closeHostedCheckout();
      return intent;
    }

    await wait(intervalMs, signal);
  }
};
