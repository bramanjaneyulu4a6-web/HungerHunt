/* The print sheet is the Active orders board on paper: the same three stages,
   the same block → unit grouping, plus two checkbox columns the storeroom
   marks with a pen. What is under test is that the paper agrees with the
   board — grouping, ordering, and which boxes come pre-ticked. */
import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPrintSheet } from '../src/domain/fulfillment/printSheet.js';

const order = (status, roomNumber, roomId, items) => ({
  _id: `${status}-${roomNumber}-${Math.random()}`,
  status,
  studentSnapshot: { name: 'A Student', roomNumber, roomId },
  items: items.map(([name, quantity]) => ({ productId: `p-${name}`, name, quantity })),
});

const MINDS_UNIT = {
  rooms: [
    { id: 'r101', code: 'MINDS-101' },
    { id: 'r102', code: 'MINDS-102' },
  ],
};

test('the sheet carries the three board stages in board order, even when empty', () => {
  const sheet = buildPrintSheet([], []);

  assert.deepEqual(
    sheet.sections.map((section) => [section.status, section.label]),
    [
      ['PENDING', 'New orders'],
      ['PACKED', 'Packed'],
      ['OUT_FOR_DELIVERY', 'Out for delivery'],
    ]
  );
  for (const section of sheet.sections) {
    assert.equal(section.unitCount, 0);
    assert.equal(section.itemCount, 0);
    assert.deepEqual(section.blocks, []);
  }
  assert.deepEqual(sheet.totals, { orderCount: 0, unitCount: 0, itemCount: 0 });
});

test('each stage pre-ticks the boxes the work has already passed', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'A-1', 'a1', [['Biscuits', 2]]),
      order('PACKED', 'B-1', 'b1', [['Soap', 1]]),
      order('OUT_FOR_DELIVERY', 'C-1', 'c1', [['Chips', 3]]),
    ],
    []
  );

  const checksByStatus = Object.fromEntries(
    sheet.sections.map((section) => [section.status, section.blocks[0].units[0].checks])
  );
  assert.deepEqual(checksByStatus.PENDING, { packed: false, outForDelivery: false });
  assert.deepEqual(checksByStatus.PACKED, { packed: true, outForDelivery: false });
  assert.deepEqual(checksByStatus.OUT_FOR_DELIVERY, { packed: true, outForDelivery: true });
});

test('rooms that travel together print as one row, exactly as the board tiles them', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'MINDS-101', 'r101', [['Soap', 1], ['Biscuits', 2]]),
      order('PENDING', 'MINDS-102', 'r102', [['Biscuits', 1]]),
      order('PENDING', 'MINDS-9', 'r9', [['Chips', 1]]),
    ],
    [MINDS_UNIT]
  );

  const [pending] = sheet.sections;
  assert.equal(pending.blocks.length, 1, 'one block: MINDS');
  const block = pending.blocks[0];
  assert.equal(block.label, 'Block MINDS');
  assert.equal(block.units.length, 2, 'the paired rooms are one row, the unmapped room its own');

  const paired = block.units.find((unit) => unit.roomCodes.length === 2);
  assert.equal(paired.label, '101 · 102', 'block prefix is not repeated inside its own block');
  assert.deepEqual(paired.roomCodes, ['MINDS-101', 'MINDS-102']);
  assert.deepEqual(
    paired.items,
    [
      { name: 'Biscuits', quantity: 3 },
      { name: 'Soap', quantity: 1 },
    ],
    'items aggregate across the unit and sort naturally'
  );
  assert.equal(paired.itemCount, 4);

  const alone = block.units.find((unit) => unit.roomCodes.length === 1);
  assert.deepEqual(alone.roomCodes, ['MINDS-9']);

  assert.equal(pending.unitCount, 2);
  assert.equal(pending.itemCount, 5);
});

test('the same rooms mid-week appear once per stage they have orders in', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'MINDS-101', 'r101', [['Soap', 1]]),
      order('PACKED', 'MINDS-102', 'r102', [['Chips', 2]]),
    ],
    [MINDS_UNIT]
  );

  const [pending, packed] = sheet.sections;
  assert.equal(pending.blocks[0].units.length, 1);
  assert.equal(packed.blocks[0].units.length, 1);
  assert.deepEqual(pending.blocks[0].units[0].checks, { packed: false, outForDelivery: false });
  assert.deepEqual(packed.blocks[0].units[0].checks, { packed: true, outForDelivery: false });
});

test('closed orders never reach the paper, and the totals count only what did', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'A-1', 'a1', [['Soap', 1]]),
      order('DELIVERED', 'A-1', 'a1', [['Chips', 9]]),
      order('COLLECTED', 'A-2', 'a2', [['Chips', 9]]),
      order('CANCELLED', 'A-3', 'a3', [['Chips', 9]]),
    ],
    []
  );

  assert.deepEqual(sheet.totals, { orderCount: 1, unitCount: 1, itemCount: 1 });
});

test('blocks and units hold the natural reading order a person expects', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'B-2', 'b2', [['Soap', 1]]),
      order('PENDING', 'A-10', 'a10', [['Soap', 1]]),
      order('PENDING', 'A-9', 'a9', [['Soap', 1]]),
    ],
    []
  );

  const [pending] = sheet.sections;
  assert.deepEqual(pending.blocks.map((block) => block.key), ['A', 'B']);
  assert.deepEqual(
    pending.blocks[0].units.map((unit) => unit.label),
    ['9', '10'],
    'A-9 reads before A-10 even though it sorts after it as text'
  );
});

test('a sections filter prints only the stages asked for, in board order', () => {
  const sheet = buildPrintSheet(
    [
      order('PENDING', 'A-1', 'a1', [['Soap', 1]]),
      order('PACKED', 'B-1', 'b1', [['Chips', 2]]),
      order('OUT_FOR_DELIVERY', 'C-1', 'c1', [['Biscuits', 3]]),
    ],
    [],
    { sections: ['OUT_FOR_DELIVERY', 'PACKED'] }
  );

  assert.deepEqual(
    sheet.sections.map((section) => section.status),
    ['PACKED', 'OUT_FOR_DELIVERY'],
    'the filter selects stages; the board decides their order'
  );
  assert.deepEqual(
    sheet.totals,
    { orderCount: 2, unitCount: 2, itemCount: 5 },
    'totals count only the stages on the paper'
  );
});

test('an empty sections filter means the whole board, not a blank page', () => {
  const sheet = buildPrintSheet([order('PENDING', 'A-1', 'a1', [['Soap', 1]])], [], {
    sections: [],
  });
  assert.equal(sheet.sections.length, 3);
  assert.equal(sheet.totals.orderCount, 1);
});

test('the sheet is stamped with the moment it was generated', () => {
  const generatedAt = new Date('2026-09-07T10:30:00Z');
  const sheet = buildPrintSheet([], [], { generatedAt });
  assert.equal(sheet.generatedAt, generatedAt);
});
