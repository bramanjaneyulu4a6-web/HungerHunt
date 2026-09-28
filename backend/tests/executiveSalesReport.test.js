import test from 'node:test';
import assert from 'node:assert/strict';

import { buildExecutiveSalesReport } from '../src/domain/analytics/executiveSalesReport.js';

const from = new Date('2026-09-01T00:00:00.000Z');
const to = new Date('2026-09-08T00:00:00.000Z');
const previousFrom = new Date('2026-08-25T00:00:00.000Z');

const transaction = (overrides = {}) => ({
  studentId: 'student-1',
  totalAmount: 200,
  sourceType: 'DIRECT_CHECKOUT',
  createdAt: '2026-09-02T08:00:00.000Z',
  items: [{ productId: 'product-1', name: 'Lunch', quantity: 2, price: 100 }],
  ...overrides,
});

const receipt = (overrides = {}) => ({
  createdAt: '2026-09-01T08:00:00.000Z',
  purchaseId: { items: [{ productId: 'product-1', purchasePrice: 60 }] },
  lines: [{ productId: 'product-1', received: 10, damaged: 1, purchasePrice: 50 }],
  ...overrides,
});

const build = (overrides = {}) => buildExecutiveSalesReport({
  currentTransactions: [transaction()],
  previousTransactions: [transaction({ totalAmount: 100 })],
  receipts: [receipt()],
  from,
  to,
  previousFrom,
  timeZone: 'UTC',
  ...overrides,
});

test('summarises revenue, margin, procurement and comparison', () => {
  const report = build();

  assert.equal(report.summary.revenue, 200);
  assert.equal(report.summary.estimatedCogs, 100);
  assert.equal(report.summary.estimatedGrossProfit, 100);
  assert.equal(report.summary.estimatedGrossMargin, 50);
  assert.equal(report.summary.costCoverage, 100);
  assert.equal(report.procurement.spend, 550);
  assert.equal(report.procurement.damagedLoss, 50);
  assert.equal(report.comparison.revenueChange, 100);
  assert.equal(report.topProducts[0].name, 'Lunch');
});

test('does not present missing purchase costs as free stock', () => {
  const report = build({ receipts: [] });

  assert.equal(report.summary.costCoverage, 0);
  assert.equal(report.summary.estimatedGrossProfit, 0);
  assert.equal(report.summary.estimatedGrossMargin, 0);
  assert.equal(report.topProducts[0].estimatedProfit, null);
  assert.equal(report.topProducts[0].costKnown, false);
});

test('uses the purchase-order price when a receipt has no invoice price', () => {
  const report = build({
    receipts: [receipt({
      lines: [{ productId: 'product-1', received: 4, damaged: 0 }],
    })],
  });

  assert.equal(report.summary.estimatedCogs, 120);
  assert.equal(report.procurement.spend, 240);
});

test('keeps channels and daily trend separate while counting unique customers', () => {
  const report = build({
    currentTransactions: [
      transaction(),
      transaction({
        studentId: 'student-2',
        totalAmount: 75,
        sourceType: 'UPI_ORDER_PAYMENT',
        createdAt: '2026-09-03T08:00:00.000Z',
        items: [{ productId: 'product-1', name: 'Lunch', quantity: 1, price: 75 }],
      }),
    ],
  });

  assert.equal(report.summary.customers, 2);
  assert.equal(report.trend.length, 2);
  assert.deepEqual(report.channels.map((row) => row.name), ['Point of sale', 'UPI order']);
});
