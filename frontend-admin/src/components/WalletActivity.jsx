/* Wallet activity, as the office reads it.
 *
 * One vocabulary for the three places that now show a ledger — the dashboard
 * feed, a student's history and a parent's — because the rows are the same
 * rows, and a top-up that reads "UPI" on one screen and "Online" on another is
 * two facts to a reader rather than one.
 *
 * These are the same entries the parent app renders from the same builder
 * (backend/utils/studentLedger.js), which is the point: when a parent phones
 * about a payment, the admin who answers is looking at their history, not a
 * separate reconstruction of it.
 */
import { Fragment, useState } from 'react';


import Icon from './Icon';
import { formatINR } from '../utils/format';
import { fulfillmentStatusLabel } from '../utils/fulfillmentStatus';
import {
  describeEntry,
  entryAmount,
  entryLabel,
  entryReference,
  hasDetails,
  isOrder,
  isTransaction,
} from '../utils/ledgerEntry';
import { useStudentLedger } from '../utils/walletActivity';
import { ReceiptButton } from './ReceiptButton';
import { useDismissableOverlay } from '../utils/overlay';
import { Badge, Banner, Button, EmptyState, Skeleton } from './ui';

const when = (value) => (value ? new Date(value).toLocaleString() : null);

/* What a row opens into: what was bought, and what the storeroom did with it.
 *
 * The dates are listed in the order they happen rather than the order the
 * document stores them, and the ones that have not happened yet are left out
 * entirely — a column of empty dashes reads as missing data, when the truth is
 * that the package simply has not got there. */
export const EntryDetails = ({ entry }) => {
  const { order } = entry;
  const items = entry.items?.length ? entry.items : order?.items || [];

  const transactionFacts = [
    ['Receipt No.', entry.receiptNumber],
    // The bank's settlement reference. It is the number a parent is given when
    // they ask their own bank where the money went, and the only one that
    // means anything to either bank.
    ['UTR', entry.utr],
    ['Paid with', entry.upiApp],
    ['Transaction ID', isOrder(entry) ? null : entry.transactionId],
    ['Reverses Charge', entry.reversedTransactionId],
    ['Reason', entry.reason],
  ].filter(([, value]) => value);

  const facts = order
    ? [
        ['Order ID', order.reference],
        ['Status', fulfillmentStatusLabel(order.status)],
        ['Room', order.room],
        ['Ordered', when(order.orderedAt)],
        ['Due by', when(order.deliverBy)],
        ['Packed', when(order.packedAt)],
        ['Dispatched', when(order.dispatchedAt)],
        ['Handed to the room', when(order.deliveredAt)],
        ['Received by', order.receivedBy],
        // What the student's own code ended, and what nobody ended.
        ['Collected by the student', when(order.collectedAt)],
        ['Cancelled', when(order.cancelledAt)],
        ['Note', order.note],
      ].filter(([, value]) => value)
    : [];

  const allFacts = [...transactionFacts, ...facts];

  if (items.length === 0 && allFacts.length === 0) return null;

  return (
    <div className="ledger-detail">
      {items.length > 0 && (
        <table className="table table--stack ledger-detail__items">
          <thead>
            <tr>
              <th>Item</th>
              <th style={{ textAlign: 'center', width: 80 }}>Qty</th>
              <th style={{ textAlign: 'right', width: 110 }}>Unit price</th>
              <th style={{ textAlign: 'right', width: 120 }}>Subtotal</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={`${item.name}-${index}`}>
                <td data-label="Item" style={{ fontWeight: 600 }}>{item.name}</td>
                <td data-label="Qty" style={{ textAlign: 'center', color: 'var(--muted)' }}>
                  {item.quantity}
                </td>
                <td data-label="Unit price" style={{ textAlign: 'right', color: 'var(--muted)' }}>
                  {formatINR(item.price)}
                </td>
                <td data-label="Subtotal" style={{ textAlign: 'right', fontWeight: 600 }}>
                  {formatINR(item.price * item.quantity)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {allFacts.length > 0 && (
        <dl className="ledger-detail__facts">
          {allFacts.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
};

const EntryRow = ({ entry, studentId, showStudent }) => {
  const { label, variant } = entryLabel(entry);
  const { direction } = describeEntry(entry);
  const canPrint =
    Boolean(entry.adjustmentId || entry.reversalId) && (studentId || entry.student?.id);
  const [open, setOpen] = useState(false);
  const expandable = hasDetails(entry);
  const columns = showStudent ? 7 : 6;

  return (
    <Fragment>
    <tr
      className={expandable ? 'ledger-row--expandable' : undefined}
      aria-expanded={expandable ? open : undefined}
      onClick={expandable ? () => setOpen((was) => !was) : undefined}
    >
      <td data-label="Date/Time" style={{ fontSize: 13, color: 'var(--muted)' }}>
        {new Date(entry.date).toLocaleString()}
      </td>
      {showStudent && (
        <td data-label="Student">{entry.student?.name || 'Deleted account'}</td>
      )}
      <td data-label="Status">
        <Badge variant={variant}>{label}</Badge>
      </td>
      <td data-label="Reference" className="ledger-mono">
        {entryReference(entry) || '—'}
      </td>
      <td
        data-label="Amount"
        className={direction === 'none' ? 'amount-void' : undefined}
        style={{
          textAlign: 'right',
          fontWeight: 700,
          color: direction === 'in' ? 'var(--success)' : undefined,
        }}
      >
        {entryAmount(entry)}
      </td>
      <td data-label="Balance" style={{ textAlign: 'right', color: 'var(--muted)', fontSize: 13 }}>
        {entry.newBalance === undefined ? '—' : formatINR(entry.newBalance)}
      </td>
      <td className="ledger-actions">
        {canPrint && (
          <ReceiptButton studentId={studentId || entry.student.id} entry={entry} />
        )}
        {expandable && (
          <span className={`ledger-chevron${open ? ' ledger-chevron--open' : ''}`} aria-hidden="true">
            <Icon name="caret" size={16} />
          </span>
        )}
      </td>
    </tr>
    {open && (
      <tr className="ledger-detail-row">
        <td colSpan={columns}>
          <EntryDetails entry={entry} />
        </td>
      </tr>
    )}
    </Fragment>
  );
};

export const LedgerTable = ({ entries, studentId, showStudent = false }) => (
  <div className="table-wrap">
    <table className="table table--stack table--hover">
      <thead>
        <tr>
          <th>Date/Time</th>
          {showStudent && <th>Student</th>}
          <th style={{ width: 150 }}>Status</th>
          <th>Reference</th>
          <th style={{ textAlign: 'right', width: 130 }}>Amount</th>
          <th style={{ textAlign: 'right', width: 130 }}>Balance</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => (
          <EntryRow
            key={`${entry.kind}-${entry._id}`}
            entry={entry}
            studentId={studentId}
            showStudent={showStudent}
          />
        ))}
      </tbody>
    </table>
  </div>
);

const Section = ({ title, entries, studentId, empty }) => (
  <section style={{ marginTop: 20 }}>
    <h4 className="section-title" style={{ marginBottom: 8 }}>
      {title} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({entries.length})</span>
    </h4>
    {entries.length === 0
      ? <p className="modal-note">{empty}</p>
      : <LedgerTable entries={entries} studentId={studentId} />}
  </section>
);

const LedgerBody = ({ ledger, studentId }) => {
  if (ledger.loading && ledger.entries.length === 0) {
    return (
      <div>
        <Skeleton height={40} />
        <Skeleton height={40} style={{ marginTop: 8 }} />
        <Skeleton height={40} style={{ marginTop: 8 }} />
      </div>
    );
  }

  if (ledger.failed && ledger.entries.length === 0) {
    return (
      <Banner variant="alert">
        That history could not be loaded.{' '}
        <button type="button" className="link-button" onClick={ledger.retry}>Try again</button>.
      </Banner>
    );
  }

  if (ledger.entries.length === 0) {
    return <EmptyState icon="🧾" title="Nothing on this wallet yet" />;
  }

  return (
    <>
      <Section
        title="Orders"
        entries={ledger.entries.filter(isOrder)}
        studentId={studentId}
        empty="Nothing has been bought on this wallet."
      />
      <Section
        title="Transactions"
        entries={ledger.entries.filter(isTransaction)}
        studentId={studentId}
        empty="No money has moved on this wallet."
      />
      {ledger.hasMore && (
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Button variant="ghost" disabled={ledger.loading} onClick={ledger.loadMore}>
            {ledger.loading ? 'Loading…' : 'Load older entries'}
          </Button>
        </div>
      )}
    </>
  );
};

const Dialog = ({ title, subtitle, onClose, children }) => {
  useDismissableOverlay(onClose);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal modal--activity"
        style={{ maxWidth: 900 }}
        role="dialog"
        aria-modal="true"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-head">
          <div>
            <h3 className="modal-title">{title}</h3>
            {subtitle && <p className="modal-sub">{subtitle}</p>}
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close dialog">
            <Icon name="close" size={20} />
          </button>
        </header>
        {children}
        <div className="modal-actions" style={{ justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>
  );
};

export const StudentActivityModal = ({ student, onClose }) => {
  const ledger = useStudentLedger(student?._id || student?.id);
  const studentId = student?._id || student?.id;

  return (
    <Dialog
      title={student?.name || 'Student activity'}
      subtitle={[
        student?.admissionNumber ? `Admission ${student.admissionNumber}` : null,
        student?.roomNumber ? `Room ${student.roomNumber}` : null,
        student?.pocketMoney === undefined ? null : `Balance ${formatINR(student.pocketMoney)}`,
      ].filter(Boolean).join(' · ')}
      onClose={onClose}
    >
      <LedgerBody ledger={ledger} studentId={studentId} />
    </Dialog>
  );
};

/* A parent has no wallet of their own — their money lands in their children's.
   So their activity is their children's ledgers, one after another, which is
   also the order the question is usually asked in: "what happened on my
   daughter's account?" rather than "what did I pay in March?". */
const ChildSection = ({ student }) => {
  const ledger = useStudentLedger(student.id);

  return (
    <section style={{ marginTop: 24 }}>
      <h4 className="section-title" style={{ marginBottom: 8 }}>
        {student.name}
        {student.admissionNumber && (
          <span style={{ color: 'var(--muted)', fontWeight: 400 }}> · {student.admissionNumber}</span>
        )}
      </h4>
      <LedgerBody ledger={ledger} studentId={student.id} />
    </section>
  );
};

export const ParentActivityModal = ({ parent, onClose }) => {
  const children = parent?.students || [];

  return (
    <Dialog
      title={parent?.fatherName || 'Parent activity'}
      subtitle={`${parent?.phone || ''}${children.length ? ` · ${children.length} student${children.length === 1 ? '' : 's'}` : ''}`}
      onClose={onClose}
    >
      {children.length === 0
        ? <EmptyState icon="👪" title="No students linked to this account" />
        : children.map((student) => <ChildSection key={student.id} student={student} />)}
    </Dialog>
  );
};
