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

test('createPayment fetches a token once, then pays with O-Bearer and UPI-only modes', async () => {
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
  const modes = body.paymentFlow.paymentModeConfig.enabledPaymentModes.map((m) => m.type);
  assert.deepEqual(modes.sort(), ['UPI_COLLECT', 'UPI_INTENT', 'UPI_QR']);

  // Second call reuses the cached token: still exactly one token fetch.
  await adapter.createPayment({ merchantOrderId: 'HH-def', amountPaise: 100, redirectUrl: 'https://x/r' });
  assert.equal(calls.filter((c) => c.url.includes('/oauth/token')).length, 1);
});

test('getOrderStatus returns state and integer paise amount', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ state: 'COMPLETED', amount: 49995 }));
  const status = await adapter.getOrderStatus('HH-abc');
  assert.deepEqual(status, { state: 'COMPLETED', amountPaise: 49995 });
});

test('a failed provider response throws rather than returning junk', async () => {
  mock.method(globalThis, 'fetch', async (url) =>
    String(url).includes('/oauth/token')
      ? jsonResponse({ access_token: 't', expires_at: Math.floor(Date.now() / 1000) + 3600 })
      : jsonResponse({ message: 'KEY_ERROR' }, 401));
  await assert.rejects(() => adapter.getOrderStatus('HH-abc'));
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
  assert.deepEqual(status, { state: 'COMPLETED', amountPaise: 100 });
  assert.equal(tokenFetches, 2, 'the 401 should have evicted the cached token, forcing a second token fetch');
});

test('the default export is the same functions as the named exports', () => {
  assert.equal(adapter.default.createPayment, adapter.createPayment);
  assert.equal(adapter.default.getOrderStatus, adapter.getOrderStatus);
  assert.equal(adapter.default.verifyWebhookAuth, adapter.verifyWebhookAuth);
  assert.equal(adapter.default._resetTokenCacheForTests, adapter._resetTokenCacheForTests);
});
