import test from 'node:test';
import assert from 'node:assert/strict';

import { caretakerProductTotals, filterCaretakerOrders } from './caretakerOrders.js';

const orders = [
  {
    id: 'one',
    student: { name: 'Asha Rao', admissionNumber: '10425' },
    items: [
      { productId: 'juice', name: 'Apple Juice', quantity: 2 },
      { productId: 'chips', name: 'Banana Chips', quantity: 3 },
    ],
  },
  {
    id: 'two',
    student: { name: 'Dev Kumar', admissionNumber: '20810' },
    items: [{ productId: 'juice', name: 'Apple Juice', quantity: 1 }],
  },
];

test('groups the whole unit order by product and totals each quantity', () => {
  assert.deepEqual(caretakerProductTotals(orders), [
    { id: 'juice', name: 'Apple Juice', quantity: 3 },
    { id: 'chips', name: 'Banana Chips', quantity: 3 },
  ]);
});

test('finds caretaker orders by student name without case sensitivity', () => {
  assert.deepEqual(filterCaretakerOrders(orders, 'ASHA').map((order) => order.id), ['one']);
  assert.deepEqual(filterCaretakerOrders(orders, 'kumar').map((order) => order.id), ['two']);
});

test('finds caretaker orders by partial admission number', () => {
  assert.deepEqual(filterCaretakerOrders(orders, '425').map((order) => order.id), ['one']);
});

test('an empty search keeps the complete student-order list', () => {
  assert.equal(filterCaretakerOrders(orders, '  '), orders);
});
