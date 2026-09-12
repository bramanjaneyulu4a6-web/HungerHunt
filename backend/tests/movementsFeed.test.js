/* The Transactions page's rows: every rupee that moved in a period, as the
 * office reads it on screen. Built from the same collections and the same
 * sign convention as the TallyPrime CSV, so the page and the file agree.
 *
 * No database: the row builder is pure, and the route's model calls are
 * stubbed.
 */
import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const FulfillmentOrder = (await import('../models/FulfillmentOrder.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { buildMovementRows, movementTotals } = await import(
  '../src/application/accounting/movementRows.js'
);
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const ORDER_ID = '507f191e810c19729de8608a';
const adminToken = signAdminToken(ADMIN_ID);
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');

const student = {
  _id: STUDENT_ID,
  name: 'SAI HANVIKA KARANAM',
  admissionNumber: 'N24068',
  className: 'PREP-II',
  section: 'B',
  roomNumber: 'A-12',
};

const at = (iso) => new Date(iso);

describe('movement rows', () => {
  test('classify each collection into the five kinds with the CSV sign convention', () => {
    const rows = buildMovementRows({
      adjustments: [
        { _id: 'a1', studentId: student, source: 'ADMIN', amount: 1000, receiptNumber: 'GMS1', createdAt: at('2026-08-14T06:00:00Z'), newBalance: 1500, performedBy: ADMIN_ID },
        { _id: 'a2', studentId: student, source: 'PARENT_UPI', amount: 500, receiptNumber: 'GMS2', createdAt: at('2026-08-14T07:00:00Z'), newBalance: 2000 },
      ],
      transactions: [
        { _id: 't1', studentId: student, sourceType: 'DIRECT_CHECKOUT', totalAmount: 250, createdAt: at('2026-08-14T08:00:00Z'), remainingBalance: 1750, orderReference: '#DE8608' },
        { _id: 't2', studentId: student, sourceType: 'UPI_ORDER_PAYMENT', totalAmount: 120, receiptNumber: 'GMS3', createdAt: at('2026-08-14T09:00:00Z'), remainingBalance: 1750 },
      ],
      reversals: [
        { _id: 'r1', studentId: student, amount: 250, createdAt: at('2026-08-14T10:00:00Z'), newBalance: 2000, performedBy: ADMIN_ID, reason: 'Out of stock', orderReference: '#DE8608' },
      ],
      staffNames: new Map([[ADMIN_ID, 'Bharat']]),
    });

    assert.deepEqual(
      rows.map((row) => [row.kind, row.group, row.mode, row.signedAmount]),
      [
        ['CASH_DEPOSIT', 'DEPOSIT', 'Cash', 1000],
        ['UPI_DEPOSIT', 'DEPOSIT', 'UPI', 500],
        ['WALLET_DEDUCTION', 'DEDUCTION', 'Wallet', -250],
        ['UPI_ORDER_PAYMENT', 'DEDUCTION', 'UPI', 120],
        ['REFUND', 'DEDUCTION', 'Refund', -250],
      ]
    );
    assert.equal(rows[0].processedBy, 'Bharat');
    assert.equal(rows[1].processedBy, null);
    assert.equal(rows[2].reference, '#DE8608');
    assert.equal(rows[2].balanceAfter, 1750);
    assert.equal(rows[4].note, 'Out of stock');
    assert.deepEqual(rows[0].student, {
      id: STUDENT_ID, name: student.name, admissionNumber: 'N24068',
      className: 'PREP-II', section: 'B', roomNumber: 'A-12',
    });
  });

  test('come out oldest first whichever collection they came from', () => {
    const rows = buildMovementRows({
      transactions: [{ _id: 't', studentId: student, totalAmount: 1, createdAt: at('2026-08-14T05:00:00Z') }],
      adjustments: [{ _id: 'a', studentId: student, amount: 1, createdAt: at('2026-08-14T09:00:00Z') }],
      reversals: [{ _id: 'r', studentId: student, amount: 1, createdAt: at('2026-08-14T07:00:00Z') }],
    });
    assert.deepEqual(rows.map((row) => row.id), ['t', 'r', 'a']);
  });

  test('keep a row whose student was deleted, with blank student fields', () => {
    const [row] = buildMovementRows({
      adjustments: [{ _id: 'a', studentId: STUDENT_ID, source: 'ADMIN', amount: 10, createdAt: at('2026-08-14T09:00:00Z') }],
    });
    assert.equal(row.student.name, '');
    assert.equal(row.student.id, STUDENT_ID);
  });

  test('total money in against money out', () => {
    const totals = movementTotals([
      { signedAmount: 1000 }, { signedAmount: -250 }, { signedAmount: 120 }, { signedAmount: -250 },
    ]);
    assert.deepEqual(totals, { in: 1120, out: 500, net: 620, count: 4 });
  });
});

const query = (rows) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  async lean() { return rows; },
});

describe('GET /v1/accounting-exports/movements', () => {
  let base;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  afterEach(() => mock.restoreAll());

  const read = (range, token) =>
    fetch(`${base}/api/v1/accounting-exports/movements?${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  test('is admin-only', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const denied = await read('from=2026-08-14&to=2026-08-14', warehouseToken);
    assert.equal(denied.status, 403);
  });

  test('needs a period', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const refused = await read('from=2026-08-14', adminToken);
    assert.equal(refused.status, 400);
  });

  test('returns the rows with order handles, staff names and totals', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Admin, 'find', () => query([{ _id: ADMIN_ID, name: 'Bharat' }]));
    mock.method(Transaction, 'find', () => query([{
      _id: '507f191e810c19729de860ee', studentId: student, sourceType: 'DIRECT_CHECKOUT',
      totalAmount: 250, remainingBalance: 750, createdAt: at('2026-08-14T08:00:00Z'),
    }]));
    mock.method(WalletAdjustment, 'find', () => query([{
      _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1000,
      receiptNumber: 'GMS1408N24068001', performedBy: ADMIN_ID, newBalance: 1000,
      createdAt: at('2026-08-14T06:00:00Z'),
    }]));
    mock.method(WalletReversal, 'find', () => query([]));
    mock.method(FulfillmentOrder, 'find', () => query([{
      _id: ORDER_ID, transactionId: '507f191e810c19729de860ee',
    }]));

    const response = await read('from=2026-08-14&to=2026-08-14', adminToken);
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.deepEqual(body.data.map((row) => row.kind), ['CASH_DEPOSIT', 'WALLET_DEDUCTION']);
    assert.equal(body.data[0].processedBy, 'Bharat');
    assert.equal(body.data[0].receiptNumber, 'GMS1408N24068001');
    assert.equal(body.data[1].reference, '#E8608A');
    assert.deepEqual(body.meta.totals, { in: 1000, out: 250, net: 750, count: 2 });
    assert.equal(body.meta.count, 2);
    assert.equal(body.meta.range.timeZone, 'Asia/Kolkata');
  });
});
