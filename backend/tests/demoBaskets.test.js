/* The five baskets the showroom family cycles through.
 *
 * The rotation carries no stored index — the next basket is worked out from
 * the contents of the one just completed — so what is pinned here is that the
 * derivation is stable, that it actually advances, and that it never strands a
 * visitor with nothing waiting.
 */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { buildDemoBaskets, nextBasketAfter, DEMO_BASKET_COUNT } =
  await import('../utils/demoBaskets.js');

const catalogue = [
  { _id: 'p3', name: 'Frooti', price: 10 },
  { _id: 'p1', name: 'Aloo Bhujia', price: 10 },
  { _id: 'p4', name: 'Hide & Seek', price: 10 },
  { _id: 'p2', name: 'Dark Fantasy', price: 40 },
  { _id: 'p5', name: 'Oreo', price: 10 },
  { _id: 'p6', name: 'Jim Jam', price: 10 },
];

describe('deriving the baskets', () => {
  test('there are five, each priced from the catalogue', () => {
    const baskets = buildDemoBaskets(catalogue);

    assert.equal(baskets.length, DEMO_BASKET_COUNT);
    for (const basket of baskets) {
      assert.ok(basket.items.length > 0);
      const expected = basket.items.reduce((sum, i) => sum + i.price * i.quantity, 0);
      assert.equal(basket.totalAmount, expected);
    }
  });

  /* The seeder and the reset derive this independently and must agree, so the
     query's row order must not be able to change the answer. */
  test('the same shelf gives the same five baskets whatever order it arrives in', () => {
    const forwards = buildDemoBaskets(catalogue);
    const backwards = buildDemoBaskets([...catalogue].reverse());

    assert.deepEqual(backwards, forwards);
  });

  test('the baskets differ from one another', () => {
    const baskets = buildDemoBaskets(catalogue);
    const seen = new Set(baskets.map((b) => JSON.stringify(b.items)));

    assert.equal(seen.size, baskets.length, 'every basket should be distinct');
  });

  test('a shelf too thin to build from yields nothing rather than a broken basket', () => {
    assert.deepEqual(buildDemoBaskets([]), []);
    assert.deepEqual(buildDemoBaskets([{ _id: 'p1', name: 'Only', price: 5 }]), []);
  });
});

describe('advancing the rotation', () => {
  test('each basket leads to the next, and the last wraps to the first', () => {
    const baskets = buildDemoBaskets(catalogue);

    for (let i = 0; i < baskets.length; i += 1) {
      const expected = baskets[(i + 1) % baskets.length];
      assert.deepEqual(nextBasketAfter(baskets[i].items, baskets), expected, `basket ${i}`);
    }
  });

  /* A full cycle must visit all five. A rotation that advanced but repeated
     would satisfy "next" and still show a visitor the same two baskets. */
  test('following it five times visits every basket', () => {
    const baskets = buildDemoBaskets(catalogue);
    const seen = new Set();
    let current = baskets[0];

    for (let i = 0; i < DEMO_BASKET_COUNT; i += 1) {
      seen.add(JSON.stringify(current.items));
      current = nextBasketAfter(current.items, baskets);
    }

    assert.equal(seen.size, DEMO_BASKET_COUNT);
  });

  test('line order within a basket does not confuse the match', () => {
    const baskets = buildDemoBaskets(catalogue);
    const reversedLines = [...baskets[0].items].reverse();

    assert.deepEqual(nextBasketAfter(reversedLines, baskets), baskets[1]);
  });

  /* The first order ever, an order rung up some other way, or a catalogue that
     changed under the demo. None should leave the account with nothing. */
  test('an unrecognised basket starts the cycle rather than stranding the visitor', () => {
    const baskets = buildDemoBaskets(catalogue);

    assert.deepEqual(nextBasketAfter([{ productId: 'unknown', quantity: 9 }], baskets), baskets[0]);
    assert.deepEqual(nextBasketAfter([], baskets), baskets[0]);
  });

  test('no baskets at all is answered with nothing, not a crash', () => {
    assert.equal(nextBasketAfter([{ productId: 'p1', quantity: 1 }], []), null);
  });
});
