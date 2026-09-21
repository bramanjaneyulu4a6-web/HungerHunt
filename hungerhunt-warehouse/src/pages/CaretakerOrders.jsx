import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import CaretakerApprovals from '../components/CaretakerApprovals';
import Icon from '../components/Icon';
import NotifyParentButton from '../components/NotifyParentButton';
import ReportForm from '../components/ReportForm';
import { Banner, EmptyState, Skeleton } from '../components/ui';
import api from '../utils/api';
import { DATA_CHANGED_EVENT } from '../utils/dataAutoRefresh';
import { awaitingParentTile, splitPendingOrders } from '../utils/awaitingParent';
import { caretakerProductTotals, filterCaretakerOrders } from '../utils/caretakerOrders';
import { ORDER_ISSUE_CATEGORIES } from '../utils/reports';
import { useFeature } from '../utils/currentStaff';

const HISTORY_PAGE_SIZE = 25;
const REFRESH_INTERVAL_MS = 15_000;
// AWAITING_PARENT is not a package status: it is an approval order the
// parent has not answered yet, drawn as a tile at the first step. Every
// package from the warehouse is past it.
const STATUS_STEPS = ['AWAITING_PARENT', 'PENDING', 'PACKED', 'OUT_FOR_DELIVERY', 'DELIVERED'];
const STATUS_DETAILS = {
  AWAITING_PARENT: {
    label: 'Awaiting parent approval',
    detail: 'Sent to the parent to accept or decline in their app. Nothing is charged until they do.',
    badge: 'new',
  },
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
    detail:
      'You have this package. Tap Order Complete and hand the screen to the student — their code finishes it.',
    badge: 'partial',
  },
};

/* The handover starts here but no longer happens here. Order Complete opens a
 * full screen the caretaker turns toward the student — their receipt, their
 * code field, their Help button. The code is still the student's own four
 * digits and still the only thing that changes the package: this button just
 * gives that act a screen of its own instead of a box squeezed into a card.
 *
 * The report link stays on the card because it is the caretaker's channel, not
 * the student's — for the package that is not theirs, the code that will not
 * come, the things a caretaker notices before a student is even standing
 * there. Reporting changes nothing about the package either way. */
const DeliveredActions = ({ order }) => {
  const navigate = useNavigate();
  const [reporting, setReporting] = useState(false);
  const canReport = useFeature('caretaker.reportPackage');

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
    <div className="wh-collect">
      <button
        type="button"
        className="wh-cta wh-collect-open"
        onClick={() => navigate(`/collect/${order.id}`, { state: { order } })}
      >
        Order Complete
      </button>
      {canReport && (
        <button type="button" className="wh-report-link" onClick={() => setReporting(true)}>
          Issue with this package
        </button>
      )}
    </div>
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

const UnitOrderItems = ({ items }) => (
  <div className="wh-unit-items">
    {items.map((item) => (
      <div key={item.id}>
        <span>{item.name}</span>
        <strong className="wh-num">×{item.quantity}</strong>
      </div>
    ))}
  </div>
);

const answerBy = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric',
  month: 'short',
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Kolkata',
});

const StudentDetails = ({ order }) => (
  <div>
    <span className="wh-who">{order.student.name}</span>
    <p className="wh-remaining" style={{ margin: '4px 0 0' }}>
      Room {order.student.roomNumber} · {order.student.admissionNumber || 'No admission number'}
    </p>
  </div>
);

const CaretakerOrders = () => {
  // History can be hidden from this account by a super admin.
  const canHistory = useFeature('caretaker.history');
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
  const [awaitingCollection, setAwaitingCollection] = useState(0);
  const [orderSearch, setOrderSearch] = useState('');
  // Every unanswered approval order from these rooms (GET /pending-orders/caretaker):
  // the caretaker's to answer go to Pending approvals, the parent's become
  // tiles in Student orders.
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingError, setPendingError] = useState(false);
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

  const loadPending = useCallback(async () => {
    try {
      const response = await api.get('/pending-orders/caretaker');
      setPendingOrders(response.data.orders || []);
      setPendingError(false);
    } catch (error) {
      console.error(error);
      setPendingError(true);
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

  useEffect(() => { (async () => { await Promise.all([loadArrivals(), loadPending()]); })(); }, [loadArrivals, loadPending]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      loadArrivals({ silent: true });
      loadPending();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(interval);
  }, [loadArrivals, loadPending]);

  // The backend announces every change within seconds; the interval above is
  // the safety net for when that announcement is missed.
  useEffect(() => {
    const refresh = () => {
      loadArrivals({ silent: true });
      loadPending();
    };
    window.addEventListener(DATA_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, refresh);
  }, [loadArrivals, loadPending]);

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

  const showView = async (nextView) => {
    setView(nextView);
    if (nextView === 'history' && !historyLoaded) await loadHistory(1, true);
  };

  const currentOrders = useMemo(() => [...orders].sort((a, b) =>
    STATUS_STEPS.indexOf(b.status) - STATUS_STEPS.indexOf(a.status) ||
    new Date(a.deliverBy).getTime() - new Date(b.deliverBy).getTime()
  ), [orders]);
  const { forCaretaker, awaitingParent } = useMemo(() => splitPendingOrders(pendingOrders), [pendingOrders]);
  // Orders waiting on the parent first — the one thing on this list the
  // caretaker can still move along, by nudging the parent on WhatsApp.
  const studentTiles = useMemo(
    () => [...awaitingParent.map(awaitingParentTile), ...currentOrders],
    [awaitingParent, currentOrders]
  );
  // Only what is actually on its way: an unanswered order is not paid for.
  const unitProducts = useMemo(() => caretakerProductTotals(orders), [orders]);
  const visibleOrders = useMemo(
    () => filterCaretakerOrders(studentTiles, orderSearch),
    [studentTiles, orderSearch]
  );

  return (
    <main className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Room packages</h1>
          <p className="wh-subtitle">
            {awaitingCollection > 0
              ? `${awaitingCollection} ${awaitingCollection === 1 ? 'package is' : 'packages are'} with you, waiting for their student`
              : 'Track every paid order from the warehouse to the student it belongs to'}
          </p>
        </div>
      </div>

      {/* Above the tabs: a purchase waiting on an answer is the one thing
          here that a student is actively held up by. */}
      <CaretakerApprovals orders={forCaretaker} loadError={pendingError} onResolved={loadPending} />

      <div className="wh-view-tabs" aria-label="Package view">
        <button type="button" className={view === 'arriving' ? 'active' : ''} onClick={() => showView('arriving')}>
          Current ({studentTiles.length})
        </button>
        {canHistory && (
          <button type="button" className={view === 'history' ? 'active' : ''} onClick={() => showView('history')}>
            History
          </button>
        )}
      </div>

      {view === 'arriving' ? (
        <>
          {loadError && <Banner variant="alert" icon="⚠️">Could not load arriving packages.</Banner>}
          {loading ? <Skeleton height={240} radius={14} /> : (!loadError || orders.length > 0) ? (
            <>
              <section className="caretaker-unit-order" aria-label="Entire unit order summary">
                <article className="wh-unit-tile">
                  <div className="wh-unit-tile-head">
                    <div>
                      <span className="wh-unit-kicker">Entire unit order</span>
                      <h3>All current packages</h3>
                    </div>
                    <span className="wh-unit-count">
                      <strong className="wh-num">{orders.length}</strong>
                      <small>{orders.length === 1 ? 'order' : 'orders'}</small>
                    </span>
                  </div>
                  <p className="wh-remaining">
                    {unitProducts.length} product {unitProducts.length === 1 ? 'type' : 'types'} being delivered
                    {awaitingCollection > 0 ? ` · ${awaitingCollection} ready for collection` : ''}
                  </p>
                  <UnitOrderItems items={unitProducts} />
                </article>
              </section>

              <section className="caretaker-student-orders" aria-labelledby="caretaker-student-orders-title">
                <div className="caretaker-student-orders__heading">
                  <div>
                    <span>Individual packages</span>
                    <h2 id="caretaker-student-orders-title">Student orders</h2>
                  </div>
                  <strong>{visibleOrders.length} of {studentTiles.length}</strong>
                </div>

                <label className="wh-search caretaker-order-search" htmlFor="caretaker-order-search">
                  <Icon name="search" size={19} />
                  <span className="sr-only">Search student orders</span>
                  <input
                    id="caretaker-order-search"
                    className="wh-search-input"
                    type="search"
                    value={orderSearch}
                    placeholder="Search student name or admission number"
                    onChange={(event) => setOrderSearch(event.target.value)}
                  />
                </label>

                {visibleOrders.length === 0 ? (
                  <EmptyState
                    icon={studentTiles.length === 0 ? '✓' : '⌕'}
                    title={studentTiles.length === 0 ? "You're all caught up" : 'No matching student orders'}
                    variant={studentTiles.length === 0 ? 'success' : 'default'}
                  >
                    {studentTiles.length === 0
                      ? 'Nothing is on its way to your rooms, and no package is waiting to be collected.'
                      : 'Try another student name or admission number.'}
                  </EmptyState>
                ) : visibleOrders.map((order) => {
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
                      {order.pendingOrder && order.expiresAt && (
                        <p className="wh-status-detail">
                          Parent can answer until {answerBy.format(new Date(order.expiresAt))}
                        </p>
                      )}
                      <PackageLines items={order.items} />
                      {order.pendingOrder && <NotifyParentButton order={order.pendingOrder} />}
                      {order.status === 'DELIVERED' && <DeliveredActions order={order} />}
                    </article>
                  );
                })}
              </section>
            </>
          ) : null}
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
                <span className="wh-badge wh-badge--partial">DELIVERED</span>
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
