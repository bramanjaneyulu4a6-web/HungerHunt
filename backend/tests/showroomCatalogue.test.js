/* The cut-down catalogue the showroom accounts are shown — see
 * utils/showroomCatalogue.js.
 *
 * Two questions, kept apart because they fail in opposite directions. Whether
 * an account is a showroom one decides whose screen changes, and a false
 * positive there takes the snack shelf away from a real child at a real till.
 * Whether a product belongs in the showroom decides what is left, and a false
 * positive there puts an unphotographed item on a screen meant to look
 * finished. The first is the dangerous one, so it is pinned hardest.
 */
import test, { describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';

const { SHOWROOM_CATEGORY, showroomProduct, showroomStudent } = await import(
  '../utils/showroomCatalogue.js'
);

const DEMO_PHONE = '7995601391';
const TEST_PHONE = '9000000021';

const original = {
  demo: process.env.DEMO_PARENT_PHONES,
  test: process.env.PHONEPE_TEST_PARENT_PHONES,
};

afterEach(() => {
  process.env.DEMO_PARENT_PHONES = original.demo ?? '';
  process.env.PHONEPE_TEST_PARENT_PHONES = original.test ?? '';
});

const product = (overrides = {}) => ({
  name: 'Notebook - Black',
  image: 'https://res.cloudinary.com/x/image/upload/v1/products/notebook.jpg',
  stockGroup: { name: SHOWROOM_CATEGORY },
  ...overrides,
});

describe('showroomStudent', () => {
  test('the kiosk demo account is one', () => {
    assert.equal(showroomStudent({ demoAccount: true }), true);
  });

  test("the demo parent's child is one", () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;

    assert.equal(showroomStudent({ parentPhoneNumber: DEMO_PHONE }), true);
  });

  test('a PhonePe test student is one', () => {
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;

    assert.equal(showroomStudent({ parentPhoneNumber: TEST_PHONE }), true);
  });

  /* The case that must never break. Everything else in this file is about a
     demo looking tidy; this one is a child at a real till being shown the
     shelf they came for. */
  test('an ordinary student is not', () => {
    process.env.DEMO_PARENT_PHONES = DEMO_PHONE;
    process.env.PHONEPE_TEST_PARENT_PHONES = TEST_PHONE;

    assert.equal(showroomStudent({ parentPhoneNumber: '9876543210' }), false);
    assert.equal(showroomStudent({ demoAccount: false, parentPhoneNumber: '9876543210' }), false);
  });

  // Both lists empty is the normal state of a production deploy that has
  // switched its demos off. It must not make everybody a showroom account.
  test('nobody is one when neither list is set', () => {
    process.env.DEMO_PARENT_PHONES = '';
    process.env.PHONEPE_TEST_PARENT_PHONES = '';

    assert.equal(showroomStudent({ parentPhoneNumber: DEMO_PHONE }), false);
    assert.equal(showroomStudent({ parentPhoneNumber: TEST_PHONE }), false);
  });

  test('a missing student is not one', () => {
    assert.equal(showroomStudent(null), false);
    assert.equal(showroomStudent(undefined), false);
    assert.equal(showroomStudent({}), false);
  });

  /* demoAccount is read strictly. A student document loaded without the field
     selected reads as absent, and absent must mean "ordinary" rather than
     "showroom" — the direction that shows a real child too much rather than
     too little. */
  test('only an explicit true counts as the demo flag', () => {
    assert.equal(showroomStudent({ demoAccount: 'true' }), false);
    assert.equal(showroomStudent({ demoAccount: 1 }), false);
    assert.equal(showroomStudent({ demoAccount: undefined }), false);
  });
});

describe('showroomProduct', () => {
  test('an Essentials product with a picture belongs', () => {
    assert.equal(showroomProduct(product()), true);
  });

  // The point of the picture rule: the showroom screen is a shop window, and a
  // tile wearing the "No Image" placeholder is the one thing it must not show.
  test('an Essentials product without a picture does not', () => {
    assert.equal(showroomProduct(product({ image: '' })), false);
    assert.equal(showroomProduct(product({ image: null })), false);
    assert.equal(showroomProduct(product({ image: undefined })), false);
    assert.equal(showroomProduct(product({ image: '   ' })), false);
  });

  test('a pictured product from another category does not', () => {
    assert.equal(showroomProduct(product({ stockGroup: { name: 'Snacks' } })), false);
    assert.equal(showroomProduct(product({ stockGroup: { name: 'Drinks' } })), false);
  });

  test('a product with no category at all does not', () => {
    assert.equal(showroomProduct(product({ stockGroup: null })), false);
    assert.equal(showroomProduct(product({ stockGroup: {} })), false);
  });

  test('a missing product does not', () => {
    assert.equal(showroomProduct(null), false);
    assert.equal(showroomProduct(undefined), false);
  });

  /* Categories are sealed in scripts/data/catalogue.json and matched here by
     name, so the comparison forgives the things a re-seed or a rename might
     plausibly change about the spelling — and nothing else. */
  test('the category name is matched regardless of case or padding', () => {
    for (const name of ['essentials', 'ESSENTIALS', ' Essentials ']) {
      assert.equal(showroomProduct(product({ stockGroup: { name } })), true, name);
    }
  });

  test('a category that merely starts the same does not match', () => {
    assert.equal(showroomProduct(product({ stockGroup: { name: 'Essentials & More' } })), false);
    assert.equal(showroomProduct(product({ stockGroup: { name: 'Non-Essentials' } })), false);
  });
});
