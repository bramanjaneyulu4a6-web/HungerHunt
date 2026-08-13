import test, { afterEach, before, describe, mock } from 'node:test';
import assert from 'node:assert/strict';

process.env.JWT_SECRET ||= 'test-secret';
process.env.PARENT_JWT_SECRET ||= 'parent-test-secret';
process.env.NODE_ENV = 'test';
process.env.AUTH_BYPASS = 'false';
process.env.FEATURE_V1_PROCUREMENT = 'true';

const Admin = (await import('../models/Admin.js')).default;
const Transaction = (await import('../models/Transaction.js')).default;
const WalletAdjustment = (await import('../models/WalletAdjustment.js')).default;
const WalletReversal = (await import('../models/WalletReversal.js')).default;
const { buildTallyVoucherXml } = await import('../src/application/accounting/tallyXml.js');
const { signAdminToken, signStaffToken } = await import('../utils/tokens.js');
const app = (await import('../app.js')).default;

const ADMIN_ID = '507f1f77bcf86cd799439011';
const STUDENT_ID = '507f191e810c19729de860eb';
const SALE_ID = '507f191e810c19729de860ee';
const TOPUP_ID = '507f191e810c19729de860ef';
const adminToken = signAdminToken(ADMIN_ID);
const warehouseToken = signStaffToken(ADMIN_ID, 'warehouse');
const ledgers = {
  walletLiability: 'Student Wallet & Liability',
  sales: 'HungerHunt <Sales>',
  fundingClearing: 'Wallet Funding Clearing',
  salesVoucherType: 'Sales',
  receiptVoucherType: 'Receipt',
  refundVoucherType: 'Credit Note',
};
let base;

before(async () => {
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
  server.unref();
});

afterEach(() => mock.restoreAll());

const query = (rows) => ({
  select() { return this; }, sort() { return this; }, limit() { return this; }, async lean() { return rows; },
});

describe('TallyPrime accounting export', () => {
  test('emits balanced, escaped vouchers in business-date order', () => {
    const xml = buildTallyVoucherXml({
      transactions: [{
        _id: SALE_ID, studentId: STUDENT_ID, totalAmount: '12.50',
        createdAt: new Date('2026-08-12T19:00:00.000Z'),
      }],
      adjustments: [{
        _id: TOPUP_ID, studentId: STUDENT_ID, amount: 100,
        createdAt: new Date('2026-08-12T18:00:00.000Z'),
      }],
      reversals: [{
        _id: '507f191e810c19729de860ea', studentId: STUDENT_ID, amount: 5,
        createdAt: new Date('2026-08-12T20:00:00.000Z'),
      }],
      ledgers,
      timeZone: 'Asia/Kolkata',
    });

    assert.match(xml, /<TALLYREQUEST>Import<\/TALLYREQUEST>/);
    assert.match(xml, /Student Wallet &amp; Liability/);
    assert.match(xml, /HungerHunt &lt;Sales&gt;/);
    assert.match(xml, /<DATE>20260813<\/DATE>/);
    assert.ok(xml.indexOf(`HH-R-${TOPUP_ID}`) < xml.indexOf(`HH-S-${SALE_ID}`));
    assert.match(xml, /<AMOUNT>-100\.00<\/AMOUNT>[\s\S]*<AMOUNT>100\.00<\/AMOUNT>/);
    assert.match(xml, /<AMOUNT>-12\.50<\/AMOUNT>[\s\S]*<AMOUNT>12\.50<\/AMOUNT>/);
    assert.match(xml, /HH-CN-507f191e810c19729de860ea/);
    assert.doesNotMatch(xml, /parent|phone|password/i);
  });

  test('rejects historical values that cannot be represented exactly as paise', () => {
    assert.throws(() => buildTallyVoucherXml({
      transactions: [{
        _id: SALE_ID, studentId: STUDENT_ID, totalAmount: '1.001', createdAt: new Date(),
      }],
      adjustments: [], ledgers, timeZone: 'Asia/Kolkata',
    }), /two decimal places/);
  });

  test('is admin-only, bounded, and downloads native XML', async () => {
    mock.method(Admin, 'exists', async () => ({ _id: ADMIN_ID }));
    const denied = await fetch(`${base}/api/v1/accounting-exports/tally.xml?from=2026-08-01&to=2026-08-31`, {
      headers: { Authorization: `Bearer ${warehouseToken}` },
    });
    assert.equal(denied.status, 403);

    mock.method(Transaction, 'find', () => query([{
      _id: SALE_ID, studentId: STUDENT_ID, totalAmount: 12.5,
      createdAt: new Date('2026-08-13T00:00:00.000Z'),
    }]));
    mock.method(WalletAdjustment, 'find', () => query([]));
    mock.method(WalletReversal, 'find', () => query([]));
    const response = await fetch(`${base}/api/v1/accounting-exports/tally.xml?from=2026-08-01&to=2026-08-31`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type'), /application\/xml/);
    assert.equal(response.headers.get('x-hungerhunt-voucher-count'), '1');
    assert.match(await response.text(), new RegExp(`HH-S-${SALE_ID}`));

    const tooWide = await fetch(`${base}/api/v1/accounting-exports/tally.xml?from=2026-01-01&to=2026-08-31`, {
      headers: { Authorization: `Bearer ${adminToken}` },
    });
    assert.equal(tooWide.status, 400);
  });
});
