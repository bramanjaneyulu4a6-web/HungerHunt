import test from 'node:test';
import assert from 'node:assert/strict';

import { lastUsedPurchaseRates } from './purchaseRates.js';

test('uses the newest recorded non-zero rate for each product', () => {
  const rates = lastUsedPurchaseRates([
    {
      submittedAt: '2026-09-20T00:00:00.000Z',
      items: [{ productId: 'dark-fantasy', estimatedUnitCost: 34.4 }],
    },
    {
      submittedAt: '2026-09-28T00:00:00.000Z',
      items: [
        { productId: 'dark-fantasy', estimatedUnitCost: 35.71 },
        { productId: 'maaza', estimatedUnitCost: 7.5 },
      ],
    },
  ]);

  assert.equal(rates.get('dark-fantasy'), 35.71);
  assert.equal(rates.get('maaza'), 7.5);
});

test('skips missing and zero placeholder prices', () => {
  const rates = lastUsedPurchaseRates([
    {
      submittedAt: '2026-09-28T00:00:00.000Z',
      items: [{ productId: 'appy', estimatedUnitCost: 0 }],
    },
    {
      submittedAt: '2026-09-27T00:00:00.000Z',
      items: [{ productId: 'appy', estimatedUnitCost: 8.75 }],
    },
  ]);

  assert.equal(rates.get('appy'), 8.75);
});

test('accepts populated product identifiers and legacy purchasePrice fields', () => {
  const rates = lastUsedPurchaseRates([{
    createdAt: '2026-09-28T00:00:00.000Z',
    items: [{ productId: { _id: 'green-lays' }, purchasePrice: 8.01 }],
  }]);

  assert.equal(rates.get('green-lays'), 8.01);
});
