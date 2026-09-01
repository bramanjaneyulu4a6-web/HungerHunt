const natural = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

export const blockFromHostel = (hostelNumber) => {
  const code = String(hostelNumber || "").trim().toUpperCase();
  if (!code) return "Other";

  const separated = code.split(/[-/\s]+/).filter(Boolean);
  if (separated.length > 1) return separated[0];

  const prefix = code.match(/^[A-Z]+/i)?.[0];
  return prefix || code;
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

export const groupOrdersByBlock = (orders) => {
  const blocks = new Map();

  for (const order of orders) {
    const hostelNumber = String(order.student?.hostelNumber || "Unassigned").trim();
    const blockKey = blockFromHostel(hostelNumber);
    if (!blocks.has(blockKey)) blocks.set(blockKey, new Map());
    const hostels = blocks.get(blockKey);
    if (!hostels.has(hostelNumber)) hostels.set(hostelNumber, []);
    hostels.get(hostelNumber).push(order);
  }

  return [...blocks.entries()]
    .map(([key, hostelMap]) => {
      const hostels = [...hostelMap.entries()]
        .map(([hostelNumber, hostelOrders]) => ({
          key: hostelNumber,
          hostelNumber,
          block: key,
          orders: hostelOrders,
          orderCount: hostelOrders.length,
          itemCount: hostelOrders.reduce((sum, order) => sum + itemCountOf(order), 0),
          items: aggregateItems(hostelOrders),
          overdue: hostelOrders.some(
            (order) => new Date(order.deliverBy).getTime() < Date.now()
          ),
        }))
        .sort((a, b) => natural.compare(a.hostelNumber, b.hostelNumber));

      return {
        key,
        label: key === "Other" ? "Other hostels" : `Block ${key}`,
        hostels,
        hostelCount: hostels.length,
        orderCount: hostels.reduce((sum, hostel) => sum + hostel.orderCount, 0),
        itemCount: hostels.reduce((sum, hostel) => sum + hostel.itemCount, 0),
      };
    })
    .sort((a, b) => natural.compare(a.key, b.key));
};

