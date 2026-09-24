import Admin from '../models/Admin.js';
import Room from '../models/Room.js';

/* A caretaker may cover more than one room, and the rooms they cover behave as
   a single delivery unit: one trolley, one handover, one report, and one tile
   on the warehouse board.
 *
 * One unit per caretaker, holding every room they cover. A room held by more
 * than one caretaker still belongs to exactly one unit — a package must sit on
 * one tile, never two — and goes to whichever of them holds the most rooms,
 * the floor's main caretaker, with ties settled by name so the board never
 * reshuffles between refreshes. A room nobody covers stands alone.
 *
 * Only active caretaker accounts count. A disabled account cannot sign in, so
 * a delivery grouped under it would be one nobody can take.
 *
 * Derived on read rather than stored. The inputs are two small collections, and
 * a stored grouping would have to be reconciled every time an account is
 * disabled or its rooms are edited — a cache with no invalidation story, for a
 * question the database can already answer. */
export const buildRoomUnits = async () => {
  const [rooms, caretakers] = await Promise.all([
    Room.find({ active: { $ne: false } }).select('code').lean(),
    Admin.find({ role: 'caretaker', active: { $ne: false } }).select('name roomIds').lean(),
  ]);

  const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });
  const liveRoomIds = new Set(rooms.map((room) => String(room._id)));

  // Most rooms first, then by name: the order in which a shared room is
  // claimed, so it lands with the caretaker whose round it most belongs to.
  const claimants = caretakers
    .map((caretaker) => ({
      id: String(caretaker._id),
      name: caretaker.name || '',
      roomIds: [...new Set((caretaker.roomIds || []).map(String))].filter((id) => liveRoomIds.has(id)),
    }))
    .filter((caretaker) => caretaker.roomIds.length > 0)
    .sort((a, b) => b.roomIds.length - a.roomIds.length
      || natural.compare(a.name, b.name)
      || a.id.localeCompare(b.id));

  const ownerByRoom = new Map();
  for (const caretaker of claimants) {
    for (const roomId of caretaker.roomIds) {
      if (!ownerByRoom.has(roomId)) ownerByRoom.set(roomId, caretaker);
    }
  }

  const units = new Map();
  for (const room of rooms) {
    const owner = ownerByRoom.get(String(room._id));
    // An uncovered room keys on its own id, so it can never share a unit.
    const unitKey = owner ? `caretaker:${owner.id}` : `room:${room._id}`;
    if (!units.has(unitKey)) {
      units.set(unitKey, {
        caretaker: owner ? { id: owner.id, name: owner.name } : null,
        rooms: [],
      });
    }
    units.get(unitKey).rooms.push({ id: String(room._id), code: room.code });
  }

  /* Natural order throughout: room codes are read by people, and "ROOM-10"
     belongs after "ROOM-9" on a screen even though it sorts before it as text.
     Units are ordered by their first room for the same reason — a warehouse
     board that reshuffles its blocks between refreshes is unreadable. */
  return [...units.values()]
    .map((unit) => ({
      rooms: [...unit.rooms].sort((a, b) => natural.compare(a.code, b.code)),
      caretaker: unit.caretaker,
    }))
    .sort((a, b) => natural.compare(a.rooms[0].code, b.rooms[0].code));
};

export default buildRoomUnits;
