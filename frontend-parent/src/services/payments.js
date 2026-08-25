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

export const getIntent = (intentId) =>
  API.get(`/payments/intents/${intentId}`).then((r) => r.data.intent);

/* Opens PhonePe's hosted checkout. On a phone this is the system browser,
 * where upi:// intent links actually resolve to installed UPI apps; inside
 * the webview they would dead-end. */
const openCheckout = async (redirectUrl) => {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url: redirectUrl });
  } else {
    window.open(redirectUrl, '_blank', 'noopener');
  }
};

export const startPayment = async (createFn) => {
  const { intent, redirectUrl } = await createFn();
  await openCheckout(redirectUrl);
  return { intentId: intent.id };
};

/* Every GET below makes the backend re-check with PhonePe, so polling is
 * also the recovery path for a dropped webhook. 3s cadence, 5 minute cap —
 * a UPI payment that has not resolved by then shows as "still processing"
 * and the backend's reconcile sweep owns it from there. */
export const pollIntent = async (intentId, { onUpdate, intervalMs = 3000, timeoutMs = 300000 } = {}) => {
  const deadline = Date.now() + timeoutMs;

  for (;;) {
    const intent = await getIntent(intentId);
    onUpdate?.(intent);

    if (TERMINAL_STATUSES.includes(intent.status)) return intent;
    if (Date.now() >= deadline) return intent;

    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
};
