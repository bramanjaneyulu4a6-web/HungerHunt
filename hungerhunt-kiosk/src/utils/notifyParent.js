/* "Notify Parent via WhatsApp" at the end of an approval order. It counts once
   per order, shared with the caretaker app: the server records the first tap
   and refuses the rest, and whoever tapped first locks the button everywhere.

   The record is asked for first but not waited on — WhatsApp has to open while
   the tap is still running, or a browser treats the new tab as a pop-up.

   Resolves 'notified' (recorded, or somebody had already notified) or 'failed'
   (not recorded, so the button can be offered again). */
export const notifyParent = async ({ orderId, link, post, open }) => {
  if (!orderId || !link) return "failed";

  const recorded = post(`/pending-orders/${orderId}/parent-notified`);
  open(link);

  try {
    await recorded;
    return "notified";
  } catch (error) {
    const alreadyNotified =
      error?.response?.status === 409 && error.response.data?.code === "PARENT_ALREADY_NOTIFIED";
    return alreadyNotified ? "notified" : "failed";
  }
};
