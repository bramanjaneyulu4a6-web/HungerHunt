import { describe, expect, test } from 'vitest';

import { allowanceCeiling, limitLine, limitMessage } from './purchaseCaps';

const salty = { key: 'subcategory:g1:Salty Snacks', type: 'SUBCATEGORY', name: 'Salty Snacks', quantity: 2, period: 'WEEKLY', purchased: 0, pending: 0, remaining: 2 };

const item = (id, name, { own = null, caps = [salty] } = {}, quantity) => ({
  _id: id,
  name,
  ...(quantity !== undefined ? { quantity } : {}),
  purchaseAllowance: {
    enabled: true,
    remaining: Math.min(own?.remaining ?? Infinity, ...caps.map((cap) => cap.remaining)),
    product: own,
    caps,
  },
});

const blueLays = item('lays', 'Blue Lays', {
  own: { type: 'PRODUCT', name: 'Blue Lays', quantity: 3, period: 'WEEKLY', purchased: 0, pending: 0, remaining: 3 },
});
const kurkure = item('kurkure', 'Kurkure');

describe('a shared category cap in the cart', () => {
  test('the strictest cap sets the ceiling: Blue Lays 3/week inside Salty Snacks 2/week', () => {
    expect(allowanceCeiling(blueLays, [])).toBe(2);
    expect(limitLine(blueLays, [])).toBe('2 left in your weekly Salty Snacks limit');
  });

  test('another product under the same cap uses it up', () => {
    const cart = [{ ...kurkure, quantity: 1 }];
    expect(allowanceCeiling(blueLays, cart)).toBe(1);

    const full = [{ ...kurkure, quantity: 2 }];
    expect(allowanceCeiling(blueLays, full)).toBe(0);
    expect(limitMessage(blueLays, full)).toBe('Your weekly Salty Snacks limit is used up by what is already in your cart.');
  });

  test('the product\'s own line does not count against itself', () => {
    expect(allowanceCeiling(blueLays, [{ ...blueLays, quantity: 2 }])).toBe(2);
  });

  test('a product cap names the product', () => {
    const tight = item('lays', 'Blue Lays', {
      own: { type: 'PRODUCT', name: 'Blue Lays', quantity: 1, period: 'DAILY', purchased: 1, pending: 0, remaining: 0 },
    });
    expect(allowanceCeiling(tight, [])).toBe(0);
    expect(limitMessage(tight, [])).toBe("Blue Lays's daily limit has been reached.");
  });

  test('an allowance from an older server reads as the product cap it always was', () => {
    const old = { _id: 'x', name: 'Chocolate', purchaseAllowance: { enabled: true, remaining: 1, period: 'DAILY', pending: 0 } };
    expect(allowanceCeiling(old, [])).toBe(1);
  });

  test('no allowance means no ceiling', () => {
    expect(allowanceCeiling({ _id: 'y', purchaseAllowance: null }, [])).toBe(Number.POSITIVE_INFINITY);
  });
});
