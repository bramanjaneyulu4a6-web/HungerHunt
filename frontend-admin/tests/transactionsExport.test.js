import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const {
  EXPORT_KINDS,
  NO_STAFF,
  buildTransactionsCsv,
  effectiveKinds,
  exportParams,
  listParam,
  transactionsFilename,
  unavailableKinds,
} = await import('../src/utils/transactionsExport.js');

const BHARAT = '507f1f77bcf86cd799439011';
const ANITHA = '507f1f77bcf86cd799439012';
const STAFF_KEYS = [BHARAT, ANITHA, NO_STAFF];

describe('what the Export popup asks the server for', () => {
  test('everything ticked is sent as nothing, which the server reads as everything', () => {
    assert.equal(listParam(EXPORT_KINDS, EXPORT_KINDS), undefined);
    assert.deepEqual(
      exportParams({ from: '2026-09-01', to: '2026-09-18', kinds: EXPORT_KINDS, processedBy: STAFF_KEYS, staffKeys: STAFF_KEYS }),
      { from: '2026-09-01', to: '2026-09-18' }
    );
  });

  test('a narrower selection names what was ticked', () => {
    assert.deepEqual(
      exportParams({ from: '2026-09-18', to: '2026-09-18', kinds: ['CASH_DEPOSIT', 'REFUND'], processedBy: [BHARAT], staffKeys: STAFF_KEYS }),
      { from: '2026-09-18', to: '2026-09-18', include: 'CASH_DEPOSIT,REFUND', processedBy: BHARAT }
    );
  });

  test('offers refunds too, unlike the TallyPrime export', () => {
    assert.ok(EXPORT_KINDS.includes('REFUND'));
    assert.equal(EXPORT_KINDS.length, 5);
  });
});

const row = (overrides = {}) => ({
  id: 'a1',
  kind: 'CASH_DEPOSIT',
  mode: 'Cash',
  at: '2026-09-17T19:00:00.000Z',
  amount: 1000,
  signedAmount: 1000,
  receiptNumber: 'GMS1809N24068001',
  reference: null,
  student: { name: 'SAI HANVIKA KARANAM', admissionNumber: 'N24068', className: '6', section: 'B', roomNumber: 'A-12' },
  processedBy: 'Bharat',
  balanceBefore: 500,
  balanceAfter: 1500,
  note: '',
  gateway: null,
  deleted: false,
  deletion: null,
  ...overrides,
});

const lines = (csv) => csv.replace(/^\uFEFF/, '').trim().split('\r\n');

describe('the Transactions CSV', () => {
  test('opens with a BOM so Excel reads it as UTF-8', () => {
    assert.ok(buildTransactionsCsv([]).startsWith('\uFEFF'));
  });

  test('dates a row by the school clock, not UTC', () => {
    // 19:00 UTC on the 17th is half past midnight on the 18th in Kolkata.
    const [, first] = lines(buildTransactionsCsv([row()]));
    assert.equal(
      first,
      '1,18 Sep 2026,00:30,Cash Deposit,,SAI HANVIKA KARANAM,N24068,6,B,A-12,Cash,1000.00,500.00,1500.00,GMS1809N24068001,,,,Bharat,,,'
    );
  });

  test('signs money out negative and marks a deleted row with who and why', () => {
    const [, first] = lines(buildTransactionsCsv([row({
      kind: 'WALLET_DEDUCTION', mode: 'Wallet', amount: 250.1, signedAmount: -250.1, processedBy: null,
      deleted: true, deletion: { byName: 'Anitha', reason: 'Entered twice, by mistake' },
    })]));
    assert.match(first, /,Wallet Payment,Deleted,/);
    assert.match(first, /,-250\.10,/);
    assert.match(first, /,Anitha,"Entered twice, by mistake",$/);
  });

  test('keeps a row whose student was deleted', () => {
    const [, first] = lines(buildTransactionsCsv([row({ student: { name: '' } })]));
    assert.match(first, /,Deleted student,/);
  });
});

test('names the file after its period', () => {
  assert.equal(transactionsFilename({ from: '2026-09-18', to: '2026-09-18' }), 'hungerhunt-transactions-2026-09-18.csv');
  assert.equal(
    transactionsFilename({ from: '2026-09-01', to: '2026-09-18' }),
    'hungerhunt-transactions-2026-09-01-to-2026-09-18.csv'
  );
});

describe('types that need "No staff"', () => {
  test('with "No staff" ticked, every type stays available', () => {
    assert.deepEqual(unavailableKinds([BHARAT, NO_STAFF]), []);
    assert.deepEqual(effectiveKinds(EXPORT_KINDS, [BHARAT, NO_STAFF]), EXPORT_KINDS);
  });

  test('without it, only what staff make can be asked for', () => {
    assert.deepEqual(unavailableKinds([BHARAT]), ['UPI_DEPOSIT', 'UPI_ORDER_PAYMENT']);
    assert.deepEqual(effectiveKinds(EXPORT_KINDS, [BHARAT]), ['CASH_DEPOSIT', 'WALLET_DEDUCTION', 'REFUND']);
  });

  test('ticks survive, so ticking "No staff" again restores them', () => {
    const ticks = ['UPI_DEPOSIT', 'REFUND'];
    assert.deepEqual(effectiveKinds(ticks, [BHARAT]), ['REFUND']);
    assert.deepEqual(effectiveKinds(ticks, [BHARAT, NO_STAFF]), ticks);
  });
});
