/* The product form filters its unit dropdown by category name, and categories
   are defined in the backend's catalogue seed. Nothing at runtime notices when
   the two disagree — an unmapped category silently falls back to offering every
   unit, which is the behaviour this map exists to replace. So the agreement is
   asserted here instead.
 *
 * Reaching across into backend/ is deliberate, and the same thing
 * scripts/check-shared-files.mjs does: these are separate builds in one repo,
 * and the coupling is real whether or not a test admits it. */
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalogue = JSON.parse(
  readFileSync(join(repoRoot, 'backend', 'scripts', 'data', 'catalogue.json'), 'utf8')
);

const { UNIT_SYMBOLS, unitSymbolsForCategory, unitsForCategory } = await import(
  '../src/constants/units.js'
);

const seededUnits = catalogue.units;
const seededCategories = catalogue.stockGroups.map((group) => group.name);

describe('the unit map against the catalogue seed', () => {
  for (const category of seededCategories) {
    test(`${category} is mapped, not falling through to every unit`, () => {
      const symbols = unitSymbolsForCategory(category);
      assert.notDeepEqual(
        symbols,
        UNIT_SYMBOLS,
        `${category} has no entry in constants/units.js, so the product form would offer all units for it.`
      );
      assert.ok(symbols.length > 0);
    });

    test(`every unit ${category} maps to is seeded in the database`, () => {
      const resolved = unitsForCategory(seededUnits, category);
      assert.equal(
        resolved.length,
        unitSymbolsForCategory(category).length,
        `${category} maps to a symbol the catalogue seed does not create.`
      );
    });
  }

  test('every symbol the map can offer exists in the seed', () => {
    const seeded = new Set(seededUnits.map((unit) => unit.symbol));
    const missing = UNIT_SYMBOLS.filter((symbol) => !seeded.has(symbol));
    assert.deepEqual(missing, [], `Seed these units: ${missing.join(', ')}`);
  });

  // The reverse of the check above: a seeded unit no category can offer is a
  // row nobody can ever pick in the form.
  test('every seeded unit is reachable from at least one category', () => {
    const reachable = new Set(seededCategories.flatMap(unitSymbolsForCategory));
    const orphans = seededUnits
      .map((unit) => unit.symbol)
      .filter((symbol) => !reachable.has(symbol));
    assert.deepEqual(orphans, [], `Unreachable in the product form: ${orphans.join(', ')}`);
  });
});
