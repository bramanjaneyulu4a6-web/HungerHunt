import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';
process.env.PHONEPE_ENV = 'sandbox';
process.env.PHONEPE_CLIENT_ID = 'x';
process.env.PHONEPE_CLIENT_SECRET = 'x';

const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
const PendingOrder = (await import('../models/PendingOrder.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const Student = (await import('../models/Student.js')).default;
const { settlePaymentIntent } = await import('../src/domain/payments/settlePaymentIntent.js');

/* The brief's own tests stub `phonepe` and `checkout` via mock.method() on
 * their namespace imports. That does not work on this repo (node v26.7.0):
 * mock.method() on an ES module namespace object throws
 * `TypeError: Cannot redefine property`. settlePaymentIntent instead takes
 * the provider and chargeCart as an injectable second `deps` argument, so
 * these tests pass fakes through `deps` rather than patching modules. Model
 * statics (PaymentIntent, PendingOrder, WalletAdjustment, Student) are plain
 * objects and patch fine with mock.method, exactly as elsewhere in the
 * suite (see tests/staffReports.test.js). */

afterEach(() => mock.restoreAll());

const INTENT_ID = '507f1f77bcf86cd799439051';
const ORDER_ID = '507f1f77bcf86cd799439031';
const STUDENT_ID = '507f1f77bcf86cd799439011';

const intentDoc = (overrides = {}) => ({
  _id: INTENT_ID, parentId: 'p1', studentId: STUDENT_ID, purpose: 'TOPUP',
  pendingOrderId: null, amountPaise: 10000, merchantOrderId: `HH-${INTENT_ID}`,
  status: 'PENDING', degradedToTopup: false, ...overrides,
});

const fakeProvider = (getOrderStatus) => ({ getOrderStatus });

test('a still-pending provider order moves nothing', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  const claims = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    claims.push({ filter, update });
    return Promise.resolve(null);
  });

  await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'PENDING', amountPaise: 10000 })),
  });

  assert.equal(claims.some((c) => c.update?.$set?.status === 'APPLYING'), false);
});

test('an amount mismatch is quarantined, not applied', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push(update);
    return Promise.resolve(intentDoc({ status: 'AMOUNT_MISMATCH' }));
  });

  await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 9999 })),
  });

  assert.ok(updates.some((u) => u.$set?.status === 'AMOUNT_MISMATCH'));
  assert.equal(updates.some((u) => u.$set?.status === 'APPLYING'), false);
});

test('a completed TOPUP credits the wallet exactly once through the claim', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));

  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push({ filter, update });
    // First call is the claim; report it won.
    if (update?.$set?.status === 'APPLYING') {
      return Promise.resolve(intentDoc({ status: 'APPLYING' }));
    }
    return Promise.resolve(intentDoc({ status: 'APPLIED' }));
  });
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 140 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
  });

  const claim = updates.find((u) => u.update?.$set?.status === 'APPLYING');
  assert.deepEqual(claim.filter, { _id: INTENT_ID, status: 'PENDING' });
  assert.equal(adjustment.source, 'PARENT_UPI');
  assert.equal(adjustment.amount, 100);           // rupees, converted from 10000 paise
  assert.equal(adjustment.previousBalance, 40);   // 140 after a 100 credit
  assert.equal(adjustment.newBalance, 140);
  assert.equal(String(adjustment.paymentIntentId), INTENT_ID);
  assert.equal(result.status, 'APPLIED');
});

test('a lost claim means another worker settles; nothing moves here', async () => {
  mock.method(PaymentIntent, 'findById', () =>
    Promise.resolve(intentDoc()));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(update?.$set?.status === 'APPLYING' ? null : intentDoc()));
  const credits = mock.method(Student, 'findOneAndUpdate', () => Promise.resolve(null));

  await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
  });

  assert.equal(credits.mock.callCount(), 0);
});

test('a paid ORDER whose stock died degrades to a wallet credit', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  // The stub for every intent write must echo back the ORDER purpose it was
  // claiming, and everything the real $set would have persisted (status,
  // degradedToTopup, ...) — intentDoc()'s own defaults would otherwise
  // silently mask either the ORDER branch or the final degradedToTopup flag
  // under test.
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({
      purpose: 'ORDER', pendingOrderId: ORDER_ID,
      status: 'APPLYING',
      ...(update?.$set || {}),
    })));

  // Pending order claim succeeds, totals match…
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(update?.$set?.status === 'PROCESSING'
      ? { _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100,
          items: [{ productId: 'pr1', quantity: 1, price: 100 }], status: 'PROCESSING' }
      : { _id: ORDER_ID }));

  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 100 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    // …but the charge is refused.
    chargeCart: async () => ({ ok: false, status: 409, message: 'Stock changed' }),
  });

  assert.equal(adjustment.source, 'PARENT_UPI');
  assert.equal(result.degradedToTopup, true);
});

test('a paid ORDER that still buys applies the charge and approves the order', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({
      purpose: 'ORDER', pendingOrderId: ORDER_ID,
      status: 'APPLYING',
      ...(update?.$set || {}),
    })));

  const orderUpdates = [];
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) => {
    orderUpdates.push({ filter, update });
    if (update?.$set?.status === 'PROCESSING') {
      return Promise.resolve({
        _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100,
        items: [{ productId: 'pr1', quantity: 1, price: 100 }], status: 'PROCESSING',
      });
    }
    if (update?.$set?.status === 'APPROVED') {
      return Promise.resolve({ _id: ORDER_ID, status: 'APPROVED' });
    }
    return Promise.resolve({ _id: ORDER_ID });
  });

  let chargeCartCalledWith;
  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: async (args) => {
      chargeCartCalledWith = args;
      return { ok: true, transaction: { _id: 'txn1' } };
    },
  });

  assert.equal(chargeCartCalledWith.funding, 'EXTERNAL');
  assert.equal(chargeCartCalledWith.sourceType, 'UPI_ORDER_PAYMENT');
  assert.equal(String(chargeCartCalledWith.sourceId), ORDER_ID);
  assert.ok(orderUpdates.some((u) => u.update?.$set?.status === 'APPROVED'));
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.degradedToTopup, false);
  assert.equal(result.transactionId, 'txn1');
});

test('provider FAILED marks the intent FAILED and moves nothing', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push(update);
    return Promise.resolve(intentDoc({ status: 'FAILED' }));
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'FAILED' })),
  });

  assert.ok(updates.some((u) => u.$set?.status === 'FAILED'));
  assert.equal(result.status, 'FAILED');
});

test('a terminal intent is returned as-is without re-consulting the provider', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({ status: 'APPLIED' })));
  const providerCalls = mock.fn(async () => ({ state: 'COMPLETED', amountPaise: 10000 }));

  const result = await settlePaymentIntent(INTENT_ID, { provider: fakeProvider(providerCalls) });

  assert.equal(providerCalls.mock.callCount(), 0);
  assert.equal(result.status, 'APPLIED');
});

test('an intent already APPLYING is left for the worker mid-apply', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({ status: 'APPLYING' })));
  const providerCalls = mock.fn(async () => ({ state: 'COMPLETED', amountPaise: 10000 }));

  const result = await settlePaymentIntent(INTENT_ID, { provider: fakeProvider(providerCalls) });

  assert.equal(providerCalls.mock.callCount(), 0);
  assert.equal(result.status, 'APPLYING');
});
