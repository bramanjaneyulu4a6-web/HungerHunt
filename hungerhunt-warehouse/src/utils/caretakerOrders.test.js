import test from 'node:test';
import assert from 'node:assert/strict';

import { caretakerItemCount, filterCaretakerOrders } from './caretakerOrders.js';

const orders = [
  {
    id: 'one',
    student: { name: 'Asha Rao', admissionNumber: '10425' },
    items: [{ quantity: 2 }, { quantity: 3 }],
  },
  {
    id: 'two',
    student: { name: 'Dev Kumar', admissionNumber: '20810' },
    items: [{ quantity: 1 }],
  },
];

test('counts every item unit in the hostel current-order summary', () => {
  assert.equal(caretakerItemCount(orders), 6);
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
