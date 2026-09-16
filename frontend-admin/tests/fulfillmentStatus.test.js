import test from 'node:test';
import assert from 'node:assert/strict';

import {
  availableFulfillmentStatuses,
  fulfillmentActionLabel,
  fulfillmentStatusDisplay,
  fulfillmentStatusLabel,
  isCancellableFulfillment,
} from '../src/utils/fulfillmentStatus.js';

test('the paid order state is presented to admins as Confirmed, not Pending', () => {
  assert.equal(fulfillmentStatusLabel('PENDING'), 'Confirmed');
});

test('an admin can move a paid order to any other life stage, forwards or back', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: true }),
    ['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED']
  );
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'COLLECTED', paymentProcessed: true }),
    ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED']
  );
  // Cancellation moved money; it is not a stage to move back out of.
  assert.deepEqual(availableFulfillmentStatuses({ status: 'CANCELLED' }), []);
});

test('the chevron remains available with an older API response that has no payment hint', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PACKED' }),
    ['PENDING', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED']
  );
});

test('only a package still in the storeroom can be cancelled', () => {
  assert.equal(isCancellableFulfillment({ status: 'PENDING' }), true);
  assert.equal(isCancellableFulfillment({ status: 'PACKED' }), true);
  assert.equal(isCancellableFulfillment({ status: 'OUT_FOR_DELIVERY' }), false);
  assert.equal(isCancellableFulfillment({ status: 'PENDING', paymentProcessed: false }), false);
});

test('the handover badge names the receiver from either order shape', () => {
  assert.equal(fulfillmentStatusDisplay({ status: 'DELIVERED', proofOfDelivery: { receivedBy: 'Meera' } }), 'Out for delivery, handed to Meera');
  assert.equal(fulfillmentStatusDisplay({ status: 'DELIVERED', receivedBy: 'Meera' }), 'Out for delivery, handed to Meera');
  assert.match(fulfillmentActionLabel('COLLECTED'), /collected by the student/);
});

test('status editing remains locked until payment has been processed', () => {
  assert.deepEqual(
    availableFulfillmentStatuses({ status: 'PENDING', paymentProcessed: false }),
    []
  );
});
