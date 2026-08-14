import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import {
  DEFAULT_SUBCATEGORY,
  inferSubCategory,
  normalizeSubCategory,
} from '../utils/productSubcategory.js';

describe('product sub-category classification', () => {
  test('normalizes admin input and gives legacy products a safe shelf', () => {
    assert.equal(normalizeSubCategory('  Chips   & Crisps '), 'Chips & Crisps');
    assert.equal(normalizeSubCategory(''), DEFAULT_SUBCATEGORY);
    assert.equal(normalizeSubCategory(null), DEFAULT_SUBCATEGORY);
  });

  test('classifies common current catalogue names for the backfill preview', () => {
    assert.equal(inferSubCategory('Classic Salted Chips'), 'Chips & Crisps');
    assert.equal(inferSubCategory('Oreo Biscuit Pack'), 'Biscuits & Cookies');
    assert.equal(inferSubCategory('Maggi Noodles'), 'Noodles & Instant Food');
    assert.equal(inferSubCategory('Chocolate milkshake'), 'Drinks');
    assert.equal(inferSubCategory('Marie Gold'), 'Biscuits & Cookies');
    assert.equal(inferSubCategory('Combination lock'), 'Hostel Essentials');
    assert.equal(inferSubCategory('Unrecognized item'), DEFAULT_SUBCATEGORY);
  });
});
