/* The admin's active-orders export is deliberately built as plain data before
 * PDF rendering. That keeps the grouping rules testable without teaching the
 * document renderer about Mongo documents or caretaker assignments. */

const natural = new Intl.Collator('en', { numeric: true, sensitivity: 'base' });

const text = (value, fallback = '') => String(value ?? '').trim() || fallback;

const itemCountOf = (order) =>
  (order.items || []).reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);

const studentKeyOf = (order) => text(
  order.studentId?._id ||
  order.studentId ||
  order.studentSnapshot?.admissionNumber ||
  order.studentSnapshot?.name,
  `order:${order._id || order.id}`
);

const aggregateItems = (orders) => {
  const items = new Map();
  for (const order of orders) {
    for (const item of order.items || []) {
      const key = String(item.productId || item.name || 'Unnamed product');
      const current = items.get(key);
      items.set(key, {
        name: text(item.name, 'Unnamed product'),
        quantity: (current?.quantity || 0) + (Number(item.quantity) || 0),
      });
    }
  }
  return [...items.values()].sort((a, b) => natural.compare(a.name, b.name));
};

const compareOrders = (a, b) =>
  natural.compare(text(a.studentSnapshot?.name), text(b.studentSnapshot?.name)) ||
  new Date(a.orderedAt || a.createdAt || 0) - new Date(b.orderedAt || b.createdAt || 0);

export const buildActiveOrdersExport = (
  orders,
  caretakers,
  { generatedAt = new Date() } = {}
) => {
  const groups = new Map();
  const caretakerByRoom = new Map();

  for (const caretaker of caretakers || []) {
    const id = String(caretaker._id || caretaker.id);
    const group = {
      key: `caretaker:${id}`,
      caretakerName: text(caretaker.name, 'Unnamed caretaker'),
      unassigned: false,
      orders: [],
    };
    groups.set(group.key, group);
    for (const roomId of caretaker.roomIds || []) {
      const key = String(roomId);
      if (!caretakerByRoom.has(key)) caretakerByRoom.set(key, []);
      caretakerByRoom.get(key).push(group);
    }
  }

  const unassigned = {
    key: 'unassigned',
    caretakerName: 'Unassigned caretaker',
    unassigned: true,
    orders: [],
  };

  for (const order of orders || []) {
    const roomId = String(order.studentSnapshot?.roomId || '');
    const owners = caretakerByRoom.get(roomId) || [];
    if (owners.length) {
      // A room assigned to two caretakers belongs on both of their handouts.
      // That mirrors the roster literally and avoids silently choosing one.
      for (const owner of owners) owner.orders.push(order);
    } else {
      unassigned.orders.push(order);
    }
  }
  if (unassigned.orders.length) groups.set(unassigned.key, unassigned);

  const outputGroups = [...groups.values()]
    .filter((group) => group.orders.length)
    .sort((a, b) => Number(a.unassigned) - Number(b.unassigned) ||
      natural.compare(a.caretakerName, b.caretakerName))
    .map((group) => {
      const rooms = new Map();
      for (const order of group.orders) {
        const roomId = String(order.studentSnapshot?.roomId || '');
        const roomNumber = text(order.studentSnapshot?.roomNumber, 'Unassigned room');
        const key = roomId || `number:${roomNumber}`;
        if (!rooms.has(key)) rooms.set(key, { key, roomNumber, orders: [] });
        rooms.get(key).orders.push(order);
      }

      const roomRows = [...rooms.values()]
        .map((room) => {
          const sortedOrders = [...room.orders].sort(compareOrders);
          return {
            key: room.key,
            roomNumber: room.roomNumber,
            itemCount: sortedOrders.reduce((sum, order) => sum + itemCountOf(order), 0),
            orderCount: sortedOrders.length,
            childCount: new Set(sortedOrders.map(studentKeyOf)).size,
            orders: sortedOrders.map((order) => ({
              id: String(order._id || order.id),
              studentName: text(order.studentSnapshot?.name, 'Unknown student'),
              admissionNumber: text(order.studentSnapshot?.admissionNumber),
              status: order.status,
              orderedAt: order.orderedAt || order.createdAt,
              items: (order.items || []).map((item) => ({
                name: text(item.name, 'Unnamed product'),
                quantity: Number(item.quantity) || 0,
              })),
            })),
          };
        })
        .sort((a, b) => natural.compare(a.roomNumber, b.roomNumber));

      return {
        key: group.key,
        caretakerName: group.caretakerName,
        unassigned: group.unassigned,
        rooms: roomRows,
        items: aggregateItems(group.orders),
        roomCount: roomRows.length,
        orderCount: group.orders.length,
        childCount: new Set(group.orders.map(studentKeyOf)).size,
        itemCount: group.orders.reduce((sum, order) => sum + itemCountOf(order), 0),
      };
    });

  return {
    generatedAt,
    groups: outputGroups,
    totals: {
      // These are unique active orders, rather than caretaker assignments.
      orderCount: (orders || []).length,
      itemCount: (orders || []).reduce((sum, order) => sum + itemCountOf(order), 0),
      caretakerCount: outputGroups.filter((group) => !group.unassigned).length,
    },
  };
};

export default buildActiveOrdersExport;
