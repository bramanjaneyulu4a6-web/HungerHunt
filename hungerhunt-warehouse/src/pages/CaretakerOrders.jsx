import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import RefreshButton from '../components/RefreshButton';
import { Banner, EmptyState, Skeleton } from '../components/ui';
import api from '../utils/api';

const HISTORY_PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 15_000;
const STATUS_STEPS = ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY'];
const STATUS_DETAILS = {
  PENDING: {
    label: 'Order received',
    detail: 'The warehouse has received this order.',
    badge: 'new',
  },
  PACKED: {
    label: 'Packed',
    detail: 'The warehouse has packed this order.',
    badge: 'partial',
  },
  OUT_FOR_DELIVERY: {
    label: 'On the way',
    detail: 'This package is ready to be received at the hostel.',
    badge: 'partial',
  },
};

const PackageLines = ({ items }) => (
  <div className="wh-summary wh-summary--lines">
    {items.map((item) => (
      <div key={item.productId || item.name} className="wh-order-line">
        <span className="wh-order-line-name">{item.name}</span>
        <strong className="wh-order-line-qty wh-num">×{item.quantity}</strong>
      </div>
    ))}
  </div>
);

const StudentDetails = ({ order }) => (
  <div>
    <span className="wh-who">{order.student.name}</span>
    <p className="wh-remaining" style={{ margin: '4px 0 0' }}>
      Hostel {order.student.hostelNumber} · {order.student.admissionNumber || 'No admission number'}
    </p>
  </div>
);

const CaretakerOrders = () => {
  const [view, setView] = useState('arriving');
  const [orders, setOrders] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyPage, setHistoryPage] = useState(0);
  const [historyHasMore, setHistoryHasMore] = useState(true);
  const [historyLoaded, setHistoryLoaded] = useState(false);
  const [loading, setLoading] = useState(true);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [historyError, setHistoryError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [receivingAll, setReceivingAll] = useState(false);
  const [receivableCount, setReceivableCount] = useState(0);
  const loadMoreRef = useRef(null);
  const arrivalRequestRef = useRef(0);

  const loadArrivals = useCallback(async ({ silent = false } = {}) => {
    const requestNumber = ++arrivalRequestRef.current;
    if (!silent) setLoading(true);
    if (requestNumber === arrivalRequestRef.current) setLoadError(false);
    try {
      const response = await api.get('/v1/caretaker/fulfillment-orders');
      if (requestNumber !== arrivalRequestRef.current) return;
      setOrders(response.data.data || []);
      setReceivableCount(response.data.meta?.receivableCount || 0);
    } catch (error) {
      console.error(error);
      if (requestNumber === arrivalRequestRef.current) setLoadError(true);
    } finally {
      if (requestNumber === arrivalRequestRef.current) setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async (page = 1, replace = page === 1) => {
    setHistoryLoading(true);
    setHistoryError(false);
    try {
      const response = await api.get(
        `/v1/caretaker/fulfillment-orders/history?page=${page}&limit=${HISTORY_PAGE_SIZE}`
      );
      const next = response.data.data || [];
      setHistory((current) => replace ? next : [...current, ...next]);
      setHistoryPage(page);
      setHistoryHasMore(Boolean(response.data.meta?.hasMore));
      setHistoryLoaded(true);
    } catch (error) {
      console.error(error);
      setHistoryError(true);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await loadArrivals(); })(); }, [loadArrivals]);

  useEffect(() => {
    const interval = window.setInterval(() => loadArrivals({ silent: true }), REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadArrivals]);

  useEffect(() => {
    if (view !== 'history' || !historyHasMore || historyLoading || !historyLoaded) return undefined;
    const node = loadMoreRef.current;
    if (!node) return undefined;

    if (typeof IntersectionObserver === 'undefined') return undefined;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) loadHistory(historyPage + 1, false);
    }, { rootMargin: '160px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, [historyHasMore, historyLoaded, historyLoading, historyPage, loadHistory, view]);

  const invalidateHistory = () => {
    setHistory([]);
    setHistoryPage(0);
    setHistoryHasMore(true);
    setHistoryLoaded(false);
  };

  const confirmDelivery = async (order) => {
    setBusyId(order.id);
    try {
      await api.post(`/v1/caretaker/fulfillment-orders/${order.id}/transition`, { status: 'DELIVERED' });
      toast.success('Package marked received');
      invalidateHistory();
      await loadArrivals();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Could not confirm this delivery');
    } finally {
      setBusyId(null);
    }
  };

  const receiveAll = async () => {
    const count = receivableCount;
    if (!count || !window.confirm(`Confirm that all ${count} packages have arrived at your hostel?`)) return;

    setReceivingAll(true);
    try {
      const response = await api.post('/v1/caretaker/fulfillment-orders/receive-all');
      const receivedCount = response.data.data?.receivedCount || 0;
      toast.success(`${receivedCount} ${receivedCount === 1 ? 'package' : 'packages'} received`);
      invalidateHistory();
      await loadArrivals();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || 'Could not receive all packages');
    } finally {
      setReceivingAll(false);
    }
  };

  const showView = async (nextView) => {
    setView(nextView);
    if (nextView === 'history' && !historyLoaded) await loadHistory(1, true);
  };

  const refresh = () => view === 'history' ? loadHistory(1, true) : loadArrivals();
  const currentOrders = [...orders].sort((a, b) =>
    STATUS_STEPS.indexOf(b.status) - STATUS_STEPS.indexOf(a.status) ||
    new Date(a.deliverBy).getTime() - new Date(b.deliverBy).getTime()
  );

  return (
    <main className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Hostel packages</h1>
          <p className="wh-subtitle">Track every paid order through warehouse dispatch and hostel receipt</p>
        </div>
        <RefreshButton onRefresh={refresh} />
      </div>

      <div className="wh-view-tabs" aria-label="Package view">
        <button type="button" className={view === 'arriving' ? 'active' : ''} onClick={() => showView('arriving')}>
          Current ({orders.length})
        </button>
        <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => showView('history')}>
          History
        </button>
      </div>

      {view === 'arriving' ? (
        <>
          <button type="button" className="wh-cta wh-receive-all" disabled={loading || receivingAll || receivableCount === 0}
            onClick={receiveAll}>
            {receivingAll ? 'Receiving…' : `Received all (${receivableCount})`}
          </button>

          {loadError && <Banner variant="alert" icon="⚠️">Could not load arriving packages.</Banner>}
          {loading ? <Skeleton height={240} radius={14} /> : orders.length === 0 && !loadError ? (
            <EmptyState icon="✓" title="You're all caught up" variant="success">
              No paid packages for your hostel are currently in progress.
            </EmptyState>
          ) : currentOrders.map((order) => {
            const status = STATUS_DETAILS[order.status] || {
              label: order.status?.replaceAll('_', ' ') || 'Unknown',
              detail: 'Waiting for an update.',
              badge: 'new',
            };
            const activeStep = STATUS_STEPS.indexOf(order.status);

            return (
              <article key={order.id} className="wh-card wh-order">
                <div className="wh-row">
                  <StudentDetails order={order} />
                  <span className={`wh-badge wh-badge--${status.badge}`}>{status.label}</span>
                </div>

                <div className="wh-order-progress" aria-label={`Current status: ${status.label}`}>
                  {STATUS_STEPS.map((step, index) => (
                    <span key={step} className={index <= activeStep ? 'complete' : ''}>
                      <i aria-hidden="true" />
                      {STATUS_DETAILS[step].label}
                    </span>
                  ))}
                </div>

                <p className="wh-status-detail">{status.detail}</p>
                <PackageLines items={order.items} />
                {order.status === 'OUT_FOR_DELIVERY' && (
                  <button type="button" className="wh-cta" disabled={busyId === order.id || receivingAll}
                    onClick={() => confirmDelivery(order)}>
                    {busyId === order.id ? 'Receiving…' : 'Mark as received'}
                  </button>
                )}
              </article>
            );
          })}
        </>
      ) : (
        <section aria-label="Package history">
          {historyError && <Banner variant="alert" icon="⚠️">Could not load package history.</Banner>}
          {!historyLoaded && historyLoading ? <Skeleton height={240} radius={14} /> : history.length === 0 && !historyError ? (
            <EmptyState icon="package" title="No package history yet">
              Received packages will appear here.
            </EmptyState>
          ) : history.map((order) => (
            <article key={order.id} className="wh-card wh-order">
              <div className="wh-row">
                <StudentDetails order={order} />
                <span className="wh-badge wh-badge--partial">RECEIVED</span>
              </div>
              <p className="wh-history-date">
                {order.deliveredAt ? new Date(order.deliveredAt).toLocaleString() : 'Delivery time unavailable'}
              </p>
              <PackageLines items={order.items} />
            </article>
          ))}

          {historyHasMore && historyLoaded && (
            <button ref={loadMoreRef} type="button" className="wh-history-more"
              disabled={historyLoading} onClick={() => loadHistory(historyPage + 1, false)}>
              {historyLoading ? 'Loading older packages…' : 'Load older packages'}
            </button>
          )}
        </section>
      )}
    </main>
  );
};

export default CaretakerOrders;
