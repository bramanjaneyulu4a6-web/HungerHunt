import test from 'node:test';
import assert from 'node:assert/strict';
import { businessDateAt, businessDateStart, businessPeriodStart } from '../utils/businessTime.js';

test('daily spending limits start at midnight in the business timezone', () => {
  const now = new Date('2026-08-12T18:45:00.000Z'); // 13 Aug in Kolkata
  assert.equal(
    businessPeriodStart('DAILY', now, 'Asia/Kolkata').toISOString(),
    '2026-08-12T18:30:00.000Z'
  );
});

test('weekly spending limits start Sunday in the business timezone', () => {
  const now = new Date('2026-08-12T10:00:00.000Z'); // Wednesday
  assert.equal(
    businessPeriodStart('WEEKLY', now, 'Asia/Kolkata').toISOString(),
    '2026-08-08T18:30:00.000Z'
  );
});

test('monthly boundaries work across a daylight-saving zone', () => {
  const now = new Date('2026-03-20T12:00:00.000Z');
  assert.equal(
    businessPeriodStart('MONTHLY', now, 'America/New_York').toISOString(),
    '2026-03-01T05:00:00.000Z'
  );
});

test('accounting dates begin at midnight in the business timezone', () => {
  assert.equal(
    businessDateStart('2026-08-13', 'Asia/Kolkata').toISOString(),
    '2026-08-12T18:30:00.000Z'
  );
  assert.throws(() => businessDateStart('2026-02-30', 'Asia/Kolkata'), /valid calendar date/);
});

test('business analytics dates do not use UTC date boundaries', () => {
  assert.equal(businessDateAt(new Date('2026-08-12T19:00:00.000Z'), 'Asia/Kolkata'), '2026-08-13');
});
