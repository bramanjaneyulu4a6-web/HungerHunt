import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReplenishmentDraftItems } from '../src/application/replenishment/buildDraft.js';

test('drafts only reorder flags and subtracts open order coverage', () => {
  const items = buildReplenishmentDraftItems({
    analytics: { items: [
      {
        productId: 'a', productName: 'A', currentStock: 2,
        reorder: { reorderNow: true, suggestedReorderPoint: 10, recommendedOrderQuantityEoq: 20, estimatedUnitCost: 5 },
      },
      {
        productId: 'b', productName: 'B', currentStock: 20,
        reorder: { reorderNow: false, suggestedReorderPoint: 10, recommendedOrderQuantityEoq: 5, estimatedUnitCost: 3 },
      },
    ] },
    purchaseOrders: [
      { status: 'APPROVED', items: [{ productId: 'a', quantity: 12, received: 2 }] },
      { status: 'RECEIVED', items: [{ productId: 'a', quantity: 99, received: 99 }] },
    ],
  });
  assert.deepEqual(items, [{
    productId: 'a', productName: 'A', currentStock: 2,
    openOrderQuantity: 10, suggestedQuantity: 10, estimatedUnitCost: 5,
  }]);
});

test('omits a recommendation already covered by open orders', () => {
  const items = buildReplenishmentDraftItems({
    analytics: { items: [{
      productId: 'a', productName: 'A', currentStock: 2,
      reorder: { reorderNow: true, suggestedReorderPoint: 10, recommendedOrderQuantityEoq: null, estimatedUnitCost: null },
    }] },
    purchaseOrders: [{ status: 'PENDING_REVIEW', items: [{ productId: 'a', quantity: 8, received: 0 }] }],
  });
  assert.deepEqual(items, []);
});
