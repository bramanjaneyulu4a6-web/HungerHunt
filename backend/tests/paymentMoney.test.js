import test from 'node:test';
import assert from 'node:assert/strict';
import { rupeesToPaise, paiseToRupees } from '../src/domain/payments/money.js';

test('whole and two-decimal rupees convert exactly', () => {
  assert.equal(rupeesToPaise(1), 100);
  assert.equal(rupeesToPaise(499.95), 49995);
  assert.equal(rupeesToPaise(0.01), 1);
});

test('float noise does not shave a paisa', () => {
  // 19.9 * 100 === 1989.9999999999998 in IEEE754
  assert.equal(rupeesToPaise(19.9), 1990);
});

test('invalid rupee amounts are refused', () => {
  for (const bad of [NaN, Infinity, -1, 1.005, '10', null]) {
    assert.throws(() => rupeesToPaise(bad));
  }
});

test('paise convert back and are validated', () => {
  assert.equal(paiseToRupees(49995), 499.95);
  for (const bad of [10.5, -1, NaN, '100']) {
    assert.throws(() => paiseToRupees(bad));
  }
});
