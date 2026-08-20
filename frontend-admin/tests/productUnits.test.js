import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { UNIT_SYMBOLS, unitSymbolsForCategory, unitsForCategory } = await import(
  '../src/constants/units.js'
);

const UNIT_ROWS = [
  { _id: 'u-g', name: 'Gram', symbol: 'g' },
  { _id: 'u-ml', name: 'Millilitre', symbol: 'ml' },
  { _id: 'u-l', name: 'Litre', symbol: 'L' },
  { _id: 'u-pc', name: 'Piece', symbol: 'pc' },
];

describe('unitSymbolsForCategory', () => {
  const cases = [
    ['Snacks', ['g', 'pc']],
    ['Beverages', ['ml', 'L']],
    ['Ice Cream', ['ml', 'pc']],
    ['Personal Care', ['ml', 'g', 'pc']],
    ['Stationery', ['pc']],
    ['Hostel Essentials', ['pc', 'g']],
  ];

  for (const [category, expected] of cases) {
    test(`${category} → ${expected.join(', ')}`, () => {
      assert.deepEqual(unitSymbolsForCategory(category), expected);
    });
  }

  test('matches regardless of case and surrounding space', () => {
    assert.deepEqual(unitSymbolsForCategory('  beverages '), ['ml', 'L']);
  });

  // Categories are code-defined, but a database seeded before this map — or
  // one edited straight in Mongo — can still hold a name it does not know.
  // Offering every unit is the safe miss: the office can still save.
  test('falls back to every unit for a name it does not know', () => {
    assert.deepEqual(unitSymbolsForCategory('Fireworks'), UNIT_SYMBOLS);
  });

  test('falls back to every unit when no category is chosen yet', () => {
    assert.deepEqual(unitSymbolsForCategory(''), UNIT_SYMBOLS);
    assert.deepEqual(unitSymbolsForCategory(null), UNIT_SYMBOLS);
  });
});

describe('unitsForCategory', () => {
  test('keeps the map order, not the order the rows arrived in', () => {
    assert.deepEqual(
      unitsForCategory(UNIT_ROWS, 'Beverages').map((unit) => unit.symbol),
      ['ml', 'L']
    );
  });

  test('drops a mapped symbol that has no row on the server yet', () => {
    const withoutLitre = UNIT_ROWS.filter((unit) => unit.symbol !== 'L');
    assert.deepEqual(
      unitsForCategory(withoutLitre, 'Beverages').map((unit) => unit.symbol),
      ['ml']
    );
  });

  test('returns nothing when the unit list has not loaded', () => {
    assert.deepEqual(unitsForCategory([], 'Snacks'), []);
    assert.deepEqual(unitsForCategory(undefined, 'Snacks'), []);
  });

  test('offers the full list for an unmapped category', () => {
    assert.deepEqual(
      unitsForCategory(UNIT_ROWS, 'Fireworks').map((unit) => unit.symbol),
      UNIT_SYMBOLS
    );
  });
});
