const statusOf = (order) => order.awaitingParent ? 'AWAITING_PARENT' : order.status;

export const activeOrderItemTotals = (orders = []) => {
  const products = new Map();
  const statusCounts = {};

  for (const order of orders) {
    const status = statusOf(order);
    statusCounts[status] = (statusCounts[status] ?? 0) + 1;

    for (const item of order.items ?? []) {
      const key = String(item.productId ?? item.name);
      const row = products.get(key) ?? {
        product: item.name || 'Unnamed product',
        awaitingParent: 0,
        pending: 0,
        packed: 0,
        outForDelivery: 0,
        totalUnits: 0,
        orderIds: new Set(),
      };
      const quantity = Number(item.quantity || 0);

      if (status === 'AWAITING_PARENT') row.awaitingParent += quantity;
      if (status === 'PENDING') row.pending += quantity;
      if (status === 'PACKED') row.packed += quantity;
      if (status === 'OUT_FOR_DELIVERY') row.outForDelivery += quantity;
      row.totalUnits += quantity;
      row.orderIds.add(String(order.id ?? order._id));
      products.set(key, row);
    }
  }

  const rows = [...products.values()]
    .map(({ orderIds, ...row }) => ({ ...row, orders: orderIds.size }))
    .sort((a, b) => b.totalUnits - a.totalUnits || a.product.localeCompare(b.product));

  return {
    activeOrders: orders.length,
    statusCounts,
    totalUnits: rows.reduce((sum, row) => sum + row.totalUnits, 0),
    rows,
  };
};

export default activeOrderItemTotals;
