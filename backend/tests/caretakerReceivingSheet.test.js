import test from 'node:test';
import assert from 'node:assert/strict';

import { buildCaretakerReceivingSheet } from '../src/domain/fulfillment/caretakerReceivingSheet.js';

const order = (status, roomNumber, roomId, student, items) => ({
  _id: `${status}-${roomNumber}-${student}`,
  studentId: student,
  status,
  studentSnapshot: { name: student, roomNumber, roomId },
  items: items.map(([name, quantity]) => ({ productId: `p-${name}`, name, quantity })),
});

const caretakers = [
  { _id: 'c1', name: 'Arun', roomIds: ['r1', 'r2'] },
  { _id: 'c2', name: 'Zoya', roomIds: ['r3'] },
];

test('combines all active stages into one total list per caretaker', () => {
  const sheet = buildCaretakerReceivingSheet([
    order('PENDING', 'A-1', 'r1', 's1', [['Soap', 2]]),
    order('PACKED', 'A-2', 'r2', 's2', [['Soap', 1], ['Pen', 3]]),
    order('OUT_FOR_DELIVERY', 'B-1', 'r3', 's3', [['Book', 2]]),
  ], caretakers);

  assert.deepEqual(sheet.stages.map((stage) => stage.status), [
    'PENDING', 'PACKED', 'OUT_FOR_DELIVERY',
  ]);
  assert.deepEqual(sheet.groups.map((group) => group.caretakerName), ['Arun', 'Zoya']);
  assert.deepEqual(sheet.groups[0].items, [
    { name: 'Pen', quantity: 3 },
    { name: 'Soap', quantity: 3 },
  ]);
  assert.equal(sheet.groups[0].orderCount, 2);
  assert.equal(sheet.groups[0].itemCount, 6);
});

test('a stage selection narrows totals but keeps canonical stage order', () => {
  const sheet = buildCaretakerReceivingSheet([
    order('PENDING', 'A-1', 'r1', 's1', [['Soap', 9]]),
    order('PACKED', 'A-2', 'r2', 's2', [['Pen', 2]]),
    order('OUT_FOR_DELIVERY', 'B-1', 'r3', 's3', [['Book', 1]]),
  ], caretakers, { sections: ['OUT_FOR_DELIVERY', 'PACKED'] });

  assert.deepEqual(sheet.stages.map((stage) => stage.status), ['PACKED', 'OUT_FOR_DELIVERY']);
  assert.deepEqual(sheet.groups.map((group) => group.caretakerName), ['Arun', 'Zoya']);
  assert.equal(sheet.totals.orderCount, 2);
  assert.equal(sheet.totals.itemCount, 3);
});

test('orders for uncovered rooms remain visible under unassigned caretaker', () => {
  const sheet = buildCaretakerReceivingSheet([
    order('PENDING', 'X-1', 'missing', 's1', [['Soap', 1]]),
  ], caretakers);

  assert.equal(sheet.groups[0].caretakerName, 'Unassigned caretaker');
  assert.equal(sheet.groups[0].unassigned, true);
});
