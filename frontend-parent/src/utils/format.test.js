import test from 'node:test';
import assert from 'node:assert/strict';

import { formatINR, formatPackSize } from './format.js';

test('currency uses Indian grouping and preserves paise', () => {
  assert.match(formatINR(120000), /1,20,000/);
  assert.match(formatINR(12.5), /12\.50/);
});

test('missing or invalid currency values render as zero', () => {
  assert.match(formatINR(undefined), /0/);
  assert.match(formatINR('not-money'), /0/);
});

test('pack sizes require both a positive size and unit', () => {
  assert.equal(formatPackSize(250, 'ml'), '250 ml');
  assert.equal(formatPackSize(0, 'ml'), '');
  assert.equal(formatPackSize(250, ''), '');
});
