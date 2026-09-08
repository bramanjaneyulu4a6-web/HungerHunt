import { OrderStatus } from './orderState.js';

/* The Active orders board, arranged for paper.
 *
 * The warehouse prints this to work a delivery round with a pen: the same
 * three stages as the screen, the same block → caretaker-unit grouping, and
 * two checkbox columns — Packed and Out for delivery. A stage a unit has
 * already passed prints pre-ticked, so the sheet leaves the printer agreeing
 * with the board and only the pen moves it forward from there.
 *
 * The grouping rules are a deliberate port of the warehouse frontend's
 * orderGroups.js — which rooms travel together is meta.roomUnits' answer
 * there and buildRoomUnits' answer here, and both file a unit under the
 * block of its lowest room code. If the two ever disagree, the paper stops
 * matching the screen it was printed from. */

const SECTIONS = Object.freeze([
  {
    status: OrderStatus.PENDING,
    label: 'New orders',
    checks: Object.freeze({ packed: false, outForDelivery: false }),
  },
  {
    status: OrderStatus.PACKED,
    label: 'Packed',
    checks: Object.freeze({ packed: true, outForDelivery: false }),
  },
  {
    status: OrderStatus.OUT_FOR_DELIVERY,
    label: 'Out for delivery',
    checks: Object.freeze({ packed: true, outForDelivery: true }),
  },
]);

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const blockFromRoom = (roomNumber) => {
  const code = String(roomNumber || '').trim().toUpperCase();
  if (!code) return 'Other';

  const separated = code.split(/[-/\s]+/).filter(Boolean);
  if (separated.length > 1) return separated[0];

  return code.match(/^[A-Z]+/i)?.[0] || code;
};

// "MINDS-101 · MINDS-102" under "Block MINDS" repeats the block for nothing.
const stripBlock = (roomNumber, block) => {
  const code = String(roomNumber || '').trim();
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
        name: item.name,
        quantity: (current?.quantity || 0) + (Number(item.quantity) || 0),
      });
    }
  }
  return [...items.values()].sort((a, b) => natural.compare(a.name, b.name));
};

const groupSection = (orders, unitByRoomId, checks) => {
  const units = new Map();
  for (const order of orders) {
    const roomCode = String(order.studentSnapshot?.roomNumber || '').trim();
    const membership = unitByRoomId.get(String(order.studentSnapshot?.roomId || ''));
    const unitKey = membership ? `unit:${membership.index}` : `room:${roomCode || 'Unassigned'}`;
    if (!units.has(unitKey)) {
      units.set(unitKey, {
        // A unit spanning two blocks files under its lowest room code.
        block: blockFromRoom(membership ? membership.rooms[0].code : roomCode),
        roomCodes: membership
          ? membership.rooms.map((room) => room.code)
          : [roomCode || 'Unassigned'],
        orders: [],
      });
    }
    units.get(unitKey).orders.push(order);
  }

  const blocks = new Map();
  for (const unit of units.values()) {
    if (!blocks.has(unit.block)) blocks.set(unit.block, []);
    blocks.get(unit.block).push({
      label: unit.roomCodes.map((code) => stripBlock(code, unit.block)).join(' · '),
      roomCodes: unit.roomCodes,
      orderCount: unit.orders.length,
      itemCount: unit.orders.reduce((sum, order) => sum + itemCountOf(order), 0),
      items: aggregateItems(unit.orders),
      checks,
    });
  }

  return [...blocks.entries()]
    .map(([key, blockUnits]) => {
      const sorted = [...blockUnits].sort((a, b) => natural.compare(a.label, b.label));
      return {
        key,
        label: key === 'Other' ? 'Other rooms' : `Block ${key}`,
        units: sorted,
        unitCount: sorted.length,
        itemCount: sorted.reduce((sum, unit) => sum + unit.itemCount, 0),
      };
    })
    .sort((a, b) => natural.compare(a.key, b.key));
};

// The statuses a sections filter may name — the board's three stages.
export const PRINTABLE_STATUSES = Object.freeze(SECTIONS.map((section) => section.status));

export const buildPrintSheet = (
  orders,
  roomUnits,
  { generatedAt = new Date(), sections: wanted } = {}
) => {
  const unitByRoomId = new Map();
  (roomUnits || []).forEach((unit, index) => {
    const rooms = [...(unit.rooms || [])].sort((a, b) => natural.compare(a.code, b.code));
    for (const room of rooms) unitByRoomId.set(String(room.id), { index, rooms });
  });

  /* The filter chooses which stages print; the board keeps deciding their
     order. Asking for nothing means asking for everything — an empty sheet
     helps nobody on the storeroom floor. */
  const included = wanted?.length
    ? SECTIONS.filter((section) => wanted.includes(section.status))
    : SECTIONS;

  const sections = included.map(({ status, label, checks }) => {
    const blocks = groupSection(
      (orders || []).filter((order) => order.status === status),
      unitByRoomId,
      checks
    );
    return {
      status,
      label,
      blocks,
      unitCount: blocks.reduce((sum, block) => sum + block.unitCount, 0),
      itemCount: blocks.reduce((sum, block) => sum + block.itemCount, 0),
    };
  });

  const onSheet = (orders || []).filter((order) =>
    included.some((section) => section.status === order.status)
  );

  return {
    generatedAt,
    sections,
    totals: {
      orderCount: onSheet.length,
      unitCount: sections.reduce((sum, section) => sum + section.unitCount, 0),
      itemCount: sections.reduce((sum, section) => sum + section.itemCount, 0),
    },
  };
};

export default buildPrintSheet;
