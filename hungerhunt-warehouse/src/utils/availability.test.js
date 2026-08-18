// Mirror of backend/utils/availability.js. This app used to say "low" at
// stock <= reorderLevel while the admin said "<" — with 5 on a shelf whose
// level is 5, the two screens disagreed. The shared rule ends that.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf } = await import('./availability.js');

describe('availabilityOf (mirror of the backend rule)', () => {
  const cases = [
    [null, 10, 'ARCHIVED'],
    [{ active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    [{ active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    [{ active: true, reorderLevel: 5 }, 4, 'LOW'],
    [{ active: true, reorderLevel: 5 }, 5, 'AVAILABLE'], // the old disagreement
    [{ active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    [{ active: true }, 4, 'LOW'],
  ];

  for (const [product, stock, expected] of cases) {
    test(`${JSON.stringify(product)} at ${stock} → ${expected}`, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});
