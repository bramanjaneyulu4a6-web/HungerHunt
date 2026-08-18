import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  analyzeInventory,
  calculateProcurementEfficiency,
} from '../src/domain/analytics/inventoryAnalytics.js';

const AS_OF = new Date('2026-08-12T00:00:00.000Z');
const daysAgo = (days) => new Date(AS_OF.getTime() - days * 86_400_000);

describe('deterministic inventory analytics', () => {
  test('classifies velocity across 30/60/90 day windows', () => {
    const report = analyzeInventory({
      asOf: AS_OF,
      products: [
        { id: 'fast', name: 'Fast', currentStock: 5, reorderLevel: 2, safetyStock: 0 },
        { id: 'dead', name: 'Dead', currentStock: 20, reorderLevel: 2, safetyStock: 0 },
      ],
      usageEvents: [
        { productId: 'fast', quantity: 40, occurredAt: daysAgo(10) },
        { productId: 'fast', quantity: 20, occurredAt: daysAgo(45) },
      ],
      purchaseOrders: [],
    });

    assert.equal(report.items[0].velocity.classification, 'HIGH_VELOCITY');
    assert.deepEqual(report.items[0].velocity.windows[30], {
      unitsUsed: 40,
      averageDailyUsage: 1.3333,
    });
    assert.equal(report.items[0].velocity.windows[60].unitsUsed, 60);
    assert.equal(report.items[1].velocity.classification, 'DEAD_STOCK');
    assert.equal(report.summary.deadStockCount, 1);
  });

  test('calculates reorder point, EOQ and inefficient small-batch flags', () => {
    const common = {
      status: 'APPROVED',
      createdAt: daysAgo(20),
      supplierLeadTimeDays: 5,
      items: [{ productId: 'p1', quantity: 10, unitCost: 10 }],
    };
    const report = analyzeInventory({
      asOf: AS_OF,
      products: [{ id: 'p1', name: 'Rice', currentStock: 5, reorderLevel: 4, safetyStock: 1 }],
      usageEvents: [
        { productId: 'p1', quantity: 9, occurredAt: daysAgo(2) },
        { productId: 'p1', quantity: 81, occurredAt: daysAgo(70) },
      ],
      purchaseOrders: [common, { ...common, createdAt: daysAgo(40) }, { ...common, createdAt: daysAgo(60) }],
      config: { orderingCost: 100, annualHoldingRate: 0.2 },
    });

    const item = report.items[0];
    assert.equal(item.reorder.supplierLeadTimeDays, 5);
    assert.equal(item.reorder.maxDailyUsage, 81);
    assert.equal(item.reorder.suggestedSafetyStock, 400);
    assert.equal(item.reorder.suggestedReorderPoint, 405);
    assert.equal(item.reorder.recommendedOrderQuantityEoq, 192);
    assert.equal(item.reorder.reorderNow, true);
    assert.equal(item.costOverrun.flagged, true);
  });

  test('is stable for the same inputs and effective date', () => {
    const input = {
      asOf: AS_OF,
      products: [{ id: 'p1', name: 'Item', currentStock: 0, reorderLevel: 0, safetyStock: 0 }],
      usageEvents: [],
      purchaseOrders: [],
    };
    assert.deepEqual(analyzeInventory(input), analyzeInventory(input));
  });
});

describe('procurement efficiency', () => {
  test('measures decisions and identifies the slowest pipeline stage', () => {
    const result = calculateProcurementEfficiency([
      {
        status: 'RECEIVED', createdAt: daysAgo(10), reviewedAt: daysAgo(9),
        approvedAt: daysAgo(9), receivedAt: daysAgo(2), items: [],
      },
      {
        status: 'REJECTED', createdAt: daysAgo(4), reviewedAt: daysAgo(2),
        rejectedAt: daysAgo(2), items: [],
      },
    ]);

    assert.equal(result.approvalRatio, 0.5);
    assert.equal(result.rejectionRatio, 0.5);
    assert.equal(result.averageReviewHours, 36);
    assert.equal(result.averageSupplierLeadTimeDays, 7);
    assert.equal(result.primaryBottleneck, 'SUPPLIER_DELIVERY');
  });
});

