/* The "Receipt" button on a ledger row, and the popup it opens.
 *
 * Both halves of that popup live in Receipt.jsx, because the recharge dialog
 * raises the same one without a button to click.
 */
import { Button } from './ui';
import { ReceiptModal } from './Receipt';
import { useReceipt } from '../utils/walletActivity';

export const ReceiptButton = ({ studentId, entry }) => {
  const { receipt, loading, open, close } = useReceipt();

  return (
    <>
      <Button
        variant="ghost"
        className="btn--sm"
        disabled={loading}
        onClick={(event) => {
          // Expandable ledger rows sit under this button; a click here is not
          // a toggle.
          event.stopPropagation();
          open(studentId, entry);
        }}
      >
        {loading ? 'Opening…' : 'Receipt'}
      </Button>
      {receipt && <ReceiptModal receipt={receipt} onClose={close} />}
    </>
  );
};

export default ReceiptButton;
