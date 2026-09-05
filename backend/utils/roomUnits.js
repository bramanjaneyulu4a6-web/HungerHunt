import Admin from '../models/Admin.js';
import Room from '../models/Room.js';

/* A caretaker may cover more than one room, and the rooms they cover behave as
   a single delivery unit: one trolley, one handover, one report.
 *
 * Rooms sharing an identical set of active caretakers form one delivery unit; a
 * room nobody covers stands alone. Two rooms covered by the *same* two people
 * are one unit; two rooms that merely overlap in one caretaker are not, because
 * a package left in either would still have to be found by someone who does not
 * cover both.
 *
 * Only active caretaker accounts count. A disabled account cannot sign in, so
 * letting it bind two rooms together would describe a delivery nobody can make.
 * A caretaker whose rooms are covered by no active account falls back to
 * standing alone, which is the safe reading: it never merges rooms.
 *
 * Derived on read rather than stored. The inputs are two small collections, and
 * a stored grouping would have to be reconciled every time an account is
 * disabled or its rooms are edited — a cache with no invalidation story, for a
 * question the database can already answer. */
export const buildRoomUnits = async () => {
  const [rooms, caretakers] = await Promise.all([
    Room.find({ active: { $ne: false } }).select('code').lean(),
    Admin.find({ role: 'caretaker', active: { $ne: false } }).select('roomIds').lean(),
  ]);

  const staffByRoom = new Map();
  for (const caretaker of caretakers) {
    for (const roomId of caretaker.roomIds || []) {
      const key = String(roomId);
      if (!staffByRoom.has(key)) staffByRoom.set(key, []);
      staffByRoom.get(key).push(String(caretaker._id));
    }
  }

  const units = new Map();
  for (const room of rooms) {
    const staff = [...new Set(staffByRoom.get(String(room._id)) || [])].sort();
    // An uncovered room keys on its own id, so it can never share a unit.
    const unitKey = staff.length ? staff.join('+') : `room:${room._id}`;
    if (!units.has(unitKey)) units.set(unitKey, []);
    units.get(unitKey).push({ id: String(room._id), code: room.code });
  }

  /* Natural order throughout: room codes are read by people, and "ROOM-10"
     belongs after "ROOM-9" on a screen even though it sorts before it as text.
     Units are ordered by their first room for the same reason — a warehouse
     board that reshuffles its blocks between refreshes is unreadable. */
  const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  return [...units.values()]
    .map((unitRooms) => ({
      rooms: [...unitRooms].sort((a, b) => natural.compare(a.code, b.code)),
    }))
    .sort((a, b) => natural.compare(a.rooms[0].code, b.rooms[0].code));
};

export default buildRoomUnits;
