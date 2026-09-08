import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.PHONEPE_ENV = 'sandbox';
process.env.PHONEPE_CLIENT_ID = 'TESTCLIENT';
process.env.PHONEPE_CLIENT_SECRET = 'testsecret';
process.env.PHONEPE_CLIENT_VERSION = '1';
process.env.PHONEPE_WEBHOOK_USERNAME = 'hookuser';
process.env.PHONEPE_WEBHOOK_PASSWORD = 'hookpass';

const adapter = await import('../src/domain/payments/providers/phonepe.js');

afterEach(() => {
  mock.restoreAll();
  adapter._resetTokenCacheForTests();
});

const jsonResponse = (body, status = 200) =>
  ({ ok: status < 400, status, json: async () => body });

test('createPayment fetches a token once, then pays with O-Bearer and UPI Intent only', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url, opts) => {
    calls.push({ url: String(url), opts });
    if (String(url).includes('/oauth/token')) {
      return jsonResponse({ access_token: 'tok123', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    return jsonResponse({ orderId: 'OMO123', state: 'PENDING', redirectUrl: 'https://pg.example/checkout', expireAt: 1 });
  });

  const result = await adapter.createPayment({
    merchantOrderId: 'HH-abc', amountPaise: 49995, redirectUrl: 'https://parent.example/payment-return?intent=abc',
  });

  assert.equal(result.providerOrderId, 'OMO123');
  assert.equal(result.redirectUrl, 'https://pg.example/checkout');

  const payCall = calls.find((c) => c.url.includes('/checkout/v2/pay'));
  assert.equal(payCall.opts.headers.Authorization, 'O-Bearer tok123');
  const body = JSON.parse(payCall.opts.body);
  assert.equal(body.amount, 49995);
  assert.equal(body.merchantOrderId, 'HH-abc');
  assert.deepEqual(body.paymentFlow.paymentModeConfig, {
    version: 'V2',
    enabledPaymentModes: [{ type: 'UPI', flows: ['INTENT', 'QR'] }],
  });

  // Second call reuses the cached token: still exactly one token fetch.
  await adapter.createPayment({ merchantOrderId: 'HH-def', amountPaise: 100, redirectUrl: 'https://x/r' });
  assert.equal(calls.filter((c) => c.url.includes('/oauth/token')).length, 1);
});

test('createSdkPayment creates a native SDK order restricted to UPI Intent', async () => {
  let sdkCall;
  mock.method(globalThis, 'fetch', async (url, opts) => {
    if (String(url).includes('/oauth/token')) {
      return jsonResponse({ access_token: 'tok123', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    sdkCall = { url: String(url), opts };
    return jsonResponse({ orderId: 'OMO-SDK', token: 'sdk-token', state: 'PENDING', expireAt: 123 });
  });

  const result = await adapter.createSdkPayment({ merchantOrderId: 'HH-native', amountPaise: 100 });

  assert.match(sdkCall.url, /\/checkout\/v2\/sdk\/order$/);
  assert.equal(sdkCall.opts.headers.Authorization, 'O-Bearer tok123');
  assert.deepEqual(JSON.parse(sdkCall.opts.body), {
    merchantOrderId: 'HH-native',
    amount: 100,
    expireAfter: 1200,
    paymentFlow: {
      type: 'PG_CHECKOUT',
      paymentModeConfig: { enabledPaymentModes: [{ type: 'UPI_INTENT' }] },
    },
  });
  assert.deepEqual(result, {
    providerOrderId: 'OMO-SDK',
    orderId: 'OMO-SDK',
    token: 'sdk-token',
    state: 'PENDING',
    expireAt: 123,
  });
});

test('createSdkPayment rejects a malformed provider response', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ orderId: 'OMO-without-token', state: 'PENDING' }));
  await assert.rejects(() => adapter.createSdkPayment({ merchantOrderId: 'HH-native', amountPaise: 100 }), /orderId and token/);
});

test('createUpiIntentPayment targets the chosen app through Custom Checkout', async () => {
  let payCall;
  mock.method(globalThis, 'fetch', async (url, opts) => {
    if (String(url).includes('/oauth/token')) {
      return jsonResponse({ access_token: 'tok123', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    payCall = { url: String(url), opts };
    return jsonResponse({
      orderId: 'OMO-INTENT', intentUrl: 'gpay://upi/pay?token=x', state: 'PENDING', expireAt: 123,
    });
  });

  const result = await adapter.createUpiIntentPayment({
    merchantOrderId: 'HH-custom',
    amountPaise: 2500,
    targetApp: 'com.google.android.apps.nbu.paisa.user',
    deviceOS: 'ANDROID',
    merchantCallBackScheme: 'hungerhuntpay',
  });

  assert.match(payCall.url, /\/payments\/v2\/pay$/);
  assert.deepEqual(JSON.parse(payCall.opts.body), {
    merchantOrderId: 'HH-custom',
    amount: 2500,
    expireAfter: 1200,
    deviceContext: { deviceOS: 'ANDROID' },
    paymentFlow: {
      type: 'PG',
      paymentMode: {
        type: 'UPI_INTENT',
        targetApp: 'com.google.android.apps.nbu.paisa.user',
      },
    },
  });
  assert.equal(result.intentUrl, 'gpay://upi/pay?token=x');
});

test('custom UPI intents use the Custom Checkout status endpoint', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ state: 'PENDING', amount: 100 });
  });

  await adapter.getOrderStatus('HH-custom', 'UPI_INTENT');
  assert.ok(calls.some((url) => url.endsWith('/payments/v2/order/HH-custom/status')));
});

test('createUpiCollectPayment sends the payer\'s address and gets no URL back', async () => {
  let payCall;
  mock.method(globalThis, 'fetch', async (url, opts) => {
    if (String(url).includes('/oauth/token')) {
      return jsonResponse({ access_token: 'tok123', expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    payCall = { url: String(url), opts };
    return jsonResponse({ orderId: 'OMO-COLLECT', state: 'PENDING', expireAt: 123 });
  });

  const result = await adapter.createUpiCollectPayment({
    merchantOrderId: 'HH-collect',
    amountPaise: 2500,
    vpa: 'ashok@okhdfcbank',
  });

  assert.match(payCall.url, /\/payments\/v2\/pay$/);
  assert.deepEqual(JSON.parse(payCall.opts.body), {
    merchantOrderId: 'HH-collect',
    amount: 2500,
    // A collect request has to outlive the walk to the phone and the wait for
    // a UPI PIN, so it is given longer than the intent flow's 20 minutes.
    expireAfter: 3600,
    paymentFlow: {
      type: 'PG',
      paymentMode: { type: 'UPI_COLLECT', vpa: 'ashok@okhdfcbank' },
    },
  });
  // Nothing to launch: the request appears in the payer's own app.
  assert.equal(result.providerOrderId, 'OMO-COLLECT');
  assert.equal(result.intentUrl, undefined);
  assert.equal(result.redirectUrl, undefined);
});

test('createUpiCollectPayment rejects a provider response without an order id', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ state: 'PENDING' }));

  await assert.rejects(
    () => adapter.createUpiCollectPayment({
      merchantOrderId: 'HH-collect', amountPaise: 100, vpa: 'ashok@ybl',
    }),
    /orderId/
  );
});

test('collect payments read their status from the Custom Checkout endpoint too', async () => {
  const calls = [];
  mock.method(globalThis, 'fetch', async (url) => {
    calls.push(String(url));
    return String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ state: 'PENDING', amount: 100 });
  });

  await adapter.getOrderStatus('HH-collect', 'UPI_COLLECT');
  assert.ok(calls.some((url) => url.endsWith('/payments/v2/order/HH-collect/status')));
});

test('getOrderStatus returns state and integer paise amount', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ state: 'COMPLETED', amount: 49995 }));
  const status = await adapter.getOrderStatus('HH-abc');
  // A response carrying no rail details reports no UTR rather than guessing.
  assert.deepEqual(status, { state: 'COMPLETED', amountPaise: 49995, utr: null });
});

test('getOrderStatus reads the UTR from the completed attempt', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({
        state: 'COMPLETED',
        amount: 25000,
        paymentDetails: [
          // An earlier attempt that failed carries no usable reference; the
          // money's own reference belongs to the attempt that completed.
          { state: 'FAILED', rail: { type: 'UPI', utr: '111111111111' } },
          { state: 'COMPLETED', rail: { type: 'UPI', utr: '455069731511', vpa: 'a@ybl' } },
        ],
      }));
  const status = await adapter.getOrderStatus('HH-abc');
  assert.equal(status.utr, '455069731511');
});

test('a rail without a usable UTR reports null, not an empty string', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({
        state: 'COMPLETED',
        amount: 25000,
        paymentDetails: [{ state: 'COMPLETED', rail: { type: 'UPI', utr: '   ' } }],
      }));
  const status = await adapter.getOrderStatus('HH-abc');
  assert.equal(status.utr, null);
});

test('a failed provider response throws rather than returning junk', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ message: 'KEY_ERROR' }, 401));
  await assert.rejects(() => adapter.getOrderStatus('HH-abc'));
});

/* The reconcile sweep decides whether to retire an intent from the error
   this throws, and it reads providerCode — not the status — to do it. See
   reconcilePolicy.isProviderOrderMissing. */
test('a PG error carries PhonePe\'s own code through to the caller', async () => {
  const withStatusBody = (body, status) =>
    mock.method(globalThis, 'fetch', async (url) =>
      String(url).includes('/oauth/token')
        ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
        : jsonResponse(body, status));

  withStatusBody(
    { code: 'INVALID_MERCHANT_ORDER_ID', message: 'No entry found for given merchant order id' },
    400
  );
  const missing = await adapter.getOrderStatus('HH-nope').catch((e) => e);
  assert.equal(missing.providerCode, 'INVALID_MERCHANT_ORDER_ID');
  assert.equal(missing.statusCode, 400);

  mock.restoreAll();
  adapter._resetTokenCacheForTests();

  // A 4xx with no code at all must not look like a named reason — null, not
  // undefined-and-hopeful, and never the status standing in for a code.
  withStatusBody({ message: 'Bad Request' }, 400);
  const bare = await adapter.getOrderStatus('HH-nope').catch((e) => e);
  assert.equal(bare.providerCode, null);
  assert.equal(bare.statusCode, 400);
});

test('a token failure carries neither statusCode nor providerCode', async () => {
  mock.method(globalThis, 'fetch', async () =>
    jsonResponse({ code: 'INVALID_MERCHANT_ORDER_ID', message: 'nonsense' }, 400));
  const err = await adapter.getOrderStatus('HH-abc').catch((e) => e);
  // Bad credentials must never be readable as "this order does not exist":
  // the token endpoint throws before any PG response is inspected, so
  // neither field is ever set — whatever that endpoint happened to return.
  assert.equal(err.statusCode, undefined);
  assert.equal(err.providerCode, undefined);
  assert.match(err.message, /token request failed/);
});

test('webhook auth is the SHA256 of username:password, compared in constant time', () => {
  const good = crypto.createHash('sha256').update('hookuser:hookpass').digest('hex');
  assert.equal(adapter.verifyWebhookAuth(good), true);
  assert.equal(adapter.verifyWebhookAuth(good.toUpperCase()), true);
  assert.equal(adapter.verifyWebhookAuth('deadbeef'), false);
  assert.equal(adapter.verifyWebhookAuth(undefined), false);
  assert.equal(adapter.verifyWebhookAuth(''), false);
});

test('webhook auth does not throw on same-character-length non-ASCII input', () => {
  // 64 JS characters (matching a sha256 hex digest's string length) but,
  // once UTF-8 encoded, more than 64 bytes — must fail cleanly, not throw.
  const nonAsciiSameLength = 'é'.repeat(64);
  assert.doesNotThrow(() => adapter.verifyWebhookAuth(nonAsciiSameLength));
  assert.equal(adapter.verifyWebhookAuth(nonAsciiSameLength), false);
});

test('a 401 evicts the cached token so the next call re-fetches one', async () => {
  let tokenFetches = 0;
  let statusFetches = 0;
  mock.method(globalThis, 'fetch', async (url) => {
    if (String(url).includes('/oauth/token')) {
      tokenFetches += 1;
      return jsonResponse({ access_token: `tok${tokenFetches}`, expires_at: Math.floor(Date.now() / 1000) + 3600 });
    }
    statusFetches += 1;
    if (statusFetches === 1) {
      return jsonResponse({ message: 'UNAUTHORIZED' }, 401);
    }
    return jsonResponse({ state: 'COMPLETED', amount: 100 });
  });

  await assert.rejects(() => adapter.getOrderStatus('HH-abc'));
  assert.equal(tokenFetches, 1);

  const status = await adapter.getOrderStatus('HH-abc');
  assert.deepEqual(status, { state: 'COMPLETED', amountPaise: 100, utr: null });
  assert.equal(tokenFetches, 2, 'the 401 should have evicted the cached token, forcing a second token fetch');
});

test('the default export is the same functions as the named exports', () => {
  assert.equal(adapter.default.createPayment, adapter.createPayment);
  assert.equal(adapter.default.createSdkPayment, adapter.createSdkPayment);
  assert.equal(adapter.default.getOrderStatus, adapter.getOrderStatus);
  assert.equal(adapter.default.verifyWebhookAuth, adapter.verifyWebhookAuth);
  assert.equal(adapter.default._resetTokenCacheForTests, adapter._resetTokenCacheForTests);
});
