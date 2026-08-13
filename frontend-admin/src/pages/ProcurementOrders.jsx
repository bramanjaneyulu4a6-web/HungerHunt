import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { Badge, Banner, Button, Card, EmptyState, PageHeader, Skeleton } from '../components/ui';
import { formatINR } from '../utils/format';

const FILTERS = [
  ['ACTIVE', 'Active'],
  ['PENDING_REVIEW', 'Awaiting review'],
  ['APPROVED', 'Approved'],
  ['RECEIVED', 'Received'],
  ['REJECTED', 'Rejected'],
  ['ALL', 'All orders'],
];

const badgeFor = (status) => {
  if (status === 'RECEIVED') return 'success';
  if (['REJECTED', 'CANCELLED'].includes(status)) return 'alert';
  if (status === 'PENDING_REVIEW') return 'warn';
  return 'neutral';
};

const totalOf = (order) =>
  order.items.reduce((sum, item) => sum + item.quantity * item.estimatedUnitCost, 0);

export default function ProcurementOrders() {
  const [orders, setOrders] = useState([]);
  const [filter, setFilter] = useState('ACTIVE');
  const [expanded, setExpanded] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await api.get('/v1/purchase-orders');
      setOrders(response.data.data || []);
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

  const visible = useMemo(() => {
    if (filter === 'ALL') return orders;
    if (filter === 'ACTIVE') {
      return orders.filter((order) => ['PENDING_REVIEW', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status));
    }
    return orders.filter((order) => order.status === filter);
  }, [filter, orders]);

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Purchase Order Ledger"
        subtitle="Track every warehouse request from Accounts review through supplier receipt."
        actions={<Button variant="ghost" onClick={load}>Refresh</Button>}
      />

      <div className="warehouse-filterbar" role="tablist" aria-label="Filter purchase orders">
        {FILTERS.map(([value, label]) => (
          <button key={value} type="button" role="tab" aria-selected={filter === value} className={filter === value ? 'active' : ''} onClick={() => setFilter(value)}>
            {label}<span>{value === 'ACTIVE' ? orders.filter((order) => ['PENDING_REVIEW', 'APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)).length : value === 'ALL' ? orders.length : orders.filter((order) => order.status === value).length}</span>
          </button>
        ))}
      </div>

      {error && <Banner variant="alert" icon="⚠️">The order ledger could not be loaded.</Banner>}
      {loading ? <Skeleton height={240} radius={16} /> : visible.length === 0 ? (
        <EmptyState icon="▤" title="No orders in this view">Choose another status or wait for Warehouse to raise a request.</EmptyState>
      ) : (
        <Card className="warehouse-ledger-card">
          <div className="table-wrap">
            <table className="table table--stack table--hover">
              <thead><tr><th>Order</th><th>Supplier</th><th>Submitted</th><th>Lines</th><th>Estimated value</th><th>Status</th><th><span className="sr-only">Actions</span></th></tr></thead>
              <tbody>
                {visible.map((order) => (
                  <Fragment key={order.id}>
                    <tr>
                      <td data-label="Order"><strong>PO-{order.id.slice(-6).toUpperCase()}</strong></td>
                      <td data-label="Supplier">{order.supplierName || 'Not selected'}</td>
                      <td data-label="Submitted">{new Date(order.submittedAt).toLocaleDateString()}</td>
                      <td data-label="Lines">{order.items.length}</td>
                      <td data-label="Estimated value"><strong>{formatINR(totalOf(order))}</strong></td>
                      <td data-label="Status"><Badge variant={badgeFor(order.status)}>{order.status.replaceAll('_', ' ')}</Badge></td>
                      <td data-label="Actions"><Button variant="ghost" className="btn--sm" aria-expanded={expanded === order.id} onClick={() => setExpanded(expanded === order.id ? null : order.id)}>{expanded === order.id ? 'Hide' : 'Details'}</Button></td>
                    </tr>
                    {expanded === order.id && (
                      <tr className="warehouse-ledger-detail">
                        <td colSpan="7">
                          <div className="warehouse-ledger-detail__grid">
                            <div><small>Requested items</small>{order.items.map((item) => <p key={item.productId}><strong>{item.productName || item.productId}</strong><span>{item.quantity} ordered · {item.receivedQuantity} received · {formatINR(item.estimatedUnitCost)} each</span></p>)}</div>
                            <div><small>Review record</small><p><strong>{order.reviewedAt ? `Reviewed ${new Date(order.reviewedAt).toLocaleString()}` : 'Not reviewed yet'}</strong><span>{order.reviewReason || 'No review note'}</span></p>{order.reason && <p><strong>Warehouse reason</strong><span>{order.reason}</span></p>}</div>
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
      )}
    </div>
  );
}
