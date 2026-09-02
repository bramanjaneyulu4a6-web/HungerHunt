export const OrderStatus = Object.freeze({
  PENDING: 'PENDING',
  PACKED: 'PACKED',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  COLLECTED: 'COLLECTED',
  CANCELLED: 'CANCELLED',
});

/* DELIVERED is the warehouse handing the package to the hostel's caretaker,
   and it is where the storeroom's job ends: the receiver is named by the
   person who handed it over. COLLECTED is the step after, at the dorm door,
   and only the student's own purchase code can move a package into it — which
   is why no member of staff appears in that transition as its author.

   The two are separate states rather than one because they answer different
   questions: "did the warehouse deliver on time?" and "does the student
   actually have their food?". Collapsing them would let a package sit in a
   caretaker's room for a week and still read as delivered on time. */
const transitions = Object.freeze({
  [OrderStatus.PENDING]: new Set([OrderStatus.PACKED, OrderStatus.CANCELLED]),
  [OrderStatus.PACKED]: new Set([OrderStatus.OUT_FOR_DELIVERY, OrderStatus.CANCELLED]),
  [OrderStatus.OUT_FOR_DELIVERY]: new Set([OrderStatus.DELIVERED]),
  [OrderStatus.DELIVERED]: new Set([OrderStatus.COLLECTED]),
  [OrderStatus.COLLECTED]: new Set(),
  [OrderStatus.CANCELLED]: new Set(),
});

export const canTransitionOrder = (from, to) => transitions[from]?.has(to) ?? false;

// The back office may correct a package that was put in the wrong active
// column. This is deliberately separate from the warehouse state machine:
// storeroom accounts still advance work in sequence, while a full admin can
// move a paid order between the three live operational states.
export const ADMIN_EDITABLE_ORDER_STATUSES = Object.freeze([
  OrderStatus.PENDING,
  OrderStatus.PACKED,
  OrderStatus.OUT_FOR_DELIVERY,
]);

export const canAdminEditOrderStatus = (from, to) =>
  from !== to &&
  ADMIN_EDITABLE_ORDER_STATUSES.includes(from) &&
  ADMIN_EDITABLE_ORDER_STATUSES.includes(to);

export const orderStatuses = Object.freeze(Object.values(OrderStatus));

export const assertOrderTransition = (from, to) => {
  if (!canTransitionOrder(from, to)) {
    throw new Error(`Fulfilment order cannot transition from ${from} to ${to}.`);
  }
};
