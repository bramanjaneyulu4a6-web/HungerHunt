import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import Icon from '../components/Icon';
import { formatINR } from '../utils/format';
import {
  availableFulfillmentStatuses,
  fulfillmentActionLabel,
  fulfillmentStatusDisplay,
  fulfillmentStatusLabel,
} from '../utils/fulfillmentStatus';

const CANCELLABLE = new Set(['PENDING', 'PACKED']);
const HISTORY_PAGE_SIZE = 50;

const badgeFor = (status) => {
  if (status === 'PENDING') return 'warn';
  if (['OUT_FOR_DELIVERY', 'DELIVERED', 'COLLECTED'].includes(status)) return 'success';
  return 'neutral';
};

const orderNumber = (order) => `FO-${order.id.slice(-6).toUpperCase()}`;

const itemCount = (order) =>
  order.items.reduce((total, item) => total + Number(item.quantity || 0), 0);

const cancellationKey = (orderId) => {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-cancel-${orderId}-${nonce}`;
};

const OrdersLedger = ({
  orders,
  expanded,
  onExpand,
  onCancel,
  onStatusChange,
  statusMenu,
  onStatusMenu,
  history = false,
}) => (
  <Card className="warehouse-ledger-card fulfillment-ledger">
    <div className="fulfillment-ledger__summary">
      <div><strong>{orders.length}</strong><span>{history ? 'orders on this page' : 'active orders'}</span></div>
      <p>{history
        ? 'Completed and cancelled packages are listed newest first.'
        : 'Update paid orders as they move from confirmed through delivery. Confirmed and packed orders can be cancelled.'}</p>
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
          {orders.map((order) => {
            const availableStatuses = availableFulfillmentStatuses(order);
            return (
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
                  {!history && availableStatuses.length > 0 ? (
                    <div className="fulfillment-status-picker">
                      <button
                        type="button"
                        className="fulfillment-status-trigger"
                        aria-haspopup="menu"
                        aria-expanded={statusMenu === order.id}
                        aria-label={`Change status for ${orderNumber(order)}. Current status: ${fulfillmentStatusLabel(order.status)}`}
                        onClick={() => onStatusMenu(statusMenu === order.id ? null : order.id)}
                      >
                        <Badge variant={badgeFor(order.status)}>{fulfillmentStatusDisplay(order)}</Badge>
                        <Icon name="caret" size={14} />
                      </button>
                      {statusMenu === order.id && (
                        <div className="fulfillment-status-menu" role="menu">
                          {availableStatuses.map((status) => (
                            <button
                              type="button"
                              role="menuitem"
                              key={status}
                              onClick={() => onStatusChange(order, status)}
                            >
                              Mark as {fulfillmentActionLabel(status)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ) : (
                    <Badge variant={badgeFor(order.status)}>{fulfillmentStatusDisplay(order)}</Badge>
                  )}
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
                    {!history && (CANCELLABLE.has(order.status) ? (
                      <Button variant="danger" className="btn--sm" onClick={() => onCancel(order)}>
                        Cancel
                      </Button>
                    ) : (
                      <span className="fulfillment-locked">Already dispatched</span>
                    ))}
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
                    </div>
                  </td>
                </tr>
              )}
              </Fragment>
            );
          })}
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
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const [statusMenu, setStatusMenu] = useState(null);
  const [statusChange, setStatusChange] = useState(null);
  const [statusError, setStatusError] = useState('');
  const [receivedBy, setReceivedBy] = useState('');
  const [receiverPhone, setReceiverPhone] = useState('');
  const cancellationKeyRef = useRef('');

  const loadActive = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const response = await api.get('/v1/fulfillment-orders');
      setOrders(response.data.data || []);
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

  const openCancellation = (order) => {
    setStatusMenu(null);
    cancellationKeyRef.current = cancellationKey(order.id);
    setCancelling(order);
    setReason('');
    setCancelError('');
  };

  const openStatusChange = (order, status) => {
    setStatusMenu(null);
    setStatusChange({ order, status });
    setStatusError('');
    setReceivedBy('');
    setReceiverPhone('');
  };

  const closeStatusChange = () => {
    if (saving) return;
    setStatusChange(null);
    setStatusError('');
  };

  const changeStatus = async (event) => {
    event.preventDefault();
    if (!statusChange) return;

    const { order, status } = statusChange;
    const body = { status };
    if (status === 'DELIVERED') {
      body.receivedBy = receivedBy.trim();
      body.receiverPhone = receiverPhone.trim();
    }

    setSaving(true);
    setStatusError('');
    try {
      const response = await api.post(`/v1/fulfillment-orders/${order.id}/transition`, body);
      const updated = response.data.data;
      setOrders((current) => status === 'DELIVERED'
        ? current.filter((item) => item.id !== order.id)
        : current.map((item) => item.id === order.id ? updated : item));
      setExpanded((current) => status === 'DELIVERED' && current === order.id ? null : current);
      toast.success(`${orderNumber(order)} is now ${fulfillmentActionLabel(status).toLowerCase()}.`);
      setStatusChange(null);
    } catch (error) {
      console.error(error);
      setStatusError(
        error.response?.data?.message ||
        error.response?.data?.error?.message ||
        'The status could not be changed. It may have already been updated.'
      );
    } finally {
      setSaving(false);
    }
  };

  const closeCancellation = () => {
    if (saving) return;
    cancellationKeyRef.current = '';
    setCancelling(null);
    setReason('');
    setCancelError('');
  };

  const cancelOrder = async (event) => {
    event.preventDefault();
    const note = reason.trim();
    if (!note || !cancelling) return;

    setSaving(true);
    setCancelError('');
    try {
      const response = await api.post(
        `/v1/fulfillment-orders/${cancelling.id}/transition`,
        { status: 'CANCELLED', reason: note },
        { headers: { 'Idempotency-Key': cancellationKeyRef.current } }
      );
      const refund = response.data.data?.reversal?.amount;
      setOrders((current) => current.filter((order) => order.id !== cancelling.id));
      setExpanded((current) => current === cancelling.id ? null : current);
      toast.success(
        refund == null
          ? `${orderNumber(cancelling)} cancelled.`
          : `${orderNumber(cancelling)} cancelled and ${formatINR(refund)} refunded.`
      );
      cancellationKeyRef.current = '';
      setCancelling(null);
      setReason('');
    } catch (error) {
      console.error(error);
      setCancelError(
        error.response?.data?.message ||
        error.response?.data?.error?.message ||
        'This order could not be cancelled. It may have moved to another status.'
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Student Orders"
        subtitle="Review active warehouse packages and the complete history of handed-over, delivered, and cancelled orders."
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
            ? 'Every warehouse package has been handed over, delivered, or cancelled.'
            : 'Handed-over, delivered, and cancelled orders will appear here.'}
        </EmptyState>
      ) : (view === 'active' ? orders : historyOrders).length > 0 ? (
        <>
          <OrdersLedger
            orders={view === 'active' ? orders : historyOrders}
            expanded={expanded}
            onExpand={setExpanded}
            onCancel={openCancellation}
            onStatusChange={openStatusChange}
            statusMenu={statusMenu}
            onStatusMenu={setStatusMenu}
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

      {cancelling && (
        <div className="modal-backdrop" onClick={closeCancellation}>
          <form
            className="modal fulfillment-cancel-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="cancel-order-title"
            onSubmit={cancelOrder}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="modal-title" id="cancel-order-title">Cancel {orderNumber(cancelling)}?</h2>
            <p className="fulfillment-cancel-copy">
              This will refund {formatINR(cancelling.totalAmount)} to {cancelling.student?.name || 'the student'} and return every item to warehouse stock.
            </p>
            {cancelError && <Banner variant="alert" icon="⚠️">{cancelError}</Banner>}
            <label className="fulfillment-cancel-label" htmlFor="fulfillment-cancel-reason">
              Cancellation reason
            </label>
            <textarea
              id="fulfillment-cancel-reason"
              className="input"
              rows="4"
              maxLength="200"
              autoFocus
              value={reason}
              placeholder="Explain why this package should be cancelled."
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="fulfillment-cancel-count">{reason.length}/200</div>
            <div className="modal-actions fulfillment-cancel-actions">
              <Button variant="ghost" disabled={saving} onClick={closeCancellation}>Keep order</Button>
              <Button type="submit" variant="danger" disabled={saving || !reason.trim()}>
                {saving ? 'Cancelling…' : 'Cancel and refund'}
              </Button>
            </div>
          </form>
        </div>
      )}

      {statusChange && (
        <div className="modal-backdrop" onClick={closeStatusChange}>
          <form
            className="modal fulfillment-status-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="change-order-status-title"
            onSubmit={changeStatus}
            onClick={(event) => event.stopPropagation()}
          >
            <h2 className="modal-title" id="change-order-status-title">
              {statusChange.status === 'DELIVERED'
                ? 'Record the handover to the room?'
                : `Change status to ${fulfillmentStatusLabel(statusChange.status)}?`}
            </h2>
            <p className="fulfillment-cancel-copy">
              {statusChange.status === 'DELIVERED'
                ? `${orderNumber(statusChange.order)} stays out for delivery until its student collects it with their code; this records who is holding it at the room.`
                : `${orderNumber(statusChange.order)} will move from ${fulfillmentStatusLabel(statusChange.order.status).toLowerCase()} to ${fulfillmentStatusLabel(statusChange.status).toLowerCase()}.`}
            </p>
            {statusChange.status === 'DELIVERED' && (
              <div className="fulfillment-delivery-fields">
                <label htmlFor="fulfillment-received-by">
                  <span className="field-label">Received by</span>
                  <input
                    id="fulfillment-received-by"
                    className="input"
                    maxLength="60"
                    autoFocus
                    required
                    value={receivedBy}
                    placeholder="Name or room role"
                    onChange={(event) => setReceivedBy(event.target.value)}
                  />
                </label>
                <label htmlFor="fulfillment-receiver-phone">
                  <span className="field-label">Receiver phone</span>
                  <input
                    id="fulfillment-receiver-phone"
                    className="input"
                    inputMode="tel"
                    required
                    value={receiverPhone}
                    placeholder="10-digit phone number"
                    onChange={(event) => setReceiverPhone(event.target.value)}
                  />
                </label>
              </div>
            )}
            {statusError && <Banner variant="alert" icon="⚠️">{statusError}</Banner>}
            <div className="modal-actions fulfillment-cancel-actions">
              <Button variant="ghost" disabled={saving} onClick={closeStatusChange}>Keep current status</Button>
              <Button
                type="submit"
                disabled={saving || (statusChange.status === 'DELIVERED' && (!receivedBy.trim() || !receiverPhone.trim()))}
              >
                {saving ? 'Updating…' : 'Confirm status change'}
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
