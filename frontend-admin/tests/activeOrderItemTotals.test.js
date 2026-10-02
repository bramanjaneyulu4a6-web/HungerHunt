import assert from 'node:assert/strict';
import test from 'node:test';

import { activeOrderItemTotals } from '../src/utils/activeOrderItemTotals.js';

test('groups item quantities across every active-order stage', () => {
  const result = activeOrderItemTotals([
    {
      id: 'request-1',
      awaitingParent: true,
      items: [
        { productId: 'appy', name: 'Appy Fizz', quantity: 2 },
        { productId: 'naturo', name: 'Naturo Mango Blast', quantity: 1 },
      ],
    },
    {
      id: 'package-1',
      status: 'PENDING',
      items: [
        { productId: 'appy', name: 'Appy Fizz', quantity: 3 },
        { productId: 'naturo', name: 'Naturo Mango Blast', quantity: 2 },
      ],
    },
    {
      id: 'package-2',
      status: 'PACKED',
      items: [{ productId: 'appy', name: 'Appy Fizz', quantity: 4 }],
    },
    {
      id: 'package-3',
      status: 'OUT_FOR_DELIVERY',
      items: [{ productId: 'naturo', name: 'Naturo Mango Blast', quantity: 5 }],
    },
  ]);

  assert.equal(result.activeOrders, 4);
  assert.equal(result.totalUnits, 17);
  assert.deepEqual(result.statusCounts, {
    AWAITING_PARENT: 1,
    PENDING: 1,
    PACKED: 1,
    OUT_FOR_DELIVERY: 1,
  });
  assert.deepEqual(result.rows, [
    {
      product: 'Appy Fizz',
      awaitingParent: 2,
      pending: 3,
      packed: 4,
      outForDelivery: 0,
      totalUnits: 9,
      orders: 3,
    },
    {
      product: 'Naturo Mango Blast',
      awaitingParent: 1,
      pending: 2,
      packed: 0,
      outForDelivery: 5,
      totalUnits: 8,
      orders: 3,
    },
  ]);
});

test('returns an empty live summary when there are no active orders', () => {
  assert.deepEqual(activeOrderItemTotals([]), {
    activeOrders: 0,
    statusCounts: {},
    totalUnits: 0,
    rows: [],
  });
});
