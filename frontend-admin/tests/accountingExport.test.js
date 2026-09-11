import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { EXPORT_FORMATS, exportFilename, exportedCount } = await import(
  '../src/utils/accountingExport.js'
);

describe('the two shapes the accounting export comes in', () => {
  test('the XML is what TallyPrime imports natively', () => {
    assert.equal(EXPORT_FORMATS.xml.path, '/v1/accounting-exports/tally.xml');
    assert.equal(EXPORT_FORMATS.xml.fallbackName, 'hungerhunt-tally.xml');
  });

  test('the CSV is the spreadsheet the office reconciles from', () => {
    assert.equal(EXPORT_FORMATS.csv.path, '/v1/accounting-exports/tally.csv');
    assert.equal(EXPORT_FORMATS.csv.fallbackName, 'hungerhunt-tally.csv');
  });

  test('each format counts what it actually produced', () => {
    assert.equal(exportedCount(EXPORT_FORMATS.xml, { 'x-hungerhunt-voucher-count': '12' }), '12 vouchers exported');
    assert.equal(exportedCount(EXPORT_FORMATS.csv, { 'x-hungerhunt-row-count': '12' }), '12 rows exported');
  });

  test('a count the server did not send reads as none rather than as undefined', () => {
    assert.equal(exportedCount(EXPORT_FORMATS.csv, {}), '0 rows exported');
  });
});

/* The server names the file — it knows the date range and the extension. The
   fallback exists only for a response that arrives without the header. */
describe('what the downloaded file is called', () => {
  test('takes the name the server put on the response', () => {
    assert.equal(
      exportFilename('attachment; filename="hungerhunt-tally-2026-08-01-to-2026-08-31.csv"', EXPORT_FORMATS.csv),
      'hungerhunt-tally-2026-08-01-to-2026-08-31.csv'
    );
  });

  test('falls back to the format default when the header says nothing', () => {
    assert.equal(exportFilename('', EXPORT_FORMATS.csv), 'hungerhunt-tally.csv');
    assert.equal(exportFilename(undefined, EXPORT_FORMATS.xml), 'hungerhunt-tally.xml');
  });
});

const { MOVEMENT_TYPES, quickRange, quickRangeLabel, includeParam } = await import(
  '../src/utils/accountingExport.js'
);

describe('the movement types an export can be narrowed to', () => {
  test('offers the five the ledger actually distinguishes', () => {
    assert.deepEqual(
      MOVEMENT_TYPES.map((type) => type.key),
      ['CASH_DEPOSIT', 'UPI_DEPOSIT', 'WALLET_DEDUCTION', 'UPI_ORDER_PAYMENT', 'REFUND']
    );
  });

  test('sends the selection as the comma list the server parses', () => {
    assert.equal(includeParam(['CASH_DEPOSIT', 'REFUND']), 'CASH_DEPOSIT,REFUND');
  });
});

/* The school's day, not the browser's. An admin exporting at 11pm from a
   laptop still on UTC would otherwise ask for yesterday. */
describe('the ranges the quick buttons stand for', () => {
  const at = (iso) => new Date(iso);

  test('today is the current business day, both ends', () => {
    assert.deepEqual(quickRange('today', at('2026-09-07T02:00:00Z')), {
      from: '2026-09-07',
      to: '2026-09-07',
    });
  });

  test('late evening in Kolkata is still the same business day', () => {
    // 23:30 IST on the 7th, which is 18:00 UTC.
    assert.deepEqual(quickRange('today', at('2026-09-07T18:00:00Z')), {
      from: '2026-09-07',
      to: '2026-09-07',
    });
  });

  test('after midnight IST has rolled over even though UTC has not', () => {
    // 00:30 IST on the 8th, which is 19:00 UTC on the 7th.
    assert.deepEqual(quickRange('today', at('2026-09-07T19:00:00Z')), {
      from: '2026-09-08',
      to: '2026-09-08',
    });
  });

  test('this week runs from the most recent Sunday to today', () => {
    // Wednesday 9 Sep 2026; the Sunday before is the 6th.
    assert.deepEqual(quickRange('week', at('2026-09-09T06:00:00Z')), {
      from: '2026-09-06',
      to: '2026-09-09',
    });
  });

  test('on a Sunday this week is that one day', () => {
    assert.deepEqual(quickRange('week', at('2026-09-06T06:00:00Z')), {
      from: '2026-09-06',
      to: '2026-09-06',
    });
  });

  test('a week reaching back over a year boundary keeps both dates real', () => {
    // Thursday 1 Jan 2026; the Sunday before is 28 Dec 2025.
    assert.deepEqual(quickRange('week', at('2026-01-01T06:00:00Z')), {
      from: '2025-12-28',
      to: '2026-01-01',
    });
  });
});

describe('what a quick button says it will export', () => {
  test('a single day reads as that day', () => {
    assert.equal(quickRangeLabel({ from: '2026-09-07', to: '2026-09-07' }), '7 Sep 2026');
  });

  test('a span inside one year names the year once', () => {
    assert.equal(quickRangeLabel({ from: '2026-09-06', to: '2026-09-09' }), '6 Sep – 9 Sep 2026');
  });

  test('a span across a year names both years', () => {
    assert.equal(
      quickRangeLabel({ from: '2025-12-28', to: '2026-01-01' }),
      '28 Dec 2025 – 1 Jan 2026'
    );
  });
});
