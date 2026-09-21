import { useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { notifyParent, parentNotifiedLabel } from '../utils/awaitingParent';
import { openWhatsApp } from '../utils/openWhatsApp';
import { notifyParentWhatsAppLink } from '../utils/parentWhatsApp';

const WhatsAppMark = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
    <path fill="currentColor" d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2a8.2 8.2 0 0 1-4.2-1.1l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8s-.4-.1-.6.1-.7.8-.8 1-.3.2-.5.1a6.7 6.7 0 0 1-3.3-2.9c-.2-.4.2-.4.7-1.2.1-.2 0-.3 0-.4l-.8-1.8c-.2-.5-.4-.4-.6-.4h-.5a1 1 0 0 0-.7.3 3 3 0 0 0-.9 2.2 5.2 5.2 0 0 0 1.1 2.8 11.9 11.9 0 0 0 4.6 4c1.7.7 2.3.8 3.2.7a2.7 2.7 0 0 0 1.8-1.3 2.2 2.2 0 0 0 .2-1.3c-.1-.1-.3-.2-.5-.3Z" />
  </svg>
);

/* Tells the parent about an order still waiting for an answer, from the
 * caretaker's own WhatsApp — the kiosk's message, word for word: accept or
 * decline when the parent answers, "the caretaker is reviewing it" when they
 * handed it over. Opens a typed-out message; the caretaker taps send.
 *
 * Once per order, shared with the kiosk: after the first tap from either
 * side the button stays disabled and says who notified the parent and when. */
const NotifyParentButton = ({ order }) => {
  // Our own tap, until the next refresh brings the same record on the order.
  const [recorded, setRecorded] = useState(null);
  const [busy, setBusy] = useState(false);
  const notified = recorded || order.parentNotified;
  const link = notifyParentWhatsAppLink(order);

  if (notified) {
    return (
      <div className="caretaker-notify-parent-done">
        <button type="button" className="caretaker-notify-parent" disabled>
          <WhatsAppMark />
          Parent notified ✓
        </button>
        <p>{parentNotifiedLabel(notified)}</p>
      </div>
    );
  }

  if (!link) {
    return (
      <p className="caretaker-notify-parent__missing">
        No WhatsApp number on file for this student&apos;s parent.
      </p>
    );
  }

  const tap = async () => {
    setBusy(true);
    let opened = true;
    const result = await notifyParent({
      orderId: order._id,
      link,
      post: (url) => api.post(url),
      open: (target) => { opened = openWhatsApp(target); return opened; },
    });
    setBusy(false);

    if (!opened) toast.error('Could not open WhatsApp. Allow pop-ups for this site and try again.');
    if (result.outcome === 'notified') {
      setRecorded(result.parentNotified || { at: new Date().toISOString(), via: 'CARETAKER', by: null });
    } else {
      toast.error(result.message);
    }
  };

  return (
    <button type="button" className="caretaker-notify-parent" disabled={busy} onClick={tap}>
      <WhatsAppMark />
      Notify Parent via WhatsApp
    </button>
  );
};

export default NotifyParentButton;
