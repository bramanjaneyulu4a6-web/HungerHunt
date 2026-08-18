import { useEffect, useState } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { AnimateIn, Banner, EmptyState, PageHeader, Skeleton, Card } from '../components/ui';
import PendingApprovalCard from '../components/PendingApprovalCard';
import OrderCard from '../components/OrderCard';
import { ErrorFeedback } from '../components/error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';

const DashboardSkeleton = () => (
  <>
    {[0, 1].map((item) => (
      <Card key={item} className="pending-card" style={{ marginBottom: 18 }}>
        <Skeleton width="42%" height={22} />
        <Skeleton width="65%" height={14} style={{ marginTop: 10 }} />
        <Skeleton height={54} style={{ marginTop: 24 }} />
      </Card>
    ))}
  </>
);

export default function Dashboard() {
  const [pendingOrders, setPendingOrders] = useState([]);
  const [ongoingOrders, setOngoingOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);

  const reload = (message = '') => {
    if (message) setNotice(message);
    setError('');
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const [pendingResponse, dashboardResponse] = await Promise.all([
          API.get('/pending-orders/parent'),
          API.get('/parent/dashboard'),
        ]);
        if (ignore) return;
        setPendingOrders(pendingResponse.data.orders || []);
        setOngoingOrders(dashboardResponse.data.ongoingOrders || []);
        setError('');
      } catch (err) {
        if (ignore) return;
        setError(
          err.response?.data?.message ||
            "Couldn't load your dashboard. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);
    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [attempt]);

  return (
    <div className="page dashboard-page">
      <PageHeader
        title="Dashboard"
        subtitle="Track ongoing orders and review purchases waiting for your approval."
      />

      {notice && <Banner variant="success" icon="✅" style={{ marginBottom: 20 }}>{notice}</Banner>}
      {error && (
        <ErrorFeedback className="page-error-state" issue={presentError({ request: true, message: error })} action={{ label: 'Try again', onClick: () => reload() }} />
      )}
      {loading && <DashboardSkeleton />}
      {!loading && !error && ongoingOrders.length > 0 && (
        <section className="dashboard-section" aria-labelledby="ongoing-orders-title">
          <div className="section-heading-row">
            <div>
              <p className="section-eyebrow">Live updates</p>
              <h2 className="section-title" id="ongoing-orders-title">Ongoing orders</h2>
              <p className="section-copy">Follow each order until it reaches the dorm.</p>
            </div>
          </div>

          <div className="dashboard-orders-grid">
            {ongoingOrders.map((order, index) => (
              <AnimateIn key={order.id} index={index}>
                <OrderCard order={order} index={index} showStudent />
              </AnimateIn>
            ))}
          </div>
        </section>
      )}

      {!loading && !error && pendingOrders.length > 0 && (
        <section className="dashboard-section" aria-labelledby="pending-approvals-title">
          <div className="section-heading-row">
            <div>
              <p className="section-eyebrow">Action needed</p>
              <h2 className="section-title" id="pending-approvals-title">Pending approvals</h2>
              <p className="section-copy">Review these purchases before they expire.</p>
            </div>
          </div>

          {pendingOrders.map((order, index) => (
            <AnimateIn key={order._id} index={index}>
              <PendingApprovalCard order={order} onResolved={reload} compact />
            </AnimateIn>
          ))}
        </section>
      )}

      {!loading && !error && pendingOrders.length === 0 && ongoingOrders.length === 0 && (
        <EmptyState icon="✓" title="You're all caught up" variant="success">
          No orders need your review, and there are no active deliveries. New activity will appear here automatically.
        </EmptyState>
      )}
    </div>
  );
}
