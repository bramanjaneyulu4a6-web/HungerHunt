/* The "Receipt" button and the popup it opens.
 *
 * The receipt used to open in a new browser tab, which walked the admin away
 * from the ledger they were reading. Now it stays a popup over the same
 * screen — the PDF in a frame, with the print and download the tab's toolbar
 * used to provide. The blob URL lives exactly as long as the popup does.
 */
import { useRef, useState } from 'react';

import Icon from './Icon';
import { Button } from './ui';
import { fetchReceipt } from '../utils/walletActivity';

export const ReceiptButton = ({ studentId, entry }) => {
  const [receipt, setReceipt] = useState(null); // { url, fileName } while open
  const [loading, setLoading] = useState(false);
  const frameRef = useRef(null);

  const open = async (event) => {
    // Expandable ledger rows sit under this button; a click here is not a toggle.
    event.stopPropagation();
    setLoading(true);
    const fetched = await fetchReceipt(studentId, entry);
    if (fetched) setReceipt(fetched);
    setLoading(false);
  };

  const close = () => {
    URL.revokeObjectURL(receipt.url);
    setReceipt(null);
  };

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
    <>
      <Button variant="ghost" className="btn--sm" disabled={loading} onClick={open}>
        {loading ? 'Opening…' : 'Receipt'}
      </Button>
      {receipt && (
        <div
          className="modal-backdrop"
          onClick={(event) => {
            event.stopPropagation();
            close();
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
                <h3 className="modal-title">Receipt</h3>
                {(entry.receiptNumber || receipt.fileName) && (
                  <p className="modal-sub">
                    {entry.receiptNumber || receipt.fileName.replace(/\.pdf$/i, '')}
                  </p>
                )}
              </div>
              <button type="button" className="modal-close" onClick={close} aria-label="Close receipt">
                <Icon name="close" size={20} />
              </button>
            </header>
            {/* #toolbar=0 hides Chrome's own PDF chrome; the actions below replace it. */}
            <iframe
              ref={frameRef}
              className="receipt-frame"
              src={`${receipt.url}#toolbar=0&navpanes=0`}
              title="Receipt PDF"
            />
            <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
              <Button variant="ghost" onClick={download}>Download</Button>
              <Button variant="primary" onClick={print}>Print</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default ReceiptButton;
