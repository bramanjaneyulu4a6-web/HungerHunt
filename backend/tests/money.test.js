import test from 'node:test';
import assert from 'node:assert/strict';

import {
  MoneyValidationError,
  assertPaise,
  paiseToRupees,
  rupeesToPaise,
  sumPaise,
} from '../utils/money.js';

test('converts rupees to integer paise without multiplying decimals', () => {
  assert.equal(rupeesToPaise('0.10'), 10);
  assert.equal(rupeesToPaise('12.5'), 1250);
  assert.equal(rupeesToPaise(120000), 12_000_000);
});

test('rejects ambiguous or lossy rupee values', () => {
  for (const value of ['1.001', '1e3', '', '₹10', Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => rupeesToPaise(value), MoneyValidationError);
  }
});

test('negative values require an explicit accounting context', () => {
  assert.throws(() => rupeesToPaise('-2.50'), /cannot be negative/);
  assert.equal(rupeesToPaise('-2.50', { allowNegative: true }), -250);
  assert.equal(assertPaise(-250, { allowNegative: true }), -250);
});

test('paise values and totals must remain safe integers', () => {
  assert.equal(paiseToRupees(1250), 12.5);
  assert.equal(sumPaise([10, 20, 30]), 60);
  assert.throws(() => assertPaise(1.5), /safe integer/);
  assert.throws(
    () => sumPaise([Number.MAX_SAFE_INTEGER, 1]),
    /outside the safe integer range/
  );
});

