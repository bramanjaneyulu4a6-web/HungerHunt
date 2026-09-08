// The parent-facing endpoints, at the points where they were sending more than
// the app reads or accepting more than they should.
//
// No database: every model call these routes make is stubbed, which is enough
// because what is under test is the shape of the response and the rules applied
// before any query runs.
import test, { before, beforeEach, afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const mongoose = (await import('mongoose')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
const Counter = (await import('../models/Counter.js')).default;
const firebasePhoneAuth = (await import('../utils/firebasePhoneAuth.js')).default;
const { authLimiter } = await import('../middleware/rateLimit.js');
const { signAdminToken, signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';

const ADMIN_ID = '507f1f77bcf86cd799439012';

const adminToken = signAdminToken(ADMIN_ID);
const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

// protectParent asks whether the session is still live: the account exists and
// its tokenVersion still matches the one stamped into the token. Every test
// here is about something else, so the answer is always yes. What happens when
// it is no is in parentSessions.test.js.
beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));

  // Every request in this suite arrives from loopback, so the whole file
  // shares one authLimiter bucket (10 per 15 min) — and its auth-route tests
  // together sit right at that cap. Limiter behavior has its own suite
  // (rateLimit.test.js); here it is background, so start each test with a
  // clean bucket instead of letting the test count silently become the limit.
  for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    authLimiter.resetKey(key);
  }
});

afterEach(() => mock.restoreAll());

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

const post = (path, body) =>
  fetch(base + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

// assertOwnsStudent looks the parent up by id to check the student is theirs.
const ownsTheStudent = () =>
  mock.method(Parent, 'findById', () => ({
    select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
  }));

describe('the dashboard sends what the dashboard renders', () => {
  test('no transaction history rides along', async () => {
    mock.method(Parent, 'findById', () => ({
      populate: async () => ({
        _id: PARENT_ID,
        studentIds: [{ _id: STUDENT_ID, name: 'Child', pocketMoney: 500 }],
      }),
    }));
    mock.method(FulfillmentOrder, 'find', () => ({
      sort: () => ({ lean: async () => [] }),
    }));

    const body = await (await get('/api/parent/dashboard')).json();

    assert.deepEqual(Object.keys(body), ['children', 'ongoingOrders']);
    assert.equal(body.children.length, 1);
    assert.deepEqual(body.ongoingOrders, []);
  });

  test('only the fields the cards show are selected', async () => {
    let populateArg;

    mock.method(Parent, 'findById', () => ({
      populate: async (arg) => {
        populateArg = arg;
        return { studentIds: [] };
      },
    }));

    await get('/api/parent/dashboard');

    // rechargeHistory grows for as long as a child is enrolled and was being
    // sent on a screen that shows a balance.
    assert.equal(populateArg.select.includes('rechargeHistory'), false);
    assert.equal(populateArg.select.includes('pocketMoney'), true);
  });

  test('ongoing orders are limited to this parent and carry their display status', async () => {
    let orderFilter;
    let orderSort;

    mock.method(Parent, 'findById', () => ({
      populate: async () => ({
        _id: PARENT_ID,
        studentIds: [{ _id: STUDENT_ID, name: 'Child', pocketMoney: 500 }],
      }),
    }));
    mock.method(FulfillmentOrder, 'find', (filter) => {
      orderFilter = filter;
      return {
        sort: (sort) => {
          orderSort = sort;
          return {
            lean: async () => [{
              _id: '507f191e810c19729de860ef',
              studentId: STUDENT_ID,
              studentSnapshot: { name: 'Child', roomNumber: 'D-4' },
              status: 'PACKED',
              items: [{ name: 'Notebook', quantity: 1, price: 100 }],
              totalAmount: 100,
              orderedAt: new Date('2026-08-14T08:00:00.000Z'),
              deliverBy: new Date('2999-08-16T08:00:00.000Z'),
            }],
          };
        },
      };
    });

    const body = await (await get('/api/parent/dashboard')).json();

    assert.deepEqual(orderFilter.studentId.$in, [STUDENT_ID]);
    assert.deepEqual([...orderFilter.status.$in].sort(), ['OUT_FOR_DELIVERY', 'PACKED', 'PENDING']);
    assert.deepEqual(orderSort, { orderedAt: -1 });
    assert.equal(body.ongoingOrders[0].status, 'PACKED');
    assert.equal(body.ongoingOrders[0].studentName, 'Child');
    assert.equal(body.ongoingOrders[0].studentId, STUDENT_ID);
  });
});

describe('child history comes a page at a time', () => {
  const billQuery = (bills) => ({
    sort: () => ({ skip: () => ({ limit: async () => bills }) }),
  });

  test('the first page reports there is more to come', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 45);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills`)).json();

    assert.equal(body.total, 45);
    assert.equal(body.page, 1);
    assert.equal(body.hasMore, true);
  });

  test('the last page does not', async () => {
    ownsTheStudent();
    mock.method(Transaction, 'find', () => billQuery([{ _id: 'a' }]));
    mock.method(Transaction, 'countDocuments', async () => 21);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/bills?page=2`)).json();

    assert.equal(body.page, 2);
    assert.equal(body.hasMore, false);
  });

  test('a limit past the cap is clamped rather than honoured', async () => {
    ownsTheStudent();

    let asked;
    mock.method(Transaction, 'find', () => ({
      sort: () => ({ skip: () => ({ limit: async (n) => ((asked = n), []) }) }),
    }));
    mock.method(Transaction, 'countDocuments', async () => 5000);

    await get(`/api/parent/child/${STUDENT_ID}/bills?limit=100000`);

    assert.equal(asked, 100);
  });

  /* One mock, both reversal reads: the ledger listing goes sort→limit→lean,
     and ensureReceiptNumbers' sweep for unnumbered refunds goes sort→lean. */
  const noReversals = () =>
    mock.method(WalletReversal, 'find', () => ({
      sort: () => ({ limit: () => ({ lean: async () => [] }), lean: async () => [] }),
    }));

  /* One mock, both charge reads: the ledger listing goes sort→limit→lean,
     and ensureReceiptNumbers' sweep for unnumbered UPI charges goes
     sort→lean. */
  const noCharges = () =>
    mock.method(Transaction, 'find', () => ({
      sort: () => ({
        limit: () => ({ lean: async () => [] }),
        lean: async () => [],
      }),
    }));

  /* One mock, both adjustment reads: the ledger listing goes
     sort→limit→lean, and ensureReceiptNumbers' hunt for unnumbered rows goes
     sort→lean with receiptNumber: null in its filter. */
  const topupLedger = (rows) =>
    mock.method(WalletAdjustment, 'find', (filter) => ({
      sort: () => ({
        limit: () => ({ lean: async () => rows }),
        lean: async () =>
          filter?.receiptNumber === null ? rows.filter((row) => !row.receiptNumber) : rows,
      }),
    }));

  const noUpiTopups = () => topupLedger([]);

  // The admission number every receipt number is built around. Every recharges
  // test needs it now that the list numbers the rows it lists.
  const studentIs = (student = { _id: STUDENT_ID, admissionNumber: '990123' }) =>
    mock.method(Student, 'findById', () => ({ select: () => ({ lean: async () => student }) }));

  // One mock, both intent reads: the failed-attempt listing goes
  // select→sort→limit→lean, the merchantOrderId lookup goes select→lean.
  const paymentIntents = ({ failed = [], byId = [] } = {}) =>
    mock.method(PaymentIntent, 'find', (filter) => ({
      select: () => ({
        sort: () => ({ limit: () => ({ lean: async () => failed }) }),
        lean: async () => (filter._id ? byId : failed),
      }),
    }));

  const noFailedTopups = () => paymentIntents();

  test('recharges come newest first', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noFailedTopups();
    studentIs();
    topupLedger([
      { _id: 'c', source: 'ADMIN', amount: 3, receiptNumber: 'GMS2308990123003', createdAt: new Date('2026-08-23T08:00:00.000Z') },
      { _id: 'b', source: 'PARENT_UPI', amount: 2, receiptNumber: 'GMS2208990123002', createdAt: new Date('2026-08-22T08:00:00.000Z') },
      { _id: 'a', source: 'ADMIN', amount: 1, receiptNumber: 'GMS2108990123001', createdAt: new Date('2026-08-21T08:00:00.000Z') },
    ]);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    assert.deepEqual(
      body.recharges.map((r) => r.amount),
      [3, 2, 1]
    );
    assert.equal(body.total, 3);
    assert.equal(body.hasMore, false);
  });

  test('top-ups come from the adjustment ledger, each carrying its receipt handle', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noFailedTopups();
    studentIs();

    const adjustmentFilters = [];
    mock.method(WalletAdjustment, 'find', (filter) => {
      adjustmentFilters.push(filter);
      return {
        sort: () => ({
          limit: () => ({
            lean: async () => [
              {
                _id: '507f191e810c19729de860ac',
                source: 'PARENT_UPI',
                receiptNumber: 'GMS2108990123002',
                amount: 250,
                previousBalance: 100,
                newBalance: 350,
                createdAt: new Date('2026-08-21T08:00:00.000Z'),
              },
              {
                _id: '507f191e810c19729de860ad',
                source: 'ADMIN',
                receiptNumber: 'GMS2008990123001',
                amount: 100,
                previousBalance: 0,
                newBalance: 100,
                createdAt: new Date('2026-08-20T08:00:00.000Z'),
              },
            ],
          }),
        }),
      };
    });

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    // Both provenances now come from the one ledger — every top-up row wrote
    // an adjustment, and only adjustment rows can carry a receipt.
    assert.equal(adjustmentFilters[0].source, undefined);
    // Nothing was unnumbered, so no hunt for unnumbered rows was made.
    assert.equal(adjustmentFilters.length, 1);

    const [upi, cash] = body.recharges;
    assert.equal(upi.kind, 'TOP_UP');
    assert.equal(upi.mode, 'UPI');
    assert.equal(upi.adjustmentId, '507f191e810c19729de860ac');
    assert.equal(upi.amount, 250);
    assert.equal(upi.previousBalance, 100);
    assert.equal(upi.newBalance, 350);
    assert.equal(new Date(upi.date).toISOString(), '2026-08-21T08:00:00.000Z');
    assert.equal(cash.mode, 'CASH');
    assert.equal(cash.adjustmentId, '507f191e810c19729de860ad');
  });

  test('order payments appear as deductions naming their order', async () => {
    ownsTheStudent();
    noReversals();
    noUpiTopups();
    noFailedTopups();
    studentIs();

    let chargeFilter;
    mock.method(Transaction, 'find', (filter) => {
      chargeFilter = filter;
      return {
        sort: () => ({
          limit: () => ({
            lean: async () => [{
              _id: '507f191e810c19729de860aa',
              totalAmount: 60,
              previousBalance: 500,
              remainingBalance: 440,
              createdAt: new Date('2026-08-20T08:00:00.000Z'),
            }],
          }),
        }),
      };
    });
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({
        lean: async () => [{
          _id: '507f191e810c19729de860ab',
          transactionId: '507f191e810c19729de860aa',
        }],
      }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    // Wallet- and UPI-funded charges both belong here now; the kind and the
    // balances are what tell them apart, not the query.
    assert.equal(chargeFilter.sourceType, undefined);

    const [entry] = body.recharges;
    assert.equal(entry.kind, 'ORDER_PAYMENT');
    assert.equal(entry.amount, 60);
    assert.equal(entry.previousBalance, 500);
    assert.equal(entry.newBalance, 440);
    // The order it paid, named the way the orders tab names it: # plus the
    // id's last six. A bare reference, not a sentence — no reason field.
    assert.equal(entry.orderId, '#E860AB');
    assert.equal(entry.reason, undefined);
    // The ledger row's own id doubles as the reference the office looks a
    // wallet charge up by.
    assert.equal(entry.transactionId, '507f191e810c19729de860aa');
  });

  test('UPI-funded order payments list as their own kind, with no balances', async () => {
    ownsTheStudent();
    noReversals();
    noUpiTopups();
    noFailedTopups();
    studentIs();

    mock.method(Transaction, 'find', () => ({
      sort: () => ({
        limit: () => ({
          lean: async () => [{
            _id: '507f191e810c19729de860aa',
            sourceType: 'UPI_ORDER_PAYMENT',
            idempotencyKey: 'HH-507f191e810c19729de860ba',
            // Numbered like a top-up: this money entered the school's books
            // directly, so it carries a school receipt number too.
            receiptNumber: 'GMS2008990123005',
            totalAmount: 60,
            // The wallet never moved: chargeCart snapshots the untouched
            // balance on both sides of an EXTERNAL-funded charge.
            previousBalance: 500,
            remainingBalance: 500,
            createdAt: new Date('2026-08-20T08:00:00.000Z'),
          }],
        }),
      }),
    }));
    mock.method(FulfillmentOrder, 'find', () => ({
      select: () => ({
        lean: async () => [{
          _id: '507f191e810c19729de860ab',
          transactionId: '507f191e810c19729de860aa',
        }],
      }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    const [entry] = body.recharges;
    assert.equal(entry.kind, 'UPI_ORDER_PAYMENT');
    assert.equal(entry.amount, 60);
    assert.equal(entry.orderId, '#E860AB');
    assert.equal(entry.reason, undefined);
    // The gateway's reference, quotable at their support desk — and the
    // school's own receipt number beside it, like a UPI top-up carries.
    assert.equal(entry.transactionId, 'HH-507f191e810c19729de860ba');
    assert.equal(entry.receiptNumber, 'GMS2008990123005');
    // No balances: the money went gateway → school, never through the wallet,
    // and printing an unchanged balance would read as the wallet paying.
    assert.equal(entry.previousBalance, undefined);
    assert.equal(entry.newBalance, undefined);
  });

  test('failed top-up attempts are listed flagged, with no balances to show', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noUpiTopups();
    studentIs();

    let intentFilter;
    mock.method(PaymentIntent, 'find', (filter) => {
      intentFilter = filter;
      return {
        select: () => ({
          sort: () => ({
            limit: () => ({
              lean: async () => [{
                _id: '507f191e810c19729de860ba',
                amountPaise: 25000,
                merchantOrderId: 'HH-507f191e810c19729de860ba',
                createdAt: new Date('2026-09-06T08:00:00.000Z'),
              }],
            }),
          }),
        }),
      };
    });

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    // Only refused payments belong here — expired abandonments are non-events.
    assert.equal(intentFilter.status, 'FAILED');
    assert.equal(intentFilter.purpose, 'TOPUP');

    const [entry] = body.recharges;
    assert.equal(entry.kind, 'TOPUP_FAILED');
    assert.equal(entry.amount, 250);
    assert.equal(entry.transactionId, 'HH-507f191e810c19729de860ba');
    assert.equal(entry.previousBalance, undefined);
    assert.equal(entry.newBalance, undefined);
  });

  /* Every top-up row is quoted to the office by its receipt number, not by
     the gateway's own reference — that one still exists, on the receipt this
     row can open. See the ledger rows in pages/ChildDetails. */
  test('a UPI top-up carries both its receipt number and its gateway reference', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    studentIs();
    topupLedger([{
      _id: '507f191e810c19729de860ac',
      source: 'PARENT_UPI',
      paymentIntentId: '507f191e810c19729de860bb',
      receiptNumber: 'GMS2108990123007',
      amount: 250,
      previousBalance: 100,
      newBalance: 350,
      createdAt: new Date('2026-08-21T08:00:00.000Z'),
    }]);
    paymentIntents({
      byId: [{ _id: '507f191e810c19729de860bb', merchantOrderId: 'HH-507f191e810c19729de860bb' }],
    });

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    const [entry] = body.recharges;
    assert.equal(entry.kind, 'TOP_UP');
    assert.equal(entry.receiptNumber, 'GMS2108990123007');
    assert.equal(entry.transactionId, 'HH-507f191e810c19729de860bb');
  });

  test('a desk top-up has a receipt number but no gateway reference to carry', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noFailedTopups();
    studentIs();
    topupLedger([{
      _id: '507f191e810c19729de860ad',
      source: 'ADMIN',
      receiptNumber: 'GMS2008990123001',
      amount: 100,
      previousBalance: 0,
      newBalance: 100,
      createdAt: new Date('2026-08-20T08:00:00.000Z'),
    }]);

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    const [entry] = body.recharges;
    assert.equal(entry.receiptNumber, 'GMS2008990123001');
    // No gateway was involved, so there is no reference — and the app leaves
    // the row out rather than printing an empty one.
    assert.equal(entry.transactionId, null);
  });

  test('a top-up not yet numbered is numbered so the list can show one', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noFailedTopups();
    studentIs();
    topupLedger([{
      _id: '507f191e810c19729de860ac',
      source: 'ADMIN',
      receiptNumber: null,
      amount: 100,
      previousBalance: 0,
      newBalance: 100,
      createdAt: new Date('2026-08-21T08:00:00.000Z'),
    }]);

    // Numbering is the receipt module's job; here it only has to be asked.
    // Its own rules are pinned in walletReceipts.test.js.
    let numberedFor;
    mock.method(Counter, 'nextSequence', async (key) => {
      numberedFor = key;
      return 7;
    });
    mock.method(WalletAdjustment, 'findOneAndUpdate', (filter, update) => ({
      lean: async () => ({ _id: filter._id, receiptNumber: update.$set.receiptNumber }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    assert.equal(numberedFor, `walletReceipt:${STUDENT_ID}`);
    assert.equal(body.recharges[0].receiptNumber, 'GMS2108990123007');
  });

  test('a failed attempt keeps the gateway reference, having no receipt to name', async () => {
    ownsTheStudent();
    noReversals();
    noCharges();
    noUpiTopups();
    studentIs();
    mock.method(PaymentIntent, 'find', () => ({
      select: () => ({
        sort: () => ({
          limit: () => ({
            lean: async () => [{
              _id: '507f191e810c19729de860ba',
              amountPaise: 25000,
              merchantOrderId: 'HH-507f191e810c19729de860ba',
              createdAt: new Date('2026-09-06T08:00:00.000Z'),
            }],
          }),
        }),
      }),
    }));

    const body = await (await get(`/api/parent/child/${STUDENT_ID}/recharges`)).json();

    const [entry] = body.recharges;
    assert.equal(entry.kind, 'TOPUP_FAILED');
    // No money moved, so no adjustment and no receipt was ever written. The
    // gateway reference is the only handle support can chase it by.
    assert.equal(entry.transactionId, 'HH-507f191e810c19729de860ba');
    assert.equal(entry.receiptNumber, undefined);
  });

  test('a student belonging to someone else is refused', async () => {
    mock.method(Parent, 'findById', () => ({
      select: async () => ({ _id: PARENT_ID, studentIds: ['507f191e810c19729de860ff'] }),
    }));

    const res = await get(`/api/parent/child/${STUDENT_ID}/bills`);

    assert.equal(res.status, 403);
  });
});

describe('phone-first login and first password setup', () => {
  test('a registered first-time parent is sent to phone verification', async () => {
    mock.method(Parent, 'findOne', async () => ({ activationRequired: true, password: null }));

    const res = await post('/api/parent/login-step', { parentPhoneNumber: '9876543210' });

    assert.equal(res.status, 200);
    assert.equal((await res.json()).next, 'VERIFY_PHONE');
  });

  test('only an active account with a password is offered the password step', async () => {
    mock.method(Parent, 'findOne', async () => ({ activationRequired: false, password: 'hash' }));
    const existing = await post('/api/parent/login-step', { parentPhoneNumber: '9876543210' });

    assert.equal((await existing.json()).next, 'PASSWORD');
  });

  test('an unknown number and an archived account are both told to contact the school', async () => {
    mock.method(Parent, 'findOne', async () => null);
    const unknown = await post('/api/parent/login-step', { parentPhoneNumber: '9000000000' });

    mock.restoreAll();
    mock.method(Parent, 'findOne', async () => ({ active: false, password: 'hash' }));
    const archived = await post('/api/parent/login-step', { parentPhoneNumber: '9876543210' });

    assert.equal((await unknown.json()).next, 'NO_ACCOUNT');
    assert.equal((await archived.json()).next, 'NO_ACCOUNT');
  });

  test('a short password is refused before any lookup', async () => {
    const res = await post('/api/parent/first-password', {
      parentPhoneNumber: '9876543210',
      firebaseIdToken: 'firebase-proof',
      password: 'abc',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /at least 6/);
  });

  test('a missing password does not reach bcrypt', async () => {
    // bcrypt.hash(undefined) threw, and the parent saw a 500.
    const res = await post('/api/parent/first-password', {
      parentPhoneNumber: '9876543210',
      firebaseIdToken: 'firebase-proof',
    });

    assert.equal(res.status, 400);
  });

  test('a number that cannot match the school records is refused', async () => {
    const res = await post('/api/parent/first-password', {
      parentPhoneNumber: '+91 98765 43210',
      firebaseIdToken: 'firebase-proof',
      password: 'longenough',
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /10-digit/);
  });

  test('a Firebase phone proof must match the registered number', async () => {
    mock.method(firebasePhoneAuth, 'verifyPhoneIdToken', async () => ({
      phone_number: '+919000000000',
      firebase: { sign_in_provider: 'phone' },
    }));

    const res = await post('/api/parent/first-password', {
      parentPhoneNumber: '9876543210',
      firebaseIdToken: 'firebase-proof',
      password: 'longenough',
    });

    assert.equal(res.status, 401);
    assert.match((await res.json()).message, /does not match/i);
  });

  test('a matching Firebase proof creates the first password and signs in', async () => {
    const parent = {
      _id: PARENT_ID,
      fatherName: 'Dev Rao',
      phone: '9876543210',
      email: 'dev@example.com',
      studentIds: [STUDENT_ID],
      activationRequired: true,
      tokenVersion: 2,
      save: async function () { return this; },
    };
    mock.method(firebasePhoneAuth, 'verifyPhoneIdToken', async () => ({
      phone_number: '+919876543210',
      firebase: { sign_in_provider: 'phone' },
    }));
    mock.method(Parent, 'findOne', async () => parent);

    const res = await post('/api/parent/first-password', {
      parentPhoneNumber: '9876543210',
      firebaseIdToken: 'firebase-proof',
      password: 'longenough',
    });
    const body = await res.json();

    assert.equal(res.status, 200);
    assert.equal(parent.activationRequired, false);
    assert.match(parent.password, /^\$2/);
    assert.equal(parent.tokenVersion, 3);
    assert.ok(body.token);
  });
});

describe('login does not say which phone numbers have accounts', () => {
  test('an unknown number and a wrong password read the same', async () => {
    mock.method(Parent, 'findOne', async () => null);

    const unknown = await post('/api/parent/login', {
      parentPhoneNumber: '9000000000',
      password: 'whatever',
    });

    mock.restoreAll();

    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('the-real-password', 4);
    mock.method(Parent, 'findOne', async () => ({ _id: PARENT_ID, password: hash }));

    const wrongPassword = await post('/api/parent/login', {
      parentPhoneNumber: '9876543210',
      password: 'not-the-real-password',
    });

    assert.equal(unknown.status, 401);
    assert.equal(wrongPassword.status, 401);
    assert.equal(
      (await unknown.json()).message,
      (await wrongPassword.json()).message
    );
  });
});

describe('the purchase code is four digits', () => {
  // post() above is deliberately signed out — it serves the register and login
  // tests. These routes are behind protectParent, so they need the token.
  const postSignedIn = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`,
      },
      body: JSON.stringify(body),
    });

  // Every one of these routes hangs off assertOwnsStudent, so the parent has
  // to own the student before the rule is even reached.
  const setCode = (password) =>
    postSignedIn('/api/parent/set-purchase-password', {
      studentId: STUDENT_ID,
      password,
    });

  const authorized = () => {
    ownsTheStudent();
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        purchasePassword: null,
        save: async () => {},
      }),
    }));
  };

  test('four digits is accepted', async () => {
    authorized();

    const res = await setCode('4821');

    assert.equal(res.status, 200);
  });

  for (const [description, code] of [
    ['three digits', '482'],
    ['five digits', '48210'],
    ['letters', 'abcd'],
    ['digits with a letter', '48a1'],
    ['a decimal point', '4.82'],
    ['spaces around it', ' 482'],
    ['nothing at all', ''],
  ]) {
    test(`${description} is refused`, async () => {
      authorized();

      const res = await setCode(code);
      const body = await res.json();

      assert.equal(res.status, 400);
      assert.match(body.message, /4 digits|code is required/i);
    });
  }

  test('a code that is only long is no longer good enough', async () => {
    // The old rule was "at least 4 characters", so this used to pass. It is
    // the case that tells the two rules apart.
    authorized();

    const res = await setCode('correct-horse');

    assert.equal(res.status, 400);
  });

  test('the account password is the way off a code from before the rule', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const parentHash = await bcrypt.hash('the-parent-password', 4);
    const saved = { _id: STUDENT_ID, save: async () => {} };

    mock.method(Parent, 'findById', (id) =>
      String(id) === PARENT_ID
        ? {
            select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
            then: undefined,
          }
        : null
    );

    // resetPurchasePassword awaits Parent.findById directly for the password
    // check, and through .select() for the ownership check.
    mock.method(Parent, 'findById', () => {
      const doc = {
        _id: PARENT_ID,
        studentIds: [STUDENT_ID],
        password: parentHash,
        select: async () => ({ _id: PARENT_ID, studentIds: [STUDENT_ID] }),
      };
      return Object.assign(Promise.resolve(doc), doc);
    });

    mock.method(Student, 'findById', async () => saved);

    const res = await postSignedIn('/api/parent/reset-purchase-password', {
      studentId: STUDENT_ID,
      parentPassword: 'the-parent-password',
      newPassword: '1234',
    });

    assert.equal(res.status, 200);
    assert.equal(saved.purchaseCodeIsPin, true);
  });
});

describe('a code is recorded as four digits so the counter can tell', () => {
  // Nothing can ask a bcrypt hash whether it is four digits, so the answer is
  // written down when it is known. These are the two moments it is known.
  const postSignedIn = (path, body) =>
    fetch(base + path, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${parentToken}`,
      },
      body: JSON.stringify(body),
    });

  test('saving a code marks the student', async () => {
    const saved = { _id: STUDENT_ID, purchasePassword: null, save: async () => {} };

    ownsTheStudent();
    mock.method(Student, 'findById', () => ({ select: async () => saved }));

    await postSignedIn('/api/parent/set-purchase-password', {
      studentId: STUDENT_ID,
      password: '4821',
    });

    assert.equal(saved.purchaseCodeIsPin, true);
  });

  test('a code that is not four digits is refused before bcrypt', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));

    const looked = mock.method(Student, 'findById', () => ({
      select: async () => ({ _id: STUDENT_ID }),
    }));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: 'legacy-long-password',
      }),
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /4 digits/i);
    assert.equal(looked.mock.callCount(), 0, 'refused before the student is even read');
  });

  test('a wrong code says what else it might be when the format is unknown', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('9999', 4);

    // A miss is counted towards the checkout lock now. The controller does not
    // depend on the write landing — it answers "wrong code" either way — but an
    // unstubbed one costs this test a buffering timeout.
    mock.method(Student, 'updateOne', async () => ({}));

    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        parentPhoneNumber: '9876543210',
        purchasePassword: hash,
        purchaseCodeIsPin: false,
      }),
    }));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: '1234',
      }),
    });

    assert.equal(res.status, 400);
    assert.match((await res.json()).message, /before codes became 4 digits/i);
  });

  test('a four-digit code accepted at the counter marks the student', async () => {
    const bcrypt = (await import('bcryptjs')).default;
    const hash = await bcrypt.hash('4821', 4);

    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Student, 'findById', () => ({
      select: async () => ({
        _id: STUDENT_ID,
        parentPhoneNumber: '9876543210',
        purchasePassword: hash,
        purchaseCodeIsPin: false,
      }),
    }));

    const marked = mock.method(Student, 'updateOne', async () => ({}));

    const res = await fetch(base + '/api/transactions/verify-payment', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        studentId: STUDENT_ID,
        phone: '9876543210',
        password: '4821',
      }),
    });

    assert.equal(res.status, 200);
    assert.equal(marked.mock.callCount(), 1);
    assert.deepEqual(marked.mock.calls[0].arguments[1], { purchaseCodeIsPin: true });
  });
});
