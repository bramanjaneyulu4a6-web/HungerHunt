import test from 'node:test';
import assert from 'node:assert/strict';

import { buildActiveOrdersExport } from '../src/domain/fulfillment/activeOrdersExport.js';

const order = ({
  id,
  roomId,
  roomNumber,
  student,
  admissionNumber = '',
  status = 'PENDING',
  items,
}) => ({
  _id: id,
  status,
  orderedAt: new Date('2026-09-24T08:00:00Z'),
  studentSnapshot: { name: student, admissionNumber, roomId, roomNumber },
  items: items.map(([name, quantity]) => ({ productId: name.toLowerCase(), name, quantity })),
});

const caretakers = [
  { _id: 'c2', name: 'Zoya', roomIds: ['r3'] },
  { _id: 'c1', name: 'Arun', roomIds: ['r1', 'r2'] },
];

test('groups active items by caretaker, then by naturally sorted room', () => {
  const report = buildActiveOrdersExport([
    order({ id: 'o1', roomId: 'r2', roomNumber: 'A-10', student: 'Dev', items: [['Soap', 1]] }),
    order({ id: 'o2', roomId: 'r1', roomNumber: 'A-2', student: 'Bea', items: [['Soap', 2], ['Pen', 1]] }),
    order({ id: 'o3', roomId: 'r1', roomNumber: 'A-2', student: 'Asha', items: [['Pen', 3]] }),
    order({ id: 'o4', roomId: 'r3', roomNumber: 'B-1', student: 'Ira', items: [['Book', 2]] }),
  ], caretakers);

  assert.deepEqual(report.groups.map((group) => group.caretakerName), ['Arun', 'Zoya']);
  const arun = report.groups[0];
  assert.deepEqual(arun.rooms.map((room) => room.roomNumber), ['A-2', 'A-10']);
  assert.deepEqual(arun.items, [
    { name: 'Pen', quantity: 4 },
    { name: 'Soap', quantity: 3 },
  ]);
  assert.deepEqual(arun.rooms.map((room) => room.childCount), [2, 1]);
  assert.equal(arun.childCount, 3);
  assert.deepEqual(arun.rooms[0].orders.map((entry) => entry.studentName), ['Asha', 'Bea']);
  assert.equal(arun.itemCount, 7);
  assert.deepEqual(report.totals, { orderCount: 4, itemCount: 9, caretakerCount: 2 });
});

test('child counts are unique students rather than order counts', () => {
  const report = buildActiveOrdersExport([
    order({ id: 'o1', roomId: 'r1', roomNumber: 'A-2', student: 'Asha', admissionNumber: 'S1', items: [['Pen', 1]] }),
    order({ id: 'o2', roomId: 'r1', roomNumber: 'A-2', student: 'Asha', admissionNumber: 'S1', items: [['Soap', 1]] }),
    order({ id: 'o3', roomId: 'r1', roomNumber: 'A-2', student: 'Bea', admissionNumber: 'S2', items: [['Book', 1]] }),
  ], caretakers);

  assert.equal(report.groups[0].orderCount, 3);
  assert.equal(report.groups[0].childCount, 2);
  assert.equal(report.groups[0].rooms[0].childCount, 2);
});

test('keeps awaiting-parent orders and files uncovered rooms under unassigned', () => {
  const report = buildActiveOrdersExport([
    order({
      id: 'p1', roomId: 'missing', roomNumber: 'C-4', student: 'Mira',
      status: 'AWAITING_PARENT', items: [['Pencil', 2]],
    }),
  ], caretakers);

  assert.equal(report.groups.length, 1);
  assert.equal(report.groups[0].caretakerName, 'Unassigned caretaker');
  assert.equal(report.groups[0].unassigned, true);
  assert.equal(report.groups[0].rooms[0].orders[0].status, 'AWAITING_PARENT');
});

test('a shared room appears under every assigned caretaker without inflating unique totals', () => {
  const sharedOrder = order({
    id: 'o1', roomId: 'r1', roomNumber: 'A-1', student: 'Asha', items: [['Soap', 2]],
  });
  const report = buildActiveOrdersExport([sharedOrder], [
    { _id: 'c1', name: 'Arun', roomIds: ['r1'] },
    { _id: 'c2', name: 'Zoya', roomIds: ['r1'] },
  ]);

  assert.equal(report.groups.length, 2);
  assert.ok(report.groups.every((group) => group.orderCount === 1));
  assert.deepEqual(report.totals, { orderCount: 1, itemCount: 2, caretakerCount: 2 });
});
