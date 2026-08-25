import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  AGE_OUT_DAYS,
  KNOWN_PROVIDER_STATES,
  isProviderOrderMissing,
  shouldAgeOut,
  unknownProviderStateFilter,
} from '../src/domain/payments/reconcilePolicy.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-08-25T02:00:00Z');

const intentCreatedDaysAgo = (days) => ({
  createdAt: new Date(NOW.getTime() - days * DAY_MS),
});

const orderMissingError = (statusCode = 400) =>
  Object.assign(new Error(`PhonePe GET .../status failed (${statusCode}): no such order`), { statusCode });

describe('isProviderOrderMissing', () => {
  test('a 400 or 404 from the PG API means the order does not exist', () => {
    assert.equal(isProviderOrderMissing(orderMissingError(400)), true);
    assert.equal(isProviderOrderMissing(orderMissingError(404)), true);
  });

  // Everything a retry can fix must keep retrying forever: network errors
  // carry no statusCode at all, 5xx is the provider having a bad day, 429 is
  // the provider asking us to back off, and a token failure (which the
  // adapter deliberately never tags with statusCode) is our credentials, not
  // the order's existence.
  test('network, 5xx, 429 and token errors are not "order missing"', () => {
    assert.equal(isProviderOrderMissing(new Error('fetch failed')), false);
    assert.equal(isProviderOrderMissing(orderMissingError(500)), false);
    assert.equal(isProviderOrderMissing(orderMissingError(503)), false);
    assert.equal(isProviderOrderMissing(orderMissingError(429)), false);
    assert.equal(isProviderOrderMissing(new Error('PhonePe token request failed (400)')), false);
    assert.equal(isProviderOrderMissing(undefined), false);
  });
});

describe('shouldAgeOut', () => {
  test('an old intent the provider has never heard of is retired', () => {
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(AGE_OUT_DAYS), orderMissingError(), NOW), true);
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(AGE_OUT_DAYS + 30), orderMissingError(404), NOW), true);
  });

  test('a young intent is left to keep retrying even when the order is missing', () => {
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(0), orderMissingError(), NOW), false);
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(AGE_OUT_DAYS - 1), orderMissingError(), NOW), false);
  });

  // The one-way door only opens on the provider's own "does not exist" — an
  // ancient intent failing on network trouble might be COMPLETED at PhonePe
  // with real captured money, and must never be written off.
  test('age alone never retires an intent — retryable errors loop forever', () => {
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(365), new Error('fetch failed'), NOW), false);
    assert.equal(shouldAgeOut(intentCreatedDaysAgo(365), orderMissingError(503), NOW), false);
  });

  test('a missing createdAt is never aged out', () => {
    assert.equal(shouldAgeOut({}, orderMissingError(), NOW), false);
  });
});

describe('unknownProviderStateFilter', () => {
  test('targets open intents whose recorded state is outside the known vocabulary', () => {
    const filter = unknownProviderStateFilter();
    assert.deepEqual(filter.status, { $in: ['CREATED', 'PENDING'] });
    // null must be excluded from "unknown": most open intents have never had
    // a providerState written at all, and they are not an operator queue.
    assert.deepEqual(filter.providerState, { $nin: [...KNOWN_PROVIDER_STATES, null] });
  });

  test('the known vocabulary is exactly what settlePaymentIntent handles', () => {
    assert.deepEqual([...KNOWN_PROVIDER_STATES].sort(), ['COMPLETED', 'EXPIRED', 'FAILED', 'PENDING']);
  });
});
