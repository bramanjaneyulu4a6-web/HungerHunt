import test, { describe } from 'node:test';
import assert from 'node:assert/strict';

import StockGroup from '../models/StockGroup.js';

describe('category sub-category metadata', () => {
  test('new categories always have an Others destination', () => {
    const category = new StockGroup({ name: 'Food & Snacks' });
    assert.deepEqual(category.subCategories, ['Others']);
  });

  test('preserves the saved tile order', () => {
    const category = new StockGroup({
      name: 'Food & Snacks',
      subCategories: ['Chips & Crisps', 'Biscuits & Cookies', 'Others'],
    });
    assert.deepEqual(category.subCategories, [
      'Chips & Crisps',
      'Biscuits & Cookies',
      'Others',
    ]);
  });
});
