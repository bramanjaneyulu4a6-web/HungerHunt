// The one definition of "can this be sold, and should the office worry" —
// every screen and endpoint derives from this function so no two surfaces
// can disagree about a threshold again.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf } = await import('../utils/availability.js');

describe('availabilityOf', () => {
  const cases = [
    // [description, product, stock, expected]
    ['a missing product row is off sale, not an alert', null, 10, 'ARCHIVED'],
    ['archived wins over everything, even zero stock', { active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    ['absent active means active (rows predate the flag)', { reorderLevel: 5 }, 10, 'AVAILABLE'],
    ['zero stock is out of stock', { active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    ['negative stock is out of stock, not an error', { active: true, reorderLevel: 5 }, -2, 'OUT_OF_STOCK'],
    ['below the reorder level is low', { active: true, reorderLevel: 5 }, 4, 'LOW'],
    ['at the reorder level is not low — the level *below* which', { active: true, reorderLevel: 5 }, 5, 'AVAILABLE'],
    ['reorder level 0 never flags', { active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    ['absent reorder level reads as the model default of 5', { active: true }, 4, 'LOW'],
    ['non-numeric stock coerces to 0', { active: true, reorderLevel: 5 }, undefined, 'OUT_OF_STOCK'],
    ['healthy shelf is available', { active: true, reorderLevel: 5 }, 20, 'AVAILABLE'],
  ];

  for (const [name, product, stock, expected] of cases) {
    test(name, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});
