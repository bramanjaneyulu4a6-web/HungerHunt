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

/* The credential limiter, under the condition that actually breaks it: a
   group of parents sharing one public address. It runs before any token
   exists, so unlike the limiters above it CANNOT key on an account — IP is
   the only bucket available, and every parent on a school's WiFi or behind
   one mobile carrier NAT lands in it together.

   Signing in costs two of these requests, not one (/login-step, then
   /login), so the headline number is always halved before it reaches a
   parent. That arithmetic is what these tests pin down. */

import {
  authLimiter,
  passwordResetRequestLimiter,
  AUTH_MAX,
  AUTH_WINDOW_MS,
  PARENTS_PER_SHARED_ADDRESS,
} from '../middleware/rateLimit.js';

const REQUESTS_PER_SIGN_IN = 2;

const authApp = express();
authApp.post('/login-step', authLimiter, (req, res) => res.json({ ok: true }));
authApp.post('/login', authLimiter, (req, res) => res.json({ ok: true }));

let authServer, authBase;
before(async () => {
  authServer = authApp.listen(0);
  await new Promise((resolve) => authServer.once('listening', resolve));
  authBase = `http://127.0.0.1:${authServer.address().port}`;
});
after(() => new Promise((resolve) => authServer.close(resolve)));

const signIn = async () => {
  const step = await fetch(`${authBase}/login-step`, { method: 'POST' });
  const login = await fetch(`${authBase}/login`, { method: 'POST' });
  return [step.status, login.status];
};

test('a roomful of parents on one address can all sign in', async () => {
  // Every request below comes from 127.0.0.1 — one bucket, which is exactly
  // what a school hall or a carrier NAT looks like to the limiter.
  for (let parent = 1; parent <= PARENTS_PER_SHARED_ADDRESS; parent += 1) {
    const statuses = await signIn();
    assert.deepEqual(
      statuses,
      [200, 200],
      `parent ${parent} of ${PARENTS_PER_SHARED_ADDRESS} on the shared address was throttled`
    );
  }
});

test('and the next attempt on that address is still refused', async () => {
  // Continues the bucket the previous test filled. Brute force has to remain
  // stopped; widening the limiter must not mean removing it.
  const [step] = await signIn();
  assert.equal(step, 429);
});

test('the advertised group size is what the ceiling actually buys', () => {
  // Guards the halving: raising AUTH_MAX without remembering that signing in
  // costs two requests would quietly overstate how many parents fit.
  assert.equal(PARENTS_PER_SHARED_ADDRESS, Math.floor(AUTH_MAX / REQUESTS_PER_SIGN_IN));
});

test('a throttled parent waits minutes, not a quarter of an hour', () => {
  // The window is the other half of the fix: whoever does hit the ceiling
  // must get back in soon enough to still be trying, not give up.
  assert.ok(AUTH_WINDOW_MS <= 5 * 60 * 1000, 'lockout window is too long for a launch day');
});

test('the ceiling stays far below what guessing a password needs', () => {
  assert.ok(AUTH_MAX <= 30, 'credential endpoint is too open to be a brute-force control');
});

/* Asking for a reset link sends an email on the project's Gmail credentials,
   which have a daily cap. It must never inherit the sign-in ceiling: one
   address spending the day's quota locks every other parent out of resetting
   a password, which is worse than the throttling the widening fixed. */

const resetApp = express();
resetApp.post('/forgot-password', passwordResetRequestLimiter, (req, res) => res.json({ ok: true }));

let resetServer, resetBase;
before(async () => {
  resetServer = resetApp.listen(0);
  await new Promise((resolve) => resetServer.once('listening', resolve));
  resetBase = `http://127.0.0.1:${resetServer.address().port}`;
});
after(() => new Promise((resolve) => resetServer.close(resolve)));

test('reset emails stay on a far stingier budget than sign-in', async () => {
  const send = () => fetch(`${resetBase}/forgot-password`, { method: 'POST' });

  // Comfortably below the sign-in ceiling: proves the two did not get merged.
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    assert.equal((await send()).status, 200, `reset request ${attempt} was refused too early`);
  }

  assert.equal((await send()).status, 429);
  assert.ok(10 < AUTH_MAX, 'the email budget must stay below the sign-in ceiling');
});
