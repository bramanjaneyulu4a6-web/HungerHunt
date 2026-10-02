import { describe, expect, test } from 'vitest';

import { priceTag } from './priceTag';

describe('priceTag', () => {
  test('presents a genuine discount with its old and selling prices', () => {
    expect(priceTag({ oldPrice: 40, price: 35 })).toEqual({
      discounted: true,
      sellingPrice: 35,
      oldPrice: 40,
    });
  });

  test('does not claim a discount when rounding leaves both prices equal', () => {
    expect(priceTag({ oldPrice: 5, price: 5 })).toEqual({
      discounted: false,
      sellingPrice: 5,
      oldPrice: 5,
    });
  });

  test('legacy products without an old price retain the ordinary price tag', () => {
    expect(priceTag({ price: 20 })).toEqual({
      discounted: false,
      sellingPrice: 20,
      oldPrice: 20,
    });
  });
});
