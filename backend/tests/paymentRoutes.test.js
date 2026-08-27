import test, { after, afterEach, before, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.PHONEPE_ENV = 'sandbox';
process.env.PHONEPE_CLIENT_ID = 'x';
process.env.PHONEPE_CLIENT_SECRET = 'x';
process.env.PHONEPE_WEBHOOK_USERNAME = 'hookuser';
process.env.PHONEPE_WEBHOOK_PASSWORD = 'hookpass';
process.env.PHONEPE_REDIRECT_BASE_URL = 'https://parent.example';

const mongoose = (await import('mongoose')).default;
const Parent = (await import('../models/Parent.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
// Stubbed through their default export objects, not the module namespace:
// mock.method() on an ES module namespace throws "Cannot redefine property"
// on this repo's Node (v26.7.0). The controller under test reaches both
// through the same default objects for exactly this reason.
const phonepe = (await import('../src/domain/payments/providers/phonepe.js')).default;
const settle = (await import('../src/domain/payments/settlePaymentIntent.js')).default;
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const PARENT_ID = '507f1f77bcf86cd799439001';
const STUDENT_ID = '507f1f77bcf86cd799439011';
const ORDER_ID = '507f1f77bcf86cd799439031';
const INTENT_ID = '507f1f77bcf86cd799439051';

// signParentToken(id, phone, tokenVersion = 0) — verified against the current
// utils/tokens.js and how controllers/parentController.js calls it, not the
// object-shaped call in the original brief.
const parentToken = signParentToken(PARENT_ID, '9999999999');

let server, base;
before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const asParent = () => mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));

const send = (method, path, body, headers = {}) =>
  fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${parentToken}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

test('a topup intent is created and returns the checkout url', async () => {
  asParent();
  let createdDoc;
  mock.method(PaymentIntent, 'create', async (doc) => {
    createdDoc = doc;
    return { ...doc, _id: INTENT_ID, status: 'CREATED' };
  });
  mock.method(PaymentIntent, 'findOneAndUpdate', async (filter, update) =>
    ({ _id: INTENT_ID, ...createdDoc, ...update.$set }));
  mock.method(phonepe, 'createPayment', async ({ merchantOrderId, amountPaise, redirectUrl }) => {
    assert.equal(amountPaise, 50000);
    assert.ok(redirectUrl.startsWith('https://parent.example/payment-return?intent='));
    return { providerOrderId: 'OMO1', redirectUrl: 'https://pg.example/co', state: 'PENDING' };
  });

  const res = await send('POST', '/api/payments/intents',
    { purpose: 'TOPUP', studentId: STUDENT_ID, amountRupees: 500 });

  assert.equal(res.status, 201);
  const body = await res.json();
  assert.equal(body.redirectUrl, 'https://pg.example/co');
  assert.equal(body.intent.status, 'PENDING');
  assert.equal(createdDoc.amountPaise, 50000);
});

test('topup amounts are validated', async () => {
  asParent();
  for (const amountRupees of [0, -5, 20001, 10.5, 'abc']) {
    const res = await send('POST', '/api/payments/intents',
      { purpose: 'TOPUP', studentId: STUDENT_ID, amountRupees });
    assert.equal(res.status, 400, `accepted ${amountRupees}`);
  }
});

test('a parent cannot create a topup for a student that is not theirs', async () => {
  // First exists() call authenticates the token; second checks ownership.
  let calls = 0;
  mock.method(Parent, 'exists', async () => (calls++ === 0 ? { _id: PARENT_ID } : null));
  const res = await send('POST', '/api/payments/intents',
    { purpose: 'TOPUP', studentId: STUDENT_ID, amountRupees: 100 });
  assert.equal(res.status, 404);
});

test('an order intent snapshots the order total in paise', async () => {
  asParent();
  let capturedFilter;
  mock.method(PendingOrder, 'findOne', async (filter) => {
    capturedFilter = filter;
    return { _id: ORDER_ID, parentId: PARENT_ID, studentId: STUDENT_ID, status: 'PENDING',
       totalAmount: 149.5, expiresAt: new Date(Date.now() + 3600_000) };
  });
  let createdDoc;
  mock.method(PaymentIntent, 'create', async (doc) => {
    createdDoc = doc;
    return { ...doc, _id: INTENT_ID, status: 'CREATED' };
  });
  mock.method(PaymentIntent, 'findOneAndUpdate', async (f, update) =>
    ({ _id: INTENT_ID, ...createdDoc, ...update.$set }));
  mock.method(phonepe, 'createPayment', async () =>
    ({ providerOrderId: 'OMO2', redirectUrl: 'https://pg.example/co2', state: 'PENDING' }));

  const res = await send('POST', '/api/payments/intents', { purpose: 'ORDER', pendingOrderId: ORDER_ID });

  assert.equal(res.status, 201);
  assert.equal(createdDoc.amountPaise, 14950);
  assert.equal(String(createdDoc.pendingOrderId), ORDER_ID);
  // Pins the cross-parent guard itself: a query that dropped parentId would
  // let this test keep passing even though it would let a parent pay
  // someone else's order.
  assert.equal(capturedFilter.parentId, PARENT_ID);
});

test('reading a pending intent settles it first', async () => {
  asParent();
  const settled = mock.method(settle, 'settlePaymentIntent', async () =>
    ({ _id: INTENT_ID, parentId: PARENT_ID, purpose: 'TOPUP', status: 'APPLIED',
       amountPaise: 50000, degradedToTopup: false, pendingOrderId: null, createdAt: new Date() }));
  let capturedFilter;
  mock.method(PaymentIntent, 'findOne', async (filter) => {
    capturedFilter = filter;
    return { _id: INTENT_ID, parentId: PARENT_ID, purpose: 'TOPUP', status: 'PENDING',
       amountPaise: 50000, degradedToTopup: false, pendingOrderId: null, createdAt: new Date() };
  });

  const res = await send('GET', `/api/payments/intents/${INTENT_ID}`);

  assert.equal(res.status, 200);
  assert.equal((await res.json()).intent.status, 'APPLIED');
  assert.equal(settled.mock.callCount(), 1);
  // Pins the cross-parent guard itself: a query that dropped parentId would
  // let this test keep passing even though it would let a parent read
  // someone else's intent.
  assert.equal(capturedFilter.parentId, PARENT_ID);
});

test('the webhook rejects a bad credential hash and never settles', async () => {
  const settled = mock.method(settle, 'settlePaymentIntent', async () => null);
  const res = await fetch(base + '/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'wrong' },
    body: JSON.stringify({ payload: { merchantOrderId: `HH-${INTENT_ID}` } }),
  });
  assert.equal(res.status, 401);
  assert.equal(settled.mock.callCount(), 0);
});

test('an authenticated webhook settles by merchantOrderId and answers 200', async () => {
  mock.method(PaymentIntent, 'findOne', async () => ({ _id: INTENT_ID }));
  const settled = mock.method(settle, 'settlePaymentIntent', async () => ({ status: 'APPLIED' }));
  const auth = crypto.createHash('sha256').update('hookuser:hookpass').digest('hex');

  const res = await fetch(base + '/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ event: 'checkout.order.completed', payload: { merchantOrderId: `HH-${INTENT_ID}` } }),
  });

  assert.equal(res.status, 200);
  assert.equal(settled.mock.callCount(), 1);
});

test('a webhook for an unknown order still answers 200 and stays quiet', async () => {
  mock.method(PaymentIntent, 'findOne', async () => null);
  const auth = crypto.createHash('sha256').update('hookuser:hookpass').digest('hex');
  const res = await fetch(base + '/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ payload: { merchantOrderId: 'HH-nobody' } }),
  });
  assert.equal(res.status, 200);
});

test('a webhook whose lookup rejects still answers instead of crashing the process', async () => {
  // A bare, un-caught await here would reject the handler's promise; Express
  // 4 does not catch that, and with no unhandledRejection handler installed
  // it would take the whole backend down rather than answer PhonePe at all.
  // This only proves a response comes back — see paymentController.js for
  // why 500 (not the usual always-200) is the deliberate answer here.
  mock.method(PaymentIntent, 'findOne', async () => {
    throw new Error('mongo buffering timed out');
  });
  const auth = crypto.createHash('sha256').update('hookuser:hookpass').digest('hex');
  const res = await fetch(base + '/api/payments/phonepe/webhook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: auth },
    body: JSON.stringify({ payload: { merchantOrderId: `HH-${INTENT_ID}` } }),
  });
  assert.equal(res.status, 500);
});

/* ---- the public return-page read --------------------------------------- */

const RETURN_TOKEN = 'a'.repeat(64);

// No Authorization header anywhere: the browser PhonePe redirects into does
// not have one, which is the entire reason this route exists.
const publicGet = (id, query = '') => fetch(`${base}/api/payments/public/intents/${id}${query}`);

const publicIntentDoc = (over = {}) => ({
  _id: INTENT_ID,
  parentId: PARENT_ID,
  studentId: STUDENT_ID,
  purpose: 'TOPUP',
  status: 'PENDING',
  amountPaise: 50000,
  degradedToTopup: false,
  pendingOrderId: null,
  returnToken: RETURN_TOKEN,
  createdAt: new Date(),
  ...over,
});

// findById(...).select('+returnToken') — the token is select:false on the
// model, so the route has to ask for it by name; this stub pins that chain.
const stubFindById = (doc) => {
  let selected;
  mock.method(PaymentIntent, 'findById', (id) => ({
    select: async (fields) => {
      selected = fields;
      return doc;
    },
  }));
  return () => selected;
};

test('the checkout redirect url carries the intent return token', async () => {
  asParent();
  let createdDoc;
  mock.method(PaymentIntent, 'create', async (doc) => {
    createdDoc = doc;
    return { ...doc, _id: INTENT_ID, status: 'CREATED' };
  });
  mock.method(PaymentIntent, 'findOneAndUpdate', async (f, update) =>
    ({ _id: INTENT_ID, ...createdDoc, ...update.$set }));
  let capturedRedirect;
  mock.method(phonepe, 'createPayment', async ({ redirectUrl }) => {
    capturedRedirect = redirectUrl;
    return { providerOrderId: 'OMO1', redirectUrl: 'https://pg.example/co', state: 'PENDING' };
  });

  const res = await send('POST', '/api/payments/intents',
    { purpose: 'TOPUP', studentId: STUDENT_ID, amountRupees: 500 });
  assert.equal(res.status, 201);

  // 32 random bytes as hex. A short or predictable token would turn the
  // public route into a status oracle for anyone who can guess an ObjectId.
  assert.match(createdDoc.returnToken, /^[a-f\d]{64}$/);
  const url = new URL(capturedRedirect);
  assert.equal(url.searchParams.get('intent'), INTENT_ID);
  assert.equal(url.searchParams.get('t'), createdDoc.returnToken);
  // The token must never come back to the app that started the payment; it
  // belongs only in the URL handed to PhonePe.
  assert.equal((await res.json()).intent.returnToken, undefined);
});

test('the return page reads a verdict with the token and no session', async () => {
  const readSelect = stubFindById(publicIntentDoc());
  const settled = mock.method(settle, 'settlePaymentIntent', async () =>
    publicIntentDoc({ status: 'APPLIED' }));

  const res = await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`);

  assert.equal(res.status, 200);
  const { intent } = await res.json();
  assert.equal(intent.status, 'APPLIED');
  assert.equal(intent.purpose, 'TOPUP');
  assert.equal(intent.degradedToTopup, false);
  // Polling is the recovery path here too — an unfinished intent gets
  // re-asked of PhonePe rather than read stale off the row.
  assert.equal(settled.mock.callCount(), 1);
  assert.equal(readSelect(), '+returnToken');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('the public verdict carries no amount, student or order', async () => {
  stubFindById(publicIntentDoc({ status: 'APPLIED' }));

  const { intent } = await (await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`)).json();

  // A leaked URL must not become a statement of how much, for whom.
  assert.deepEqual(Object.keys(intent).sort(), ['degradedToTopup', 'id', 'purpose', 'status']);
});

test('a wrong, absent or malformed token is answered 404 and never settles', async () => {
  const settled = mock.method(settle, 'settlePaymentIntent', async () => null);
  stubFindById(publicIntentDoc());

  const wrong = await publicGet(INTENT_ID, `?t=${'b'.repeat(64)}`);
  const none = await publicGet(INTENT_ID);
  const empty = await publicGet(INTENT_ID, '?t=');
  // Different byte length from the stored token: timingSafeEqual throws on
  // a length mismatch, so this must be rejected before it is reached.
  const shortTok = await publicGet(INTENT_ID, '?t=abc');
  // Multi-byte characters — same trap, arriving through the query string.
  const wide = await publicGet(INTENT_ID, `?t=${encodeURIComponent('é'.repeat(64))}`);
  // Repeated ?t= makes Express parse the value as an array, not a string.
  const arrayTok = await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}&t=${RETURN_TOKEN}`);

  for (const res of [wrong, none, empty, shortTok, wide, arrayTok]) {
    assert.equal(res.status, 404);
    // One body for every rejection: the route never confirms an id exists.
    assert.equal((await res.json()).message, 'Payment not found.');
  }
  assert.equal(settled.mock.callCount(), 0);
});

test('an unknown or malformed intent id is answered 404', async () => {
  stubFindById(null);
  assert.equal((await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`)).status, 404);
  // Not an ObjectId — rejected before any query, so a flood of junk paths
  // cannot make Mongoose throw a CastError per request.
  assert.equal((await publicGet('not-an-id', `?t=${RETURN_TOKEN}`)).status, 404);
});

test('an intent with no stored token can never be read publicly', async () => {
  // Rows created before returnToken existed. They must fall back to the
  // authenticated route, not answer to an empty-string token.
  stubFindById(publicIntentDoc({ returnToken: null }));
  assert.equal((await publicGet(INTENT_ID, '?t=null')).status, 404);
  assert.equal((await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`)).status, 404);
});

test('a settled-terminal intent is returned without asking the provider again', async () => {
  stubFindById(publicIntentDoc({ status: 'FAILED' }));
  const settled = mock.method(settle, 'settlePaymentIntent', async () => null);

  const res = await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`);

  assert.equal(res.status, 200);
  assert.equal((await res.json()).intent.status, 'FAILED');
  assert.equal(settled.mock.callCount(), 0);
});

test('a settle failure still answers with the row rather than an error', async () => {
  stubFindById(publicIntentDoc());
  mock.method(settle, 'settlePaymentIntent', async () => { throw new Error('PhonePe down'); });

  const res = await publicGet(INTENT_ID, `?t=${RETURN_TOKEN}`);

  // The parent is standing at the end of a payment; a provider hiccup shows
  // them "still checking", never a 500.
  assert.equal(res.status, 200);
  assert.equal((await res.json()).intent.status, 'PENDING');
});
