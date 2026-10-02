import { describe, expect, test } from 'vitest';

import { formatPercentOff, priceTag } from './priceTag';

describe('priceTag', () => {
  test('presents a genuine discount with its MRP and stored percentage', () => {
    expect(priceTag({ mrp: 40, price: 35, discountRate: 12.5 })).toEqual({
      discounted: true,
      sellingPrice: 35,
      mrp: 40,
      percentOff: 12.5,
    });
    expect(formatPercentOff(12.5)).toBe('12.5% OFF');
  });

  test('calculates the saving when an older row has prices but no rate', () => {
    expect(priceTag({ mrp: 70, price: 55 }).percentOff).toBe(21.4);
  });

  test('does not claim a discount when rounding leaves the selling price at MRP', () => {
    expect(priceTag({ mrp: 5, price: 5, discountRate: 1 })).toEqual({
      discounted: false,
      sellingPrice: 5,
      mrp: 5,
      percentOff: null,
    });
  });

  test('legacy products without MRP retain the ordinary price tag', () => {
    expect(priceTag({ price: 20 })).toEqual({
      discounted: false,
      sellingPrice: 20,
      mrp: 20,
      percentOff: null,
    });
  });
});
