// Receipt numbers are minted when the money moves, not when someone first
// asks to see the paper.
//
// The lazy pass (utils/walletReceipts.js ensureReceiptNumbers) still exists as
// the backfill for rows written before this change, and its own tests live in
// walletReceipts.test.js. What is under test here is that every receiptable
// row — a cash deposit, a UPI deposit, a UPI-funded order charge and a
// cancellation refund — is born carrying its number, so a screen that only
// reads rows (the dashboard feed) has one to show.
//
// No database: every model call is stubbed, the way the rest of the wallet
// suite does it.
import test, { after, afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.PHONEPE_ENV = 'sandbox';
process.env.PHONEPE_CLIENT_ID = 'x';
process.env.PHONEPE_CLIENT_SECRET = 'x';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Counter = (await import('../models/Counter.js')).default;
const Inventory = (await import('../models/Inventory.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { mintReceiptNumber } = await import('../utils/walletReceipts.js');
const { chargeCart } = await import('../utils/checkout.js');
const { cancelAndRefundFulfillment } = await import('../utils/refunds.js');
const { settlePaymentIntent } = await import('../src/domain/payments/settlePaymentIntent.js');
const { signAdminToken } = await import('../utils/tokens.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const PRODUCT_ID = '507f191e810c19729de860ec';
const ORDER_ID = '507f191e810c19729de860ef';
const TRANSACTION_ID = '507f191e810c19729de860ee';
const INTENT_ID = '507f1f77bcf86cd799439051';
const MERCHANT_ORDER_ID = `HH-${INTENT_ID}`;
const ADMISSION = '990123';

const token = signAdminToken(ADMIN_ID);
const accountIs = accountMatcher(Admin, ADMIN_ID);

let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

/* The per-student counter, handing out 1, 2, 3… and recording which sequence
   each caller asked for. */
const countsFrom = (start = 0) => {
  let seq = start;
  return mock.method(Counter, 'nextSequence', async () => {
    seq += 1;
    return seq;
  });
};

describe('minting a receipt number', () => {
  test('draws the next number from that student\'s own sequence', async () => {
    const counter = countsFrom(41);

    const number = await mintReceiptNumber({
      studentId: STUDENT_ID,
      admissionNumber: ADMISSION,
      date: new Date('2026-09-07T08:00:00.000Z'),
    });

    assert.equal(number, 'GMS0709990123042');
    assert.equal(counter.mock.calls[0].arguments[0], `walletReceipt:${STUDENT_ID}`);
  });

  /* A student with no admission number would mint "GMS0709undefined001" — a
     number nobody can look up. Better to leave the row unnumbered and let the
     backfill number it once the record is fixed. */
  test('declines to mint without an admission number, burning no sequence', async () => {
    const counter = countsFrom();

    const number = await mintReceiptNumber({ studentId: STUDENT_ID, admissionNumber: '' });

    assert.equal(number, null);
    assert.equal(counter.mock.callCount(), 0);
  });
});

describe('a cash deposit', () => {
  test('is numbered as the office records it', async () => {
    authenticateAdmin();
    countsFrom();
    let created;
    mock.method(WalletAdjustment, 'findOne', async () => null);
    mock.method(WalletAdjustment, 'create', async (document) => {
      created = Array.isArray(document) ? document[0] : document;
      return Array.isArray(document)
        ? [{ _id: 'wa1', ...created }]
        : { _id: 'wa1', ...created };
    });
    const stored = [];
    mock.method(WalletAdjustment, 'updateOne', async (filter, update) => {
      stored.push(update.$set);
      return { modifiedCount: 1 };
    });
    mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: STUDENT_ID,
      admissionNumber: ADMISSION,
      pocketMoney: 600,
    }));
    mock.method(Student, 'updateOne', async () => ({ modifiedCount: 1 }));
    // No parent linked: the push notification is not what is under test.
    mock.method(Parent, 'findOne', async () => null);

    const response = await fetch(`${base}/api/students/${STUDENT_ID}/topup`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'cash-once',
      },
      body: JSON.stringify({ amount: 500 }),
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    const receiptNumber = stored.find((set) => set.receiptNumber)?.receiptNumber;
    assert.match(receiptNumber, /^GMS\d{4}990123001$/);
    // and the caller is told the number, so the desk can print it at once
    assert.equal(body.adjustment.receiptNumber, receiptNumber);
  });
});

describe('a UPI deposit', () => {
  test('is numbered as the gateway money lands', async () => {
    countsFrom();
    mock.method(PaymentIntent, 'findById', async () => intentDoc());
    mock.method(PaymentIntent, 'findOneAndUpdate', async (filter, update) =>
      update?.$set?.status === 'APPLYING'
        ? intentDoc({ status: 'APPLYING' })
        : intentDoc({ status: 'APPLIED' })
    );
    mock.method(WalletAdjustment, 'findOne', async () => null);
    mock.method(Transaction, 'findOne', async () => null);
    mock.method(Student, 'findById', async () => ({
      _id: STUDENT_ID, admissionNumber: ADMISSION, pocketMoney: 40, active: true,
    }));
    mock.method(Student, 'findOneAndUpdate', async () => ({ _id: STUDENT_ID, pocketMoney: 140 }));
    let adjustment;
    mock.method(WalletAdjustment, 'create', async (docs) => {
      adjustment = Array.isArray(docs) ? docs[0] : docs;
      return [{ _id: 'wa1', ...adjustment }];
    });

    await settlePaymentIntent(INTENT_ID, {
      provider: { getOrderStatus: async () => ({ state: 'COMPLETED', amountPaise: 10000 }) },
    });

    assert.match(adjustment.receiptNumber, /^GMS\d{4}990123001$/);
  });
});

describe('a UPI-funded order charge', () => {
  test('is numbered like the desk payment it is', async () => {
    countsFrom();
    stubCatalogue();
    let document;
    mock.method(Transaction, 'create', async (doc) => {
      document = Array.isArray(doc) ? doc[0] : doc;
      return { _id: TRANSACTION_ID, ...document };
    });

    const result = await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      sourceType: 'UPI_ORDER_PAYMENT',
      sourceId: ORDER_ID,
      idempotencyKey: MERCHANT_ORDER_ID,
      funding: 'EXTERNAL',
    });

    assert.equal(result.ok, true);
    assert.match(document.receiptNumber, /^GMS\d{4}990123001$/);
  });

  /* Money spent out of the wallet was receipted when it entered the wallet.
     Numbering it again would put two pieces of paper on one rupee. */
  test('a wallet-funded charge takes no number and burns no sequence', async () => {
    const counter = countsFrom();
    stubCatalogue();
    let document;
    mock.method(Transaction, 'create', async (doc) => {
      document = Array.isArray(doc) ? doc[0] : doc;
      return { _id: TRANSACTION_ID, ...document };
    });

    await chargeCart({
      studentId: STUDENT_ID,
      items: [{ productId: PRODUCT_ID, quantity: 1 }],
      idempotencyKey: 'till-once',
    });

    assert.equal(document.receiptNumber, undefined);
    assert.equal(counter.mock.callCount(), 0);
  });
});

describe('a cancellation refund', () => {
  test('is numbered as the money goes back', async () => {
    countsFrom();
    let storedReversal = null;
    mock.method(WalletReversal, 'findOne', async () => storedReversal);
    mock.method(FulfillmentOrder, 'findById', async () => ({
      _id: ORDER_ID, status: 'PACKED', transactionId: TRANSACTION_ID, studentId: STUDENT_ID,
    }));
    mock.method(FulfillmentOrder, 'findOneAndUpdate', async () => ({
      _id: ORDER_ID, status: 'CANCELLED', transactionId: TRANSACTION_ID, studentId: STUDENT_ID,
    }));
    mock.method(Transaction, 'findById', async () => ({
      _id: TRANSACTION_ID, studentId: STUDENT_ID, totalAmount: 40,
      items: [{ productId: PRODUCT_ID, quantity: 2 }],
    }));
    mock.method(WalletReversal, 'create', async (document) => {
      storedReversal = { _id: '507f191e810c19729de860ea', ...document };
      return storedReversal;
    });
    mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: STUDENT_ID, admissionNumber: ADMISSION, pocketMoney: 90,
    }));
    mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
    const stored = [];
    mock.method(WalletReversal, 'updateOne', async (filter, update) => {
      stored.push(update.$set);
      return { modifiedCount: 1 };
    });

    const { reversal } = await cancelAndRefundFulfillment({
      orderId: ORDER_ID, actorId: ADMIN_ID, idempotencyKey: 'cancel-once', reason: 'Packing error',
    });

    const receiptNumber = stored.find((set) => set.receiptNumber)?.receiptNumber;
    assert.match(receiptNumber, /^GMS\d{4}990123001$/);
    assert.equal(reversal.receiptNumber, receiptNumber);
  });
});

function authenticateAdmin() {
  accountIs('admin');
}

function intentDoc(overrides = {}) {
  return {
    _id: INTENT_ID, parentId: 'p1', studentId: STUDENT_ID, purpose: 'TOPUP',
    pendingOrderId: null, amountPaise: 10000, merchantOrderId: MERCHANT_ORDER_ID,
    status: 'PENDING', degradedToTopup: false, ...overrides,
  };
}

/* One product, in stock, priced — enough for chargeCart to reach the write. */
function stubCatalogue() {
  mock.method(Student, 'findById', async () => ({
    _id: STUDENT_ID, admissionNumber: ADMISSION, pocketMoney: 500, active: true,
  }));
  mock.method(Inventory, 'findOne', () => ({
    populate: async () => ({
      productId: { _id: PRODUCT_ID, name: 'Milk', price: 20, active: true },
      stock: 10,
    }),
  }));
  mock.method(Inventory, 'updateOne', async () => ({ modifiedCount: 1 }));
  mock.method(Inventory, 'findOneAndUpdate', async () => ({ productId: PRODUCT_ID, stock: 9 }));
  mock.method(Student, 'findOneAndUpdate', async () => ({ _id: STUDENT_ID, pocketMoney: 480 }));
}
