import test from 'node:test';
import assert from 'node:assert/strict';
import PaymentIntent from '../models/PaymentIntent.js';

const base = {
  parentId: '507f1f77bcf86cd799439011',
  studentId: '507f1f77bcf86cd799439012',
  amountPaise: 49995,
  merchantOrderId: 'HH-507f1f77bcf86cd799439099',
};

test('a topup intent validates without a pendingOrderId', () => {
  const doc = new PaymentIntent({ ...base, purpose: 'TOPUP' });
  assert.equal(doc.validateSync(), undefined);
  assert.equal(doc.status, 'CREATED');
  assert.equal(doc.provider, 'PHONEPE');
});

test('an order intent requires its pendingOrderId', () => {
  const missing = new PaymentIntent({ ...base, purpose: 'ORDER' });
  assert.ok(missing.validateSync()?.errors?.pendingOrderId);
  const ok = new PaymentIntent({
    ...base, purpose: 'ORDER', pendingOrderId: '507f1f77bcf86cd799439013',
  });
  assert.equal(ok.validateSync(), undefined);
});

test('amountPaise must meet PhonePe\'s ₹1 minimum as an integer', () => {
  for (const bad of [0, -100, 99, 10.5]) {
    const doc = new PaymentIntent({ ...base, purpose: 'TOPUP', amountPaise: bad });
    assert.ok(doc.validateSync()?.errors?.amountPaise, `accepted ${bad}`);
  }
});

test('merchantOrderId is indexed unique', () => {
  const unique = PaymentIntent.schema.indexes()
    .find(([keys, opts]) => keys.merchantOrderId === 1 && opts.unique);
  assert.ok(unique);
});
