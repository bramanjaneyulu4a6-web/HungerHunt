/* A package is officially delivered only when its student ends it with their
   own code (COLLECTED). The warehouse handing it to a room receiver
   (DELIVERED) is a step inside delivery, not the end of it, so it reads as
   "out for delivery" everywhere — the back office alone is additionally told
   who is holding the package. */
export const FULFILLMENT_STATUS_LABELS = Object.freeze({
  PENDING: 'Confirmed',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'Out for delivery',
  DELIVERED: 'Out for delivery',
  COLLECTED: 'Delivered',
});

const ACTIVE_STATUSES = Object.freeze(['PENDING', 'PACKED', 'OUT_FOR_DELIVERY']);

export const fulfillmentStatusLabel = (status) =>
  FULFILLMENT_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ');

// The admin's badge: a handed-over package names its receiver, so the office
// can see where inside "out for delivery" it actually is.
export const fulfillmentStatusDisplay = (order) =>
  order?.status === 'DELIVERED' && order.proofOfDelivery?.receivedBy
    ? `Out for delivery, handed to ${order.proofOfDelivery.receivedBy}`
    : fulfillmentStatusLabel(order?.status);

// Two statuses now share the "out for delivery" label, so the transition that
// records the handover needs its own verb in menus, dialogs and toasts.
export const fulfillmentActionLabel = (status) =>
  status === 'DELIVERED' ? 'handed over to the room' : fulfillmentStatusLabel(status);

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
