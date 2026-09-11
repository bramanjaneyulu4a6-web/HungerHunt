import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { entryReference, businessDateToday, receiptEntryFromTopUp } = await import(
  '../src/utils/ledgerEntry.js'
);

/* The Reference column is what an admin reads back to a parent on the phone,
   and for money coming in that is the receipt number — the one figure printed
   on the paper the family holds. The gateway's own reference means nothing to
   either of them; it stays in the row's detail for the rare call to support. */
describe('what a ledger row is referenced by', () => {
  test('a cash deposit is referenced by its receipt number', () => {
    assert.equal(
      entryReference({ kind: 'TOP_UP', mode: 'CASH', receiptNumber: 'GMS0709990123001' }),
      'GMS0709990123001'
    );
  });

  test('a UPI deposit is referenced by its receipt number, not the gateway\'s', () => {
    assert.equal(
      entryReference({
        kind: 'TOP_UP',
        mode: 'UPI',
        receiptNumber: 'GMS0709990123002',
        transactionId: 'HH-507f1f77bcf86cd799439051',
      }),
      'GMS0709990123002'
    );
  });

  /* Deposits written before numbering moved to creation time carry no number
     until someone opens that student's ledger. Until then the gateway
     reference is better than an em dash. */
  test('a deposit still waiting for its number falls back to the gateway reference', () => {
    assert.equal(
      entryReference({
        kind: 'TOP_UP',
        mode: 'UPI',
        receiptNumber: null,
        transactionId: 'HH-507f1f77bcf86cd799439051',
      }),
      'HH-507f1f77bcf86cd799439051'
    );
  });

  test('an unnumbered cash deposit has nothing to reference', () => {
    assert.equal(entryReference({ kind: 'TOP_UP', mode: 'CASH', receiptNumber: null }), null);
  });

  // Money going out is still asked about by the package it bought.
  test('an order charge is referenced by its order number, stripped of the #', () => {
    assert.equal(
      entryReference({ kind: 'ORDER_PAYMENT', orderId: '#E860AB', receiptNumber: null }),
      'E860AB'
    );
  });
});

/* The dashboard shows one business day at a time, and the school's day is not
   the server's: an evening sale in Kolkata is still yesterday in UTC. */
describe('the business day the dashboard opens on', () => {
  test('is the IST calendar date, as YYYY-MM-DD', () => {
    // 19:30 UTC on the 6th is 01:00 IST on the 7th.
    assert.equal(businessDateToday(new Date('2026-09-06T19:30:00.000Z')), '2026-09-07');
  });

  test('does not roll forward before IST midnight', () => {
    // 18:29 UTC on the 6th is 23:59 IST, still the 6th.
    assert.equal(businessDateToday(new Date('2026-09-06T18:29:00.000Z')), '2026-09-06');
  });
});

/* A recharge answers with the adjustment it wrote, and the desk wants that
   deposit's receipt on screen at once. The row the receipt route is opened by
   is the adjustment — handing it the student id, or the response itself, would
   fetch nothing or the wrong document. */
describe('the receipt a fresh recharge opens', () => {
  test('is opened by the adjustment the recharge wrote', () => {
    assert.deepEqual(
      receiptEntryFromTopUp({
        message: 'Wallet recharged successfully',
        newBalance: 600,
        adjustment: { _id: '507f191e810c19729de860ad', receiptNumber: 'GMS0709990123001' },
      }),
      { adjustmentId: '507f191e810c19729de860ad', receiptNumber: 'GMS0709990123001' }
    );
  });

  /* A repeated Idempotency-Key replays the first top-up rather than making a
     second. That deposit's receipt is the right one to show. */
  test('a replayed recharge opens the deposit it replayed', () => {
    assert.deepEqual(
      receiptEntryFromTopUp({
        message: 'Wallet top-up already applied.',
        replayed: true,
        adjustment: { _id: '507f191e810c19729de860ad', receiptNumber: 'GMS0709990123001' },
      }),
      { adjustmentId: '507f191e810c19729de860ad', receiptNumber: 'GMS0709990123001' }
    );
  });

  /* A deposit whose student has no admission number is written unnumbered.
     The PDF route still renders it, and names the file itself. */
  test('an unnumbered deposit still opens, carrying no number', () => {
    assert.deepEqual(
      receiptEntryFromTopUp({ adjustment: { _id: '507f191e810c19729de860ad' } }),
      { adjustmentId: '507f191e810c19729de860ad', receiptNumber: null }
    );
  });

  // Nothing to open rather than a popup fetching /receipts/undefined/pdf.
  test('a response with no adjustment opens nothing', () => {
    assert.equal(receiptEntryFromTopUp({ newBalance: 600 }), null);
    assert.equal(receiptEntryFromTopUp(undefined), null);
  });
});
