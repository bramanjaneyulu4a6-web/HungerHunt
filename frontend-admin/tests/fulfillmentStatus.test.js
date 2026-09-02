import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableFulfillmentStatuses,
  fulfillmentStatusLabel,
} from '../src/utils/fulfillmentStatus.js';

test('the paid order state is presented to admins as Confirmed, not Pending', () => {
  assert.equal(fulfillmentStatusLabel('PENDING'), 'Confirmed');
});

test('a paid active order can advance through each operational status', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: true }),
    ['PACKED']
  );
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PACKED', paymentProcessed: true }),
    ['OUT_FOR_DELIVERY']
  );
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'OUT_FOR_DELIVERY', paymentProcessed: true }),
    ['DELIVERED']
  );
});

test('status editing remains locked until payment has been processed', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: false }),
    []
  );
});
