import { Fragment, useCallback, useEffect, useState } from 'react';

import api from '../utils/api';
import { Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import FulfillmentStatusPicker from '../components/FulfillmentStatusPicker';
import ParentApprovalPicker from '../components/ParentApprovalPicker';
import { formatINR } from '../utils/format';
import { requestNumber } from '../utils/fulfillmentStatus';

const HISTORY_PAGE_SIZE = 50;

// The active board lists open packages only; a handover, a collection or a
// cancellation moves the order to history, so it leaves this list at once.
const LEAVES_ACTIVE = new Set(['DELIVERED', 'COLLECTED', 'CANCELLED']);

// An order still waiting on its parent has no package yet, so it carries its
// request number rather than a package number.
const orderNumber = (order) =>
  order.awaitingParent ? requestNumber(order) : `FO-${order.id.slice(-6).toUpperCase()}`;

/* Everything placed and not finished: orders the parent has yet to answer
   first — they are the step before a package exists — then the packages. */
const asAwaitingRow = (order) => ({
  id: String(order._id),
  awaitingParent: true,
  student: order.studentId
    ? {
        name: order.studentId.name,
        admissionNumber: order.studentId.admissionNumber,
        roomNumber: order.studentId.roomNumber,
      }
    : null,
  items: order.items || [],
  orderedAt: order.createdAt,
  expiresAt: order.expiresAt,
  totalAmount: order.totalAmount,
});

const itemCount = (order) =>
  order.items.reduce((total, item) => total + Number(item.quantity || 0), 0);

const OrdersLedger = ({ orders, expanded, onExpand, onChanged, onAnswered, history = false }) => (
  <Card className="warehouse-ledger-card fulfillment-ledger">
    <div className="fulfillment-ledger__summary">
      <div><strong>{orders.length}</strong><span>{history ? 'orders on this page' : 'active orders'}</span></div>
      <p>{history
        ? 'Completed and cancelled packages are listed newest first. A status can still be corrected from its badge.'
        : 'Every order placed and not yet finished, from those sent to the parent through delivery. Paid orders can be moved from their badge; confirmed and packed orders can be cancelled. A super admin can approve or decline an order sent to the parent from its badge.'}</p>
    </div>
    <div className="table-wrap">
      <table className="table table--stack table--hover">
        <thead>
          <tr>
            <th>Order</th><th>Student</th><th>Room</th><th>Items</th>
            <th>Placed</th><th>Total</th><th>Status</th>
            <th><span className="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          {orders.map((order) => (
            <Fragment key={order.id}>
            <tr>
              <td data-label="Order"><strong>{orderNumber(order)}</strong></td>
              <td data-label="Student">
                <span className="fulfillment-student">
                  <strong>{order.student?.name || 'Unknown student'}</strong>
                  <small>{order.student?.admissionNumber || 'No admission number'}</small>
                </span>
              </td>
              <td data-label="Room">{order.student?.roomNumber || '—'}</td>
              <td data-label="Items">{itemCount(order)}</td>
              <td data-label="Placed">{new Date(order.orderedAt).toLocaleString()}</td>
              <td data-label="Total"><strong>{formatINR(order.totalAmount)}</strong></td>
              <td data-label="Status">
                {order.awaitingParent
                  ? <ParentApprovalPicker order={order} onAnswered={(answer) => onAnswered(order, answer)} />
                  : <FulfillmentStatusPicker order={order} onChanged={(updated, status) => onChanged(order, updated, status)} />}
              </td>
              <td data-label="Actions">
                <div className="fulfillment-actions">
                  <Button
                    variant="ghost"
                    className="btn--sm"
                    aria-expanded={expanded === order.id}
                    onClick={() => onExpand(expanded === order.id ? null : order.id)}
                  >
                    {expanded === order.id ? 'Hide' : 'Details'}
                  </Button>
                </div>
              </td>
            </tr>
            {expanded === order.id && (
              <tr className="warehouse-ledger-detail">
                <td colSpan="8">
                  <div className="fulfillment-order-detail">
                    <div>
                      <small>Ordered items</small>
                      {order.items.map((item, index) => (
                        <p key={`${item.productId}-${index}`}>
                          <strong>{item.name || 'Unnamed product'}</strong>
                          <span>{item.quantity} × {formatINR(item.price)}</span>
                        </p>
                      ))}
                    </div>
                    {order.awaitingParent ? (
                    <div>
                      <small>Waiting on the parent</small>
                      <p><strong>Open until {new Date(order.expiresAt).toLocaleString()}</strong></p>
                      <p><span>Request ID</span><strong>{order.id}</strong></p>
                      <p><span>Charged</span><strong>Nothing yet</strong></p>
                    </div>
                    ) : (
                    <div>
                      <small>{history ? 'Order record' : 'Delivery window'}</small>
                      <p><strong>Due {new Date(order.deliverBy).toLocaleString()}</strong></p>
                      <p><span>Order ID</span><strong>{order.id}</strong></p>
                      {history && order.transitions?.at(-1) && (
                        <p>
                          <span>Last updated</span>
                          <strong>{new Date(order.transitions.at(-1).at).toLocaleString()}</strong>
                        </p>
                      )}
                    </div>
                    )}
                  </div>
                </td>
              </tr>
            )}
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  </Card>
);

export default function FulfillmentOrders() {
  const [view, setView] = useState('active');
  const [orders, setOrders] = useState([]);
  const [historyOrders, setHistoryOrders] = useState([]);
  const [historyPage, setHistoryPage] = useState(1);
  const [historyPages, setHistoryPages] = useState(1);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const loadActive = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const [packages, awaiting] = await Promise.all([
        api.get('/v1/fulfillment-orders'),
        api.get('/pending-orders/admin'),
      ]);
      setOrders([
        ...(awaiting.data.orders || []).map(asAwaitingRow),
        ...(packages.data.data || []),
      ]);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page = 1) => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get('/v1/fulfillment-orders/history', {
        params: { scope: 'all', page, limit: HISTORY_PAGE_SIZE },
      });
      setHistoryOrders(response.data.data || []);
      setHistoryPage(response.data.meta?.page || page);
      setHistoryPages(response.data.meta?.pages || 1);
      setHistoryTotal(response.data.meta?.total || 0);
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(
      () => view === 'active' ? loadActive() : loadHistory(historyPage),
      0
    );
    return () => clearTimeout(initial);
  }, [historyPage, loadActive, loadHistory, view]);

  /* The active board patches its own row and drops one that has left the
     open statuses; the history page re-reads, since a correction there can
     send an order back onto the active board. */
  const onActiveChanged = (order, updated, status) => {
    setOrders((current) => LEAVES_ACTIVE.has(status)
      ? current.filter((item) => item.id !== order.id)
      : current.map((item) => (item.id === order.id && updated ? updated : item)));
    setExpanded((current) => (LEAVES_ACTIVE.has(status) && current === order.id ? null : current));
  };

  /* An approval turns the request into a paid package, which the board reads
     back from the server; a decline just leaves. */
  const onAwaitingAnswered = (order, answer) => {
    setExpanded((current) => (current === order.id ? null : current));
    if (answer === 'APPROVED') {
      loadActive();
      return;
    }
    setOrders((current) => current.filter((item) => item.id !== order.id));
  };

  const onHistoryChanged = () => loadHistory(historyPage);

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Student Orders"
        subtitle="Review every active order, from those sent to the parent through delivery, and the complete history of delivered and cancelled orders."
      />

      <div className="tabs users-tabs" role="tablist" aria-label="Student order views">
        <button type="button" role="tab" aria-selected={view === 'active'} className={`tab${view === 'active' ? ' tab--active' : ''}`} onClick={() => { setView('active'); setExpanded(null); }}>
          Active Orders
        </button>
        <button type="button" role="tab" aria-selected={view === 'history'} className={`tab${view === 'history' ? ' tab--active' : ''}`} onClick={() => { setView('history'); setExpanded(null); }}>
          Order History
        </button>
      </div>

      {loadError && (
        <Banner variant="alert" icon="⚠️">
          {view === 'active' ? 'Active student orders' : 'Order history'} could not be loaded. No orders have been changed.
        </Banner>
      )}

      {loading ? (
        <Skeleton height={280} radius={16} />
      ) : (view === 'active' ? orders : historyOrders).length === 0 && !loadError ? (
        <EmptyState icon="✓" title={view === 'active' ? 'No active student orders' : 'No order history yet'} variant="success">
          {view === 'active'
            ? 'Nothing is waiting on a parent, and every warehouse package has been delivered or cancelled.'
            : 'Handed-over, delivered, and cancelled orders will appear here.'}
        </EmptyState>
      ) : (view === 'active' ? orders : historyOrders).length > 0 ? (
        <>
          <OrdersLedger
            orders={view === 'active' ? orders : historyOrders}
            expanded={expanded}
            onExpand={setExpanded}
            onChanged={view === 'active' ? onActiveChanged : onHistoryChanged}
            onAnswered={onAwaitingAnswered}
            history={view === 'history'}
          />
          {view === 'history' && historyPages > 1 && (
            <nav className="table-pagination" aria-label="Order history pages">
              <Button variant="ghost" className="btn--sm" disabled={historyPage <= 1} onClick={() => setHistoryPage((page) => page - 1)}>Previous</Button>
              <span>Page {historyPage} of {historyPages} · {historyTotal} orders</span>
              <Button variant="ghost" className="btn--sm" disabled={historyPage >= historyPages} onClick={() => setHistoryPage((page) => page + 1)}>Next</Button>
            </nav>
          )}
        </>
      ) : null}
    </div>
  );
}
