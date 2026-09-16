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

// The five life stages of a paid package, in order. A cancelled order has
// left this line and does not come back.
export const FULFILLMENT_STAGES = Object.freeze(['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED']);

// The storeroom may still cancel a package that has not left it.
const CANCELLABLE_STATUSES = Object.freeze(['PENDING', 'PACKED']);

export const fulfillmentStatusLabel = (status) =>
  FULFILLMENT_STATUS_LABELS[status] || String(status || '').replaceAll('_', ' ');

// The admin's badge: a handed-over package names its receiver, so the office
// can see where inside "out for delivery" it actually is.
export const fulfillmentStatusDisplay = (order) => {
  // The board carries the proof object; the ledger flattens it to receivedBy.
  const receiver = order?.proofOfDelivery?.receivedBy || order?.receivedBy;
  return order?.status === 'DELIVERED' && receiver
    ? `Out for delivery, handed to ${receiver}`
    : fulfillmentStatusLabel(order?.status);
};

// Two statuses share the "out for delivery" label and two share "delivered",
// so the transitions need their own verbs in menus, dialogs and toasts.
export const fulfillmentActionLabel = (status) => {
  if (status === 'DELIVERED') return 'handed over to the room';
  if (status === 'COLLECTED') return 'delivered (collected by the student)';
  return fulfillmentStatusLabel(status);
};

export const fulfillmentBadgeVariant = (status) => {
  if (status === 'PENDING') return 'warn';
  if (status === 'CANCELLED') return 'alert';
  if (['OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED'].includes(status)) return 'success';
  return 'neutral';
};

/* Every stage an admin may move this order to: all of them but the one it is
   in. The server is the judge of who may do this (a storeroom account is held
   to the forward sequence); the console is admin-only, so it offers the lot.
   Older API responses do not carry paymentProcessed. Active fulfilment orders
   are only created after checkout, and the transition endpoint also verifies
   the transaction, so absence of the newer hint must not hide the editor. An
   explicit false still locks a known unpaid/corrupt record. */
export const availableFulfillmentStatuses = (order) => {
  if (!order || order.paymentProcessed === false || !FULFILLMENT_STAGES.includes(order.status)) {
    return [];
  }
  return FULFILLMENT_STAGES.filter((status) => status !== order.status);
};

export const isCancellableFulfillment = (order) =>
  Boolean(order) && order.paymentProcessed !== false && CANCELLABLE_STATUSES.includes(order.status);
