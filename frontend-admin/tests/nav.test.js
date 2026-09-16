import test from 'node:test';
import assert from 'node:assert/strict';

import { visibleNav } from '../src/utils/nav.js';

const ITEMS = [
  { path: '/dashboard', label: 'Dashboard' },
  { path: '/billing', label: 'Point of Sale' },
  { path: '/users/staff', label: 'Staff' },
];
const HIDDEN = new Set(['/billing', '/users/staff']);

test('a plain admin sees the menu with the hidden pages taken out', () => {
  assert.deepEqual(visibleNav(ITEMS, HIDDEN).map((item) => item.path), ['/dashboard']);
  assert.deepEqual(visibleNav(ITEMS, HIDDEN, { isSuperAdmin: false }).map((item) => item.path), ['/dashboard']);
});

test('a super admin sees every option, hidden list or not', () => {
  assert.deepEqual(
    visibleNav(ITEMS, HIDDEN, { isSuperAdmin: true }).map((item) => item.path),
    ['/dashboard', '/billing', '/users/staff'],
  );
});

test('an empty hidden set hides nothing from anyone', () => {
  assert.equal(visibleNav(ITEMS, new Set()).length, ITEMS.length);
});
