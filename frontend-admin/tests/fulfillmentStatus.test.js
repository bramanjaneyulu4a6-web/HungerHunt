import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableFulfillmentStatuses,
  fulfillmentStatusLabel,
} from '../src/utils/fulfillmentStatus.js';

test('the paid order state is presented to admins as Confirmed, not Pending', () => {
  assert.equal(fulfillmentStatusLabel('PENDING'), 'Confirmed');
});

test('an admin can move a paid order between any active operational status', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: true }),
    ['PACKED', 'OUT_FOR_DELIVERY']
  );
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PACKED', paymentProcessed: true }),
    ['PENDING', 'OUT_FOR_DELIVERY']
  );
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'OUT_FOR_DELIVERY', paymentProcessed: true }),
    ['PENDING', 'PACKED', 'DELIVERED']
  );
});

test('the chevron remains available with an older API response that has no payment hint', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PACKED' }),
    ['PENDING', 'OUT_FOR_DELIVERY']
  );
});

test('status editing remains locked until payment has been processed', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: false }),
    []
  );
});
