import { useCallback, useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { formatINR } from '../utils/format';

const totalOf = (order) =>
  order.items.reduce(
    (sum, item) => sum + item.quantity * item.estimatedUnitCost,
    0
  );

export default function ProcurementReview() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [workingId, setWorkingId] = useState(null);
  const [rejection, setRejection] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get('/v1/purchase-orders?status=PENDING_REVIEW');
      setOrders(response.data.data);
    } catch (err) {
      console.error(err);
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  const decide = async (order, decision, reason = '') => {
    setWorkingId(order.id);
    try {
      await api.post(`/v1/purchase-orders/${order.id}/decision`, { decision, reason });
      setOrders((current) => current.filter((item) => item.id !== order.id));
      setRejection(null);
      toast.success(decision === 'APPROVED' ? 'Purchase order approved' : 'Purchase order rejected');
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || 'Decision could not be saved');
      if (err.response?.status === 409) load();
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Accounts Review Queue"
        subtitle="Verify supplier, quantities, and estimated spend before releasing an order to Warehouse."
        actions={
          <div className="warehouse-page-actions">
            <Badge variant={orders.length ? "warn" : "success"}>{orders.length} awaiting decision</Badge>
            <Button variant="ghost" onClick={load}>Refresh</Button>
          </div>
        }
      />

      <div className="warehouse-review-note">
        <span aria-hidden="true">i</span>
        <p><strong>Approval releases the order for receiving.</strong> Rejection closes this request and requires Warehouse to raise a new one if stock is still needed.</p>
      </div>

      {error && <Banner variant="alert" icon="⚠️">Could not load review requests.</Banner>}
      {loading ? (
        <><Skeleton height={150} radius={16} /><Skeleton height={150} radius={16} style={{ marginTop: 14 }} /></>
      ) : orders.length === 0 && !error ? (
        <EmptyState icon="✓" title="You're all caught up" variant="success">
          No warehouse requests are waiting for review. New requests will appear here automatically.
        </EmptyState>
      ) : (
        orders.map((order) => (
          <Card key={order.id} className="warehouse-review-card">
            <div className="warehouse-review-card__head">
              <div>
                <p className="warehouse-eyebrow">PO-{order.id.slice(-6).toUpperCase()}</p>
                <h3>{order.supplierName || 'Supplier not selected'}</h3>
                <p>Submitted {new Date(order.submittedAt).toLocaleString()}</p>
              </div>
              <Badge variant="warn">Pending review</Badge>
            </div>

            <div className="table-wrap warehouse-review-table">
              <table className="table table--stack">
                <thead><tr><th>Product</th><th>Quantity</th><th>Estimated unit cost</th><th>Line total</th></tr></thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.productId}>
                      <td data-label="Product"><strong>{item.productName || item.productId}</strong></td>
                      <td data-label="Quantity">{item.quantity}</td>
                      <td data-label="Estimated unit cost">{formatINR(item.estimatedUnitCost)}</td>
                      <td data-label="Line total"><strong>{formatINR(item.estimatedUnitCost * item.quantity)}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="warehouse-review-summary">
              <div><small>Warehouse reason</small><p>{order.reason || 'Routine stock replenishment'}</p></div>
              <div><small>Estimated order value</small><strong>{formatINR(totalOf(order))}</strong></div>
            </div>

            {rejection?.id === order.id ? (
              <div className="warehouse-rejection-panel">
                <label className="field-label" htmlFor={`reject-${order.id}`}>Rejection reason</label>
                <textarea
                  id={`reject-${order.id}`}
                  className="input"
                  maxLength={500}
                  value={rejection.reason}
                  onChange={(event) => setRejection({ ...rejection, reason: event.target.value })}
                />
                <div className="warehouse-decision-actions">
                  <Button
                    variant="alert"
                    disabled={!rejection.reason.trim() || workingId === order.id}
                    onClick={() => decide(order, 'REJECTED', rejection.reason.trim())}
                  >Confirm rejection</Button>
                  <Button variant="ghost" onClick={() => setRejection(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="warehouse-decision-actions">
                <Button
                  variant="success"
                  disabled={workingId === order.id}
                  onClick={() => decide(order, 'APPROVED')}
                >Approve and release</Button>
                <Button
                  variant="alert"
                  disabled={workingId === order.id}
                  onClick={() => setRejection({ id: order.id, reason: '' })}
                >Reject</Button>
              </div>
            )}
          </Card>
        ))
      )}
    </div>
  );
}
