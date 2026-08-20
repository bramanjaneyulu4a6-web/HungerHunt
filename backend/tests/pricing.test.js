import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { finalPrice, isValidDiscountRate } = await import('../utils/pricing.js');

describe('finalPrice', () => {
  test('an undiscounted product sells at its MRP', () => {
    assert.equal(finalPrice(27, 0), 27);
  });

  // The rule the office chose: whatever the arithmetic says, the student pays
  // the next whole rupee up. 27 less 15% is 22.95, and the till has no paise.
  test('rounds a fractional discounted price up to the next rupee', () => {
    assert.equal(finalPrice(27, 15), 23);
  });

  test('rounds up from a half rupee', () => {
    assert.equal(finalPrice(21, 50), 11);
  });

  // Rounding up must not invent a rupee that the arithmetic did not ask for:
  // 20 less 10% is exactly 18, not 19.
  test('leaves an exactly whole discounted price alone', () => {
    assert.equal(finalPrice(20, 10), 18);
  });

  // Rounding up is capped at the MRP, or a product priced in paise would cost
  // more after a discount than before one.
  test('never charges more than the MRP', () => {
    assert.equal(finalPrice(12.5, 0), 12.5);
  });

  // The till refuses a free product, so the deepest discount still has to
  // leave something to charge.
  test('the steepest discount still leaves a rupee to charge', () => {
    assert.equal(finalPrice(10, 99), 1);
  });

  test('accepts a fractional discount rate', () => {
    assert.equal(finalPrice(100, 12.5), 88);
  });
});

describe('isValidDiscountRate', () => {
  for (const rate of [0, 5, 12.5, 99, '15']) {
    test(`accepts ${JSON.stringify(rate)}`, () => {
      assert.equal(isValidDiscountRate(rate), true);
    });
  }

  // 100 is refused rather than clamped: a product given away free is not a
  // discount, it is a pricing mistake the till cannot survive.
  for (const rate of [-1, 100, 150, 'half off', '', null, undefined, {}]) {
    test(`refuses ${JSON.stringify(rate)}`, () => {
      assert.equal(isValidDiscountRate(rate), false);
    });
  }
});
