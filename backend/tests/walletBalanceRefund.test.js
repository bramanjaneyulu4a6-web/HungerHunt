import test, { afterEach, beforeEach, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';

const Counter = (await import('../models/Counter.js')).default;
const Admin = (await import('../models/Admin.js')).default;
const Parent = (await import('../models/Parent.js')).default;
const Student = (await import('../models/Student.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const { refundWalletBalance } = await import('../controllers/studentController.js');
const { getWalletReceipt } = await import('../controllers/walletReceiptController.js');

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const REFUND_ID = '507f191e810c19729de860ec';

const response = () => ({
  statusCode: 200,
  body: null,
  status(code) { this.statusCode = code; return this; },
  json(body) { this.body = body; return this; },
});

const request = (body, key = 'refund-once') => ({
  body,
  params: { id: STUDENT_ID },
  staff: { id: ADMIN_ID },
  get: (name) => name === 'Idempotency-Key' ? key : undefined,
});

beforeEach(() => {
  mock.method(Parent, 'findOne', async () => null);
  mock.method(Counter, 'nextSequence', async () => 1);
});
afterEach(() => mock.restoreAll());

describe('wallet balance refund', () => {
  test('debits once, records the reason, and returns the receipt handle on replay', async () => {
    let stored = null;
    mock.method(WalletAdjustment, 'findOne', async () => stored);
    mock.method(WalletAdjustment, 'create', async (document) => {
      stored = { _id: REFUND_ID, createdAt: new Date(), ...document };
      return stored;
    });
    const debit = mock.method(Student, 'findOneAndUpdate', async () => ({
      _id: STUDENT_ID,
      admissionNumber: 'HH1001',
      pocketMoney: 60,
      updatedAt: new Date(),
    }));
    mock.method(Student, 'findOne', () => ({
      select: async () => ({ _id: STUDENT_ID, pocketMoney: 60 }),
    }));

    const first = response();
    await refundWalletBalance(request({ amount: 40, reason: 'Student leaving school' }), first);
    const replay = response();
    await refundWalletBalance(request({ amount: 40, reason: 'Student leaving school' }), replay);

    assert.equal(first.statusCode, 200);
    assert.equal(first.body.newBalance, 60);
    assert.equal(first.body.refund.type, 'BALANCE_REFUND');
    assert.equal(first.body.refund.previousBalance, 100);
    assert.equal(first.body.refund.reason, 'Student leaving school');
    assert.equal(first.body.refund.refundMode, 'CASH');
    assert.match(first.body.refund.receiptNumber, /^GMS\d{4}HH1001001$/);
    assert.equal(replay.body.replayed, true);
    assert.equal(replay.body.refund._id, REFUND_ID);
    assert.equal(debit.mock.callCount(), 1);
  });

  test('refuses an amount above the live balance', async () => {
    mock.method(WalletAdjustment, 'findOne', async () => null);
    mock.method(Student, 'findOneAndUpdate', async () => null);
    mock.method(Student, 'exists', async () => ({ _id: STUDENT_ID }));

    const res = response();
    await refundWalletBalance(request({ amount: 101, reason: 'Requested refund' }), res);

    assert.equal(res.statusCode, 409);
    assert.match(res.body.message, /exceeds the available wallet balance/i);
  });

  test('composes the refund receipt from the recorded movement', async () => {
    const refund = {
      _id: REFUND_ID,
      studentId: STUDENT_ID,
      performedBy: ADMIN_ID,
      type: 'BALANCE_REFUND',
      amount: 40,
      previousBalance: 100,
      newBalance: 60,
      reason: 'Student leaving school',
      receiptNumber: 'GMS3009HH1001001',
      createdAt: new Date('2026-09-30T08:00:00.000Z'),
    };
    mock.method(WalletAdjustment, 'findById', () => ({ lean: async () => refund }));
    mock.method(Parent, 'findById', () => ({
      select: async () => ({
        studentIds: [STUDENT_ID],
        fatherName: 'Ramesh Rao',
        phone: '9876543210',
      }),
    }));
    mock.method(Student, 'findById', () => ({
      select: () => ({
        lean: async () => ({
          _id: STUDENT_ID,
          name: 'Asha Rao',
          admissionNumber: 'HH1001',
          className: '7',
          section: 'B',
          roomNumber: 'A-12',
        }),
      }),
    }));
    mock.method(Admin, 'findById', () => ({
      select: () => ({ lean: async () => ({ name: 'Office Admin' }) }),
    }));

    const res = response();
    await getWalletReceipt({ params: { adjustmentId: REFUND_ID }, parent: { id: 'parent-1' } }, res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.body.receipt.kind, 'BALANCE_REFUND');
    assert.equal(res.body.receipt.refund.reason, 'Student leaving school');
    assert.equal(res.body.receipt.receivedBy.name, 'Office Admin');
    assert.equal(res.body.receipt.previousBalance, 100);
    assert.equal(res.body.receipt.newBalance, 60);
  });
});
