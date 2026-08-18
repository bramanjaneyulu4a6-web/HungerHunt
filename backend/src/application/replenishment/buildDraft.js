const ACTIVE_ORDER_STATES = new Set(['PENDING_REVIEW', 'APPROVED', 'PARTIALLY_RECEIVED']);

export const buildReplenishmentDraftItems = ({ analytics, purchaseOrders }) => {
  const covered = new Map();
  for (const order of purchaseOrders.filter((row) => ACTIVE_ORDER_STATES.has(row.status))) {
    for (const item of order.items) {
      const remaining = Math.max(0, Number(item.quantity) - Number(item.received || 0));
      const id = String(item.productId);
      covered.set(id, (covered.get(id) || 0) + remaining);
    }
  }

  return analytics.items.flatMap((item) => {
    if (!item.reorder.reorderNow) return [];
    const target = Math.max(
      Number(item.reorder.recommendedOrderQuantityEoq) || 0,
      Math.max(0, Number(item.reorder.suggestedReorderPoint) - Number(item.currentStock))
    );
    const openOrderQuantity = covered.get(String(item.productId)) || 0;
    const suggestedQuantity = Math.ceil(target - openOrderQuantity);
    if (suggestedQuantity <= 0) return [];
    return [{
      productId: item.productId,
      productName: item.productName,
      currentStock: item.currentStock,
      openOrderQuantity,
      suggestedQuantity,
      estimatedUnitCost: item.reorder.estimatedUnitCost,
    }];
  });
};
