import test from 'node:test';
import assert from 'node:assert/strict';

import { availableFulfillmentStatuses, isCancellableFulfillment } from './fulfillmentStatus.js';

// An order sent to the parent is answered with accept or decline only; the
// package stages open up once it is accepted and becomes a paid package.
test('an order waiting on the parent offers no package stage and no cancellation', () => {
  const waiting = { id: 'r1', awaitingParent: true, status: 'PENDING' };

  assert.deepEqual(availableFulfillmentStatuses(waiting), []);
  assert.equal(isCancellableFulfillment(waiting), false);
});

test('once accepted, the confirmed package offers every other stage and cancellation', () => {
  const confirmed = { id: 'f1', status: 'PENDING' };

  assert.deepEqual(availableFulfillmentStatuses(confirmed), ['PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED']);
  assert.equal(isCancellableFulfillment(confirmed), true);
});
