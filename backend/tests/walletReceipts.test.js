// Wallet recharge receipts: the number a parent can quote to the office, and
// the two routes that hand the receipt back — as data for the in-app view and
// as a PDF for sharing.
//
// No database, parentSurface-style: every model call is stubbed, because what
// is under test is the numbering rules, the ownership gate and the response
// shape — not Mongo.
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
const Counter = (await import('../models/Counter.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const PaymentIntent = (await import('../models/PaymentIntent.js')).default;
const phonepe = (await import('../src/domain/payments/providers/phonepe.js')).default;
const { buildReceiptNumber, amountInWords, ensureReceiptNumbers } = await import('../utils/walletReceipts.js');
const { authLimiter } = await import('../middleware/rateLimit.js');
const { signParentToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

mongoose.set('bufferTimeoutMS', 1000);

const PARENT_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860ea';
const ADMIN_ID = '507f1f77bcf86cd799439012';
const ADJUSTMENT_ID = '507f191e810c19729de860ad';
const INTENT_ID = '507f191e810c19729de860ae';

const parentToken = signParentToken(PARENT_ID, '9876543210');

let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

beforeEach(() => {
  mock.method(Parent, 'exists', async () => ({ _id: PARENT_ID }));
  // The numbering pass also sweeps UPI-funded order charges and refunds now;
  // no test in this file has either, so the sweep finds nothing unless a test
  // says otherwise.
  mock.method(Transaction, 'find', () => ({
    sort: () => ({ lean: async () => [] }),
  }));
  mock.method(WalletReversal, 'find', () => ({
    sort: () => ({ lean: async () => [] }),
  }));
  for (const key of ['127.0.0.1', '::ffff:127.0.0.1', '::1']) {
    authLimiter.resetKey(key);
  }
});

afterEach(() => mock.restoreAll());

const get = (path) =>
  fetch(base + path, { headers: { Authorization: `Bearer ${parentToken}` } });

describe('receipt numbers', () => {
  test('GMS + day-month + admission number + three-digit sequence, no separators', () => {
    assert.equal(
      buildReceiptNumber({
        date: new Date('2026-09-07T08:00:00.000Z'),
        admissionNumber: '990123',
        seq: 42,
      }),
      'GMS0709990123042'
    );
  });

  test('the day-month is the recharge day in IST, not UTC', () => {
    // 19:30 UTC on the 6th is 01:00 IST on the 7th.
    assert.equal(
      buildReceiptNumber({
        date: new Date('2026-09-06T19:30:00.000Z'),
        admissionNumber: '990123',
        seq: 1,
      }),
      'GMS0709990123001'
    );
  });

  test('a sequence past 999 keeps its digits rather than colliding', () => {
    assert.equal(
      buildReceiptNumber({
        date: new Date('2026-09-07T08:00:00.000Z'),
        admissionNumber: '990123',
        seq: 1000,
      }),
      'GMS07099901231000'
    );
  });
});

describe('numbering across ledgers', () => {
  /* A UPI-funded order is money that entered the school's books directly —
     receipted like a desk top-up, and from the same per-student sequence, so
     the numbers a parent quotes still follow payment date whichever ledger a
     payment landed in. */
  test('UPI-paid orders join the top-up sequence, interleaved by date', async () => {
    const adjustment = {
      _id: '507f191e810c19729de860b1',
      studentId: STUDENT_ID,
      receiptNumber: null,
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
    };
    const upiCharge = {
      _id: '507f191e810c19729de860b2',
      studentId: STUDENT_ID,
      sourceType: 'UPI_ORDER_PAYMENT',
      receiptNumber: null,
      createdAt: new Date('2026-09-02T08:00:00.000Z'),
    };
    const laterAdjustment = {
      _id: '507f191e810c19729de860b3',
      studentId: STUDENT_ID,
      receiptNumber: null,
      createdAt: new Date('2026-09-03T08:00:00.000Z'),
    };

    mock.method(WalletAdjustment, 'find', () => ({
      sort: () => ({ lean: async () => [adjustment, laterAdjustment] }),
    }));
    mock.method(Transaction, 'find', () => ({
      sort: () => ({ lean: async () => [upiCharge] }),
    }));

    const numbered = [];
    const sticks = (model) => (filter, update) => ({
      lean: async () => {
        numbered.push({ model, id: String(filter._id), number: update.$set.receiptNumber });
        return { _id: filter._id, receiptNumber: update.$set.receiptNumber };
      },
    });
    mock.method(WalletAdjustment, 'findOneAndUpdate', sticks('adjustment'));
    mock.method(Transaction, 'findOneAndUpdate', sticks('transaction'));

    let seq = 0;
    mock.method(Counter, 'nextSequence', async () => {
      seq += 1;
      return seq;
    });

    const assigned = await ensureReceiptNumbers(STUDENT_ID, '990123');

    // Date order across both collections: adjustment, charge, adjustment.
    assert.deepEqual(
      numbered.map((n) => n.model),
      ['adjustment', 'transaction', 'adjustment']
    );
    assert.equal(numbered[1].number, 'GMS0209990123002');
    assert.equal(assigned.get(String(upiCharge._id)), 'GMS0209990123002');
    assert.equal(assigned.get(String(laterAdjustment._id)), 'GMS0309990123003');
  });
});

describe('amount in words', () => {
  test('whole rupees', () => {
    assert.equal(amountInWords(250), 'Rupees Two Hundred Fifty Only');
  });

  test('Indian grouping: lakhs and crores', () => {
    assert.equal(amountInWords(1250000), 'Rupees Twelve Lakh Fifty Thousand Only');
  });

  test('paise ride along when present', () => {
    assert.equal(amountInWords(250.5), 'Rupees Two Hundred Fifty and Fifty Paise Only');
  });
});

describe('GET /api/parent/receipts/:adjustmentId', () => {
  const student = {
    _id: STUDENT_ID,
    name: 'Anaya Rao',
    admissionNumber: '990123',
    className: '9',
    section: 'B',
    roomNumber: 'A-101',
  };

  const cashAdjustment = {
    _id: ADJUSTMENT_ID,
    studentId: STUDENT_ID,
    source: 'ADMIN',
    performedBy: ADMIN_ID,
    amount: 500,
    previousBalance: 100,
    newBalance: 600,
    receiptNumber: null,
    createdAt: new Date('2026-09-07T08:00:00.000Z'),
  };

  const ownsTheStudent = () =>
    mock.method(Parent, 'findById', () => ({
      select: async () => ({
        _id: PARENT_ID,
        studentIds: [STUDENT_ID],
        fatherName: 'Ravi Rao',
        phone: '9876543210',
      }),
    }));

  const adjustmentIs = (row) =>
    mock.method(WalletAdjustment, 'findById', () => ({ lean: async () => row }));

  const studentIs = (row) =>
    mock.method(Student, 'findById', () => ({
      select: () => ({ lean: async () => row }),
    }));

  const adminIs = (row) =>
    mock.method(Admin, 'findById', () => ({
      select: () => ({ lean: async () => row }),
    }));

  // The lazy assignment pass: which rows are still unnumbered.
  const unnumberedRows = (rows) =>
    mock.method(WalletAdjustment, 'find', () => ({
      sort: () => ({ lean: async () => rows }),
    }));

  const assignmentSticks = () =>
    mock.method(WalletAdjustment, 'findOneAndUpdate', (filter, update) => ({
      lean: async () => ({ _id: filter._id, receiptNumber: update.$set.receiptNumber }),
    }));

  test('an unknown id is a 404, not a crash', async () => {
    const res = await get('/api/parent/receipts/not-an-id');
    assert.equal(res.status, 404);
  });

  test("someone else's recharge is refused", async () => {
    adjustmentIs({ ...cashAdjustment, studentId: '507f191e810c19729de860ff' });
    ownsTheStudent();

    const res = await get(`/api/parent/receipts/${ADJUSTMENT_ID}`);
    assert.equal(res.status, 403);
  });

  test('a cash recharge names the admin who took the money', async () => {
    adjustmentIs(cashAdjustment);
    ownsTheStudent();
    studentIs(student);
    adminIs({ _id: ADMIN_ID, name: 'Suma Devi' });
    unnumberedRows([cashAdjustment]);
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 7);

    const res = await get(`/api/parent/receipts/${ADJUSTMENT_ID}`);
    assert.equal(res.status, 200);

    const { receipt } = await res.json();
    assert.equal(receipt.receiptNumber, 'GMS0709990123007');
    assert.equal(receipt.mode, 'CASH');
    assert.equal(receipt.amount, 500);
    assert.equal(receipt.previousBalance, 100);
    assert.equal(receipt.newBalance, 600);
    assert.equal(receipt.amountInWords, 'Rupees Five Hundred Only');
    assert.equal(receipt.student.name, 'Anaya Rao');
    assert.equal(receipt.student.admissionNumber, '990123');
    assert.equal(receipt.student.className, '9');
    assert.equal(receipt.student.section, 'B');
    assert.equal(receipt.student.roomNumber, 'A-101');
    assert.equal(receipt.parent.name, 'Ravi Rao');
    assert.equal(receipt.parent.phone, '9876543210');
    assert.equal(receipt.receivedBy.name, 'Suma Devi');
    assert.equal(receipt.company.name, 'GRAARR SERVICES');
  });

  test('a student the migration has not reached splits their old grade for the receipt', async () => {
    adjustmentIs({ ...cashAdjustment, receiptNumber: 'GMS0709990123001' });
    ownsTheStudent();
    studentIs({
      _id: STUDENT_ID,
      name: 'Anaya Rao',
      admissionNumber: '990123',
      grade: '9-B',
      roomNumber: 'A-101',
    });
    adminIs({ _id: ADMIN_ID, name: 'Suma Devi' });
    unnumberedRows([]);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.student.className, '9');
    assert.equal(receipt.student.section, 'B');
  });

  test('a UPI recharge carries the payment reference instead of an admin', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-123',
          providerOrderId: 'OMO123',
          degradedToTopup: false,
        }),
      }),
    }));
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 8);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.mode, 'UPI');
    assert.equal(receipt.receivedBy, undefined);
    assert.equal(receipt.payment.provider, 'PHONEPE');
    assert.equal(receipt.payment.merchantOrderId, 'HH-TOPUP-123');
  });

  test("the receipt quotes the bank's UTR when the intent already carries it", async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-125',
          providerOrderId: 'OMO125',
          degradedToTopup: false,
          utr: '455069731511',
        }),
      }),
    }));
    // A stored UTR is reprinted, never re-fetched.
    let asked = false;
    mock.method(phonepe, 'getOrderStatus', async () => ((asked = true), {}));
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 10);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.payment.utr, '455069731511');
    assert.equal(asked, false);
  });

  test('a payment settled before UTRs were captured backfills one, once', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-126',
          providerOrderId: 'OMO126',
          degradedToTopup: false,
          utr: null,
        }),
      }),
    }));
    mock.method(phonepe, 'getOrderStatus', async () => ({
      state: 'COMPLETED',
      amountPaise: 25000,
      utr: '900011122233',
    }));
    let saved = null;
    mock.method(PaymentIntent, 'updateOne', async (filter, update) => {
      saved = update.$set.utr;
      return { acknowledged: true };
    });
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 11);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.payment.utr, '900011122233');
    // Kept, so the next open reprints it rather than asking PhonePe again.
    assert.equal(saved, '900011122233');
  });

  test('a receipt still opens when PhonePe cannot be reached for the UTR', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-127',
          providerOrderId: 'OMO127',
          degradedToTopup: false,
          utr: null,
        }),
      }),
    }));
    mock.method(phonepe, 'getOrderStatus', async () => {
      throw new Error('PhonePe unreachable');
    });
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 12);

    const response = await get(`/api/parent/receipts/${ADJUSTMENT_ID}`);
    const { receipt } = await response.json();

    // The receipt is the parent's record of their own money; a provider
    // outage must not stand between them and it.
    assert.equal(response.status, 200);
    assert.equal(receipt.payment.utr, '');
    assert.equal(receipt.payment.merchantOrderId, 'HH-TOPUP-127');
  });

  test('the receipt records which UPI app the parent actually paid with', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-124',
          providerOrderId: 'OMO124',
          degradedToTopup: false,
          upiApp: 'gpay',
        }),
      }),
    }));
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 9);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.payment.upiApp, 'gpay');
    // The label the receipt prints is composed here, once, so the in-app view
    // and the PDF cannot disagree about which app a parent paid with.
    assert.equal(receipt.payment.upiLabel, 'Google Pay');
  });

  test('a receipt for a typed UPI ID names the address, masked', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-128',
          providerOrderId: 'OMO128',
          degradedToTopup: false,
          checkoutMode: 'UPI_COLLECT',
          upiVpa: 'ashok@okhdfcbank',
        }),
      }),
    }));
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 11);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.payment.upiLabel, 'as***@okhdfcbank');
    // A receipt is forwarded around; the address it was billed to never
    // leaves this server whole.
    assert.equal(receipt.payment.upiVpa, undefined);
  });

  test('a hosted checkout names no app rather than guessing one', async () => {
    const upiAdjustment = {
      ...cashAdjustment,
      source: 'PARENT_UPI',
      performedBy: undefined,
      paymentIntentId: INTENT_ID,
    };
    adjustmentIs(upiAdjustment);
    ownsTheStudent();
    studentIs(student);
    unnumberedRows([upiAdjustment]);
    mock.method(PaymentIntent, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: INTENT_ID,
          provider: 'PHONEPE',
          merchantOrderId: 'HH-TOPUP-129',
          providerOrderId: 'OMO129',
          degradedToTopup: false,
          checkoutMode: 'REDIRECT',
        }),
      }),
    }));
    assignmentSticks();
    mock.method(Counter, 'nextSequence', async () => 12);

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    // The parent chose their app inside PhonePe's own page, out of this
    // server's sight. The receipt says "UPI" and stops there.
    assert.equal(receipt.payment.upiLabel, null);
  });

  test('a receipt already numbered keeps its number and mints no new one', async () => {
    adjustmentIs({ ...cashAdjustment, receiptNumber: 'GMS0709990123001' });
    ownsTheStudent();
    studentIs(student);
    adminIs({ _id: ADMIN_ID, name: 'Suma Devi' });
    unnumberedRows([]);

    let minted = 0;
    mock.method(Counter, 'nextSequence', async () => {
      minted += 1;
      return 99;
    });

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    assert.equal(receipt.receiptNumber, 'GMS0709990123001');
    assert.equal(minted, 0);
  });

  test('unnumbered recharges are numbered oldest first, so sequence follows date', async () => {
    const older = {
      ...cashAdjustment,
      _id: '507f191e810c19729de860b1',
      createdAt: new Date('2026-09-01T08:00:00.000Z'),
    };
    const newer = { ...cashAdjustment, createdAt: new Date('2026-09-07T08:00:00.000Z') };

    adjustmentIs(newer);
    ownsTheStudent();
    studentIs(student);
    adminIs({ _id: ADMIN_ID, name: 'Suma Devi' });
    unnumberedRows([older, newer]);

    const numbered = [];
    mock.method(WalletAdjustment, 'findOneAndUpdate', (filter, update) => ({
      lean: async () => {
        numbered.push({ id: String(filter._id), number: update.$set.receiptNumber });
        return { _id: filter._id, receiptNumber: update.$set.receiptNumber };
      },
    }));

    let seq = 0;
    mock.method(Counter, 'nextSequence', async () => {
      seq += 1;
      return seq;
    });

    const { receipt } = await (await get(`/api/parent/receipts/${ADJUSTMENT_ID}`)).json();

    // The older recharge took 001; the one being viewed took 002.
    assert.deepEqual(numbered.map((n) => n.id), [older._id, ADJUSTMENT_ID]);
    assert.equal(numbered[0].number, 'GMS0109990123001');
    assert.equal(receipt.receiptNumber, 'GMS0709990123002');
  });

  test('the PDF route answers with a PDF', async () => {
    adjustmentIs({ ...cashAdjustment, receiptNumber: 'GMS0709990123001' });
    ownsTheStudent();
    studentIs(student);
    adminIs({ _id: ADMIN_ID, name: 'Suma Devi' });
    unnumberedRows([]);

    const res = await get(`/api/parent/receipts/${ADJUSTMENT_ID}/pdf`);

    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type'), /application\/pdf/);
    const body = Buffer.from(await res.arrayBuffer());
    assert.equal(body.subarray(0, 4).toString(), '%PDF');
  });
});
