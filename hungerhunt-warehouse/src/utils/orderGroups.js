const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const blockFromRoom = (roomNumber) => {
  const code = String(roomNumber || "").trim().toUpperCase();
  if (!code) return "Other";

  const separated = code.split(/[-/\s]+/).filter(Boolean);
  if (separated.length > 1) return separated[0];

  const prefix = code.match(/^[A-Z]+/i)?.[0];
  return prefix || code;
};

/* The block is already the heading a unit sits under, so the tile carries only
   what tells one unit from the next: "MINDS-101 · MINDS-102" under "Block
   MINDS" repeats the block twice for nothing. */
const stripBlock = (roomNumber, block) => {
  const code = String(roomNumber || "").trim();
  return code.toUpperCase().startsWith(`${block}-`) ? code.slice(block.length + 1) : code;
};

const itemCountOf = (order) =>
  (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

const aggregateItems = (orders) => {
  const items = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = String(item.productId || item.name);
      const current = items.get(key);
      items.set(key, {
        id: key,
        name: item.name,
        quantity: (current?.quantity || 0) + (Number(item.quantity) || 0),
      });
    }
  }
  return [...items.values()].sort((a, b) => natural.compare(a.name, b.name));
};

/* A caretaker may hold several rooms, and those rooms are one delivery: one
   tile, one advance, one receiver, one report. Which rooms travel together is
   the server's answer (meta.roomUnits), never a guess made here from room
   codes — two rooms in the same block can belong to different people.
 *
 * A room the map does not mention stands alone rather than disappearing: an
 * order that is not on the board is work nobody can see. For the same reason an
 * absent or empty map degrades to one unit per room, which is what the board
 * did before units existed. */
export const groupOrdersByBlock = (orders, roomUnits = []) => {
  const unitByRoomId = new Map();
  (roomUnits || []).forEach((unit, index) => {
    const rooms = [...(unit.rooms || [])].sort((a, b) => natural.compare(a.code, b.code));
    for (const room of rooms) unitByRoomId.set(String(room.id), { index, rooms });
  });

  const units = new Map();
  for (const order of orders) {
    const roomCode = String(order.student?.roomNumber || "").trim();
    const membership = unitByRoomId.get(String(order.student?.roomId || ""));
    const unitKey = membership ? `unit:${membership.index}` : `room:${roomCode || "Unassigned"}`;
    if (!units.has(unitKey)) {
      units.set(unitKey, {
        key: unitKey,
        // A unit spanning two blocks is filed under its lowest room code, which
        // is the first of the naturally sorted list.
        block: blockFromRoom(membership ? membership.rooms[0].code : roomCode),
        roomNumbers: membership
          ? membership.rooms.map((room) => room.code)
          : [roomCode || "Unassigned"],
        orders: [],
      });
    }
    units.get(unitKey).orders.push(order);
  }

  const blocks = new Map();
  for (const unit of units.values()) {
    if (!blocks.has(unit.block)) blocks.set(unit.block, []);
    blocks.get(unit.block).push({
      key: unit.key,
      label: unit.roomNumbers.map((code) => stripBlock(code, unit.block)).join(" · "),
      roomNumbers: unit.roomNumbers,
      orders: unit.orders,
      orderCount: unit.orders.length,
      itemCount: unit.orders.reduce((sum, order) => sum + itemCountOf(order), 0),
      items: aggregateItems(unit.orders),
      overdue: unit.orders.some((order) => new Date(order.deliverBy).getTime() < Date.now()),
    });
  }

  return [...blocks.entries()]
    .map(([key, blockUnits]) => {
      const sorted = [...blockUnits].sort((a, b) => natural.compare(a.label, b.label));
      return {
        key,
        label: key === "Other" ? "Other rooms" : `Block ${key}`,
        units: sorted,
        unitCount: sorted.length,
        orderCount: sorted.reduce((sum, unit) => sum + unit.orderCount, 0),
        itemCount: sorted.reduce((sum, unit) => sum + unit.itemCount, 0),
      };
    })
    .sort((a, b) => natural.compare(a.key, b.key));
};
