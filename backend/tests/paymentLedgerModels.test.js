import test from 'node:test';
import assert from 'node:assert/strict';
import WalletAdjustment from '../models/WalletAdjustment.js';
import Transaction from '../models/Transaction.js';

const ID = '507f1f77bcf86cd799439011';

test('an admin adjustment still requires performedBy', () => {
  const doc = new WalletAdjustment({
    studentId: ID, amount: 100, previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.ok(doc.validateSync()?.errors?.performedBy);
});

test('a parent UPI adjustment requires paymentIntentId instead of performedBy', () => {
  const missingIntent = new WalletAdjustment({
    studentId: ID, source: 'PARENT_UPI', amount: 100,
    previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.ok(missingIntent.validateSync()?.errors?.paymentIntentId);

  const ok = new WalletAdjustment({
    studentId: ID, source: 'PARENT_UPI', paymentIntentId: ID, amount: 100,
    previousBalance: 0, newBalance: 100, idempotencyKey: 'k',
  });
  assert.equal(ok.validateSync(), undefined);
});

test('one wallet credit per payment intent is enforced by a unique index', () => {
  const idx = WalletAdjustment.schema.indexes().find(
    ([keys, opts]) => keys.paymentIntentId === 1 && opts.unique && opts.partialFilterExpression
  );
  assert.ok(idx);
});

test('UPI_ORDER_PAYMENT is a legal transaction source with its own uniqueness', () => {
  const doc = new Transaction({
    studentId: ID, totalAmount: 10, previousBalance: 50, remainingBalance: 50,
    sourceType: 'UPI_ORDER_PAYMENT', sourceId: ID,
  });
  assert.equal(doc.validateSync(), undefined);

  const idx = Transaction.schema.indexes().find(
    ([, opts]) => opts.partialFilterExpression?.sourceType === 'UPI_ORDER_PAYMENT' && opts.unique
  );
  assert.ok(idx);
});
