// What "remove the old groups" means in a catalogue that forbids deletion:
// the products stay, off sale, because orders and receipts reference them
// forever. Deciding which ones is a set difference, and set differences are
// where an off-by-one archives something still being sold — so it is worked
// out here, in the open, rather than inside a script that also writes.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { retiredProducts, retiredGroups } = await import('../utils/catalogueRetirement.js');

const product = (name, active = true) => ({ _id: name, name, active });

describe('retiredProducts', () => {
  const keep = ['Oreo', 'Pepsi'];

  test('retires an active product the new catalogue does not list', () => {
    const retired = retiredProducts([product('Marie Gold')], keep);
    assert.deepEqual(retired.map((p) => p.name), ['Marie Gold']);
  });

  test('keeps a product the new catalogue lists', () => {
    assert.deepEqual(retiredProducts([product('Oreo')], keep), []);
  });

  // Archiving is idempotent, so a second run must find nothing left to do —
  // otherwise the preview keeps promising changes it will not make.
  test('leaves an already archived product alone', () => {
    assert.deepEqual(retiredProducts([product('Marie Gold', false)], keep), []);
  });

  // Rows written by hand in Mongo, or by an admin who typed a stray space,
  // must not be archived merely for being spelled differently.
  test('matches the new list regardless of case and surrounding space', () => {
    assert.deepEqual(retiredProducts([product('  oreo ')], keep), []);
  });

  // Absent is not false: rows predating the `active` field have no flag at
  // all, and the catalogue treats those as on sale everywhere else.
  test('treats a product with no active flag as on sale', () => {
    const retired = retiredProducts([{ _id: 'x', name: 'Batteries' }], keep);
    assert.deepEqual(retired.map((p) => p.name), ['Batteries']);
  });

  test('retires nothing when the new list covers everything', () => {
    assert.deepEqual(retiredProducts([product('Oreo'), product('Pepsi')], keep), []);
  });

  // The guard that matters most: an empty keep list would archive the entire
  // catalogue, which is never an intention anyone typed.
  test('refuses to work from an empty keep list rather than archiving everything', () => {
    assert.throws(() => retiredProducts([product('Oreo')], []), /empty/i);
  });
});

describe('retiredGroups', () => {
  test('returns the groups the new catalogue no longer defines', () => {
    const groups = [{ name: 'Snacks' }, { name: 'Ice Cream' }, { name: 'Beverages' }];
    const retired = retiredGroups(groups, ['Food & Snacks', 'Beverages']);
    assert.deepEqual(retired.map((g) => g.name), ['Snacks', 'Ice Cream']);
  });

  test('matches regardless of case and surrounding space', () => {
    assert.deepEqual(retiredGroups([{ name: ' beverages' }], ['Beverages']), []);
  });

  test('refuses to work from an empty keep list', () => {
    assert.throws(() => retiredGroups([{ name: 'Snacks' }], []), /empty/i);
  });
});
