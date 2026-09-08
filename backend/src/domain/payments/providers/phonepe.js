import crypto from 'node:crypto';

/* Everything PhonePe lives here. The rest of the payment code speaks in
 * merchantOrderId, paise and four states — swap this file to swap providers.
 *
 * Standard Checkout v2 (verified against developer.phonepe.com, Aug 2026):
 *  - OAuth client-credentials token, sent as `Authorization: O-Bearer <token>`
 *  - amounts are integer paise
 *  - webhook calls carry `Authorization: SHA256(username:password)` hex
 */

const HOSTS = {
  sandbox: {
    token: 'https://api-preprod.phonepe.com/apis/pg-sandbox/v1/oauth/token',
    pg: 'https://api-preprod.phonepe.com/apis/pg-sandbox',
  },
  production: {
    token: 'https://api.phonepe.com/apis/identity-manager/v1/oauth/token',
    pg: 'https://api.phonepe.com/apis/pg',
  },
};

const env = () => {
  const name = process.env.PHONEPE_ENV || 'sandbox';
  if (!Object.hasOwn(HOSTS, name)) {
    throw new Error('PHONEPE_ENV must be exactly "sandbox" or "production".');
  }
  return HOSTS[name];
};

const requestTimeoutMs = () => {
  const configured = Number(process.env.PHONEPE_HTTP_TIMEOUT_MS || 10_000);
  return Number.isInteger(configured) && configured >= 1_000 && configured <= 30_000
    ? configured
    : 10_000;
};

const providerFetch = (url, options = {}) =>
  fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(requestTimeoutMs()) });

/* ---- token cache ------------------------------------------------------- */

let cachedToken = null; // { token, expiresAtMs }

export const _resetTokenCacheForTests = () => { cachedToken = null; };

const getAccessToken = async () => {
  // 60s of slack so a token never expires mid-request.
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > Date.now()) {
    return cachedToken.token;
  }

  const response = await providerFetch(env().token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: process.env.PHONEPE_CLIENT_ID,
      client_secret: process.env.PHONEPE_CLIENT_SECRET,
      client_version: process.env.PHONEPE_CLIENT_VERSION || '1',
      grant_type: 'client_credentials',
    }),
  });

  const body = await response.json();

  if (!response.ok || !body.access_token) {
    // Never echo the response body here — it can carry back the client
    // secret's fingerprint or other provider-side detail. Status only.
    throw new Error(`PhonePe token request failed (${response.status})`);
  }

  cachedToken = { token: body.access_token, expiresAtMs: body.expires_at * 1000 };
  return cachedToken.token;
};

const authorizedJson = async (url, options = {}) => {
  const token = await getAccessToken();
  const response = await providerFetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    // A rejected/rotated token would otherwise wedge the cache until its
    // stated expiry (hours) with a process restart as the only remedy —
    // evict on 401 so the next call re-authenticates instead.
    if (response.status === 401) cachedToken = null;
    const error = new Error(`PhonePe ${options.method || 'GET'} ${url} failed (${response.status}): ${body?.code || body?.message || 'no message'}`);
    // Two things the reconcile sweep needs, and it needs them apart.
    //
    // statusCode is context for a human reading a report line. providerCode
    // is the decision: PhonePe names its own reasons in the error body's
    // `code` field, and only that name distinguishes "this order was never
    // registered" from "your request was malformed" — both of which arrive
    // as a 4xx. See reconcilePolicy.isProviderOrderMissing for why the
    // status alone is not safe to read.
    //
    // Both are deliberately set only here, on PG API responses: a
    // token-endpoint failure in getAccessToken carries neither, so bad
    // credentials can never masquerade as a missing order.
    error.statusCode = response.status;
    error.providerCode = typeof body?.code === 'string' ? body.code : null;
    throw error;
  }
  return body;
};

/* ---- the three operations ---------------------------------------------- */

export const createPayment = async ({ merchantOrderId, amountPaise, redirectUrl }) => {
  const body = await authorizedJson(`${env().pg}/checkout/v2/pay`, {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      // Seconds until PhonePe expires an unpaid order. 20 minutes: long
      // enough to fight with a UPI app, short enough that a stale intent
      // resolves the same day.
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        merchantUrls: { redirectUrl },
        // UPI only — bank-to-bank carries 0% MDR. Adding CARD or
        // NET_BANKING here is what would start costing money. Don't.
        paymentModeConfig: {
          // PhonePe recommends the V2 constraint schema for new hosted-checkout
          // integrations. UPI-only keeps MDR at 0%; cards, net banking and
          // wallets stay suppressed. QR is allowed alongside INTENT because
          // this hosted page is what desktop-web parents see, and a desktop
          // browser has no UPI app to intent into — INTENT alone renders an
          // empty payment panel there (observed on UAT, 2026-09-07). The
          // native SDK order (createSdkPayment below) stays intent-only.
          version: 'V2',
          enabledPaymentModes: [
            { type: 'UPI', flows: ['INTENT', 'QR'] },
          ],
        },
      },
    }),
  });

  return {
    providerOrderId: body.orderId,
    redirectUrl: body.redirectUrl,
    state: body.state,
    expireAt: body.expireAt,
  };
};

/* Native Standard Checkout does not use the hosted redirect URL. PhonePe's
 * mobile contract returns a short-lived order token which only the native SDK
 * consumes; the merchant secret remains on this server. The mobile Create
 * Order page still documents the V1 payment-mode shape, so use its single
 * UPI_INTENT allowlist rather than mixing that endpoint with the website-only
 * V2 example. */
export const createSdkPayment = async ({ merchantOrderId, amountPaise }) => {
  const body = await authorizedJson(`${env().pg}/checkout/v2/sdk/order`, {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200,
      paymentFlow: {
        type: 'PG_CHECKOUT',
        paymentModeConfig: {
          enabledPaymentModes: [{ type: 'UPI_INTENT' }],
        },
      },
    }),
  });

  if (!body.orderId || !body.token) {
    throw new Error('PhonePe SDK order response did not include orderId and token');
  }

  return {
    providerOrderId: body.orderId,
    orderId: body.orderId,
    token: body.token,
    state: body.state,
    expireAt: body.expireAt,
  };
};

/* Custom Checkout lets Hunger Hunt own the app picker while PhonePe still
 * owns the payment order and its final status. The target is chosen from a
 * server-side allowlist in the controller; never accept a package or scheme
 * from the browser and forward it here unchecked. */
export const createUpiIntentPayment = async ({
  merchantOrderId,
  amountPaise,
  targetApp,
  deviceOS,
  merchantCallBackScheme,
}) => {
  const body = await authorizedJson(`${env().pg}/payments/v2/pay`, {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      expireAfter: 1200,
      deviceContext: {
        deviceOS,
        ...(deviceOS === 'IOS' ? { merchantCallBackScheme } : {}),
      },
      paymentFlow: {
        type: 'PG',
        paymentMode: { type: 'UPI_INTENT', targetApp },
      },
    }),
  });

  if (!body.orderId || !body.intentUrl) {
    throw new Error('PhonePe UPI Intent response did not include orderId and intentUrl');
  }

  return {
    providerOrderId: body.orderId,
    intentUrl: body.intentUrl,
    state: body.state,
    expireAt: body.expireAt,
  };
};

/* The bank's own reference for the money, reported by PhonePe rather than
 * minted by it — the number that means the same thing to the parent's bank,
 * to PhonePe and to the school's, and the one a parent's statement shows.
 * It exists only once an attempt actually completes, so the completed attempt
 * is the one to read; an attempt PhonePe reports without rail details (the
 * sandbox often does) simply yields null and the receipt prints without it. */
const utrFrom = (paymentDetails) => {
  if (!Array.isArray(paymentDetails)) return null;
  const completed =
    paymentDetails.find((attempt) => attempt?.state === 'COMPLETED') || paymentDetails[0];
  const utr = completed?.rail?.utr;
  return typeof utr === 'string' && utr.trim() ? utr.trim() : null;
};

/* The other half of Custom Checkout: instead of launching an app, PhonePe
 * pushes a collect request to whichever app owns the address the parent typed.
 * Nothing comes back to open — the parent's phone buzzes, they approve, and
 * this server hears about it through the webhook and its own status reads.
 *
 * The vpa arrives from a browser, so the controller matches it against
 * utils/upiVpa before it ever reaches here. Never forward a raw typed string. */
export const createUpiCollectPayment = async ({ merchantOrderId, amountPaise, vpa }) => {
  const body = await authorizedJson(`${env().pg}/payments/v2/pay`, {
    method: 'POST',
    body: JSON.stringify({
      merchantOrderId,
      amount: amountPaise,
      /* An hour, where an intent gets twenty minutes. A collect request is
         approved on a phone that may be in another room, and expiring it
         early would tell the parent their payment failed at the moment they
         were about to authorise it. */
      expireAfter: 3600,
      paymentFlow: {
        type: 'PG',
        paymentMode: { type: 'UPI_COLLECT', vpa },
      },
    }),
  });

  if (!body.orderId) {
    throw new Error('PhonePe UPI Collect response did not include an orderId');
  }

  return {
    providerOrderId: body.orderId,
    state: body.state,
    expireAt: body.expireAt,
  };
};

export const getOrderStatus = async (merchantOrderId, checkoutMode = 'REDIRECT') => {
  const custom = checkoutMode === 'UPI_INTENT' || checkoutMode === 'UPI_COLLECT';
  const prefix = custom ? '/payments/v2/order' : '/checkout/v2/order';
  const body = await authorizedJson(
    `${env().pg}${prefix}/${encodeURIComponent(merchantOrderId)}/status`
  );
  return {
    state: body.state,
    amountPaise: body.amount,
    utr: utrFrom(body.paymentDetails),
  };
};

/* ---- webhook authentication -------------------------------------------- */

export const verifyWebhookAuth = (authorizationHeader) => {
  const username = process.env.PHONEPE_WEBHOOK_USERNAME;
  const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!username || !password || !authorizationHeader) return false;

  const expected = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
  const presented = String(authorizationHeader).trim().toLowerCase();

  // Compare BYTE length, not string length — a header can carry latin1
  // high bytes (Node's HTTP parser accepts obs-text) that are more bytes
  // than characters once UTF-8 encoded, and timingSafeEqual throws on a
  // byte-length mismatch rather than just returning false.
  const presentedBuffer = Buffer.from(presented);
  const expectedBuffer = Buffer.from(expected);
  if (presentedBuffer.length !== expectedBuffer.length) return false;
  return crypto.timingSafeEqual(presentedBuffer, expectedBuffer);
};

export default {
  createPayment,
  createSdkPayment,
  createUpiIntentPayment,
  createUpiCollectPayment,
  getOrderStatus,
  verifyWebhookAuth,
  _resetTokenCacheForTests,
};
