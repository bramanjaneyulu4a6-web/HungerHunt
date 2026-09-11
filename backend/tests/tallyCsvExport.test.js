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
const { buildTallyCsv } = await import('../src/application/accounting/tallyCsv.js');
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const ORDER_ID = '507f191e810c19729de8608a';
const adminToken = signAdminToken(ADMIN_ID);
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');
const PAID_TO = 'GRAARR BOOKS 756705002080';
const TIME_ZONE = 'Asia/Kolkata';

const student = {
  _id: STUDENT_ID,
  name: 'SAI HANVIKA KARANAM',
  admissionNumber: 'N24068',
  className: 'PREP-II',
  section: 'B',
};

// The header the Uniform Receipts sheet gave us, with Total dropped, Cash
// renamed to Amount and moved after Section, and Paid to taking the slot the
// bank-account column used to hold.
const HEADER =
  'S.No,Receipt No,Admission No,Name,Class,Section,Amount,Paid to,' +
  'ModeOfPayment,Details,Date of Payment,Voucher Type';

const csvRows = (csv) => csv.replace(/^\uFEFF/, '').trim().split('\r\n');

describe('TallyPrime CSV export', () => {
  test('writes the Uniform Receipts header', () => {
    const csv = buildTallyCsv({
      transactions: [], adjustments: [], reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });
    assert.equal(csvRows(csv)[0], HEADER);
  });

  test('opens with a BOM so Excel reads it as UTF-8', () => {
    const csv = buildTallyCsv({
      transactions: [], adjustments: [], reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });
    assert.ok(csv.startsWith('\uFEFF'));
  });

  test('books a desk top-up as a positive Cash Deposit receipt', () => {
    const csv = buildTallyCsv({
      transactions: [],
      adjustments: [{
        _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1000,
        receiptNumber: 'GMS1408N24068001', createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.equal(
      csvRows(csv)[1],
      `1,GMS1408N24068001,N24068,SAI HANVIKA KARANAM,PREP-II,B,1000.00,${PAID_TO},` +
        'Cash,Cash Deposit,14 Aug 2026,Receipt'
    );
  });

  test('books a parent top-up as a positive UPI Deposit receipt', () => {
    const csv = buildTallyCsv({
      transactions: [],
      adjustments: [{
        _id: '507f191e810c19729de860ef', studentId: student, source: 'PARENT_UPI', amount: 500.5,
        receiptNumber: 'GMS1408N24068002', createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    const cells = csvRows(csv)[1].split(',');
    assert.equal(cells[6], '500.50');
    assert.equal(cells[8], 'UPI');
    assert.equal(cells[9], 'UPI Deposit');
    assert.equal(cells[11], 'Receipt');
  });

  test('books a wallet purchase as a negative Wallet sale naming its order', () => {
    const csv = buildTallyCsv({
      transactions: [{
        _id: '507f191e810c19729de860ee', studentId: student, sourceType: 'DIRECT_CHECKOUT',
        totalAmount: 250, receiptNumber: null, orderReference: '#E860AB',
        createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      adjustments: [], reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.equal(
      csvRows(csv)[1],
      `1,,N24068,SAI HANVIKA KARANAM,PREP-II,B,-250.00,${PAID_TO},Wallet,` +
        'Student Wallet Deduction - Order #E860AB,14 Aug 2026,Sales'
    );
  });

  test('books a directly-paid order as a positive UPI sale', () => {
    const csv = buildTallyCsv({
      transactions: [{
        _id: '507f191e810c19729de860ee', studentId: student, sourceType: 'UPI_ORDER_PAYMENT',
        totalAmount: 250, receiptNumber: 'GMS1408N24068003', orderReference: '#E860AB',
        createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      adjustments: [], reversals: [], paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    const cells = csvRows(csv)[1].split(',');
    assert.equal(cells[1], 'GMS1408N24068003');
    assert.equal(cells[6], '250.00');
    assert.equal(cells[8], 'UPI');
    assert.equal(cells[9], 'UPI Order Payment - Order #E860AB');
    assert.equal(cells[11], 'Sales');
  });

  test('books a cancellation as a negative Refund credit note', () => {
    const csv = buildTallyCsv({
      transactions: [], adjustments: [],
      reversals: [{
        _id: '507f191e810c19729de860ea', studentId: student, amount: 250,
        receiptNumber: 'GMS1408N24068004', orderReference: '#E860AB',
        createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.equal(
      csvRows(csv)[1],
      `1,GMS1408N24068004,N24068,SAI HANVIKA KARANAM,PREP-II,B,-250.00,${PAID_TO},Refund,` +
        'Refund - Order #E860AB,14 Aug 2026,Credit Note'
    );
  });

  test('numbers every movement in one series, oldest first', () => {
    const csv = buildTallyCsv({
      transactions: [{
        _id: '507f191e810c19729de860ee', studentId: student, sourceType: 'DIRECT_CHECKOUT',
        totalAmount: 250, orderReference: '#E860AB',
        createdAt: new Date('2026-08-14T08:00:00.000Z'),
      }],
      adjustments: [{
        _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1000,
        createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      reversals: [{
        _id: '507f191e810c19729de860ea', studentId: student, amount: 250,
        orderReference: '#E860AB', createdAt: new Date('2026-08-14T09:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    const rows = csvRows(csv).slice(1);
    assert.deepEqual(
      rows.map((row) => row.split(',').slice(0, 1).concat(row.split(',')[9])),
      [
        ['1', 'Cash Deposit'],
        ['2', 'Student Wallet Deduction - Order #E860AB'],
        ['3', 'Refund - Order #E860AB'],
      ]
    );
  });

  test('dates a movement by the school day, not by UTC', () => {
    const csv = buildTallyCsv({
      transactions: [], reversals: [],
      // 00:30 on the 15th in Kolkata; still the 14th in UTC.
      adjustments: [{
        _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1000,
        createdAt: new Date('2026-08-14T19:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.equal(csvRows(csv)[1].split(',')[10], '15 Aug 2026');
  });

  /* The receipts book spells every month in three letters. en-GB does not:
     its short form for September is "Sept", which is how a column of dates
     ends up one character wider for one month of the year. */
  test('spells every month in three letters, September included', () => {
    const months = Array.from({ length: 12 }, (unused, month) =>
      buildTallyCsv({
        transactions: [], reversals: [],
        adjustments: [{
          _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1,
          createdAt: new Date(Date.UTC(2026, month, 15, 6)),
        }],
        paidTo: PAID_TO, timeZone: TIME_ZONE,
      })
    ).map((csv) => csvRows(csv)[1].split(',')[10]);

    assert.deepEqual(months, [
      '15 Jan 2026', '15 Feb 2026', '15 Mar 2026', '15 Apr 2026',
      '15 May 2026', '15 Jun 2026', '15 Jul 2026', '15 Aug 2026',
      '15 Sep 2026', '15 Oct 2026', '15 Nov 2026', '15 Dec 2026',
    ]);
  });

  test('quotes a name carrying a comma or a quote', () => {
    const csv = buildTallyCsv({
      transactions: [], reversals: [],
      adjustments: [{
        _id: '507f191e810c19729de860ef',
        studentId: { ...student, name: 'RAO, K "BABU"' },
        source: 'ADMIN', amount: 1000, createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.match(csvRows(csv)[1], /,"RAO, K ""BABU""",/);
  });

  test('splits a legacy combined grade the way the migration will', () => {
    const csv = buildTallyCsv({
      transactions: [], reversals: [],
      adjustments: [{
        _id: '507f191e810c19729de860ef',
        studentId: { _id: STUDENT_ID, name: 'OLD ROW', admissionNumber: 'N1', grade: 'LKG-A' },
        source: 'ADMIN', amount: 1000, createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    const cells = csvRows(csv)[1].split(',');
    assert.equal(cells[4], 'LKG');
    assert.equal(cells[5], 'A');
  });

  test('still books a movement whose student record has gone', () => {
    const csv = buildTallyCsv({
      transactions: [], reversals: [],
      adjustments: [{
        _id: '507f191e810c19729de860ef', studentId: null, source: 'ADMIN', amount: 1000,
        createdAt: new Date('2026-08-14T06:00:00.000Z'),
      }],
      paidTo: PAID_TO, timeZone: TIME_ZONE,
    });

    assert.equal(
      csvRows(csv)[1],
      `1,,,,,,1000.00,${PAID_TO},Cash,Cash Deposit,14 Aug 2026,Receipt`
    );
  });
});

const query = (rows) => ({
  select() { return this; },
  populate() { return this; },
  sort() { return this; },
  limit() { return this; },
  async lean() { return rows; },
});

describe('TallyPrime CSV export route', () => {
  let base;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  afterEach(() => mock.restoreAll());

  const download = (range, token) =>
    fetch(`${base}/api/v1/accounting-exports/tally.csv?${range}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

  test('is admin-only', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const denied = await download('from=2026-08-01&to=2026-08-31', warehouseToken);
    assert.equal(denied.status, 403);
  });

  test('downloads a named CSV naming the order each charge paid', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Transaction, 'find', () => query([{
      _id: '507f191e810c19729de860ee', studentId: student, sourceType: 'DIRECT_CHECKOUT',
      totalAmount: 250, createdAt: new Date('2026-08-14T06:00:00.000Z'),
    }]));
    mock.method(WalletAdjustment, 'find', () => query([]));
    mock.method(WalletReversal, 'find', () => query([]));
    mock.method(FulfillmentOrder, 'find', () => query([{
      _id: ORDER_ID, transactionId: '507f191e810c19729de860ee',
    }]));

    const response = await download('from=2026-08-01&to=2026-08-31', adminToken);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /text\/csv/);
    assert.match(
      response.headers.get('content-disposition'),
      /filename="hungerhunt-tally-2026-08-01-to-2026-08-31\.csv"/
    );
    assert.equal(response.headers.get('x-hungerhunt-row-count'), '1');
    assert.match(await response.text(), /Student Wallet Deduction - Order #E8608A/);
  });

  test('refuses a range longer than the export window', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const tooWide = await download('from=2026-01-01&to=2026-08-31', adminToken);
    assert.equal(tooWide.status, 400);
  });
});

/* A deselected type must not merely be dropped from the file — its collection
   must not be read at all. On a full month that is the difference between
   three collection scans and one. */
describe('exporting only some movement types', () => {
  let base;

  before(async () => {
    const server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
    server.unref();
  });

  afterEach(() => mock.restoreAll());

  const range = 'from=2026-08-01&to=2026-08-31';

  const mockAll = () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    mock.method(Transaction, 'find', () => query([]));
    mock.method(WalletAdjustment, 'find', () => query([]));
    mock.method(WalletReversal, 'find', () => query([]));
    mock.method(FulfillmentOrder, 'find', () => query([]));
  };

  test('leaves the collections nothing was selected from unread', async () => {
    mockAll();
    const response = await fetch(`${base}/api/v1/accounting-exports/tally.csv?${range}&include=REFUND`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 200);
    assert.equal(Transaction.find.mock.callCount(), 0);
    assert.equal(WalletAdjustment.find.mock.callCount(), 0);
    assert.equal(WalletReversal.find.mock.callCount(), 1);
  });

  test('asks the deposit ledger only for the half that was selected', async () => {
    mockAll();
    await fetch(`${base}/api/v1/accounting-exports/tally.csv?${range}&include=CASH_DEPOSIT`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.deepEqual(WalletAdjustment.find.mock.calls[0].arguments[0], {
      createdAt: { $gte: new Date('2026-07-31T18:30:00.000Z'), $lt: new Date('2026-08-31T18:30:00.000Z') },
      source: { $ne: 'PARENT_UPI' },
    });
  });

  test('writes only the selected type into the sheet', async () => {
    mockAll();
    // A deposit the selection did not ask for. It has to be absent because the
    // filter excluded it, not because the fixture was empty.
    mock.method(WalletAdjustment, 'find', () => query([{
      _id: '507f191e810c19729de860ef', studentId: student, source: 'ADMIN', amount: 1000,
      receiptNumber: 'GMS1408N24068001', createdAt: new Date('2026-08-14T05:00:00.000Z'),
    }]));
    mock.method(WalletReversal, 'find', () => query([{
      _id: '507f191e810c19729de860ea', studentId: student, amount: 250,
      receiptNumber: 'GMS1408N24068004', fulfillmentOrderId: ORDER_ID,
      createdAt: new Date('2026-08-14T06:00:00.000Z'),
    }]));

    const response = await fetch(`${base}/api/v1/accounting-exports/tally.csv?${range}&include=REFUND`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    const rows = (await response.text()).replace(/^\uFEFF/, '').trim().split('\r\n');

    assert.equal(rows.length, 2);
    assert.match(rows[1], /Refund - Order #E8608A,14 Aug 2026,Credit Note$/);
    assert.equal(response.headers.get('x-hungerhunt-row-count'), '1');
  });

  test('refuses a type it does not recognise rather than exporting less', async () => {
    mockAll();
    const response = await fetch(`${base}/api/v1/accounting-exports/tally.csv?${range}&include=DONATIONS`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(response.status, 400);
    assert.equal(Transaction.find.mock.callCount(), 0);
  });

  test('filters the voucher XML by the same selection', async () => {
    mockAll();
    const response = await fetch(`${base}/api/v1/accounting-exports/tally.xml?${range}&include=CASH_DEPOSIT`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });

    assert.equal(response.status, 200);
    assert.equal(Transaction.find.mock.callCount(), 0);
    assert.equal(WalletReversal.find.mock.callCount(), 0);
    assert.equal(WalletAdjustment.find.mock.callCount(), 1);
  });
});
