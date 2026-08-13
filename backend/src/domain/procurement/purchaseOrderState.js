export const PurchaseOrderStatus = Object.freeze({
  PENDING_REVIEW: 'PENDING_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  PARTIALLY_RECEIVED: 'PARTIALLY_RECEIVED',
  RECEIVED: 'RECEIVED',
  CANCELLED: 'CANCELLED',
});

const transitions = Object.freeze({
  [PurchaseOrderStatus.PENDING_REVIEW]: new Set([
    PurchaseOrderStatus.APPROVED,
    PurchaseOrderStatus.REJECTED,
    PurchaseOrderStatus.CANCELLED,
  ]),
  [PurchaseOrderStatus.APPROVED]: new Set([
    PurchaseOrderStatus.PARTIALLY_RECEIVED,
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ]),
  [PurchaseOrderStatus.PARTIALLY_RECEIVED]: new Set([
    PurchaseOrderStatus.RECEIVED,
    PurchaseOrderStatus.CANCELLED,
  ]),
  [PurchaseOrderStatus.REJECTED]: new Set(),
  [PurchaseOrderStatus.RECEIVED]: new Set(),
  [PurchaseOrderStatus.CANCELLED]: new Set(),
});

export const purchaseOrderStatuses = Object.freeze(Object.values(PurchaseOrderStatus));

export const canTransitionPurchaseOrder = (from, to) =>
  transitions[from]?.has(to) ?? false;

export const assertPurchaseOrderTransition = (from, to) => {
  if (!canTransitionPurchaseOrder(from, to)) {
    throw new Error(`Purchase order cannot transition from ${from} to ${to}.`);
  }
};

