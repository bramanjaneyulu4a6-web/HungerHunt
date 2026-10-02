import test from 'node:test';
import assert from 'node:assert/strict';

import {
  inventoryReceiptHistoryRows,
  receiptAddedStock,
} from '../utils/inventoryReceiptHistory.js';

const PRODUCT_ID = '507f191e810c19729de860ec';

test('turns received inventory-order units into one positive history row', () => {
  const rows = inventoryReceiptHistoryRows([{
    _id: 'r1',
    createdAt: '2026-09-28T11:29:28.000Z',
    stockApplied: true,
    invoiceNumber: 'INV-42',
    receivedBy: { email: 'warehouse@example.com' },
    purchaseId: { _id: 'p1', supplierId: { name: 'Sri Rama Agencies' } },
    lines: [
      { productId: PRODUCT_ID, received: 30, damaged: 2 },
      { productId: { _id: PRODUCT_ID }, received: 10, damaged: 0 },
      { productId: '507f191e810c19729de860ed', received: 99, damaged: 0 },
    ],
  }], PRODUCT_ID);

  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'RECEIPT');
  assert.equal(rows[0].delta, 40);
  assert.equal(rows[0].stockAfter, null);
  assert.equal(rows[0].adjustedBy.email, 'warehouse@example.com');
  assert.match(rows[0].reason, /Sri Rama Agencies/);
  assert.match(rows[0].reason, /INV-42/);
});

test('damaged units and receipts that did not apply stock stay out of history', () => {
  const rows = inventoryReceiptHistoryRows([
    {
      _id: 'damaged', stockApplied: true,
      lines: [{ productId: PRODUCT_ID, received: 0, damaged: 5 }],
    },
    {
      _id: 'explicit-false', stockApplied: false,
      lines: [{ productId: PRODUCT_ID, received: 100, damaged: 0 }],
    },
    {
      _id: 'legacy-opening',
      note: 'Backfilled receipt record; stock was already represented by the opening-stock reconciliation.',
      lines: [{ productId: PRODUCT_ID, received: 100, damaged: 0 }],
    },
  ], PRODUCT_ID);

  assert.deepEqual(rows, []);
});

test('ordinary legacy receipts without the new flag still appear', () => {
  assert.equal(receiptAddedStock({ note: 'Closed from the back office in one step.' }), true);
});
