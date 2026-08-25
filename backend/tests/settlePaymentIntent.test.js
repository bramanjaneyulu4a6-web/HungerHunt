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
const Transaction = (await import('../models/Transaction.js')).default;
const Student = (await import('../models/Student.js')).default;
const { settlePaymentIntent } = await import('../src/domain/payments/settlePaymentIntent.js');

/* The brief's own tests stub `phonepe` and `checkout` via mock.method() on
 * their namespace imports. That does not work on this repo (node v26.7.0):
 * mock.method() on an ES module namespace object throws
 * `TypeError: Cannot redefine property`. settlePaymentIntent instead takes
 * the provider and chargeCart as an injectable second `deps` argument, so
 * these tests pass fakes through `deps` rather than patching modules. Model
 * statics (PaymentIntent, PendingOrder, WalletAdjustment, Transaction,
 * Student) are plain objects and patch fine with mock.method, exactly as
 * elsewhere in the suite (see tests/staffReports.test.js). */

afterEach(() => mock.restoreAll());

const INTENT_ID = '507f1f77bcf86cd799439051';
const ORDER_ID = '507f1f77bcf86cd799439031';
const STUDENT_ID = '507f1f77bcf86cd799439011';
const MERCHANT_ORDER_ID = `HH-${INTENT_ID}`;

const intentDoc = (overrides = {}) => ({
  _id: INTENT_ID, parentId: 'p1', studentId: STUDENT_ID, purpose: 'TOPUP',
  pendingOrderId: null, amountPaise: 10000, merchantOrderId: MERCHANT_ORDER_ID,
  status: 'PENDING', degradedToTopup: false, ...overrides,
});

const fakeProvider = (getOrderStatus) => ({ getOrderStatus });

// Every claimed intent now runs findPriorApplication() before doing
// anything. Most tests are exercising a fresh (non-replay) settle, so both
// lookups come back empty.
const noPriorApplication = () => {
  mock.method(WalletAdjustment, 'findOne', async () => null);
  mock.method(Transaction, 'findOne', async () => null);
};

// The claim write for an ORDER-purpose intent must echo back the purpose it
// was claiming, and everything the real $set would have persisted (status,
// degradedToTopup, ...) — intentDoc()'s own defaults would otherwise
// silently mask either the ORDER branch or the final degradedToTopup flag
// under test. (This is the bug found in the brief's own reference tests:
// its stub only echoed `status`, so purpose silently reverted to the
// default 'TOPUP' and the ORDER branch was never actually exercised.)
const orderIntentClaimStub = (filter, update) =>
  Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
    status: 'APPLYING',
    ...(update?.$set || {}),
  }));

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
  noPriorApplication();

  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push({ filter, update });
    // First call is the claim; report it won.
    if (update?.$set?.status === 'APPLYING') {
      return Promise.resolve(intentDoc({ status: 'APPLYING' }));
    }
    return Promise.resolve(intentDoc({ status: 'APPLIED' }));
  });
  // Pre-credit balance: WalletAdjustment is now written before the wallet
  // is credited, so creditAsTopup reads the student's current balance via
  // findById first, then $inc's it.
  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 40, active: true }));
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
  assert.equal(adjustment.previousBalance, 40);
  assert.equal(adjustment.newBalance, 140);       // 40 + a 100 credit
  assert.equal(String(adjustment.paymentIntentId), INTENT_ID);
  assert.equal(adjustment.idempotencyKey, MERCHANT_ORDER_ID); // load-bearing for the shared unique index
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
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  noPriorApplication();

  // Pending order claim succeeds, totals match…
  const orderUpdates = [];
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) => {
    orderUpdates.push({ filter, update });
    return Promise.resolve(update?.$set?.status === 'PROCESSING'
      ? { _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100,
          items: [{ productId: 'pr1', quantity: 1, price: 100 }], status: 'PROCESSING' }
      : { _id: ORDER_ID });
  });

  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 0, active: true }));
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
  // releaseOrder() must actually have run: the claimed order goes back to
  // PENDING with its approvalKey/processingAt cleared, distinguishing this
  // charge-refusal degrade from a reprice degrade (covered separately below)
  // that never even reaches chargeCart.
  assert.ok(orderUpdates.some((u) =>
    u.update?.$set?.status === 'PENDING' && u.update?.$unset?.approvalKey === 1));
});

test('a paid ORDER whose total was repriced since payment degrades without ever charging', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  noPriorApplication();

  const orderUpdates = [];
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) => {
    orderUpdates.push({ filter, update });
    if (update?.$set?.status === 'PROCESSING') {
      // Repriced since the parent paid: 150 rupees no longer matches the
      // 10000 paise (100 rupees) captured on the intent.
      return Promise.resolve({
        _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 150,
        items: [{ productId: 'pr1', quantity: 1, price: 150 }], status: 'PROCESSING',
      });
    }
    return Promise.resolve({ _id: ORDER_ID });
  });

  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 0, active: true }));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 100 }));
  mock.method(WalletAdjustment, 'create', (docs) => {
    const adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  let chargeCartCalls = 0;
  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: async () => {
      chargeCartCalls += 1;
      return { ok: true, transaction: { _id: 'should-not-happen' } };
    },
  });

  // This is what fails if the total-match check is ever removed or inverted:
  // a repriced order must degrade before chargeCart is ever called.
  assert.equal(chargeCartCalls, 0);
  assert.ok(orderUpdates.some((u) =>
    u.update?.$set?.status === 'PENDING' && u.update?.$unset?.approvalKey === 1));
  assert.equal(result.degradedToTopup, true);
});

test('a paid ORDER whose total no longer converts to paise degrades instead of looping forever', async () => {
  // rupeesToPaise throws by design on a total with more than two decimal
  // places. If the order is edited to such a total AFTER capture, an
  // unguarded conversion would throw mid-settle on every retry — webhook,
  // poll, sweep — looping the intent PENDING ⇄ APPLYING forever with the
  // parent's money stuck. It must instead be treated as "this order can no
  // longer be bought": claim released, no charge, money lands as a wallet
  // credit.
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  noPriorApplication();

  const orderUpdates = [];
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) => {
    orderUpdates.push({ filter, update });
    if (update?.$set?.status === 'PROCESSING') {
      // 100.005 rupees is not a whole-paise amount: rupeesToPaise refuses it.
      return Promise.resolve({
        _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100.005,
        items: [{ productId: 'pr1', quantity: 1, price: 100.005 }], status: 'PROCESSING',
      });
    }
    return Promise.resolve({ _id: ORDER_ID });
  });

  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 0, active: true }));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 100 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  let chargeCartCalls = 0;
  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: async () => {
      chargeCartCalls += 1;
      return { ok: true, transaction: { _id: 'should-not-happen' } };
    },
  });

  assert.equal(chargeCartCalls, 0);
  // The claim was released, not stranded at PROCESSING.
  assert.ok(orderUpdates.some((u) =>
    u.update?.$set?.status === 'PENDING' && u.update?.$unset?.approvalKey === 1));
  // Invariant 2: the captured money landed as a wallet credit, visibly marked.
  assert.equal(adjustment.source, 'PARENT_UPI');
  assert.equal(result.degradedToTopup, true);
  assert.equal(result.status, 'APPLIED');
});

test('a paid ORDER that still buys applies the charge and approves the order', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  noPriorApplication();

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
  assert.equal(chargeCartCalledWith.idempotencyKey, MERCHANT_ORDER_ID); // load-bearing for the shared unique index
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

test('provider EXPIRED marks the intent EXPIRED and moves nothing', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push(update);
    return Promise.resolve(intentDoc({ status: 'EXPIRED' }));
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'EXPIRED' })),
  });

  assert.ok(updates.some((u) => u.$set?.status === 'EXPIRED'));
  assert.equal(result.status, 'EXPIRED');
});

test('an unrecognised provider state is recorded but stays open — never terminal, never paid', async () => {
  // The old behaviour marked these FAILED, permanently: the parent's app said
  // "nothing was charged", the parent completed the payment in their UPI app
  // anyway, and no webhook, poll or sweep ever consulted PhonePe about the
  // intent again — captured money, invisible forever. The fixed behaviour
  // leaves the intent where it is (so the sweep keeps re-asking PhonePe),
  // records the verbatim state and a failureReason for the operator, and
  // moves no money. Worst case is "still checking", never a false "nothing
  // was charged".
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push({ filter, update });
    return Promise.resolve(intentDoc({ ...(update?.$set || {}) }));
  });
  const credits = mock.method(Student, 'findOneAndUpdate', () => Promise.resolve(null));

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'SOME_NEW_STATE' })),
  });

  // No write may touch status at all: not FAILED, not any other terminal
  // state, and not the APPLYING claim either.
  assert.equal(updates.some((u) => u.update?.$set?.status !== undefined), false);

  // But it is not silent: the verbatim state and a reason are recorded, on a
  // status-guarded update so a concurrent settle is never clobbered.
  const recorded = updates.find((u) => u.update?.$set?.providerState === 'SOME_NEW_STATE');
  assert.ok(recorded);
  assert.match(recorded.update.$set.failureReason, /SOME_NEW_STATE/);
  assert.deepEqual(recorded.filter, { _id: INTENT_ID, status: 'PENDING' });

  // Still open — the sweep's CREATED/PENDING filter keeps finding it — and
  // no money moved.
  assert.equal(result.status, 'PENDING');
  assert.equal(credits.mock.callCount(), 0);
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

test('a lost race on marking terminal re-fetches instead of returning null', async () => {
  // Simulates: this call read the intent as PENDING, but by the time its
  // markTerminal write lands, another caller has already moved it (e.g. to
  // APPLYING) — the filter {_id, status: fromStatus} matches nothing and
  // findOneAndUpdate resolves null. The old `... || intent` never awaited
  // the promise (always truthy) and so never triggered; this asserts the
  // fixed behaviour re-fetches the fresh document instead of surfacing null.
  let findByIdCalls = 0;
  mock.method(PaymentIntent, 'findById', () => {
    findByIdCalls += 1;
    return Promise.resolve(findByIdCalls === 1 ? intentDoc() : intentDoc({ status: 'APPLYING' }));
  });
  mock.method(PaymentIntent, 'findOneAndUpdate', () => Promise.resolve(null));

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'FAILED' })),
  });

  assert.equal(findByIdCalls, 2);
  assert.ok(result);
  assert.equal(result.status, 'APPLYING');
});

test('a crashed-then-replayed ORDER settle finds the prior transaction and never re-charges', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  mock.method(WalletAdjustment, 'findOne', async () => null);
  mock.method(Transaction, 'findOne', async (filter) => {
    assert.equal(filter.sourceType, 'UPI_ORDER_PAYMENT');
    assert.equal(String(filter.sourceId), ORDER_ID);
    assert.equal(filter.idempotencyKey, MERCHANT_ORDER_ID); // scoped to this intent, not just the order
    return { _id: 'txn-original' };
  });

  const orderClaims = mock.method(PendingOrder, 'findOneAndUpdate', () => Promise.resolve(null));
  const chargeCartCalls = mock.fn(async () => ({ ok: true, transaction: { _id: 'txn-should-not-happen' } }));
  const walletCreates = mock.method(WalletAdjustment, 'create', async () => [{ _id: 'wa-should-not-happen' }]);

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: chargeCartCalls,
  });

  assert.equal(orderClaims.mock.callCount(), 0); // applyToOrder never even attempted the claim
  assert.equal(chargeCartCalls.mock.callCount(), 0);
  assert.equal(walletCreates.mock.callCount(), 0);
  assert.equal(result.transactionId, 'txn-original');
  assert.equal(result.degradedToTopup, false);
  assert.equal(result.status, 'APPLIED');
});

test('a crashed-then-replayed TOPUP settle finds the prior adjustment and never credits again', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({ status: 'APPLYING', ...(update?.$set || {}) })));
  mock.method(WalletAdjustment, 'findOne', async (filter) => {
    assert.equal(String(filter.paymentIntentId), INTENT_ID);
    return { _id: 'wa-original' };
  });

  const walletCreates = mock.method(WalletAdjustment, 'create', async () => [{ _id: 'wa-should-not-happen' }]);
  const credits = mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 999 }));
  const studentReads = mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 999 }));

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
  });

  assert.equal(walletCreates.mock.callCount(), 0);
  assert.equal(credits.mock.callCount(), 0);
  assert.equal(studentReads.mock.callCount(), 0);
  assert.equal(result.walletAdjustmentId, 'wa-original');
  assert.equal(result.degradedToTopup, false);
  assert.equal(result.status, 'APPLIED');
});

test('a crashed-then-replayed degraded ORDER settle finds the prior credit, not a second one', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  // A prior attempt already degraded this intent to a wallet credit — the
  // WalletAdjustment exists even though this is an ORDER-purpose intent.
  mock.method(WalletAdjustment, 'findOne', async () => ({ _id: 'wa-degraded-original' }));
  const transactionLookup = mock.method(Transaction, 'findOne', async () => null);

  const orderClaims = mock.method(PendingOrder, 'findOneAndUpdate', () => Promise.resolve(null));
  const walletCreates = mock.method(WalletAdjustment, 'create', async () => [{ _id: 'wa-should-not-happen' }]);

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: async () => { throw new Error('must not be called'); },
  });

  assert.equal(transactionLookup.mock.callCount(), 0); // adjustment found first; never even checks Transaction
  assert.equal(orderClaims.mock.callCount(), 0);
  assert.equal(walletCreates.mock.callCount(), 0);
  assert.equal(result.walletAdjustmentId, 'wa-degraded-original');
  assert.equal(result.degradedToTopup, true); // still recorded as a degrade, not a fresh top-up
  assert.equal(result.status, 'APPLIED');
});

test('a second intent against the same pendingOrderId does not steal the first intent\'s transaction', async () => {
  // PaymentIntent carries no unique index on pendingOrderId (Task 7, which
  // creates intents, isn't written yet), so nothing stops a parent abandoning
  // a stuck attempt and creating a second intent for the same PENDING order.
  // If both complete, the second intent's findPriorApplication lookup must
  // not match the FIRST intent's Transaction just because it targets the
  // same order — that would finish the second intent APPLIED carrying
  // someone else's transactionId, with the second payment landing nowhere.
  const FIRST_INTENT_MERCHANT_ORDER_ID = 'HH-first-attempt';
  const SECOND_INTENT_MERCHANT_ORDER_ID = MERCHANT_ORDER_ID; // this settle's own intent

  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID, merchantOrderId: SECOND_INTENT_MERCHANT_ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({
      purpose: 'ORDER', pendingOrderId: ORDER_ID, merchantOrderId: SECOND_INTENT_MERCHANT_ORDER_ID,
      status: 'APPLYING',
      ...(update?.$set || {}),
    })));
  mock.method(WalletAdjustment, 'findOne', async () => null);

  // A fake single-document Transaction collection: only the FIRST intent's
  // key is on the existing row. A generic field-by-field match (not a
  // hand-picked check) is what proves the filter itself is intent-scoped —
  // if `idempotencyKey` were missing from the real filter, this same stub
  // would still (incorrectly) match on sourceType/sourceId alone.
  const existingTransaction = {
    _id: 'txn-first-intent', sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: ORDER_ID, idempotencyKey: FIRST_INTENT_MERCHANT_ORDER_ID,
  };
  mock.method(Transaction, 'findOne', async (filter) =>
    (Object.entries(filter).every(([key, value]) => String(existingTransaction[key]) === String(value))
      ? existingTransaction
      : null));

  // The order is no longer PENDING — the first intent already bought it —
  // so this second intent's own claim attempt correctly fails, and the
  // money must degrade to a top-up rather than vanish.
  mock.method(PendingOrder, 'findOneAndUpdate', () => Promise.resolve(null));
  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 0, active: true }));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 100 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa-second-intent', ...adjustment }]);
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
    chargeCart: async () => { throw new Error('must not be called — order is no longer PENDING'); },
  });

  assert.notEqual(result.transactionId, 'txn-first-intent');
  assert.equal(result.walletAdjustmentId, 'wa-second-intent');
  assert.equal(result.degradedToTopup, true);
  assert.equal(adjustment.idempotencyKey, SECOND_INTENT_MERCHANT_ORDER_ID);
});

test('a completed payment for an inactive student still credits the wallet and reaches APPLIED', async () => {
  // creditWallet matches by _id alone (activeOnly defaults false), so a
  // captured payment for a since-deactivated student must credit fine
  // rather than throw — a throw here releases the claim and every retry
  // (webhook, poll, sweep) hits the same wall forever, and the provider's
  // captured money never lands anywhere.
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  noPriorApplication();
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({ status: 'APPLYING', ...(update?.$set || {}) })));
  mock.method(Student, 'findById', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 40, active: false }));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 140 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  const result = await settlePaymentIntent(INTENT_ID, {
    provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
  });

  assert.equal(adjustment.source, 'PARENT_UPI');
  assert.equal(adjustment.amount, 100);
  assert.equal(adjustment.previousBalance, 40);
  assert.equal(adjustment.newBalance, 140);
  assert.equal(result.status, 'APPLIED');
  assert.equal(result.degradedToTopup, false);
});

test('a throwing charge releases both the intent claim and the order claim (fail-open) and rethrows', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(PaymentIntent, 'findOneAndUpdate', orderIntentClaimStub);
  noPriorApplication();

  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(update?.$set?.status === 'PROCESSING'
      ? { _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100,
          items: [{ productId: 'pr1', quantity: 1, price: 100 }], status: 'PROCESSING' }
      : null));

  const intentReleases = [];
  mock.method(PaymentIntent, 'updateOne', (filter, update) => {
    intentReleases.push({ filter, update });
    return Promise.resolve({});
  });
  const orderReleases = [];
  mock.method(PendingOrder, 'updateOne', (filter, update) => {
    orderReleases.push({ filter, update });
    return Promise.resolve({});
  });

  await assert.rejects(
    () => settlePaymentIntent(INTENT_ID, {
      provider: fakeProvider(async () => ({ state: 'COMPLETED', amountPaise: 10000 })),
      chargeCart: async () => { throw new Error('boom'); },
    }),
    /boom/
  );

  assert.ok(intentReleases.some((c) =>
    c.filter.status === 'APPLYING' && c.update.$set.status === 'PENDING'));
  assert.ok(orderReleases.some((c) =>
    c.filter.status === 'PROCESSING' && c.update.$set.status === 'PENDING' && c.update.$unset.approvalKey === 1));
});
