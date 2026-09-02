export const FULFILLMENT_STATUS_LABELS = Object.freeze({
  PENDING: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Delivered',
});

const ACTIVE_STATUSES = Object.freeze(['PENDING', 'PACKED', 'OUT_FOR_DELIVERY']);

export const fulfillmentStatusLabel = (status) =>
  FULFILLMENT_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ');

export const availableFulfillmentStatuses = (order) => {
  // Older API responses do not carry paymentProcessed. Active fulfilment
  // orders are only created after checkout, and the transition endpoint also
  // verifies the transaction, so absence of the newer hint must not hide the
  // editor. An explicit false still locks a known unpaid/corrupt record.
  if (!order || order.paymentProcessed === false || !ACTIVE_STATUSES.includes(order.status)) {
    return [];
  }

  const choices = ACTIVE_STATUSES.filter((status) => status !== order.status);
  if (order.status === 'OUT_FOR_DELIVERY') choices.push('DELIVERED');
  return choices;
};
