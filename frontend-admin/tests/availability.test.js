// Mirror of backend/utils/availability.js — the fallback for a backend
// that predates the availability field. Change one, change both.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { availabilityOf, resolveAvailability } = await import('../src/utils/availability.js');

describe('availabilityOf (mirror of the backend rule)', () => {
  const cases = [
    [null, 10, 'ARCHIVED'],
    [{ active: false, reorderLevel: 5 }, 0, 'ARCHIVED'],
    [{ reorderLevel: 5 }, 10, 'AVAILABLE'],
    [{ active: true, reorderLevel: 5 }, 0, 'OUT_OF_STOCK'],
    [{ active: true, reorderLevel: 5 }, 4, 'LOW'],
    [{ active: true, reorderLevel: 5 }, 5, 'AVAILABLE'],
    [{ active: true, reorderLevel: 0 }, 1, 'AVAILABLE'],
    [{ active: true }, 4, 'LOW'],
  ];

  for (const [product, stock, expected] of cases) {
    test(`${JSON.stringify(product)} at ${stock} → ${expected}`, () => {
      assert.equal(availabilityOf(product, stock), expected);
    });
  }
});

describe('resolveAvailability', () => {
  test('prefers what the server said', () => {
    assert.equal(
      resolveAvailability({ availability: 'LOW', productId: { active: true }, stock: 100 }),
      'LOW'
    );
  });

  test('falls back to computing from an inventory row', () => {
    assert.equal(
      resolveAvailability({ productId: { active: true, reorderLevel: 5 }, stock: 0 }),
      'OUT_OF_STOCK'
    );
  });

  test('falls back to computing from a product row carrying stock', () => {
    assert.equal(
      resolveAvailability({ active: true, reorderLevel: 5, stock: 3 }),
      'LOW'
    );
  });

  test('unknown stock resolves to null, never to OUT_OF_STOCK', () => {
    assert.equal(resolveAvailability({ active: true, reorderLevel: 5 }), null);
  });

  test('an inventory row whose product is gone is archived, not available', () => {
    // productId is present but null — `?? row` would hand the row itself to
    // the rule and call an unlinked shelf AVAILABLE.
    assert.equal(resolveAvailability({ productId: null, stock: 9 }), 'ARCHIVED');
  });
});
