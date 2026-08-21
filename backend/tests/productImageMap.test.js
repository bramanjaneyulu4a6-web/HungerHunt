// The folder is named by hand, so its filenames are close to the product
// names without being them: a stray capital, an apostrophe, a shop's name for
// something the catalogue calls another thing. Matching is worked out here so
// a wrong pairing is a failing test rather than a bottle of Pepsi wearing a
// picture of crisps.
import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

const { productNameForImage, planImageAssignments, cloudinaryIdFor } = await import(
  '../utils/productImageMap.js'
);

describe('productNameForImage', () => {
  test('an unaliased file is its own product name', () => {
    assert.equal(productNameForImage('Oreo.avif'), 'Oreo');
  });

  test('strips the extension whatever the case', () => {
    assert.equal(productNameForImage('Pepsi.AVIF'), 'Pepsi');
  });

  // The five the folder spells differently from the catalogue.
  const aliases = [
    ["Blue Lay's.avif", "Lay's Magic Masala - Blue Lays"],
    ["Green Lay's.avif", "Lay's American Style Cream & Onion - Green Lays"],
    ['Amul Lassi.avif', 'Lassi'],
    ['Appy FIzz.avif', 'Appy Fizz'],
    ['7 Up.avif', '7 UP'],
  ];

  for (const [file, expected] of aliases) {
    test(`${file} → ${expected}`, () => {
      assert.equal(productNameForImage(file), expected);
    });
  }
});

describe('planImageAssignments', () => {
  const products = [
    { _id: 'p1', name: 'Oreo', image: '' },
    { _id: 'p2', name: 'Lassi', image: 'https://res.cloudinary.com/old.jpg' },
  ];

  test('pairs a file with the product it names', () => {
    const plan = planImageAssignments(['Oreo.avif'], products);
    assert.deepEqual(plan.matched.map((m) => [m.file, m.product.name]), [['Oreo.avif', 'Oreo']]);
    assert.deepEqual(plan.unmatched, []);
  });

  test('resolves an alias to its catalogue product', () => {
    const plan = planImageAssignments(['Amul Lassi.avif'], products);
    assert.deepEqual(plan.matched.map((m) => m.product.name), ['Lassi']);
  });

  // Overwriting is the instruction, so an existing image is reported rather
  // than skipped — the office should still see which art it is replacing.
  test('reports that a matched product already had an image', () => {
    const plan = planImageAssignments(['Amul Lassi.avif'], products);
    assert.equal(plan.matched[0].replacing, 'https://res.cloudinary.com/old.jpg');
  });

  test('leaves replacing empty for a product with no image yet', () => {
    const plan = planImageAssignments(['Oreo.avif'], products);
    assert.equal(plan.matched[0].replacing, '');
  });

  // The whole point of the preview: a file naming nothing is named back,
  // rather than silently doing nothing.
  test('names a file that matches no product', () => {
    const plan = planImageAssignments(['Thums Up.avif'], products);
    assert.deepEqual(plan.unmatched, ['Thums Up.avif']);
    assert.deepEqual(plan.matched, []);
  });

  test('matches a product regardless of case and surrounding space', () => {
    const plan = planImageAssignments(['Oreo.avif'], [{ _id: 'p9', name: ' oreo ', image: '' }]);
    assert.deepEqual(plan.matched.map((m) => m.product.name), [' oreo ']);
  });

  // Anything that is not an image would be uploaded as one otherwise — a
  // .DS_Store sitting in a folder of pictures is the ordinary case.
  test('ignores files that are not images', () => {
    const plan = planImageAssignments(['.DS_Store', 'notes.txt', 'Oreo.avif'], products);
    assert.deepEqual(plan.matched.map((m) => m.file), ['Oreo.avif']);
    assert.deepEqual(plan.unmatched, []);
  });

  // Two files claiming one product would upload twice and leave whichever
  // finished last, which is a coin toss rather than a decision.
  test('refuses two files claiming the same product', () => {
    assert.throws(
      () => planImageAssignments(['Amul Lassi.avif', 'Lassi.avif'], products),
      /Lassi/
    );
  });
});

// Cloudinary keys an asset by its public id, so a stable one makes a re-run
// replace the picture it uploaded last time instead of adding a second copy
// beside it and leaving the account to grow a duplicate per run.
describe('cloudinaryIdFor', () => {
  const cases = [
    ['Oreo', 'oreo'],
    ['7 UP', '7-up'],
    ['Appy Fizz', 'appy-fizz'],
    ["Lay's Magic Masala - Blue Lays", 'lays-magic-masala-blue-lays'],
    ['Geometry Box: DOMS GEOFINE', 'geometry-box-doms-geofine'],
    ["Lay's American Style Cream & Onion - Green Lays", 'lays-american-style-cream-onion-green-lays'],
  ];

  for (const [name, expected] of cases) {
    test(`${name} → ${expected}`, () => {
      assert.equal(cloudinaryIdFor(name), expected);
    });
  }

  test('collapses runs of punctuation rather than leaving empty segments', () => {
    assert.equal(cloudinaryIdFor('A  --  B'), 'a-b');
  });

  test('carries no leading or trailing separator', () => {
    assert.equal(cloudinaryIdFor('  :Oreo:  '), 'oreo');
  });

  // Every product name in the catalogue has to produce a usable id, and a
  // name of nothing but punctuation would produce an empty one.
  test('refuses a name that reduces to nothing', () => {
    assert.throws(() => cloudinaryIdFor('!!!'), /id/i);
  });
});
