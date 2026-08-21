// Setting every shelf to an opening figure. The Inventory number is meant to
// stay derivable — receipts in, sales out, StockAdjustment rows for everything
// else — so this works out deltas rather than slamming a number in, and each
// one becomes a ledger row naming who set it and why.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { planOpeningStock } = await import('../utils/openingStock.js');

const product = (name, active = true) => ({ _id: `id-${name}`, name, active });
const shelf = (name, stock) => ({ productId: `id-${name}`, stock });

describe('planOpeningStock', () => {
  test('raises a shelf to the target and records the delta', () => {
    const plan = planOpeningStock({
      products: [product('Oreo')],
      shelves: [shelf('Oreo', 5)],
      target: 20,
    });
    assert.deepEqual(plan, [{ productId: 'id-Oreo', name: 'Oreo', from: 5, to: 20, delta: 15 }]);
  });

  test('lowers a shelf that is above the target', () => {
    const plan = planOpeningStock({
      products: [product('Oreo')],
      shelves: [shelf('Oreo', 32)],
      target: 20,
    });
    assert.equal(plan[0].delta, -12);
  });

  // A zero delta is not a movement, and StockAdjustment refuses one — a row
  // saying nothing happened is worse than no row.
  test('skips a shelf already at the target', () => {
    const plan = planOpeningStock({
      products: [product('Oreo')],
      shelves: [shelf('Oreo', 20)],
      target: 20,
    });
    assert.deepEqual(plan, []);
  });

  // Only possible for rows older than the shelf backfill, but it reads as
  // empty everywhere else and must here too.
  test('treats a product with no shelf row as empty', () => {
    const plan = planOpeningStock({ products: [product('Oreo')], shelves: [], target: 20 });
    assert.equal(plan[0].from, 0);
    assert.equal(plan[0].delta, 20);
  });

  // Archived products are off sale everywhere; stocking them would put a
  // number behind something nobody can buy.
  test('leaves archived products alone', () => {
    const plan = planOpeningStock({
      products: [product('Oreo'), product('Marie Gold', false)],
      shelves: [shelf('Oreo', 0), shelf('Marie Gold', 0)],
      target: 20,
    });
    assert.deepEqual(plan.map((p) => p.name), ['Oreo']);
  });

  test('treats a product with no active flag as on sale', () => {
    const plan = planOpeningStock({
      products: [{ _id: 'id-x', name: 'Legacy' }],
      shelves: [],
      target: 20,
    });
    assert.deepEqual(plan.map((p) => p.name), ['Legacy']);
  });

  test('a target of zero is allowed and empties the shelves', () => {
    const plan = planOpeningStock({
      products: [product('Oreo')],
      shelves: [shelf('Oreo', 7)],
      target: 0,
    });
    assert.equal(plan[0].delta, -7);
  });

  for (const bad of [-1, 2.5, 'twenty', null, undefined]) {
    test(`refuses a target of ${JSON.stringify(bad)}`, () => {
      assert.throws(
        () => planOpeningStock({ products: [product('Oreo')], shelves: [], target: bad }),
        /whole number/i
      );
    });
  }
});
