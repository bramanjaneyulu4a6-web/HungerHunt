import { Capacitor } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import API from './api';

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

export const TERMINAL_STATUSES = ['APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'];

export const createOrderPayment = (pendingOrderId) =>
  API.post('/payments/intents', { purpose: 'ORDER', pendingOrderId }).then((r) => r.data);

export const createTopup = (studentId, amountRupees) =>
  API.post('/payments/intents', { purpose: 'TOPUP', studentId, amountRupees }).then((r) => r.data);

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

/* Opens PhonePe's hosted checkout. On a phone this is the system browser,
 * where upi:// intent links actually resolve to installed UPI apps; inside
 * the webview they would dead-end. */
const openCheckout = async (redirectUrl) => {
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

/* Dismisses the native checkout tab (Custom Tab / SFSafariViewController)
 * once the in-app poll knows the real answer. Without this, every native
 * payment ends with the parent staring at whatever the checkout tab landed
 * on — PhonePe's redirect arrives in a browser that shares no localStorage
 * with the app, so /payment-return greets them with a login screen — while
 * the app underneath is already showing the truth. Closing the tab returns
 * them to that truth.
 *
 * Native only: on the web there is no Capacitor browser to close (the web
 * checkout is a popup or the same tab), and Browser.close() there rejects
 * with "not implemented". The catch also covers the tab the parent already
 * dismissed by hand — nothing to close is success, not an error. */
const closeCheckout = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Browser.close();
  } catch {
    // Already closed, or never opened — either way the parent is in the app.
  }
};

export const startPayment = async (createFn) => {
  const { intent, redirectUrl } = await createFn();
  await openCheckout(redirectUrl);
  return { intentId: intent.id };
};

const wait = (ms, signal) =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        resolve();
      },
      { once: true }
    );
  });

const isAuthRequiredError = (err) =>
  err?.response?.status === 401 && err?.response?.data?.code === 'AUTH_REQUIRED';

// A handful of consecutive misses is almost always the phone's radio
// renegotiating as the parent switches back from their UPI app, not a real
// outage. Give that a few beats to pass before surfacing anything — but do
// surface it, rather than spinning forever on "Checking with the bank…".
const MAX_CONSECUTIVE_POLL_FAILURES = 4;

/* Every GET below makes the backend re-check with PhonePe, so polling is
 * also the recovery path for a dropped webhook. 3s cadence, 5 minute cap —
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
  { onUpdate, intervalMs = 3000, timeoutMs = 300000, signal, fetcher = getIntent } = {}
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
      // The ledger has answered; the checkout tab is now just something
      // standing between the parent and the app that shows that answer.
      await closeCheckout();
      return intent;
    }
    if (Date.now() >= deadline) return intent;

    await wait(intervalMs, signal);
  }
};
