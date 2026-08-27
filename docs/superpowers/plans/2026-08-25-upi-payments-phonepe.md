# UPI Payments (PhonePe Standard Checkout v2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parents pay by UPI from the parent app for exactly two things — an active pending order, or a wallet top-up for their child.

**Architecture:** A new `PaymentIntent` collection is the single record of external money. A thin PhonePe adapter (`providers/phonepe.js`) is the only file that knows the provider exists. Money moves only in `settlePaymentIntent()`, reached by webhook, by status poll, and by a reconcile script — never by the client's return-from-checkout, which is only a hint to poll. Order payments bypass the wallet (`Transaction.sourceType: 'UPI_ORDER_PAYMENT'`, balance unchanged); every failure of a captured payment degrades to a wallet credit so a parent is never out of pocket.

**Tech Stack:** Node/Express/Mongoose (ESM), PhonePe Standard Checkout v2 (OAuth `O-Bearer`, paise amounts, `paymentModeConfig` restricted to UPI), React + Capacitor (`@capacitor/browser`), node:test with `mock.method`.

**Spec:** No spec file by user decision (2026-08-25). Design was approved in chat; its decisions are restated verbatim in Global Constraints and task rationale below — this plan is self-contained.

## Global Constraints

- **UPI only.** Every create-payment call sends `paymentModeConfig.enabledPaymentModes: [{type:"UPI_INTENT"},{type:"UPI_COLLECT"},{type:"UPI_QR"}]`. No card or netbanking mode, ever — that is what keeps the 0% rate.
- **Two rails.** ORDER payments never touch `pocketMoney`. TOPUP payments only touch `pocketMoney`.
- **Degrade, never strand.** A captured payment that cannot buy its order becomes a wallet credit, recorded on the intent as `degradedToTopup: true`. No refund API in v1.
- **Client is never authority.** No route reachable from the app marks money as received. Only `settlePaymentIntent`, which re-reads status from PhonePe's server API, moves money.
- **Paise-native.** All new payment code stores/compares integer paise (`amountPaise`). Conversion to the legacy rupee ledgers happens only through `src/domain/payments/money.js`.
- **Secrets env-only:** `PHONEPE_CLIENT_ID`, `PHONEPE_CLIENT_SECRET`, `PHONEPE_CLIENT_VERSION`, `PHONEPE_ENV` (`sandbox`|`production`), `PHONEPE_WEBHOOK_USERNAME`, `PHONEPE_WEBHOOK_PASSWORD`, `PHONEPE_REDIRECT_BASE_URL`. Never committed (repo history is public).
- **Verify PhonePe URLs once at Task 3:** the endpoints below are from developer.phonepe.com as of Aug 2026; the executor of Task 3 must confirm them against the live docs before coding, and update the constants if they moved. Everything else in the plan is independent of the exact URLs.
- Tests: `cd backend && npm test` runs all (`node --test`); one file: `node --test tests/<file>.test.js`. Test style: import `app.js`, `app.listen(0)`, real `fetch`, `mock.method` on models — copy the shape of `backend/tests/staffReports.test.js`.
- Backend is ESM (`import`/`export`), Express 4, Mongoose 8. No new backend dependencies are needed (crypto and fetch are built in).
- Commit style: plain descriptive sentence (match `git log`), ending with the `Co-Authored-By: Claude …` trailer the harness requires.
- Never point anything at the production Atlas database. Local dev DB is `hungerhunt_dev` via `backend/.env`.

## File Map (who owns what)

| File | Responsibility |
|---|---|
| `backend/src/domain/payments/money.js` (new) | rupees↔paise conversion, the only place it happens |
| `backend/models/PaymentIntent.js` (new) | the external-money record |
| `backend/src/domain/payments/providers/phonepe.js` (new) | ALL PhonePe knowledge: OAuth token cache, create, status, webhook auth |
| `backend/src/domain/payments/settlePaymentIntent.js` (new) | the only function that moves money |
| `backend/controllers/paymentController.js` (new) | HTTP: create intent, read intent, webhook |
| `backend/routes/paymentRoutes.js` (new) | routes + mounting |
| `backend/scripts/reconcilePaymentIntents.js` (new) | safety net for dropped webhooks / crashed applies |
| `backend/models/WalletAdjustment.js` (modify) | grows `source: ADMIN\|PARENT_UPI` |
| `backend/models/Transaction.js` (modify) | grows `sourceType: UPI_ORDER_PAYMENT` + unique index |
| `backend/utils/checkout.js` (modify) | `chargeCart` grows `funding: 'WALLET'\|'EXTERNAL'` |
| `backend/app.js` (modify) | mount `/api/payments` |
| `frontend-parent/src/services/payments.js` (new) | API calls + poll loop + Golden Rule comment |
| `frontend-parent/src/pages/PaymentReturn.jsx` (new) | the page PhonePe redirects back to |
| `frontend-parent/src/components/PendingApprovalCard.jsx` (modify) | "Pay by UPI" button |
| `frontend-parent/src/pages/ChildDetails.jsx` (modify) | "Add money" on the **Recharges** tab |
| `frontend-parent/android/app/src/main/AndroidManifest.xml` (modify) | `<queries>` UPI package visibility |
| `frontend-parent/ios/App/App/Info.plist` (modify) | `LSApplicationQueriesSchemes` |

---

### Task 1: Money helpers (paise boundary)

**Files:**
- Create: `backend/src/domain/payments/money.js`
- Test: `backend/tests/paymentMoney.test.js`

**Interfaces:**
- Produces: `rupeesToPaise(rupees) -> integer paise` (throws on non-finite, negative, >2dp), `paiseToRupees(paise) -> number` (throws on non-integer/negative).

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/paymentMoney.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import { rupeesToPaise, paiseToRupees } from '../src/domain/payments/money.js';

test('whole and two-decimal rupees convert exactly', () => {
  assert.equal(rupeesToPaise(1), 100);
  assert.equal(rupeesToPaise(499.95), 49995);
  assert.equal(rupeesToPaise(0.01), 1);
});

test('float noise does not shave a paisa', () => {
  // 19.9 * 100 === 1989.9999999999998 in IEEE754
  assert.equal(rupeesToPaise(19.9), 1990);
});

test('invalid rupee amounts are refused', () => {
  for (const bad of [NaN, Infinity, -1, 1.005, '10', null]) {
    assert.throws(() => rupeesToPaise(bad));
  }
});

test('paise convert back and are validated', () => {
  assert.equal(paiseToRupees(49995), 499.95);
  for (const bad of [10.5, -1, NaN, '100']) {
    assert.throws(() => paiseToRupees(bad));
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/paymentMoney.test.js`
Expected: FAIL — cannot find module `money.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/src/domain/payments/money.js

/* The one place rupees and paise meet. Payment code is paise-native (PhonePe
 * transacts in integer paise); the existing wallet ledgers are rupee floats.
 * Every crossing goes through these two functions so a missed *100 or /100
 * can only ever be a bug in one file. */

export const rupeesToPaise = (rupees) => {
  if (typeof rupees !== 'number' || !Number.isFinite(rupees) || rupees < 0) {
    throw new Error(`Not a usable rupee amount: ${rupees}`);
  }
  const paise = Math.round(rupees * 100);
  // Refuse sub-paisa amounts rather than silently rounding a price that
  // should not exist (1.005 is a data bug, not a rounding job).
  if (Math.abs(paise - rupees * 100) > 1e-6) {
    throw new Error(`More than two decimal places: ${rupees}`);
  }
  return paise;
};

export const paiseToRupees = (paise) => {
  if (!Number.isInteger(paise) || paise < 0) {
    throw new Error(`Not a usable paise amount: ${paise}`);
  }
  return paise / 100;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/paymentMoney.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/payments/money.js backend/tests/paymentMoney.test.js
git commit -m "Give payments one place where rupees and paise meet"
```

---

### Task 2: PaymentIntent model

**Files:**
- Create: `backend/models/PaymentIntent.js`
- Test: `backend/tests/paymentIntentModel.test.js`

**Interfaces:**
- Produces: mongoose model `PaymentIntent` with fields `parentId`, `studentId`, `purpose ('ORDER'|'TOPUP')`, `pendingOrderId`, `amountPaise`, `merchantOrderId` (unique), `providerOrderId`, `provider ('PHONEPE')`, `status ('CREATED'|'PENDING'|'APPLYING'|'APPLIED'|'FAILED'|'EXPIRED'|'AMOUNT_MISMATCH')`, `degradedToTopup`, `transactionId`, `walletAdjustmentId`, `providerState`, `providerAmountPaise`, `failureReason`, `appliedAt`, timestamps.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/paymentIntentModel.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import PaymentIntent from '../models/PaymentIntent.js';

const base = {
  parentId: '507f1f77bcf86cd799439011',
  studentId: '507f1f77bcf86cd799439012',
  amountPaise: 49995,
  merchantOrderId: 'HH-507f1f77bcf86cd799439099',
};

test('a topup intent validates without a pendingOrderId', () => {
  const doc = new PaymentIntent({ ...base, purpose: 'TOPUP' });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.status, 'CREATED');
  assert.equal(doc.provider, 'PHONEPE');
});

test('an order intent requires its pendingOrderId', () => {
  const missing = new PaymentIntent({ ...base, purpose: 'ORDER' });
  assert.ok(missing.validateSync()?.errors?.pendingOrderId);
  const ok = new PaymentIntent({
    ...base, purpose: 'ORDER', pendingOrderId: '507f1f77bcf86cd799439013',
  });
  assert.equal(ok.validateSync(), undefined);
});

test('amountPaise must be a positive integer', () => {
  for (const bad of [0, -100, 10.5]) {
    const doc = new PaymentIntent({ ...base, purpose: 'TOPUP', amountPaise: bad });
    assert.ok(doc.validateSync()?.errors?.amountPaise, `accepted ${bad}`);
  }
});

test('merchantOrderId is indexed unique', () => {
  const unique = PaymentIntent.schema.indexes()
    .find(([keys, opts]) => keys.merchantOrderId === 1 && opts.unique);
  assert.ok(unique);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/paymentIntentModel.test.js`
Expected: FAIL — cannot find module `PaymentIntent.js`.

- [ ] **Step 3: Write minimal implementation**

```js
// backend/models/PaymentIntent.js
import mongoose from 'mongoose';

/* One row per attempt to bring outside money in — including the attempts that
 * failed, which no other ledger has a place for. The webhook, the app's
 * status poll and the reconcile script all converge on this row; its status
 * field is the lock that makes them credit exactly once.
 *
 * Lifecycle: CREATED -> PENDING -> APPLYING -> APPLIED
 * and from PENDING out to FAILED / EXPIRED / AMOUNT_MISMATCH.
 * APPLYING is a claim, same idea as PendingOrder's PROCESSING: taken with an
 * atomic findOneAndUpdate, released back to PENDING if the apply fails. */
const paymentIntentSchema = new mongoose.Schema(
  {
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Parent', required: true, index: true },
    studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true, index: true },

    purpose: { type: String, enum: ['ORDER', 'TOPUP'], required: true },

    pendingOrderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PendingOrder',
      // What an ORDER payment is for; a TOPUP has no order.
      required: function () { return this.purpose === 'ORDER'; },
      default: null,
    },

    // Integer paise, the unit PhonePe transacts in. Never rupees.
    amountPaise: {
      type: Number,
      required: true,
      validate: {
        validator: (v) => Number.isInteger(v) && v > 0,
        message: 'amountPaise must be a positive integer',
      },
    },

    // Ours; what PhonePe echoes back in webhooks and status reads.
    merchantOrderId: { type: String, required: true, maxlength: 63 },

    provider: { type: String, enum: ['PHONEPE'], default: 'PHONEPE', required: true },
    providerOrderId: { type: String, default: null },

    status: {
      type: String,
      enum: ['CREATED', 'PENDING', 'APPLYING', 'APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'],
      default: 'CREATED',
      index: true,
    },

    // Set when a captured ORDER payment could not buy its order (stock gone,
    // order expired or edited) and the money landed as wallet balance instead.
    degradedToTopup: { type: Boolean, default: false },

    // Exactly one of these once APPLIED: the purchase it funded, or the
    // top-up row it became (also the degraded case).
    transactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Transaction', default: null },
    walletAdjustmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletAdjustment', default: null },

    // What PhonePe last said, verbatim, for the audit trail.
    providerState: { type: String, default: null },
    providerAmountPaise: { type: Number, default: null },
    failureReason: { type: String, maxlength: 500, default: null },

    appliedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

paymentIntentSchema.index({ merchantOrderId: 1 }, { unique: true });
paymentIntentSchema.index({ parentId: 1, createdAt: -1 });
// The reconcile script's read: unfinished intents, oldest first.
paymentIntentSchema.index({ status: 1, updatedAt: 1 });

export default mongoose.model('PaymentIntent', paymentIntentSchema);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/paymentIntentModel.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/models/PaymentIntent.js backend/tests/paymentIntentModel.test.js
git commit -m "Record every attempt to bring outside money in as a PaymentIntent"
```

---

### Task 3: PhonePe adapter

**Files:**
- Create: `backend/src/domain/payments/providers/phonepe.js`
- Test: `backend/tests/phonepeAdapter.test.js`

**Interfaces:**
- Produces:
  - `createPayment({ merchantOrderId, amountPaise, redirectUrl }) -> { providerOrderId, redirectUrl, state, expireAt }`
  - `getOrderStatus(merchantOrderId) -> { state, amountPaise }` — state is PhonePe's (`PENDING`|`COMPLETED`|`FAILED`|`EXPIRED`)
  - `verifyWebhookAuth(authorizationHeader) -> boolean`
  - `_resetTokenCacheForTests()`
- Consumes: nothing from other tasks. Env vars from Global Constraints.

**Before coding:** open https://developer.phonepe.com/payment-gateway/website-integration/standard-checkout/api-integration/ and confirm the four endpoint paths below (token, pay, status) and the webhook auth scheme. They were verified 2026-08-25. Adjust constants only if the docs moved.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/phonepeAdapter.test.js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/phonepeAdapter.test.js`
Expected: FAIL — cannot find module `phonepe.js`.

- [ ] **Step 3: Write the implementation**

```js
// backend/src/domain/payments/providers/phonepe.js
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/phonepeAdapter.test.js`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/payments/providers/phonepe.js backend/tests/phonepeAdapter.test.js
git commit -m "Keep all PhonePe knowledge behind one adapter"
```

---

### Task 4: Ledger models learn about UPI

**Files:**
- Modify: `backend/models/WalletAdjustment.js`
- Modify: `backend/models/Transaction.js`
- Test: `backend/tests/paymentLedgerModels.test.js`

**Interfaces:**
- Produces: `WalletAdjustment` gains `source: 'ADMIN'|'PARENT_UPI'` (default `'ADMIN'`), `paymentIntentId` (required when `PARENT_UPI`, unique when present), and `performedBy` becomes required only for `ADMIN` rows. `Transaction.sourceType` gains `'UPI_ORDER_PAYMENT'` with its own one-transaction-per-order unique index.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/paymentLedgerModels.test.js
import test from 'node:test';
import assert from 'node:assert/strict';
import WalletAdjustment from '../models/WalletAdjustment.js';
import Transaction from '../models/Transaction.js';

const ID = '507f1f77bcf86cd799439011';

test('an admin adjustment still requires performedBy', () => {
  const doc = new WalletAdjustment({
    studentId: ID, amount: 100, previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.ok(doc.validateSync()?.errors?.performedBy);
});

test('a parent UPI adjustment requires paymentIntentId instead of performedBy', () => {
  const missingIntent = new WalletAdjustment({
    studentId: ID, source: 'PARENT_UPI', amount: 100,
    previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.ok(missingIntent.validateSync()?.errors?.paymentIntentId);

  const ok = new WalletAdjustment({
    studentId: ID, source: 'PARENT_UPI', paymentIntentId: ID, amount: 100,
    previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.equal(ok.validateSync(), undefined);
});

test('one wallet credit per payment intent is enforced by a unique index', () => {
  const idx = WalletAdjustment.schema.indexes().find(
    ([keys, opts]) => keys.paymentIntentId === 1 && opts.unique && opts.partialFilterExpression
  );
  assert.ok(idx);
});

test('UPI_ORDER_PAYMENT is a legal transaction source with its own uniqueness', () => {
  const doc = new Transaction({
    studentId: ID, totalAmount: 10, previousBalance: 50, remainingBalance: 50,
    sourceType: 'UPI_ORDER_PAYMENT', sourceId: ID,
  });
  assert.equal(doc.validateSync(), undefined);

  const idx = Transaction.schema.indexes().find(
    ([, opts]) => opts.partialFilterExpression?.sourceType === 'UPI_ORDER_PAYMENT' && opts.unique
  );
  assert.ok(idx);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/paymentLedgerModels.test.js`
Expected: FAIL — `PARENT_UPI` is not a valid enum value / index assertions fail.

- [ ] **Step 3: Modify the two models**

In `backend/models/WalletAdjustment.js`, change `performedBy` and add `source` + `paymentIntentId` (keep everything else, including the existing `one_wallet_adjustment_per_admin_request` index):

```js
    // Who put the money in. ADMIN rows are the office topping up at the desk
    // and carry performedBy; PARENT_UPI rows are money that arrived through a
    // payment intent and carry paymentIntentId instead. One ledger, two
    // provenances — the Tally export keeps a single funding-clearing mapping.
    source: {
      type: String,
      enum: ['ADMIN', 'PARENT_UPI'],
      default: 'ADMIN',
      required: true,
    },
    performedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Admin',
      required: function () { return this.source !== 'PARENT_UPI'; },
      index: true,
    },
    paymentIntentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PaymentIntent',
      required: function () { return this.source === 'PARENT_UPI'; },
      default: null,
    },
```

and add below the existing indexes:

```js
// DB-level backstop for the settle claim: even if two processes both think
// they won, only one top-up row per intent can ever exist.
walletAdjustmentSchema.index(
  { paymentIntentId: 1 },
  {
    unique: true,
    partialFilterExpression: { paymentIntentId: { $type: 'objectId' } },
    name: 'one_wallet_adjustment_per_payment_intent',
  }
);
```

In `backend/models/Transaction.js`, extend the enum and add an index:

```js
  sourceType: {
    type: String,
    enum: ['DIRECT_CHECKOUT', 'PARENT_APPROVAL', 'UPI_ORDER_PAYMENT'],
    default: 'DIRECT_CHECKOUT',
  },
```

```js
// Mirror of one_transaction_per_parent_approval for the externally funded
// path: one charge per pending order, however many times a webhook replays.
transactionSchema.index(
  { sourceType: 1, sourceId: 1 },
  {
    unique: true,
    partialFilterExpression: { sourceType: 'UPI_ORDER_PAYMENT' },
    name: 'one_transaction_per_upi_payment',
  }
);
```

- [ ] **Step 4: Run the new test AND the existing financial tests**

Run: `cd backend && node --test tests/paymentLedgerModels.test.js tests/financialIdempotency.test.js`
Expected: all PASS — the `source` default keeps every existing `WalletAdjustment.create` call valid.

- [ ] **Step 5: Commit**

```bash
git add backend/models/WalletAdjustment.js backend/models/Transaction.js backend/tests/paymentLedgerModels.test.js
git commit -m "Teach the wallet and purchase ledgers where UPI money comes from"
```

---

### Task 5: chargeCart learns external funding

**Files:**
- Modify: `backend/utils/checkout.js`
- Test: `backend/tests/externalFundingCheckout.test.js`

**Interfaces:**
- Consumes: `chargeCart` as it exists ([utils/checkout.js](../../backend/utils/checkout.js)).
- Produces: `chargeCart({ ..., funding: 'WALLET' | 'EXTERNAL' })` (default `'WALLET'`, behaviour unchanged). With `'EXTERNAL'`: no `debitWallet`, no wallet-control check (the parent paying directly *is* the consent the limit exists to obtain), `previousBalance === remainingBalance === student.pocketMoney` on the transaction. Also: the wallet-control spending aggregate excludes `sourceType: 'UPI_ORDER_PAYMENT'` so parent-paid orders never consume the child's own limit.

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/externalFundingCheckout.test.js
import test, { afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.NODE_ENV = 'test';

const Student = (await import('../models/Student.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const { chargeCart } = await import('../utils/checkout.js');

afterEach(() => mock.restoreAll());

const STUDENT_ID = '507f1f77bcf86cd799439011';
const PRODUCT_ID = '507f1f77bcf86cd799439021';

const stubStudent = (overrides = {}) => {
  const student = {
    _id: STUDENT_ID, active: true, pocketMoney: 40,
    walletControl: { enabled: false }, ...overrides,
  };
  mock.method(Student, 'findById', () => Promise.resolve(student));
  return student;
};

const stubInventory = () => {
  mock.method(Inventory, 'findOne', () => ({
    populate: () => Promise.resolve({
      stock: 10,
      productId: { _id: PRODUCT_ID, name: 'Samosa', price: 15, active: true },
    }),
  }));
  mock.method(Inventory, 'findOneAndUpdate', () => Promise.resolve({ stock: 8 }));
};

test('EXTERNAL funding never touches the wallet and snapshots an unchanged balance', async () => {
  stubStudent();
  stubInventory();
  const debits = [];
  mock.method(Student, 'findOneAndUpdate', (filter) => {
    debits.push(filter);
    return Promise.resolve(null); // would fail a WALLET debit; must never run
  });
  let created;
  mock.method(Transaction, 'create', (doc) => {
    created = doc;
    return Promise.resolve({ _id: 'txn1', ...doc });
  });

  const result = await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 2, price: 15 }],
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: '507f1f77bcf86cd799439031',
    idempotencyKey: 'HH-x',
    funding: 'EXTERNAL',
  });

  assert.equal(result.ok, true, result.message);
  assert.equal(debits.length, 0, 'wallet was debited on an externally funded order');
  assert.equal(created.previousBalance, 40);
  assert.equal(created.remainingBalance, 40);
  assert.equal(created.sourceType, 'UPI_ORDER_PAYMENT');
});

test('EXTERNAL funding succeeds even when the balance could not cover the bill', async () => {
  stubStudent({ pocketMoney: 0 });
  stubInventory();
  mock.method(Transaction, 'create', (doc) => Promise.resolve({ _id: 'txn1', ...doc }));

  const result = await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: 15 }],
    funding: 'EXTERNAL',
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: '507f1f77bcf86cd799439031',
  });

  assert.equal(result.ok, true, result.message);
});

test('the wallet-control aggregate excludes UPI-funded purchases', async () => {
  stubStudent({ walletControl: { enabled: true, limitAmount: 100, limitType: 'WEEKLY' } });
  stubInventory();
  let matchStage;
  mock.method(Transaction, 'aggregate', (pipeline) => {
    matchStage = pipeline[0].$match;
    return Promise.resolve([]);
  });
  const WalletReversal = (await import('../models/WalletReversal.js')).default;
  mock.method(WalletReversal, 'aggregate', () => Promise.resolve([]));
  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ pocketMoney: 25 }));
  mock.method(Transaction, 'create', (doc) => Promise.resolve({ _id: 't', ...doc }));

  await chargeCart({
    studentId: STUDENT_ID,
    items: [{ productId: PRODUCT_ID, quantity: 1, price: 15 }],
  });

  assert.deepEqual(matchStage.sourceType, { $ne: 'UPI_ORDER_PAYMENT' });
});
```

Note for the executor: `chargeCart` calls `checkPurchaseLimits`, which reads other models — if the first run fails on that, `mock.method` those reads to return `{ ok: true }`-shaped data the same way `tests/purchaseLimits.test.js` does. Adjust stubs to reality; do not weaken the three assertions.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/externalFundingCheckout.test.js`
Expected: FAIL — wallet is debited / `previousBalance` differs / aggregate has no `sourceType` filter.

- [ ] **Step 3: Modify chargeCart**

In `backend/utils/checkout.js`:

1. Signature: add `funding = 'WALLET'` to the destructured options.
2. Wallet-control block: run it only `if (funding === 'WALLET' && student.walletControl?.enabled)`, and in the `Transaction.aggregate` `$match` add `sourceType: { $ne: 'UPI_ORDER_PAYMENT' }` with this comment:

```js
        // UPI-paid orders are the parent's own money, spent with the
        // parent's own thumb on the pay button. They neither need the
        // child-spending limit's consent nor consume its allowance.
```

3. Replace the unconditional debit:

```js
  // WALLET funding spends the child's balance; EXTERNAL funding is money
  // that already arrived from outside (a parent's UPI payment), so the
  // wallet is left exactly as it was and the transaction records an
  // unchanged before/after as proof it was never touched.
  let debited = student;

  if (funding === 'WALLET') {
    debited = await debitWallet(studentId, totalAmount, { session });

    if (!debited) {
      await restoreStock(applied, session);
      return { ok: false, status: 400, message: 'Insufficient pocket money balance!' };
    }
  }
```

4. Transaction document balances:

```js
      previousBalance: funding === 'WALLET' ? debited.pocketMoney + totalAmount : student.pocketMoney,
      remainingBalance: funding === 'WALLET' ? debited.pocketMoney : student.pocketMoney,
```

5. The `catch` rollback: only `creditWallet` back `if (funding === 'WALLET')`.

- [ ] **Step 4: Run the new test AND every test that exercises chargeCart**

Run: `cd backend && node --test tests/externalFundingCheckout.test.js tests/purchaseLimits.test.js tests/multipleWeeklyOrders.test.js tests/archivedCheckout.test.js`
Expected: all PASS — default `funding: 'WALLET'` leaves existing behaviour byte-identical.

- [ ] **Step 5: Commit**

```bash
git add backend/utils/checkout.js backend/tests/externalFundingCheckout.test.js
git commit -m "Let chargeCart sell an order funded from outside the wallet"
```

---

### Task 6: settlePaymentIntent — the only function that moves money

**Files:**
- Create: `backend/src/domain/payments/settlePaymentIntent.js`
- Test: `backend/tests/settlePaymentIntent.test.js`

**Interfaces:**
- Consumes: `getOrderStatus` (Task 3), `chargeCart` with `funding: 'EXTERNAL'` (Task 5), `creditWallet` from `utils/walletAccount.js`, `withMongoTransaction`/`sessionOptions` from `utils/mongoTransaction.js`, `paiseToRupees`/`rupeesToPaise` (Task 1), models `PaymentIntent`, `PendingOrder`, `WalletAdjustment`.
- Produces: `settlePaymentIntent(intentId) -> PaymentIntent` (the fresh document, whatever its final status). Idempotent; safe to call concurrently from webhook, poll and script.

**The state machine this implements:**

```
provider says PENDING              -> leave intent PENDING (or EXPIRED if past provider expiry state)
provider says FAILED / EXPIRED     -> intent FAILED / EXPIRED, nothing moves
provider says COMPLETED, amount != intent.amountPaise -> AMOUNT_MISMATCH, nothing moves (manual case)
provider says COMPLETED, amount ok -> atomic claim PENDING->APPLYING, then in one mongo transaction:
    TOPUP  -> creditWallet + WalletAdjustment(PARENT_UPI)          -> APPLIED
    ORDER  -> claim PendingOrder PENDING->PROCESSING
              order total still equals paid amount?
              chargeCart(funding EXTERNAL) ok?
                yes -> PendingOrder APPROVED + transactionId       -> APPLIED
                no  -> release order claim, creditWallet instead   -> APPLIED, degradedToTopup
    crash anywhere -> claim released APPLYING->PENDING (fail-open, like approvePendingOrder)
```

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/settlePaymentIntent.test.js
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
const phonepe = await import('../src/domain/payments/providers/phonepe.js');
const checkout = await import('../utils/checkout.js');
const { settlePaymentIntent } = await import('../src/domain/payments/settlePaymentIntent.js');

afterEach(() => mock.restoreAll());

const INTENT_ID = '507f1f77bcf86cd799439051';
const ORDER_ID = '507f1f77bcf86cd799439031';
const STUDENT_ID = '507f1f77bcf86cd799439011';

const intentDoc = (overrides = {}) => ({
  _id: INTENT_ID, parentId: 'p1', studentId: STUDENT_ID, purpose: 'TOPUP',
  pendingOrderId: null, amountPaise: 10000, merchantOrderId: `HH-${INTENT_ID}`,
  status: 'PENDING', degradedToTopup: false, ...overrides,
});

test('a still-pending provider order moves nothing', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  mock.method(phonepe, 'getOrderStatus', async () => ({ state: 'PENDING', amountPaise: 10000 }));
  const claims = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    claims.push({ filter, update });
    return Promise.resolve(null);
  });

  await settlePaymentIntent(INTENT_ID);

  assert.equal(claims.some((c) => c.update?.$set?.status === 'APPLYING'), false);
});

test('an amount mismatch is quarantined, not applied', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  mock.method(phonepe, 'getOrderStatus', async () => ({ state: 'COMPLETED', amountPaise: 9999 }));
  const updates = [];
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) => {
    updates.push(update);
    return Promise.resolve(intentDoc({ status: 'AMOUNT_MISMATCH' }));
  });

  await settlePaymentIntent(INTENT_ID);

  assert.ok(updates.some((u) => u.$set?.status === 'AMOUNT_MISMATCH'));
  assert.equal(updates.some((u) => u.$set?.status === 'APPLYING'), false);
});

test('a completed TOPUP credits the wallet exactly once through the claim', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc()));
  mock.method(phonepe, 'getOrderStatus', async () => ({ state: 'COMPLETED', amountPaise: 10000 }));

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

  const result = await settlePaymentIntent(INTENT_ID);

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
  mock.method(phonepe, 'getOrderStatus', async () => ({ state: 'COMPLETED', amountPaise: 10000 }));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(update?.$set?.status === 'APPLYING' ? null : intentDoc()));
  const credits = mock.method(Student, 'findOneAndUpdate', () => Promise.resolve(null));

  await settlePaymentIntent(INTENT_ID);

  assert.equal(credits.mock.callCount(), 0);
});

test('a paid ORDER whose stock died degrades to a wallet credit', async () => {
  mock.method(PaymentIntent, 'findById', () => Promise.resolve(intentDoc({
    purpose: 'ORDER', pendingOrderId: ORDER_ID,
  })));
  mock.method(phonepe, 'getOrderStatus', async () => ({ state: 'COMPLETED', amountPaise: 10000 }));
  mock.method(PaymentIntent, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(intentDoc({ status: update?.$set?.status || 'APPLYING' })));

  // Pending order claim succeeds, totals match…
  mock.method(PendingOrder, 'findOneAndUpdate', (filter, update) =>
    Promise.resolve(update?.$set?.status === 'PROCESSING'
      ? { _id: ORDER_ID, studentId: STUDENT_ID, totalAmount: 100,
          items: [{ productId: 'pr1', quantity: 1, price: 100 }], status: 'PROCESSING' }
      : { _id: ORDER_ID }));
  // …but the charge is refused.
  mock.method(checkout, 'chargeCart', async () => ({ ok: false, status: 409, message: 'Stock changed' }));

  mock.method(Student, 'findOneAndUpdate', () => Promise.resolve({ _id: STUDENT_ID, pocketMoney: 100 }));
  let adjustment;
  mock.method(WalletAdjustment, 'create', (docs) => {
    adjustment = Array.isArray(docs) ? docs[0] : docs;
    return Promise.resolve([{ _id: 'wa1', ...adjustment }]);
  });

  const result = await settlePaymentIntent(INTENT_ID);

  assert.equal(adjustment.source, 'PARENT_UPI');
  assert.equal(result.degradedToTopup, true);
});
```

Note for the executor: `mock.method` on a namespace import (`phonepe`, `checkout`) only works if `settlePaymentIntent.js` calls them through the imported namespace object (`import * as phonepe from …; phonepe.getOrderStatus(...)`) — write the implementation that way, matching how these tests stub it.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/settlePaymentIntent.test.js`
Expected: FAIL — cannot find module `settlePaymentIntent.js`.

- [ ] **Step 3: Write the implementation**

```js
// backend/src/domain/payments/settlePaymentIntent.js
import PaymentIntent from '../../../models/PaymentIntent.js';
import PendingOrder from '../../../models/PendingOrder.js';
import WalletAdjustment from '../../../models/WalletAdjustment.js';
import * as phonepe from './providers/phonepe.js';
import * as checkoutModule from '../../../utils/checkout.js';
import { creditWallet } from '../../../utils/walletAccount.js';
import { withMongoTransaction, sessionOptions } from '../../../utils/mongoTransaction.js';
import { paiseToRupees, rupeesToPaise } from './money.js';

/* The only function in the codebase that turns a provider's "COMPLETED" into
 * money. The webhook calls it, the app's status poll calls it, the reconcile
 * script calls it — concurrently, repeatedly, after crashes — and the
 * PENDING->APPLYING claim plus the unique ledger indexes make all of those
 * paths credit exactly once.
 *
 * It re-reads status from PhonePe's server API every time. A webhook body or
 * a client's say-so is never the thing that moves money. */

const TERMINAL = ['APPLIED', 'FAILED', 'EXPIRED', 'AMOUNT_MISMATCH'];

const markTerminal = (intentId, fromStatus, set) =>
  PaymentIntent.findOneAndUpdate(
    { _id: intentId, status: fromStatus },
    { $set: set },
    { new: true }
  );

/* Credits the paid amount as balance. Used by TOPUP, and by ORDER when the
 * order can no longer be bought — the parent's money must land somewhere. */
const creditAsTopup = async (intent, session) => {
  const amountRupees = paiseToRupees(intent.amountPaise);
  const student = await creditWallet(intent.studentId, amountRupees, { session });

  if (!student) throw new Error(`Student ${intent.studentId} not found for credit`);

  const [adjustment] = await WalletAdjustment.create(
    [{
      studentId: intent.studentId,
      source: 'PARENT_UPI',
      paymentIntentId: intent._id,
      type: 'TOP_UP',
      amount: amountRupees,
      previousBalance: student.pocketMoney - amountRupees,
      newBalance: student.pocketMoney,
      idempotencyKey: intent.merchantOrderId,
    }],
    { ...sessionOptions(session) }
  );

  return adjustment;
};

/* Tries to buy the order with the captured money. Returns the transaction on
 * success, null when the order can no longer be bought (caller degrades). */
const applyToOrder = async (intent, session) => {
  const now = new Date();
  const order = await PendingOrder.findOneAndUpdate(
    { _id: intent.pendingOrderId, status: 'PENDING', expiresAt: { $gt: now } },
    { $set: { status: 'PROCESSING', approvalKey: intent.merchantOrderId, processingAt: now } },
    { new: true, runValidators: true, ...sessionOptions(session) }
  );

  if (!order) return null; // approved/rejected/expired since payment began

  const releaseOrder = () =>
    PendingOrder.findOneAndUpdate(
      { _id: order._id, status: 'PROCESSING', approvalKey: intent.merchantOrderId },
      { $set: { status: 'PENDING' }, $unset: { approvalKey: 1, processingAt: 1 } },
      { ...sessionOptions(session) }
    );

  // The parent paid the total they were shown. If the order was edited since
  // (the till can reprice), the paid amount no longer buys this order.
  if (rupeesToPaise(order.totalAmount) !== intent.amountPaise) {
    await releaseOrder();
    return null;
  }

  const charge = await checkoutModule.chargeCart({
    studentId: order.studentId,
    items: order.items.map((item) => ({
      productId: item.productId, quantity: item.quantity, price: item.price,
    })),
    session,
    sourceType: 'UPI_ORDER_PAYMENT',
    sourceId: order._id,
    idempotencyKey: intent.merchantOrderId,
    funding: 'EXTERNAL',
  });

  if (!charge.ok) {
    await releaseOrder();
    return null;
  }

  await PendingOrder.findOneAndUpdate(
    { _id: order._id, status: 'PROCESSING', approvalKey: intent.merchantOrderId },
    {
      $set: { status: 'APPROVED', approvedAt: new Date(), transactionId: charge.transaction._id },
      $unset: { processingAt: 1 },
    },
    { runValidators: true, ...sessionOptions(session) }
  );

  return charge.transaction;
};

export const settlePaymentIntent = async (intentId) => {
  const intent = await PaymentIntent.findById(intentId);
  if (!intent || TERMINAL.includes(intent.status)) return intent;
  if (intent.status === 'APPLYING') return intent; // another worker is mid-apply

  const provider = await phonepe.getOrderStatus(intent.merchantOrderId);

  if (provider.state === 'PENDING') return intent;

  if (provider.state === 'FAILED' || provider.state === 'EXPIRED') {
    return markTerminal(intent._id, intent.status, {
      status: provider.state === 'FAILED' ? 'FAILED' : 'EXPIRED',
      providerState: provider.state,
    }) || intent;
  }

  if (provider.state !== 'COMPLETED') {
    // A state this code has never heard of gets quarantined loudly, not paid.
    return markTerminal(intent._id, intent.status, {
      status: 'FAILED', providerState: provider.state,
      failureReason: `Unknown provider state ${provider.state}`,
    }) || intent;
  }

  if (provider.amountPaise !== intent.amountPaise) {
    // Money arrived but not the money we asked for. Never auto-apply;
    // this row is the queue for a human.
    return markTerminal(intent._id, intent.status, {
      status: 'AMOUNT_MISMATCH',
      providerState: provider.state,
      providerAmountPaise: provider.amountPaise,
      failureReason: `Provider captured ${provider.amountPaise}, intent expected ${intent.amountPaise}`,
    }) || intent;
  }

  // COMPLETED, right amount: claim it. Exactly one caller wins this write.
  const claimed = await PaymentIntent.findOneAndUpdate(
    { _id: intent._id, status: 'PENDING' },
    { $set: { status: 'APPLYING', providerState: 'COMPLETED' } },
    { new: true }
  );

  if (!claimed) return PaymentIntent.findById(intentId);

  try {
    const result = await withMongoTransaction(async (session) => {
      if (claimed.purpose === 'TOPUP') {
        const adjustment = await creditAsTopup(claimed, session);
        return { walletAdjustmentId: adjustment._id, degradedToTopup: false };
      }

      const transaction = await applyToOrder(claimed, session);
      if (transaction) {
        return { transactionId: transaction._id, degradedToTopup: false };
      }

      // The order can no longer be bought. The money still has to land:
      // wallet credit, marked so support can see what happened.
      const adjustment = await creditAsTopup(claimed, session);
      return { walletAdjustmentId: adjustment._id, degradedToTopup: true };
    });

    return await PaymentIntent.findOneAndUpdate(
      { _id: claimed._id, status: 'APPLYING' },
      {
        $set: {
          status: 'APPLIED',
          appliedAt: new Date(),
          degradedToTopup: result.degradedToTopup,
          ...(result.transactionId ? { transactionId: result.transactionId } : {}),
          ...(result.walletAdjustmentId ? { walletAdjustmentId: result.walletAdjustmentId } : {}),
        },
      },
      { new: true }
    );
  } catch (err) {
    // Fail open, exactly like approvePendingOrder: release the claim so the
    // next settle attempt (webhook retry, poll, script) can try again. The
    // unique ledger indexes make a half-applied retry safe.
    await PaymentIntent.updateOne(
      { _id: claimed._id, status: 'APPLYING' },
      { $set: { status: 'PENDING' } }
    ).catch(() => {});
    throw err;
  }
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/settlePaymentIntent.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/domain/payments/settlePaymentIntent.js backend/tests/settlePaymentIntent.test.js
git commit -m "Settle payment intents in one idempotent place"
```

---

### Task 7: HTTP surface — create intent, read intent, webhook

**Files:**
- Create: `backend/controllers/paymentController.js`
- Create: `backend/routes/paymentRoutes.js`
- Modify: `backend/app.js` (import + `app.use('/api/payments', paymentRoutes);` right after the `/api/receipts` mount at [app.js:241](../../backend/app.js#L241))
- Test: `backend/tests/paymentRoutes.test.js`

**Interfaces:**
- Consumes: `settlePaymentIntent` (Task 6), `phonepe.createPayment`/`verifyWebhookAuth` (Task 3), `rupeesToPaise` (Task 1), `protectParent` from `middleware/authMiddleware.js`, models `PaymentIntent`, `PendingOrder`, `Parent`.
- Produces, all JSON:
  - `POST /api/payments/intents` (parent auth) — body `{ purpose:'TOPUP', studentId, amountRupees }` or `{ purpose:'ORDER', pendingOrderId }` → `201 { intent: view, redirectUrl }`
  - `GET /api/payments/intents/:id` (parent auth) → `{ intent: view }` — settles on read when PENDING, so polling this IS the recovery path
  - `POST /api/payments/phonepe/webhook` (no auth middleware; verified via the credential hash) → always `200 {received:true}` once authenticated
  - `view` = `{ id, purpose, status, amountPaise, amountRupees, degradedToTopup, pendingOrderId, createdAt }` — provider ids and failureReason stay server-side.

Amount rules for TOPUP: `amountRupees` must be an integer, `1 <= amountRupees <= 20000` (UPI per-txn ceilings sit far above this; the cap bounds the blast radius of a fat-fingered zero).

- [ ] **Step 1: Write the failing test**

```js
// backend/tests/paymentRoutes.test.js
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
const phonepe = await import('../src/domain/payments/providers/phonepe.js');
const settle = await import('../src/domain/payments/settlePaymentIntent.js');
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const PARENT_ID = '507f1f77bcf86cd799439001';
const STUDENT_ID = '507f1f77bcf86cd799439011';
const ORDER_ID = '507f1f77bcf86cd799439031';
const INTENT_ID = '507f1f77bcf86cd799439051';

const parentToken = signParentToken({ _id: PARENT_ID, phone: '9999999999' });

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
  mock.method(PendingOrder, 'findOne', async () =>
    ({ _id: ORDER_ID, parentId: PARENT_ID, studentId: STUDENT_ID, status: 'PENDING',
       totalAmount: 149.5, expiresAt: new Date(Date.now() + 3600_000) }));
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
});

test('reading a pending intent settles it first', async () => {
  asParent();
  const settled = mock.method(settle, 'settlePaymentIntent', async () =>
    ({ _id: INTENT_ID, parentId: PARENT_ID, purpose: 'TOPUP', status: 'APPLIED',
       amountPaise: 50000, degradedToTopup: false, pendingOrderId: null, createdAt: new Date() }));
  mock.method(PaymentIntent, 'findOne', async () =>
    ({ _id: INTENT_ID, parentId: PARENT_ID, purpose: 'TOPUP', status: 'PENDING',
       amountPaise: 50000, degradedToTopup: false, pendingOrderId: null, createdAt: new Date() }));

  const res = await send('GET', `/api/payments/intents/${INTENT_ID}`);

  assert.equal(res.status, 200);
  assert.equal((await res.json()).intent.status, 'APPLIED');
  assert.equal(settled.mock.callCount(), 1);
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
```

Note for the executor: check `utils/tokens.js` for `signParentToken`'s real signature before assuming `{_id, phone}` — mirror how `parentController.js` calls it. If `Parent.exists` in `protectParent` uses `atTokenVersion(payload)`, the `asParent` stub already satisfies it (it matches any filter); keep assertions as written.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test tests/paymentRoutes.test.js`
Expected: FAIL — 404s everywhere (routes not mounted).

- [ ] **Step 3: Write controller, routes, and mount**

```js
// backend/controllers/paymentController.js
import PaymentIntent from '../models/PaymentIntent.js';
import PendingOrder from '../models/PendingOrder.js';
import Parent from '../models/Parent.js';
import * as phonepe from '../src/domain/payments/providers/phonepe.js';
import * as settle from '../src/domain/payments/settlePaymentIntent.js';
import { rupeesToPaise, paiseToRupees } from '../src/domain/payments/money.js';

/* The Golden Rule of gateways, enforced here by what these handlers refuse to
 * do: nothing a client can call marks money as received. createIntent starts
 * a payment; getIntent (and the webhook) hand the intent to
 * settlePaymentIntent, which asks PhonePe's server before moving anything.
 * The app returning from checkout saying "success!" changes nothing by
 * itself. */

const intentView = (intent) => ({
  id: String(intent._id),
  purpose: intent.purpose,
  status: intent.status,
  amountPaise: intent.amountPaise,
  amountRupees: paiseToRupees(intent.amountPaise),
  degradedToTopup: Boolean(intent.degradedToTopup),
  pendingOrderId: intent.pendingOrderId ? String(intent.pendingOrderId) : null,
  createdAt: intent.createdAt,
});

const TOPUP_MAX_RUPEES = 20000;

export const createPaymentIntent = async (req, res) => {
  try {
    const { purpose } = req.body || {};
    let studentId;
    let pendingOrderId = null;
    let amountPaise;

    if (purpose === 'TOPUP') {
      const { amountRupees } = req.body;
      studentId = req.body.studentId;

      if (!Number.isInteger(amountRupees) || amountRupees < 1 || amountRupees > TOPUP_MAX_RUPEES) {
        return res.status(400).json({
          message: `Amount must be a whole rupee figure between 1 and ${TOPUP_MAX_RUPEES}.`,
        });
      }

      const ownsStudent = await Parent.exists({ _id: req.parent.id, studentIds: studentId });
      if (!ownsStudent) {
        return res.status(404).json({ message: 'Student not found' });
      }

      amountPaise = rupeesToPaise(amountRupees);
    } else if (purpose === 'ORDER') {
      const order = await PendingOrder.findOne({
        _id: req.body.pendingOrderId,
        parentId: req.parent.id,
      });

      if (!order) return res.status(404).json({ message: 'This order could not be found.' });
      if (order.status !== 'PENDING' || order.expiresAt <= new Date()) {
        return res.status(409).json({ message: 'This order is no longer awaiting payment.' });
      }

      studentId = order.studentId;
      pendingOrderId = order._id;
      // Snapshot of the total the parent is being shown right now. Settle
      // re-checks it; an order edited after this point degrades to a top-up
      // rather than buying something the parent never saw.
      amountPaise = rupeesToPaise(order.totalAmount);
    } else {
      return res.status(400).json({ message: 'purpose must be TOPUP or ORDER.' });
    }

    const intent = await PaymentIntent.create({
      parentId: req.parent.id,
      studentId,
      purpose,
      pendingOrderId,
      amountPaise,
      merchantOrderId: `HH-${new PaymentIntent.base.Types.ObjectId()}`,
    });

    let created;
    try {
      created = await phonepe.createPayment({
        merchantOrderId: intent.merchantOrderId,
        amountPaise,
        redirectUrl: `${process.env.PHONEPE_REDIRECT_BASE_URL}/payment-return?intent=${intent._id}`,
      });
    } catch (err) {
      await PaymentIntent.findOneAndUpdate(
        { _id: intent._id, status: 'CREATED' },
        { $set: { status: 'FAILED', failureReason: `Provider create failed: ${err.message}` } }
      );
      return res.status(502).json({ message: 'The payment service is not answering. Nothing was charged — try again.' });
    }

    const pending = await PaymentIntent.findOneAndUpdate(
      { _id: intent._id, status: 'CREATED' },
      { $set: { status: 'PENDING', providerOrderId: created.providerOrderId } },
      { new: true }
    );

    res.status(201).json({ intent: intentView(pending || intent), redirectUrl: created.redirectUrl });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const getPaymentIntent = async (req, res) => {
  try {
    const intent = await PaymentIntent.findOne({ _id: req.params.id, parentId: req.parent.id });
    if (!intent) return res.status(404).json({ message: 'Payment not found.' });

    // Polling IS the recovery path: every read of an unfinished intent asks
    // PhonePe what actually happened, so a dropped webhook only ever delays
    // money, never loses it.
    const fresh = ['PENDING', 'APPLYING', 'CREATED'].includes(intent.status)
      ? (await settle.settlePaymentIntent(intent._id).catch(() => intent)) || intent
      : intent;

    res.set('Cache-Control', 'no-store').json({ intent: intentView(fresh) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const phonepeWebhook = async (req, res) => {
  if (!phonepe.verifyWebhookAuth(req.get('authorization'))) {
    return res.status(401).json({ message: 'Unauthorized' });
  }

  // PhonePe nests order fields under payload; tolerate both shapes.
  const merchantOrderId =
    req.body?.payload?.merchantOrderId || req.body?.merchantOrderId || null;

  if (merchantOrderId) {
    const intent = await PaymentIntent.findOne({ merchantOrderId });
    if (intent) {
      // The webhook body is a doorbell, not a bank statement: settle
      // re-reads status server-to-server and ignores what the body claims.
      await settle.settlePaymentIntent(intent._id).catch((err) => {
        console.error('Webhook settle failed for', merchantOrderId, err);
      });
    }
  }

  // Always 200 once authenticated: a 5xx would make PhonePe hammer retries
  // for problems a retry cannot fix. The reconcile script owns stragglers.
  res.json({ received: true });
};
```

```js
// backend/routes/paymentRoutes.js
import express from 'express';
import { protectParent } from '../middleware/authMiddleware.js';
import {
  createPaymentIntent,
  getPaymentIntent,
  phonepeWebhook,
} from '../controllers/paymentController.js';

const router = express.Router();

/* Parents start and watch payments. Nobody — parent, admin, or PhonePe's
   webhook — has a route that marks money received; that is settle's job,
   fed by the provider's own status API. */
router.post('/intents', protectParent, createPaymentIntent);
router.get('/intents/:id', protectParent, getPaymentIntent);

// Authenticated inside the handler by the SHA256 credential hash PhonePe
// sends; there is no bearer token to check here.
router.post('/phonepe/webhook', phonepeWebhook);

export default router;
```

In `backend/app.js`: add `import paymentRoutes from './routes/paymentRoutes.js';` with the other route imports, and `app.use('/api/payments', paymentRoutes);` directly after the `/api/receipts` mount.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && node --test tests/paymentRoutes.test.js`
Expected: PASS (8 tests). Then run the whole suite: `npm test` — no regressions.

- [ ] **Step 5: Commit**

```bash
git add backend/controllers/paymentController.js backend/routes/paymentRoutes.js backend/app.js backend/tests/paymentRoutes.test.js
git commit -m "Open the payment intent routes and the PhonePe webhook"
```

---

### Task 8: Reconcile script (the safety net)

**Files:**
- Create: `backend/scripts/reconcilePaymentIntents.js`
- Modify: `backend/package.json` (add script `"reconcile:payments": "node scripts/reconcilePaymentIntents.js"`)

**Interfaces:**
- Consumes: `settlePaymentIntent` (Task 6), `PaymentIntent` model.
- Produces: a runnable script; no exports.

No unit test — this is operational tooling in the mould of `scripts/reconcileWallets.js`. Open that file first and copy its connection/announce pattern exactly (it prints which database it is about to touch before doing anything — keep that; local `.env` points at `hungerhunt_dev`).

- [ ] **Step 1: Write the script**

```js
// backend/scripts/reconcilePaymentIntents.js
// Sweeps unfinished payment intents and settles each against PhonePe's
// status API. This is the net under the webhook: a webhook that never
// arrived, a poll the parent closed the app before, a process that died
// mid-apply — everything lands here and resolves the same way, through
// settlePaymentIntent, which is idempotent.
//
// Run it manually or from cron. It only touches intents older than
// STALE_MINUTES so it never races a payment that is genuinely in progress.

import 'dotenv/config';
import mongoose from 'mongoose';
import PaymentIntent from '../models/PaymentIntent.js';
import { settlePaymentIntent } from '../src/domain/payments/settlePaymentIntent.js';

const STALE_MINUTES = 5;

// >>> copy the "announce the target database" preamble from
// >>> scripts/reconcileWallets.js here, verbatim in style <<<

await mongoose.connect(process.env.MONGO_URI);

const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

// APPLYING included deliberately: a crash mid-apply leaves that status
// behind, and settle refuses APPLYING rows — so release the stale ones
// first. The unique ledger indexes make the re-run safe even if the
// crashed run got further than its status suggests.
const releasedStale = await PaymentIntent.updateMany(
  { status: 'APPLYING', updatedAt: { $lt: cutoff } },
  { $set: { status: 'PENDING' } }
);

const open = await PaymentIntent.find({
  status: { $in: ['CREATED', 'PENDING'] },
  updatedAt: { $lt: cutoff },
}).sort({ updatedAt: 1 }).limit(500);

let moved = 0;
const failures = [];

for (const intent of open) {
  try {
    const before = intent.status;
    const after = await settlePaymentIntent(intent._id);
    if (after && after.status !== before) moved += 1;
  } catch (err) {
    failures.push({ id: String(intent._id), error: err.message });
  }
}

console.log(`Released ${releasedStale.modifiedCount} stale APPLYING claim(s).`);
console.log(`Checked ${open.length} open intent(s); ${moved} changed state.`);
if (failures.length) {
  console.log(`Failed: ${failures.length}`);
  for (const f of failures) console.log(`  ${f.id}: ${f.error}`);
}

const mismatches = await PaymentIntent.countDocuments({ status: 'AMOUNT_MISMATCH' });
if (mismatches) {
  console.log(`ATTENTION: ${mismatches} AMOUNT_MISMATCH intent(s) need a human.`);
}

await mongoose.disconnect();
```

- [ ] **Step 2: Verify it runs against the dev database**

Run: `cd backend && npm run reconcile:payments`
Expected: connects to `hungerhunt_dev`, prints `Checked 0 open intent(s)…`, exits 0.

- [ ] **Step 3: Commit**

```bash
git add backend/scripts/reconcilePaymentIntents.js backend/package.json
git commit -m "Sweep unfinished payment intents so a lost webhook never loses money"
```

---

### Task 9: Parent-app payment service + return page

**Files:**
- Create: `frontend-parent/src/services/payments.js`
- Create: `frontend-parent/src/pages/PaymentReturn.jsx`
- Modify: `frontend-parent/src/App.jsx` (add the `/payment-return` route alongside the existing `<Route>` entries)
- Modify: `frontend-parent/package.json` (add `@capacitor/browser@^8`)

**Interfaces:**
- Consumes: `API` axios instance from `src/services/api.js`; backend routes from Task 7.
- Produces:
  - `startPayment(createFn) -> { intentId }` — creates the intent and opens checkout
  - `createOrderPayment(pendingOrderId)`, `createTopup(studentId, amountRupees)` — the two `createFn`s
  - `pollIntent(intentId, { onUpdate }) -> final intent` — resolves on a terminal status or after 5 minutes
  - `TERMINAL_STATUSES` export used by both UI surfaces.

- [ ] **Step 1: Install the browser plugin**

Run: `cd frontend-parent && npm install @capacitor/browser@^8 && npx cap sync`
Expected: installs cleanly; `cap sync` updates both native projects.

- [ ] **Step 2: Write the service**

```js
// frontend-parent/src/services/payments.js
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
```

- [ ] **Step 3: Write the return page and route**

```jsx
// frontend-parent/src/pages/PaymentReturn.jsx
import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { pollIntent, TERMINAL_STATUSES } from '../services/payments';

/* Where PhonePe's checkout redirects when the parent finishes (or abandons).
 * Shows the backend's verdict and nothing else — see the Golden Rule note in
 * services/payments.js. On native, the same intent is usually still being
 * polled by the screen that started the payment; this page is the web
 * fallback and the "I closed the app mid-payment" recovery view. */
const COPY = {
  APPLIED: { title: 'Payment received', detail: 'The money has been applied. You can head back.' },
  FAILED: { title: 'Payment failed', detail: 'Nothing was charged. You can try again from the order.' },
  EXPIRED: { title: 'Payment window closed', detail: 'The payment was not completed in time. Nothing was charged.' },
  AMOUNT_MISMATCH: { title: 'Payment needs a check', detail: 'The payment arrived but did not match. The school office will sort it out — your money is safe.' },
};

export default function PaymentReturn() {
  const [params] = useSearchParams();
  const intentId = params.get('intent');
  const [intent, setIntent] = useState(null);

  useEffect(() => {
    if (!intentId) return;
    let cancelled = false;
    pollIntent(intentId, { onUpdate: (i) => !cancelled && setIntent(i) }).catch(() => {});
    return () => { cancelled = true; };
  }, [intentId]);

  if (!intentId) return <p>This page needs a payment to look at.</p>;

  const terminal = intent && TERMINAL_STATUSES.includes(intent.status);
  const copy = terminal ? COPY[intent.status] : {
    title: 'Checking with the bank…',
    detail: 'Hold on — confirming your payment. This usually takes a few seconds.',
  };

  return (
    <div className="payment-return">
      <h2>{copy.title}</h2>
      <p>{copy.detail}</p>
      {intent?.degradedToTopup && (
        <p>
          The order could not be completed after payment, so the full amount
          was added to the wallet instead.
        </p>
      )}
      <Link to="/dashboard">Back to the app</Link>
    </div>
  );
}
```

In `App.jsx`, register `<Route path="/payment-return" element={<PaymentReturn />} />` following the pattern of the existing routes (note whether sibling routes sit inside an auth guard — this one must be reachable while logged in; it uses the parent token for polling).

- [ ] **Step 4: Lint and build**

Run: `cd frontend-parent && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add frontend-parent/src/services/payments.js frontend-parent/src/pages/PaymentReturn.jsx frontend-parent/src/App.jsx frontend-parent/package.json frontend-parent/package-lock.json
git commit -m "Give the parent app a payment service that only ever asks the backend"
```

---

### Task 10: Pay by UPI on the order, Add money on the wallet

**Files:**
- Modify: `frontend-parent/src/components/PendingApprovalCard.jsx`
- Modify: `frontend-parent/src/pages/ChildDetails.jsx`

**Interfaces:**
- Consumes: `startPayment`, `createOrderPayment`, `createTopup`, `pollIntent`, `TERMINAL_STATUSES` (Task 9).

Read both files fully before editing; match their existing state/handler idioms (`useState` + `busy` flags, the `Button` components from `components/ui`, banner-style feedback). The code below gives the logic; wire the JSX into each file's existing layout rather than restyling it.

- [ ] **Step 1: Add "Pay by UPI" to PendingApprovalCard**

Next to the existing approve confirm (`onClick={approve}` around [PendingApprovalCard.jsx:469](../../frontend-parent/src/components/PendingApprovalCard.jsx#L469)), add a second action:

```jsx
const [payState, setPayState] = useState(null); // null | 'starting' | 'polling' | intent

const payByUpi = async () => {
  setBusy(true);
  setPayState('starting');
  try {
    const { intentId } = await startPayment(() => createOrderPayment(order._id));
    setPayState('polling');
    const finalIntent = await pollIntent(intentId, { onUpdate: setPayState });
    if (finalIntent.status === 'APPLIED') {
      onResolved?.(order._id); // same refresh callback the approve path uses
    }
    setPayState(finalIntent);
  } catch (err) {
    setPayState({ status: 'FAILED', message: err.response?.data?.message || 'Could not start the payment.' });
  } finally {
    setBusy(false);
  }
};
```

Render alongside the approve button:
- a `Pay by UPI` button (disabled while `busy || edited`, same guards as approve minus `insufficient` — paying by UPI is exactly what an insufficient balance needs);
- while `payState === 'polling'` or a non-terminal intent: "Waiting for the bank…";
- terminal states: reuse the wording from `PaymentReturn.jsx`'s `COPY`, including the `degradedToTopup` sentence.

- [ ] **Step 2: Add "Add money" to ChildDetails' Recharges tab**

This goes on the **Recharges** tab — the panel at [ChildDetails.jsx:600](../../frontend-parent/src/pages/ChildDetails.jsx#L600) (`activeTab === 'recharges'`), which already lists this student's paged top-up history from `/parent/child/:id/recharges` via the `recharges` list at [ChildDetails.jsx:286](../../frontend-parent/src/pages/ChildDetails.jsx#L286). That is where a parent already goes to see money going in, so it is where money goes in.

Do **not** put it on the `wallet` tab ([ChildDetails.jsx:654](../../frontend-parent/src/pages/ChildDetails.jsx#L654)) — that tab is the spending-limit controls (`walletControl` enable/limit/period) and has nothing to do with adding funds.

Put the "add money" form **above** the history list in the recharges panel, so the action is the first thing on the tab and the history reads as its record. The state cluster for this page starts near [ChildDetails.jsx:183](../../frontend-parent/src/pages/ChildDetails.jsx#L183):

```jsx
const [topupAmount, setTopupAmount] = useState('');
const [topupState, setTopupState] = useState(null);

const addMoney = async () => {
  const amountRupees = Number(topupAmount);
  if (!Number.isInteger(amountRupees) || amountRupees < 1 || amountRupees > 20000) {
    setTopupState({ status: 'INVALID', message: 'Enter a whole rupee amount between 1 and 20,000.' });
    return;
  }
  setTopupState({ status: 'STARTING' });
  try {
    const { intentId } = await startPayment(() => createTopup(id, amountRupees));
    const finalIntent = await pollIntent(intentId, { onUpdate: setTopupState });
    setTopupState(finalIntent);
    if (finalIntent.status === 'APPLIED') {
      // Two things are now stale: the balance shown on this page, and the
      // recharge history immediately below this form — the parent's own
      // top-up must appear in it without a manual reload.
      refreshWallet();      // reuse the page's existing wallet re-fetch
      recharges.reload?.(); // the usePagedList at ChildDetails.jsx:286
    }
  } catch (err) {
    setTopupState({ status: 'FAILED', message: err.response?.data?.message || 'Could not start the payment.' });
  }
};
```

UI, inside the `recharges` tabpanel and above the existing history list: numeric input (`inputMode="numeric"`), quick-pick buttons for ₹100 / ₹200 / ₹500, an `Add money by UPI` button, and the same status copy as above.

Read `usePagedList` before wiring the reload — use whatever refresh affordance it actually exposes rather than assuming `.reload()`. If it exposes none, say so in your report rather than inventing one or refetching by hand; a stale list is a reportable gap, not something to hack around.

On `APPLIED`, both the balance line and the recharge history must visibly update.

- [ ] **Step 3: Lint and build**

Run: `cd frontend-parent && npm run lint && npm run build`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add frontend-parent/src/components/PendingApprovalCard.jsx frontend-parent/src/pages/ChildDetails.jsx
git commit -m "Let a parent pay an order or top up the wallet over UPI"
```

---

### Task 11: Native package visibility for the UPI intent drawer

**Files:**
- Modify: `frontend-parent/android/app/src/main/AndroidManifest.xml`
- Modify: `frontend-parent/ios/App/App/Info.plist`

**Why:** Android 11+ package-visibility rules hide other apps unless declared, and iOS's `canOpenURL` needs schemes whitelisted — without these, PhonePe's checkout page cannot see or launch the installed UPI apps and the intent drawer comes up empty.

- [ ] **Step 1: Android `<queries>`**

In `AndroidManifest.xml`, as a direct child of `<manifest>` (sibling of `<application>`):

```xml
    <!-- Android 11+ hides other packages unless declared. The PhonePe checkout
         opened from this app needs to see the installed UPI apps to build the
         intent drawer; without these it looks like the parent has none. -->
    <queries>
        <package android:name="com.phonepe.app" />                       <!-- PhonePe -->
        <package android:name="com.google.android.apps.nbu.paisa.user" /><!-- Google Pay -->
        <package android:name="net.one97.paytm" />                       <!-- Paytm -->
        <package android:name="in.org.npci.upiapp" />                    <!-- BHIM -->
        <package android:name="com.csam.icici.bank.imobile" />           <!-- iMobile -->
        <intent>
            <!-- Any other app registered for upi://pay, so a parent on a
                 bank app not listed above still gets an entry. -->
            <action android:name="android.intent.action.VIEW" />
            <data android:scheme="upi" android:host="pay" />
        </intent>
    </queries>
```

- [ ] **Step 2: iOS `LSApplicationQueriesSchemes`**

In `ios/App/App/Info.plist`, inside the top-level `<dict>`:

```xml
    <key>LSApplicationQueriesSchemes</key>
    <array>
        <string>phonepe</string>
        <string>tez</string>
        <string>gpay</string>
        <string>paytm</string>
        <string>bhim</string>
        <string>upi</string>
    </array>
```

- [ ] **Step 3: Verify both builds still assemble**

Run: `cd frontend-parent && npm run build && npx cap sync`
Then: `cd android && ./gradlew assembleDebug`
Expected: both succeed. (iOS build is checked on the Mac's next Xcode build; the plist edit is inert XML.)

- [ ] **Step 4: Commit**

```bash
git add frontend-parent/android/app/src/main/AndroidManifest.xml "frontend-parent/ios/App/App/Info.plist"
git commit -m "Declare the UPI apps so the intent drawer can find them"
```

---

### Task 12: Documentation

**Files:**
- Modify: `docs/architecture/openapi.yaml` — add `/payments/intents` (POST, GET by id) and `/payments/phonepe/webhook`, request/response shapes exactly as Task 7 defines them, following the file's existing style.
- Modify: `docs/architecture/product-decisions.md` — add a short numbered section: UPI via PhonePe Standard Checkout v2, UPI-only modes (0% MDR), two rails, degrade-to-wallet instead of refunds in v1, closed-loop wallet (no cash-out — keeps the closed-system PPI exemption; a "withdraw to bank" feature would change regulatory status and must not be added casually), settle-only money movement, `AMOUNT_MISMATCH` is a human queue surfaced by the reconcile script.
- Modify: `docs/architecture/implementation-status.md` — record what shipped and what is deliberately absent (no refund API, no admin payments screen, iOS untested on hardware per the push-notification precedent).

- [ ] **Step 1: Write the three doc updates** (match each file's existing voice; no code)
- [ ] **Step 2: Commit**

```bash
git add docs/architecture/openapi.yaml docs/architecture/product-decisions.md docs/architecture/implementation-status.md
git commit -m "Write the UPI payment decisions down"
```

---

## Post-plan: sandbox verification (manual, with the user)

Not a task for an executor — needs the user's PhonePe Business sandbox credentials and a device:

1. User registers on the PhonePe Business dashboard, collects sandbox `CLIENT_ID`/`CLIENT_SECRET`/`CLIENT_VERSION`, sets webhook URL + username/password (webhook needs a public HTTPS URL — the Render backend or a tunnel for local).
2. Fill `backend/.env` (never committed), set `PHONEPE_REDIRECT_BASE_URL` to the deployed parent web app origin.
3. Android emulator run (existing AVD + `adb reverse` setup from the push-testing work): top-up ₹1, pay an order, kill the app mid-payment and reopen (poll recovery), fire `npm run reconcile:payments` with the webhook URL deliberately wrong (sweep recovery).
4. Production cutover checklist: production credentials, `PHONEPE_ENV=production`, webhook URL on Render, cron for `reconcile:payments` (Render cron job, every 10 min), and a ₹1 live transaction before announcing.
