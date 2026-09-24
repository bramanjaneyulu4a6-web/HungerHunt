import { buildActiveOrdersExport } from './activeOrdersExport.js';
import { OrderStatus } from './orderState.js';

const STAGES = Object.freeze([
  [OrderStatus.PENDING, 'New orders'],
  [OrderStatus.PACKED, 'Packed'],
  [OrderStatus.OUT_FOR_DELIVERY, 'Out for delivery'],
]);

export const PRINTABLE_RECEIVING_STATUSES = Object.freeze(STAGES.map(([status]) => status));

/* The warehouse handover sheet combines the selected active stages before it
 * groups anything. A caretaker therefore appears once with the total goods
 * they are due to receive, even when some packages are packed and others are
 * still new. */
export const buildCaretakerReceivingSheet = (
  orders,
  caretakers,
  { generatedAt = new Date(), sections: wanted } = {}
) => {
  const selected = wanted?.length
    ? STAGES.filter(([status]) => wanted.includes(status))
    : STAGES;
  const selectedStatuses = new Set(selected.map(([status]) => status));
  const report = buildActiveOrdersExport(
    (orders || []).filter((order) => selectedStatuses.has(order.status)),
    caretakers,
    { generatedAt }
  );

  return {
    ...report,
    stages: selected.map(([status, label]) => ({ status, label })),
  };
};

export default buildCaretakerReceivingSheet;
