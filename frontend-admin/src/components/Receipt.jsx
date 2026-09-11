/* The receipt popup, and the state that opens one.
 *
 * The receipt used to open in a new browser tab, which walked the admin away
 * from whatever they were reading. Now it stays a popup over the same screen —
 * the PDF in a frame, with the print and download the tab's toolbar used to
 * provide.
 *
 * Split from the button that opens it (ReceiptButton.jsx) because two places
 * now raise the same popup: a row in the ledger, and the recharge dialog the
 * moment it succeeds. The desk hands over the paper without going looking for
 * the deposit it just took. The state that opens one is useReceipt, in
 * utils/walletActivity.js — this file exports components only, which is what
 * fast refresh needs to swap it without losing what is on screen.
 */
import { useRef } from 'react';

import Icon from './Icon';
import { useDismissableOverlay } from '../utils/overlay';

export const ReceiptModal = ({ receipt, onClose, title = 'Receipt' }) => {
  const frameRef = useRef(null);
  useDismissableOverlay(onClose);

  const print = () => {
    try {
      frameRef.current.contentWindow.focus();
      frameRef.current.contentWindow.print();
    } catch {
      // A viewer that refuses print() from outside gets the tab after all.
      window.open(receipt.url, '_blank');
    }
  };

  /* The blob URL is same-origin, so a plain anchor with `download` saves it
     under the receipt's own name without navigating anywhere. */
  const download = () => {
    const link = document.createElement('a');
    link.href = receipt.url;
    link.download = receipt.fileName;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div
      className="modal-backdrop"
      onClick={(event) => {
        event.stopPropagation();
        onClose();
      }}
    >
      <div
        className="modal modal--receipt"
        role="dialog"
        aria-modal="true"
        aria-label="Wallet recharge receipt"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h3 className="modal-title">{title}</h3>
            {receipt.fileName && (
              <p className="modal-sub">{receipt.fileName.replace(/\.pdf$/i, '')}</p>
            )}
          </div>
          {/* The document's actions ride the header, set a step apart from
              close so saving a receipt is never a slip away from dismissing
              it. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <button
              type="button"
              className="modal-close"
              onClick={download}
              aria-label="Download receipt PDF"
            >
              <Icon name="download" size={20} />
            </button>
            <button
              type="button"
              className="modal-close"
              onClick={print}
              aria-label="Print receipt"
            >
              <Icon name="printer" size={20} />
            </button>
            <button
              type="button"
              className="modal-close"
              style={{ marginLeft: 12 }}
              onClick={onClose}
              aria-label="Close receipt"
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        </header>
        {/* #toolbar=0 hides Chrome's own PDF chrome; the header icons replace it. */}
        <iframe
          ref={frameRef}
          className="receipt-frame"
          src={`${receipt.url}#toolbar=0&navpanes=0`}
          title="Receipt PDF"
        />
      </div>
    </div>
  );
};
