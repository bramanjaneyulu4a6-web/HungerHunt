import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

import {
  paymentCreateLimiter,
  paymentStatusLimiter,
  skipAuthLimitsInDevelopment,
} from '../middleware/rateLimit.js';

// The payment limiters must be live under test (their skip only fires in
// development), or these smoke tests would be asserting against a no-op.
process.env.NODE_ENV = 'test';

test('authentication limits are skipped only in development', () => {
  const saved = process.env.NODE_ENV;

  try {
    process.env.NODE_ENV = 'development';
    assert.equal(skipAuthLimitsInDevelopment(), true);

    for (const environment of ['production', 'test', 'staging', 'Development', '']) {
      process.env.NODE_ENV = environment;
      assert.equal(
        skipAuthLimitsInDevelopment(),
        false,
        `NODE_ENV=${environment} disabled authentication throttling`
      );
    }

    delete process.env.NODE_ENV;
    assert.equal(skipAuthLimitsInDevelopment(), false);
  } finally {
    if (saved === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = saved;
  }
});

/* Smoke tests for the payment limiters: express-rate-limit is not under test
   here, the CONFIGURATION is — that a real parent's whole payment flow fits
   with room to spare, and that the buckets are per-parent, not shared. The
   fake auth middleware stands in for protectParent, which the real routes
   mount first. */

const paymentApp = express();
paymentApp.use((req, res, next) => {
  req.parent = { id: req.get('x-parent-id') || 'parent-default' };
  next();
});
paymentApp.get('/status', paymentStatusLimiter, (req, res) => res.json({ ok: true }));
paymentApp.post('/create', paymentCreateLimiter, (req, res) => res.json({ ok: true }));

let server, base;
before(async () => {
  server = paymentApp.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));

const hit = (method, path, parentId) =>
  fetch(base + path, { method, headers: { 'x-parent-id': parentId } });

test("a full payment's worth of status polls is never throttled", async () => {
  // The app polls every 3s for up to 5 minutes: 100 polls per payment. Even
  // with all 100 compressed into a single limiter window — far denser than
  // the real cadence ever gets — every one must pass, or a legitimate
  // parent could be cut off mid-payment with money in flight.
  for (let i = 0; i < 100; i += 1) {
    const res = await hit('GET', '/status', 'poller');
    assert.equal(res.status, 200, `poll ${i + 1} of a normal payment was throttled`);
  }
});

test('a runaway status-poll loop is eventually cut off', async () => {
  let limited = null;
  for (let i = 0; i < 200 && !limited; i += 1) {
    const res = await hit('GET', '/status', 'runaway');
    if (res.status === 429) limited = res;
  }
  assert.ok(limited, 'a 200-request burst — five payments at once — was never limited');
  assert.equal((await limited.json()).message, 'Too many status checks. Please wait a moment and try again.');
});

test("a normal sitting's worth of payment creations passes; a hammering client does not", async () => {
  // An order payment, top-ups for three children, and a few fumbled-PIN
  // retries is still under ten creates. All must pass...
  for (let i = 0; i < 8; i += 1) {
    const res = await hit('POST', '/create', 'family');
    assert.equal(res.status, 200, `create ${i + 1} of a normal sitting was throttled`);
  }

  // ...while a client that just keeps creating — each create is a PhonePe
  // order on the merchant's credentials — hits the wall.
  let limited = false;
  for (let i = 0; i < 30 && !limited; i += 1) {
    limited = (await hit('POST', '/create', 'family')).status === 429;
  }
  assert.ok(limited, 'an intent-creation hammer was never limited');
});

test('payment limits are per parent account, never a shared bucket', async () => {
  // Exhaust one parent's create budget entirely...
  let limited = false;
  for (let i = 0; i < 40 && !limited; i += 1) {
    limited = (await hit('POST', '/create', 'noisy-parent')).status === 429;
  }
  assert.ok(limited);

  // ...and a different parent (same IP — the whole school shares a NAT) is
  // completely unaffected.
  const res = await hit('POST', '/create', 'quiet-parent');
  assert.equal(res.status, 200, "one parent's hammering throttled another parent");
});
