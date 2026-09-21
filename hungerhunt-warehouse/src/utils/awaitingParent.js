/* Orders still waiting on the parent, as the caretaker app draws them.
 *
 * GET /pending-orders/caretaker returns every unanswered order from the
 * caretaker's rooms. The ones the parent handed to the caretaker
 * (caretakerMayAnswer) are theirs to accept or decline and stay in "Pending
 * approvals". The rest are the parent's to answer: they are drawn with the
 * room's packages in "Student orders", as a tile at the first step, "Awaiting
 * parent approval", with the WhatsApp nudge. */

export const splitPendingOrders = (orders = []) => ({
  forCaretaker: orders.filter((order) => order.caretakerMayAnswer),
  awaitingParent: orders.filter((order) => !order.caretakerMayAnswer),
});

// The same shape as a fulfillment order from /v1/caretaker/fulfillment-orders,
// so the tile, the search and the step bar treat both alike.
export const awaitingParentTile = (order) => {
  const student = order.studentId || {};
  return {
    id: `awaiting-${order._id}`,
    status: 'AWAITING_PARENT',
    student: {
      name: student.name || 'Student',
      admissionNumber: student.admissionNumber || '',
      roomNumber: student.roomNumber || '',
    },
    items: (order.items || []).map((item) => ({
      productId: item.productId,
      name: item.name,
      quantity: item.quantity,
    })),
    expiresAt: order.expiresAt,
    pendingOrder: order,
  };
};

const notifiedTime = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

// "Parent notified via WhatsApp from the kiosk · 22 Sept, 12:12 pm", or by the
// caretaker who tapped. '' when nobody has.
export const parentNotifiedLabel = (parentNotified) => {
  if (!parentNotified?.at) return '';
  const who = parentNotified.via === 'KIOSK'
    ? 'from the kiosk'
    : `by ${parentNotified.by || 'a caretaker'}`;
  return `Parent notified via WhatsApp ${who} · ${notifiedTime.format(new Date(parentNotified.at))}`;
};

/* One tap of "Notify Parent via WhatsApp". It counts once per order, shared
 * with the kiosk: the server records the first tap and refuses the rest. The
 * record is asked for first but not waited on, so WhatsApp opens while the tap
 * is still running and the browser does not treat the tab as a pop-up.
 *
 * Resolves { outcome: 'notified', parentNotified } — ours, or whoever got
 * there first — or { outcome: 'failed', message } so the button can be
 * offered again. */
export const notifyParent = async ({ orderId, link, post, open }) => {
  const recorded = post(`/pending-orders/${orderId}/parent-notified`);
  open(link);

  try {
    const response = await recorded;
    return { outcome: 'notified', parentNotified: response.data?.parentNotified ?? null };
  } catch (error) {
    const data = error?.response?.data;
    if (error?.response?.status === 409 && data?.code === 'PARENT_ALREADY_NOTIFIED') {
      return { outcome: 'notified', parentNotified: data.parentNotified ?? null };
    }
    return { outcome: 'failed', message: data?.message || 'Could not record that the parent was notified.' };
  }
};
