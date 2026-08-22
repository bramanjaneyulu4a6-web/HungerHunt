import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import RefreshButton from '../components/RefreshButton';
import ReportForm from '../components/ReportForm';
import { Banner, EmptyState, Skeleton } from '../components/ui';
import api from '../utils/api';
import { ORDER_ISSUE_CATEGORIES } from '../utils/reports';

const HISTORY_PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 15_000;
const CODE_LENGTH = 4;
const STATUS_STEPS = ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
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
    detail: 'The warehouse is bringing this package to you.',
    badge: 'partial',
  },
  DELIVERED: {
    label: 'With you',
    detail: 'You have this package. The student takes it by typing their code below.',
    badge: 'partial',
  },
};

/* The handover, and the only thing on this screen that changes a package.
 *
 * The student types their own purchase code — the same four digits they use
 * at the till — and that is what records the package as theirs. It is not the
 * caretaker's tap: a caretaker confirming on a student's behalf is exactly
 * what this screen stopped being able to do, because the button that used to
 * close a hundred packages at once could not tell the difference between a
 * package handed over and a package still on the shelf. */
const CollectionCode = ({ order, busy, onConfirm }) => {
  const [code, setCode] = useState('');
  const [reporting, setReporting] = useState(false);
  const ready = code.length === CODE_LENGTH && !busy;

  /* The way out of this screen when the handover cannot happen as it should —
     the food is wrong, the box is damaged, the student says the package is not
     theirs, or they simply cannot produce their code. Reporting changes nothing
     about the package: it stays here, still collectable, because a student who
     is owed food should not lose it while an office reads a message. */
  if (reporting) {
    return (
      <section className="wh-collect wh-collect--reporting" aria-label={`Report an issue with ${order.student.name}'s package`}>
        <p className="wh-field-label">Issue with {order.student.name}&rsquo;s package</p>
        <ReportForm
          kind="ORDER_ISSUE"
          categories={ORDER_ISSUE_CATEGORIES}
          orderId={order.id}
          submitLabel="Send to the office"
          onCancel={() => setReporting(false)}
          onFiled={() => setReporting(false)}
        />
      </section>
    );
  }

  return (
    <form
      className="wh-collect"
      onSubmit={(event) => {
        event.preventDefault();
        if (ready) onConfirm(order, code, () => setCode(''));
      }}
    >
      <label className="wh-collect-label" htmlFor={`code-${order.id}`}>
        {order.student.name.split(' ')[0]} types their purchase code
      </label>
      <div className="wh-collect-row">
        <input
          id={`code-${order.id}`}
          className="wh-input wh-collect-input"
          value={code}
          onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, CODE_LENGTH))}
          inputMode="numeric"
          autoComplete="off"
          type="password"
          placeholder="••••"
          aria-label={`Purchase code for ${order.student.name}`}
          disabled={busy}
        />
        <button type="submit" className="wh-cta wh-collect-cta" disabled={!ready}>
          {busy ? 'Checking…' : 'Hand over'}
        </button>
      </div>
      <button
        type="button"
        className="wh-report-link"
        disabled={busy}
        onClick={() => setReporting(true)}
      >
        Issue with this package
      </button>
    </form>
  );
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
  const [awaitingCollection, setAwaitingCollection] = useState(0);
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
      setAwaitingCollection(response.data.meta?.awaitingCollection || 0);
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

  const collect = async (order, code, clearCode) => {
    setBusyId(order.id);
    try {
      await api.post(`/v1/caretaker/fulfillment-orders/${order.id}/collect`, { code });
      clearCode();
      toast.success(`${order.student.name} has their package`);
      invalidateHistory();
      await loadArrivals();
    } catch (error) {
      console.error(error);
      /* The code is wrong, or locked, or the package moved under us. Every one
         of those is the server's sentence to read out, not a generic failure:
         a caretaker who is told "wrong code" hands the phone back to the
         student, and one who is told the code is locked stops trying. */
      toast.error(error.response?.data?.message || 'Could not confirm this collection');
    } finally {
      setBusyId(null);
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
          <p className="wh-subtitle">
            {awaitingCollection > 0
              ? `${awaitingCollection} ${awaitingCollection === 1 ? 'package is' : 'packages are'} with you, waiting for their student`
              : 'Track every paid order from the warehouse to the student it belongs to'}
          </p>
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
          {loadError && <Banner variant="alert" icon="⚠️">Could not load arriving packages.</Banner>}
          {loading ? <Skeleton height={240} radius={14} /> : orders.length === 0 && !loadError ? (
            <EmptyState icon="✓" title="You're all caught up" variant="success">
              Nothing is on its way to your hostel, and no package is waiting to be collected.
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
                {order.status === 'DELIVERED' && (
                  <CollectionCode order={order} busy={busyId === order.id} onConfirm={collect} />
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
              Packages appear here once their student has collected them.
            </EmptyState>
          ) : history.map((order) => (
            <article key={order.id} className="wh-card wh-order">
              <div className="wh-row">
                <StudentDetails order={order} />
                <span className="wh-badge wh-badge--partial">COLLECTED</span>
              </div>
              <p className="wh-history-date">
                {order.collectedAt
                  ? new Date(order.collectedAt).toLocaleString()
                  : 'Collection time unavailable'}
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
