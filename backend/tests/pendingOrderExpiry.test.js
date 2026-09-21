// When an unanswered purchase request lapses: the end of the next day in the
// school's time zone, whatever time of day it was raised.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.BUSINESS_TIME_ZONE = 'Asia/Kolkata';

const { pendingOrderExpiry } = await import('../models/PendingOrder.js');

describe('a purchase request stays open until the end of the next day', () => {
  test('raised in the afternoon, it lapses at 23:59:59 IST the next day', () => {
    // 21 Sept 2026, 16:00 IST.
    const expiry = pendingOrderExpiry(new Date('2026-09-21T10:30:00.000Z'));
    assert.equal(expiry.toISOString(), '2026-09-22T18:29:59.000Z'); // 22 Sept, 23:59:59 IST
  });

  test('raised just after midnight IST, it still counts the IST day, not the UTC one', () => {
    // 22 Sept 2026, 00:15 IST — still 21 Sept in UTC.
    const expiry = pendingOrderExpiry(new Date('2026-09-21T18:45:00.000Z'));
    assert.equal(expiry.toISOString(), '2026-09-23T18:29:59.000Z'); // 23 Sept, 23:59:59 IST
  });

  test('raised on the last day of a month, it rolls into the next month', () => {
    // 30 Sept 2026, 20:00 IST.
    const expiry = pendingOrderExpiry(new Date('2026-09-30T14:30:00.000Z'));
    assert.equal(expiry.toISOString(), '2026-10-01T18:29:59.000Z'); // 1 Oct, 23:59:59 IST
  });
});
