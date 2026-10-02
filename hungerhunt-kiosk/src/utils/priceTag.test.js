import { describe, expect, test } from 'vitest';

import { priceTag } from './priceTag';

describe('priceTag', () => {
  test('presents a genuine discount with its MRP and selling price', () => {
    expect(priceTag({ mrp: 40, price: 35, discountRate: 12.5 })).toEqual({
      discounted: true,
      sellingPrice: 35,
      mrp: 40,
    });
  });

  test('does not claim a discount when rounding leaves the selling price at MRP', () => {
    expect(priceTag({ mrp: 5, price: 5, discountRate: 1 })).toEqual({
      discounted: false,
      sellingPrice: 5,
      mrp: 5,
    });
  });

  test('legacy products without MRP retain the ordinary price tag', () => {
    expect(priceTag({ price: 20 })).toEqual({
      discounted: false,
      sellingPrice: 20,
      mrp: 20,
    });
  });
});
