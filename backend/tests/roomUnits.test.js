// One warehouse tile per caretaker: every room a caretaker covers travels as
// one unit, and a room two caretakers share still lands on exactly one tile.
//
// No database: Room.find and Admin.find are stubbed.
import test, { afterEach, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

process.env.NODE_ENV = 'test';

const Admin = (await import('../models/Admin.js')).default;
const Room = (await import('../models/Room.js')).default;
const { buildRoomUnits } = await import('../utils/roomUnits.js');

afterEach(() => mock.restoreAll());

const chain = (result) => {
  const query = { select: () => query, lean: async () => result };
  return query;
};

const given = (rooms, caretakers) => {
  mock.method(Room, 'find', () => chain(rooms));
  mock.method(Admin, 'find', () => chain(caretakers));
};

const room = (id, code) => ({ _id: `room${id}`, code });
const summary = (units) =>
  units.map((unit) => [unit.caretaker?.name ?? null, unit.rooms.map((r) => r.code)]);

describe('room units', () => {
  test('each caretaker is one unit holding all their rooms', async () => {
    given(
      [room(1, 'MINDS BOYS - 101'), room(2, 'MINDS BOYS - 102'), room(3, 'MINDS BOYS - 124'), room(4, 'MINDS BOYS - 103')],
      [
        { _id: 'a', name: 'Sowmya', roomIds: ['room1', 'room2', 'room3'] },
        { _id: 'b', name: 'Suguna', roomIds: ['room4'] },
      ]
    );

    assert.deepEqual(summary(await buildRoomUnits()), [
      ['Sowmya', ['MINDS BOYS - 101', 'MINDS BOYS - 102', 'MINDS BOYS - 124']],
      ['Suguna', ['MINDS BOYS - 103']],
    ]);
  });

  test('a shared room goes to the caretaker holding the most rooms, and the other keeps their own tile', async () => {
    // Room 304 was on two caretakers' lists; before, it split into a tile of its own.
    given(
      [room(1, 'MINDS BOYS - 301'), room(2, 'MINDS BOYS - 302'), room(3, 'MINDS BOYS - 304'), room(4, 'MINDS BOYS - 315')],
      [
        { _id: 'k', name: 'Karne', roomIds: ['room3', 'room4'] },
        { _id: 'd', name: 'Dolu', roomIds: ['room1', 'room2', 'room3'] },
      ]
    );

    assert.deepEqual(summary(await buildRoomUnits()), [
      ['Dolu', ['MINDS BOYS - 301', 'MINDS BOYS - 302', 'MINDS BOYS - 304']],
      ['Karne', ['MINDS BOYS - 315']],
    ]);
  });

  test('a tie between two caretakers is settled by name, the same way every time', async () => {
    given(
      [room(1, 'A-1'), room(2, 'A-2'), room(3, 'A-3')],
      [
        { _id: 'z', name: 'Zara', roomIds: ['room2', 'room3'] },
        { _id: 'm', name: 'Meena', roomIds: ['room1', 'room2'] },
      ]
    );

    assert.deepEqual(summary(await buildRoomUnits()), [
      ['Meena', ['A-1', 'A-2']],
      ['Zara', ['A-3']],
    ]);
  });

  test('a room nobody covers stands alone, and an archived room is ignored', async () => {
    given(
      [room(1, 'H1'), room(2, 'B-1')],
      [{ _id: 'a', name: 'Asha', roomIds: ['room2', 'roomGone'] }]
    );

    assert.deepEqual(summary(await buildRoomUnits()), [
      ['Asha', ['B-1']],
      [null, ['H1']],
    ]);
  });
});
