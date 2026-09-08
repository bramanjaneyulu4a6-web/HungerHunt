// The staff side of the wallet ledger: one student's history, the whole
// school's feed, and an admin reprinting a receipt.
//
// No database. Every model call is stubbed, because what is under test is who
// may ask, what the merge produces, and how it is paged — none of which needs
// a row to exist anywhere.
import test, { after, afterEach, before, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Counter = (await import('../models/Counter.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const { buildStudentLedger } = await import('../utils/studentLedger.js');
const { accountMatcher } = await import('./helpers/accountIs.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 200);

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const OTHER_STUDENT_ID = '507f191e810c19729de860eb';
const ADJUSTMENT_ID = '507f191e810c19729de860ac';

const token = signAdminToken(ADMIN_ID);
// A signed-in storeroom or hostel account, which is a 403 rather than a 401:
// the session is good, the account simply does not reach these routes.
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');
const caretakerToken = signStaffToken(ADMIN_ID, 'caretaker');
let server;
let base;

before(async () => {
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((resolve) => server.close(resolve)));
afterEach(() => mock.restoreAll());

const accountIs = accountMatcher(Admin, ADMIN_ID);
const authenticate = () => accountIs('admin');

const get = (path, options = {}) => fetch(base + path, {
  ...options,
  headers: { Authorization: `Bearer ${token}`, ...options.headers },
});

// The four collections a ledger is merged from, each empty until a test fills
// one. Written as chainable stubs because that is the shape the builder calls.
/* One stub, every read: the ledger listing goes sort→limit→lean, the receipt
   numbering sweep goes sort→lean, and the intent lookups stop at select. */
const chain = (rows) => ({
  sort: () => ({ limit: () => ({ lean: async () => rows }), lean: async () => rows }),
  select: () => ({
    lean: async () => rows,
    sort: () => ({ limit: () => ({ lean: async () => rows }), lean: async () => rows }),
  }),
});

/* The receipt sweep asks each ledger for its unnumbered rows with
   {receiptNumber: null}; the listing asks without it. Honouring that here is
   what keeps an already-numbered row out of the sweep, as Mongo would. */
const unnumberedOnly = (filter, rows) =>
  filter?.receiptNumber === null ? rows.filter((row) => !row.receiptNumber) : rows;

const ledgerIs = ({ topups = [], charges = [], refunds = [], failed = [] } = {}) => {
  mock.method(WalletAdjustment, 'find', (filter) => chain(unnumberedOnly(filter, topups)));
  mock.method(Transaction, 'find', (filter) => chain(unnumberedOnly(filter, charges)));
  mock.method(WalletReversal, 'find', (filter) => chain(unnumberedOnly(filter, refunds)));
  mock.method(PaymentIntent, 'find', () => chain(failed));
  mock.method(FulfillmentOrder, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  mock.method(Student, 'findById', () => ({
    select: () => ({ lean: async () => ({ _id: STUDENT_ID, admissionNumber: '990123' }) }),
  }));
};

const topUp = (id, amount, iso, source = 'ADMIN') => ({
  _id: id,
  source,
  amount,
  previousBalance: 0,
  newBalance: amount,
  receiptNumber: `GMS${id}`,
  createdAt: new Date(iso),
});

const charge = (id, amount, iso) => ({
  _id: id,
  totalAmount: amount,
  previousBalance: amount,
  remainingBalance: 0,
  createdAt: new Date(iso),
});

describe('one student, for the office', () => {
  test('the ledger carries top-ups and charges together, newest first', async () => {
    authenticate();
    ledgerIs({
      topups: [topUp('a', 500, '2026-09-01T08:00:00.000Z')],
      charges: [charge('b', 60, '2026-09-02T08:00:00.000Z')],
    });

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();

    assert.deepEqual(body.entries.map((entry) => entry.kind), ['ORDER_PAYMENT', 'TOP_UP']);
    assert.equal(body.entries[1].receiptNumber, 'GMSa');
    assert.equal(body.total, 2);
  });

  test('a UPI top-up that failed is listed, so the desk sees what a parent saw', async () => {
    authenticate();
    ledgerIs({
      failed: [{ _id: 'f', amountPaise: 25000, merchantOrderId: 'HH-1', createdAt: new Date('2026-09-03T08:00:00.000Z') }],
    });

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();

    assert.equal(body.entries[0].kind, 'TOPUP_FAILED');
    assert.equal(body.entries[0].amount, 250);
  });

  test('it pages', async () => {
    authenticate();
    ledgerIs({
      topups: [
        topUp('a', 1, '2026-09-01T08:00:00.000Z'),
        topUp('b', 2, '2026-09-02T08:00:00.000Z'),
        topUp('c', 3, '2026-09-03T08:00:00.000Z'),
      ],
    });

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger?page=2&limit=2`)).json();

    assert.deepEqual(body.entries.map((entry) => entry.amount), [1]);
    assert.equal(body.hasMore, false);
    assert.equal(body.pages, 2);
  });

  test('a charge opens into its basket and its package', async () => {
    authenticate();
    ledgerIs({ charges: [charge('507f191e810c19729de860aa', 60, '2026-09-02T08:00:00.000Z')] });
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({
        lean: async () => [{
          _id: '507f191e810c19729de860ab',
          transactionId: '507f191e810c19729de860aa',
          status: 'COLLECTED',
          items: [{ name: 'Biscuits', quantity: 2, price: 30 }],
          totalAmount: 60,
          studentSnapshot: { roomNumber: 'A-1' },
          orderedAt: new Date('2026-09-02T08:00:00.000Z'),
          deliverBy: new Date('2026-09-04T08:00:00.000Z'),
          deliveredAt: new Date('2026-09-03T08:00:00.000Z'),
          collectedAt: new Date('2026-09-03T10:00:00.000Z'),
          proofOfDelivery: { receiverName: 'Dev Caretaker', receiverPhone: '9000000013' },
        }],
      }),
    }));

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();
    const [entry] = body.entries;

    assert.deepEqual(entry.items, [{ name: 'Biscuits', quantity: 2, price: 30 }]);
    assert.equal(entry.order.status, 'COLLECTED');
    assert.equal(entry.order.room, 'A-1');
    assert.equal(entry.order.receivedBy, 'Dev Caretaker');
    assert.equal(new Date(entry.order.collectedAt).toISOString(), '2026-09-03T10:00:00.000Z');
    // The caretaker's callback number is proof-of-delivery detail, not ledger
    // detail: nothing here carries it.
    assert.equal(JSON.stringify(entry.order).includes('9000000013'), false);
  });

  test('a charge whose money went back is marked refunded, and the refund names both handles', async () => {
    authenticate();
    ledgerIs({
      charges: [charge('507f191e810c19729de860aa', 58, '2026-09-02T09:30:57.000Z')],
      refunds: [{
        _id: '507f191e810c19729de860ad',
        transactionId: '507f191e810c19729de860aa',
        fulfillmentOrderId: '507f191e810c19729de860ab',
        amount: 58,
        previousBalance: 978,
        newBalance: 1036,
        reason: 'Order cancelled',
        createdAt: new Date('2026-09-05T09:53:26.000Z'),
      }],
    });
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({
        lean: async () => [{
          _id: '507f191e810c19729de860ab',
          transactionId: '507f191e810c19729de860aa',
          status: 'CANCELLED',
          items: [],
          studentSnapshot: { roomNumber: 'A-1' },
        }],
      }),
    }));

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();
    const refund = body.entries.find((entry) => entry.kind === 'ORDER_CANCELLATION_REFUND');
    const charge_ = body.entries.find((entry) => entry.kind === 'ORDER_PAYMENT');

    // The order is CANCELLED either way; only the reversal says the family was
    // made whole, so the charge is what carries that.
    assert.equal(charge_.refunded, true);
    assert.equal(refund.orderId, '#E860AB');
    assert.equal(refund.transactionId, '507f191e810c19729de860ad');
    assert.equal(refund.reversedTransactionId, '507f191e810c19729de860aa');
  });

  test('a refund is numbered from the same series and names the UTR it gave back', async () => {
    authenticate();
    ledgerIs({
      charges: [{
        ...charge('507f191e810c19729de860aa', 58, '2026-09-02T09:30:57.000Z'),
        sourceType: 'UPI_ORDER_PAYMENT',
        idempotencyKey: 'HH-9',
        receiptNumber: 'GMS0209990123004',
      }],
      refunds: [{
        _id: '507f191e810c19729de860ad',
        transactionId: '507f191e810c19729de860aa',
        fulfillmentOrderId: '507f191e810c19729de860ab',
        amount: 58,
        previousBalance: 978,
        newBalance: 1036,
        reason: 'Order cancelled',
        receiptNumber: null,
        createdAt: new Date('2026-09-05T09:53:26.000Z'),
      }],
    });
    // The order the refund undid, and the payment whose money it gave back.
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({ lean: async () => [] }),
    }));
    mock.method(PaymentIntent, 'find', () => ({
      select: () => ({
        lean: async () => [{ merchantOrderId: 'HH-9', utr: '429812345678' }],
        sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      }),
    }));
    // An unnumbered refund is numbered on this read, like every other row.
    mock.method(Counter, 'nextSequence', async () => 7);
    mock.method(WalletReversal, 'findOneAndUpdate', (filter, update) => ({
      lean: async () => ({ _id: filter._id, receiptNumber: update.$set.receiptNumber }),
    }));

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();
    const refund = body.entries.find((entry) => entry.kind === 'ORDER_CANCELLATION_REFUND');

    assert.equal(refund.receiptNumber, 'GMS0509990123007');
    // Not a UTR of its own — a cancellation moves no money through the
    // gateway. This is the reference the money arrived on.
    assert.equal(refund.utr, '429812345678');
  });

  test('a UPI top-up carries the gateway settlement reference', async () => {
    authenticate();
    ledgerIs({
      topups: [{
        ...topUp('507f191e810c19729de860ac', 100, '2026-09-07T08:00:00.000Z', 'PARENT_UPI'),
        paymentIntentId: '507f191e810c19729de860ae',
      }],
    });
    // One model, two calls: the failed-attempt sweep chains through sort, and
    // the intent lookup stops at select.
    const intents = [{
      _id: '507f191e810c19729de860ae',
      merchantOrderId: 'HH-1',
      utr: '429812345678',
      upiApp: 'phonepe',
    }];
    mock.method(PaymentIntent, 'find', () => ({
      select: () => ({
        lean: async () => intents,
        sort: () => ({ limit: () => ({ lean: async () => [] }) }),
      }),
      sort: () => ({ limit: () => ({ lean: async () => [] }) }),
    }));

    const body = await (await get(`/api/students/${STUDENT_ID}/ledger`)).json();

    assert.equal(body.entries[0].utr, '429812345678');
    assert.equal(body.entries[0].upiApp, 'phonepe');
  });

  test("the parent's view of the same rows carries no package detail", async () => {
    ledgerIs({ charges: [charge('507f191e810c19729de860aa', 60, '2026-09-02T08:00:00.000Z')] });
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({
        lean: async () => [{
          _id: '507f191e810c19729de860ab',
          transactionId: '507f191e810c19729de860aa',
          status: 'COLLECTED',
          proofOfDelivery: { receiverName: 'Dev Caretaker' },
        }],
      }),
    }));

    const [entry] = await buildStudentLedger(STUDENT_ID);

    assert.equal(entry.order, undefined);
    assert.equal(entry.items, undefined);
  });

  test('a warehouse account cannot read a student ledger', async () => {
    accountIs('warehouse');
    const response = await get(`/api/students/${STUDENT_ID}/ledger`, {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });
    assert.equal(response.status, 403);
  });

  test('a caretaker cannot read a student ledger', async () => {
    accountIs('caretaker');
    const response = await get(`/api/students/${STUDENT_ID}/ledger`, {
      headers: { Authorization: `Bearer ${caretakerToken}` },
    });
    assert.equal(response.status, 403);
  });

  test('no token, no ledger', async () => {
    const response = await fetch(`${base}/api/students/${STUDENT_ID}/ledger`);
    assert.equal(response.status, 401);
  });
});

describe('the whole school, for the dashboard', () => {
  const feedIs = ({ topups = [], charges = [], refunds = [], failed = [] } = {}) => {
    const paged = (rows) => ({
      populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }),
      sort: () => ({ limit: () => ({ lean: async () => rows }) }),
      // The intent lookup stops at select; every other read chains on.
      select: () => ({
        lean: async () => [],
        populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => rows }) }) }),
      }),
    });
    mock.method(WalletAdjustment, 'find', () => paged(topups));
    mock.method(Transaction, 'find', () => paged(charges));
    mock.method(WalletReversal, 'find', () => paged(refunds));
    mock.method(PaymentIntent, 'find', () => paged(failed));
    mock.method(FulfillmentOrder, 'find', () => ({ select: () => ({ lean: async () => [] }) }));
  };

  const named = (row, name) => ({ ...row, studentId: { _id: STUDENT_ID, name } });

  test('credits and debits arrive in one feed, newest first, each naming its student', async () => {
    authenticate();
    feedIs({
      topups: [named(topUp('a', 500, '2026-09-01T08:00:00.000Z', 'PARENT_UPI'), 'Asha')],
      charges: [named(charge('b', 60, '2026-09-02T08:00:00.000Z'), 'Vikram')],
    });

    const body = await (await get('/api/transactions/ledger')).json();

    assert.deepEqual(body.entries.map((entry) => entry.kind), ['ORDER_PAYMENT', 'TOP_UP']);
    assert.deepEqual(body.entries.map((entry) => entry.student.name), ['Vikram', 'Asha']);
    assert.equal(body.entries[1].mode, 'UPI');
  });

  test('a day filter asks each collection for that day only', async () => {
    authenticate();
    const filters = [];
    mock.method(WalletAdjustment, 'find', (filter) => {
      filters.push(filter);
      return { populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
    });
    mock.method(Transaction, 'find', (filter) => {
      filters.push(filter);
      return { populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
    });
    mock.method(WalletReversal, 'find', (filter) => {
      filters.push(filter);
      return { populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
    });
    mock.method(PaymentIntent, 'find', (filter) => {
      filters.push(filter);
      return { populate: () => ({ sort: () => ({ limit: () => ({ lean: async () => [] }) }) }) };
    });

    await get('/api/transactions/ledger?date=2026-09-02');

    assert.equal(filters.length, 4);
    for (const filter of filters) {
      assert.ok(filter.createdAt.$gte instanceof Date, 'every collection is asked for the day');
      assert.ok(filter.createdAt.$lt > filter.createdAt.$gte);
    }
  });

  test('a warehouse account cannot read the feed', async () => {
    accountIs('warehouse');
    const response = await get('/api/transactions/ledger', {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });
    assert.equal(response.status, 403);
  });
});

describe('reprinting a receipt', () => {
  const receiptExists = (studentId = STUDENT_ID) => {
    mock.method(WalletReversal, 'findById', () => ({ lean: async () => null }));
    mock.method(WalletAdjustment, 'findById', () => ({
      lean: async () => ({
        _id: ADJUSTMENT_ID,
        studentId,
        source: 'ADMIN',
        amount: 500,
        previousBalance: 0,
        newBalance: 500,
        receiptNumber: 'GMS0709990123001',
        createdAt: new Date('2026-09-07T08:00:00.000Z'),
      }),
    }));
    mock.method(Parent, 'findOne', () => ({
      select: () => ({ lean: async () => ({ fatherName: 'Dev Parent', phone: '9000000001' }) }),
    }));
    mock.method(Student, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: STUDENT_ID,
          name: 'Asha Rao',
          admissionNumber: '990123',
          className: '9',
          section: 'B',
          roomNumber: 'A-1',
        }),
      }),
    }));
  };

  test('an admin gets the same document the parent gets', async () => {
    authenticate();
    receiptExists();

    const response = await get(`/api/students/${STUDENT_ID}/receipts/${ADJUSTMENT_ID}/pdf`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    // inline, so the console can open it in a tab rather than land it in
    // Downloads. The parent's route still sends an attachment.
    assert.match(response.headers.get('content-disposition'), /^inline; /);
    assert.match(response.headers.get('content-disposition'), /GMS0709990123001\.pdf/);
    // A PDF, not an error page rendered with the wrong header.
    const head = new Uint8Array(await response.arrayBuffer()).slice(0, 4);
    assert.equal(Buffer.from(head).toString(), '%PDF');
  });

  test('a refund prints its own document from the same route', async () => {
    authenticate();
    // The id names no adjustment, so the loader falls through to the reversal
    // ledger — one route, one button, whichever ledger the row is in.
    mock.method(WalletAdjustment, 'findById', () => ({ lean: async () => null }));
    mock.method(WalletReversal, 'findById', () => ({
      lean: async () => ({
        _id: ADJUSTMENT_ID,
        studentId: STUDENT_ID,
        transactionId: '507f191e810c19729de860aa',
        fulfillmentOrderId: '507f191e810c19729de860ab',
        amount: 58,
        previousBalance: 978,
        newBalance: 1036,
        reason: 'Order cancelled',
        receiptNumber: 'GMS0509990123014',
        createdAt: new Date('2026-09-05T09:53:26.000Z'),
      }),
    }));
    mock.method(Parent, 'findOne', () => ({
      select: () => ({ lean: async () => ({ fatherName: 'Dev Parent', phone: '9000000001' }) }),
    }));
    mock.method(Student, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: STUDENT_ID,
          name: 'Asha Rao',
          admissionNumber: '990123',
          className: '9',
          section: 'B',
          roomNumber: 'A-1',
        }),
      }),
    }));
    mock.method(FulfillmentOrder, 'findById', () => ({
      select: () => ({ lean: async () => ({ _id: '507f191e810c19729de860ab', status: 'CANCELLED' }) }),
    }));
    mock.method(Transaction, 'findById', () => ({
      select: () => ({ lean: async () => ({ sourceType: 'UPI_ORDER_PAYMENT', idempotencyKey: 'HH-9' }) }),
    }));
    mock.method(PaymentIntent, 'findOne', () => ({
      select: () => ({ lean: async () => ({ merchantOrderId: 'HH-9', utr: '429812345678' }) }),
    }));

    const response = await get(`/api/students/${STUDENT_ID}/receipts/${ADJUSTMENT_ID}/pdf`);

    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'application/pdf');
    assert.match(response.headers.get('content-disposition'), /GMS0509990123014\.pdf/);
    const head = new Uint8Array(await response.arrayBuffer()).slice(0, 4);
    assert.equal(Buffer.from(head).toString(), '%PDF');
  });

  test('a receipt belonging to another student is not found under this one', async () => {
    authenticate();
    receiptExists(OTHER_STUDENT_ID);

    const response = await get(`/api/students/${STUDENT_ID}/receipts/${ADJUSTMENT_ID}/pdf`);

    assert.equal(response.status, 404);
  });

  test('a warehouse account cannot reprint a receipt', async () => {
    accountIs('warehouse');
    const response = await get(`/api/students/${STUDENT_ID}/receipts/${ADJUSTMENT_ID}/pdf`, {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });
    assert.equal(response.status, 403);
  });
});
