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
  const name = process.env.PHONEPE_ENV === 'production' ? 'production' : 'sandbox';
  return HOSTS[name];
};

/* ---- token cache ------------------------------------------------------- */

let cachedToken = null; // { token, expiresAtMs }

export const _resetTokenCacheForTests = () => { cachedToken = null; };

const getAccessToken = async () => {
  // 60s of slack so a token never expires mid-request.
  if (cachedToken && cachedToken.expiresAtMs - 60_000 > Date.now()) {
    return cachedToken.token;
  }

  const response = await fetch(env().token, {
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
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `O-Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(`PhonePe ${options.method || 'GET'} ${url} failed (${response.status}): ${body?.message || 'no message'}`);
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
          enabledPaymentModes: [
            { type: 'UPI_INTENT' },
            { type: 'UPI_COLLECT' },
            { type: 'UPI_QR' },
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

export const getOrderStatus = async (merchantOrderId) => {
  const body = await authorizedJson(
    `${env().pg}/checkout/v2/order/${encodeURIComponent(merchantOrderId)}/status`
  );
  return { state: body.state, amountPaise: body.amount };
};

/* ---- webhook authentication -------------------------------------------- */

export const verifyWebhookAuth = (authorizationHeader) => {
  const username = process.env.PHONEPE_WEBHOOK_USERNAME;
  const password = process.env.PHONEPE_WEBHOOK_PASSWORD;
  if (!username || !password || !authorizationHeader) return false;

  const expected = crypto.createHash('sha256').update(`${username}:${password}`).digest('hex');
  const presented = String(authorizationHeader).trim().toLowerCase();

  if (presented.length !== expected.length) return false;
  return crypto.timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
};

export default { createPayment, getOrderStatus, verifyWebhookAuth, _resetTokenCacheForTests };
