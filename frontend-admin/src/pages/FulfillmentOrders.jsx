import { Fragment, useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../utils/api';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { formatINR } from '../utils/format';

const CANCELLABLE = new Set(['PENDING', 'PACKED']);

const badgeFor = (status) => {
  if (status === 'PENDING') return 'warn';
  if (status === 'OUT_FOR_DELIVERY') return 'success';
  return 'neutral';
};

const orderNumber = (order) => `FO-${order.id.slice(-6).toUpperCase()}`;

const itemCount = (order) =>
  order.items.reduce((total, item) => total + Number(item.quantity || 0), 0);

const cancellationKey = (orderId) => {
  const nonce = globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `admin-cancel-${orderId}-${nonce}`;
};

export default function FulfillmentOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [expanded, setExpanded] = useState(null);
  const [cancelling, setCancelling] = useState(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [cancelError, setCancelError] = useState('');
  const cancellationKeyRef = useRef('');

  const load = useCallback(async () => {
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

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const openCancellation = (order) => {
    cancellationKeyRef.current = cancellationKey(order.id);
    setCancelling(order);
    setReason('');
    setCancelError('');
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
        title="Active Student Orders"
        subtitle="Review every individual package still being handled by Warehouse and cancel eligible orders before dispatch."
      />

      {loadError && (
        <Banner variant="alert" icon="⚠️">
          Active student orders could not be loaded. No orders have been changed.
        </Banner>
      )}

      {loading ? (
        <Skeleton height={280} radius={16} />
      ) : orders.length === 0 && !loadError ? (
        <EmptyState icon="✓" title="No active student orders" variant="success">
          Every warehouse package has been delivered, collected, or cancelled.
        </EmptyState>
      ) : orders.length > 0 ? (
        <Card className="warehouse-ledger-card fulfillment-ledger">
          <div className="fulfillment-ledger__summary">
            <div><strong>{orders.length}</strong><span>active orders</span></div>
            <p>Only pending and packed orders can be cancelled. Dispatched packages must complete delivery.</p>
          </div>
          <div className="table-wrap">
            <table className="table table--stack table--hover">
              <thead>
                <tr>
                  <th>Order</th><th>Student</th><th>Hostel</th><th>Items</th>
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
                      <td data-label="Hostel">{order.student?.hostelNumber || '—'}</td>
                      <td data-label="Items">{itemCount(order)}</td>
                      <td data-label="Placed">{new Date(order.orderedAt).toLocaleString()}</td>
                      <td data-label="Total"><strong>{formatINR(order.totalAmount)}</strong></td>
                      <td data-label="Status">
                        <Badge variant={badgeFor(order.status)}>{order.status.replaceAll('_', ' ')}</Badge>
                      </td>
                      <td data-label="Actions">
                        <div className="fulfillment-actions">
                          <Button
                            variant="ghost"
                            className="btn--sm"
                            aria-expanded={expanded === order.id}
                            onClick={() => setExpanded(expanded === order.id ? null : order.id)}
                          >
                            {expanded === order.id ? 'Hide' : 'Details'}
                          </Button>
                          {CANCELLABLE.has(order.status) ? (
                            <Button variant="danger" className="btn--sm" onClick={() => openCancellation(order)}>
                              Cancel
                            </Button>
                          ) : (
                            <span className="fulfillment-locked">Already dispatched</span>
                          )}
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
                              <small>Delivery window</small>
                              <p><strong>Due {new Date(order.deliverBy).toLocaleString()}</strong></p>
                              <p><span>Order ID</span><strong>{order.id}</strong></p>
                            </div>
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
    </div>
  );
}
