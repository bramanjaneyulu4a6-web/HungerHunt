import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PurchaseOrderStatus,
  assertPurchaseOrderTransition,
  canTransitionPurchaseOrder,
} from '../src/domain/procurement/purchaseOrderState.js';
import { ReviewPurchaseOrder } from '../src/application/procurement/useCases/reviewPurchaseOrder.js';
import { ApprovePurchaseOrderIntoInventory } from '../src/application/procurement/useCases/approvePurchaseOrderIntoInventory.js';

describe('purchase order state machine', () => {
  test('allows only explicit lifecycle transitions', () => {
    assert.equal(canTransitionPurchaseOrder('PENDING_REVIEW', 'APPROVED'), true);
    assert.equal(canTransitionPurchaseOrder('PENDING_REVIEW', 'RECEIVED'), false);
    assert.equal(canTransitionPurchaseOrder('REJECTED', 'APPROVED'), false);
    assert.throws(
      () => assertPurchaseOrderTransition('REJECTED', 'APPROVED'),
      /cannot transition/
    );
  });

  test('review uses an atomic expected-state transition', async () => {
    let command;
    const repository = {
      transition: async (input) => {
        command = input;
        return { _id: 'po', status: input.to };
      },
      findById: async () => null,
    };
    const clock = () => new Date('2026-08-12T00:00:00.000Z');
    const useCase = new ReviewPurchaseOrder({ purchaseOrderRepository: repository, clock });

    await useCase.execute({
      id: 'po',
      decision: PurchaseOrderStatus.APPROVED,
      reason: 'Within budget',
      actor: { id: 'admin' },
    });

    assert.equal(command.from, PurchaseOrderStatus.PENDING_REVIEW);
    assert.equal(command.to, PurchaseOrderStatus.APPROVED);
    assert.equal(command.changes.reviewedBy, 'admin');
  });

  test('approval books every line once and finishes the order as received', async () => {
    const transitions = [];
    const receivedLines = [];
    const inventory = [];
    const receipts = [];
    const repository = {
      transition: async (input) => {
        transitions.push(input);
        return input.to === PurchaseOrderStatus.APPROVED
          ? {
              _id: 'po',
              status: input.to,
              items: [
                { productId: 'p1', quantity: 20, purchasePrice: 35.71 },
                { productId: 'p2', quantity: 8, purchasePrice: 5 },
              ],
            }
          : { _id: 'po', status: input.to, items: [] };
      },
      findById: async () => null,
      setLineReceived: async (...args) => { receivedLines.push(args.slice(0, 3)); },
    };
    const reviewer = new ReviewPurchaseOrder({ purchaseOrderRepository: repository });
    const useCase = new ApprovePurchaseOrderIntoInventory({
      reviewPurchaseOrder: reviewer,
      purchaseOrderRepository: repository,
      inventoryRepository: { add: async (...args) => { inventory.push(args.slice(0, 2)); } },
      goodsReceiptRepository: { create: async (document) => { receipts.push(document); } },
      clock: () => new Date('2026-09-28T10:00:00.000Z'),
    });

    const result = await useCase.execute({ id: 'po', reason: '', actor: { id: 'admin' } });

    assert.equal(result.status, PurchaseOrderStatus.RECEIVED);
    assert.deepEqual(transitions.map((row) => [row.from, row.to]), [
      [PurchaseOrderStatus.PENDING_REVIEW, PurchaseOrderStatus.APPROVED],
      [PurchaseOrderStatus.APPROVED, PurchaseOrderStatus.RECEIVED],
    ]);
    assert.deepEqual(inventory, [['p1', 20], ['p2', 8]]);
    assert.deepEqual(receivedLines, [['po', 'p1', 20], ['po', 'p2', 8]]);
    assert.equal(receipts.length, 1);
    assert.equal(receipts[0].clientToken, 'approval-po');
    assert.equal(receipts[0].lines[0].purchasePrice, 35.71);
  });
});
