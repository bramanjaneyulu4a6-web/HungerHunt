import { useCallback, useEffect, useMemo, useState } from 'react';
import api from '../utils/api';
import { Badge, Banner, Button, Card, PageHeader, Skeleton } from '../components/ui';
import { resolveAvailability } from '../utils/availability';

const FLOW = [
  { number: '01', title: 'Warehouse requests stock', copy: 'The warehouse team raises a replenishment request from its own app.' },
  { number: '02', title: 'Accounts reviews', copy: 'Admin approves the spend or rejects it with a reason.' },
  { number: '03', title: 'Warehouse receives', copy: 'Approved orders can be received partially or in full against deliveries.' },
  { number: '04', title: 'Inventory reconciles', copy: 'Receipts update stock and remain attached to the order ledger.' },
];

export default function WarehouseOverview() {
  const [orders, setOrders] = useState([]);
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [ordersResponse, inventoryResponse] = await Promise.all([
        api.get('/v1/purchase-orders'),
        api.get('/inventory'),
      ]);
      setOrders(ordersResponse.data.data || []);
      setInventory(Array.isArray(inventoryResponse.data) ? inventoryResponse.data : []);
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

  const metrics = useMemo(() => {
    const availabilities = inventory.map(resolveAvailability);
    return {
      review: orders.filter((order) => order.status === 'PENDING_REVIEW').length,
      inbound: orders.filter((order) => ['APPROVED', 'PARTIALLY_RECEIVED'].includes(order.status)).length,
      outOfStock: availabilities.filter((a) => a === 'OUT_OF_STOCK').length,
      lowStock: availabilities.filter((a) => a === 'LOW').length,
      received: orders.filter((order) => order.status === 'RECEIVED').length,
    };
  }, [inventory, orders]);

  const recent = orders.slice(0, 5);

  return (
    <div className="page warehouse-page">
      <PageHeader
        title="Warehouse Control Centre"
        subtitle="A single view of procurement approvals, inbound orders, stock health, and supplier operations."
        actions={<Button variant="ghost" onClick={load} disabled={loading}>Refresh data</Button>}
      />

      {error && <Banner variant="alert" icon="⚠️">Warehouse data could not be loaded. Existing records have not been changed.</Banner>}

      {loading ? (
        <div className="warehouse-metrics">
          {[1, 2, 3, 4, 5].map((item) => <Skeleton key={item} height={124} radius={16} />)}
        </div>
      ) : (
        <div className="warehouse-metrics">
          <Card className="warehouse-metric warehouse-metric--attention">
            <span className="warehouse-metric__icon" aria-hidden="true">✓</span>
            <div><span>Awaiting review</span><strong>{metrics.review}</strong><small>Accounts decisions needed</small></div>
          </Card>
          <Card className="warehouse-metric">
            <span className="warehouse-metric__icon" aria-hidden="true">⇢</span>
            <div><span>Inbound orders</span><strong>{metrics.inbound}</strong><small>Approved or partly received</small></div>
          </Card>
          <Card className="warehouse-metric warehouse-metric--attention">
            <span className="warehouse-metric__icon" aria-hidden="true">⛔</span>
            <div>
              <span>Out of stock</span>
              <strong>{metrics.outOfStock}</strong>
              <small>Off sale until replenished</small>
              <Button to="/warehouse/inventory?filter=out" variant="ghost" className="btn--sm">View items</Button>
            </div>
          </Card>
          <Card className="warehouse-metric warehouse-metric--warning">
            <span className="warehouse-metric__icon" aria-hidden="true">!</span>
            <div>
              <span>Low-stock items</span>
              <strong>{metrics.lowStock}</strong>
              <small>Below configured threshold</small>
              <Button to="/warehouse/inventory?filter=low" variant="ghost" className="btn--sm">View items</Button>
            </div>
          </Card>
          <Card className="warehouse-metric">
            <span className="warehouse-metric__icon" aria-hidden="true">▤</span>
            <div><span>Orders received</span><strong>{metrics.received}</strong><small>Completed v1 orders</small></div>
          </Card>
        </div>
      )}

      <section className="warehouse-section">
        <div className="warehouse-section__head">
          <div><p className="warehouse-eyebrow">Operating model</p><h2>How replenishment moves</h2></div>
          <Badge variant="success">Approval controlled</Badge>
        </div>
        <div className="warehouse-flow">
          {FLOW.map((step, index) => (
            <div className="warehouse-flow__step" key={step.number}>
              <span>{step.number}</span>
              <div><strong>{step.title}</strong><p>{step.copy}</p></div>
              {index < FLOW.length - 1 && <i aria-hidden="true">→</i>}
            </div>
          ))}
        </div>
      </section>

      <div className="warehouse-overview-grid">
        <section className="warehouse-section">
          <div className="warehouse-section__head">
            <div><p className="warehouse-eyebrow">Latest activity</p><h2>Purchase orders</h2></div>
            <Button to="/warehouse/orders" variant="ghost" className="btn--sm">View ledger</Button>
          </div>
          {recent.length ? (
            <div className="warehouse-order-list">
              {recent.map((order) => (
                <div className="warehouse-order-row" key={order.id}>
                  <div><strong>PO-{order.id.slice(-6).toUpperCase()}</strong><span>{order.supplierName || 'Supplier not selected'}</span></div>
                  <Badge variant={order.status === 'REJECTED' ? 'alert' : order.status === 'RECEIVED' ? 'success' : order.status === 'PENDING_REVIEW' ? 'warn' : 'neutral'}>
                    {order.status.replaceAll('_', ' ')}
                  </Badge>
                </div>
              ))}
            </div>
          ) : <p className="warehouse-muted">No purchase orders have been raised yet.</p>}
        </section>

        <section className="warehouse-section">
          <div className="warehouse-section__head"><div><p className="warehouse-eyebrow">Quick access</p><h2>Manage warehouse data</h2></div></div>
          <div className="warehouse-quicklinks">
            <Button to="/warehouse/review" variant="primary">Review requests {metrics.review > 0 && `(${metrics.review})`}</Button>
            <Button to="/warehouse/inventory" variant="ghost">Check inventory</Button>
            <Button to="/warehouse/products" variant="ghost">Manage catalogue</Button>
            <Button to="/warehouse/suppliers" variant="ghost">Manage suppliers</Button>
          </div>
        </section>
      </div>
    </div>
  );
}
