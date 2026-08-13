import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  PurchaseOrderStatus,
  assertPurchaseOrderTransition,
  canTransitionPurchaseOrder,
} from '../src/domain/procurement/purchaseOrderState.js';
import { ReviewPurchaseOrder } from '../src/application/procurement/useCases/reviewPurchaseOrder.js';

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
});

