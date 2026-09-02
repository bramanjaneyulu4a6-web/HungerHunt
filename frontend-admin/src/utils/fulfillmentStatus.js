export const FULFILLMENT_STATUS_LABELS = Object.freeze({
  PENDING: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
});

const NEXT_STATUS = Object.freeze({
  PENDING: 'PACKED',
  PACKED: 'OUT_FOR_DELIVERY',
  OUT_FOR_DELIVERY: 'DELIVERED',
});

export const fulfillmentStatusLabel = (status) =>
  FULFILLMENT_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ');

export const availableFulfillmentStatuses = (order) => {
  if (!order?.paymentProcessed) return [];
  const next = NEXT_STATUS[order.status];
  return next ? [next] : [];
};
