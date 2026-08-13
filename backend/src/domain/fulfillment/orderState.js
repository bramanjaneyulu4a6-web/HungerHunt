export const OrderStatus = Object.freeze({
  PENDING: 'PENDING',
  PACKED: 'PACKED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
});

const transitions = Object.freeze({
  [OrderStatus.PENDING]: new Set([OrderStatus.PACKED, OrderStatus.CANCELLED]),
  [OrderStatus.PACKED]: new Set([OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED]),
  [OrderStatus.OUT_FOR_DELIVERY]: new Set([OrderStatus.DELIVERED]),
  [OrderStatus.DELIVERED]: new Set(),
  [OrderStatus.CANCELLED]: new Set(),
});

export const canTransitionOrder = (from, to) => transitions[from]?.has(to) ?? false;

export const orderStatuses = Object.freeze(Object.values(OrderStatus));

export const assertOrderTransition = (from, to) => {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Fulfilment order cannot transition from ${from} to ${to}.`);
  }
};
