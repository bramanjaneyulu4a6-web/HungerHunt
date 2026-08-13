import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { formatINR } from '../utils/format';
import {
  AnimateIn,
  Banner,
  Button,
  Card,
  EmptyState,
  Skeleton,
} from '../components/ui';
import Icon from '../components/Icon';
import PendingApprovalCard from '../components/PendingApprovalCard';

const BASE_TABS = [
  { id: 'packages', icon: '📦', label: 'Packages' },
  { id: 'purchases', icon: '🛒', label: 'Purchases' },
  { id: 'recharges', icon: '⚡', label: 'Recharges' },
  { id: 'wallet', icon: '💳', label: 'Wallet' },
];

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

const formatDateTime = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));

const PACKAGE_LABELS = {
  PENDING: 'Order received',
  PACKED: 'Packed',
  OUT_FOR_DELIVERY: 'On the way to the dorm',
  DELIVERED: 'Delivered',
  CANCELLED: 'Cancelled and refunded',
};

const DetailsSkeleton = () => (
  <>
    <Card style={{ marginBottom: 24 }}>
      <Skeleton width="40%" height={24} />
      <Skeleton width="60%" height={14} style={{ marginTop: 10 }} />
      <Skeleton width="35%" height={32} style={{ marginTop: 20 }} />
    </Card>
    <Skeleton height={52} radius="var(--radius)" style={{ marginBottom: 32 }} />
    <ListSkeleton />
  </>
);

const ListSkeleton = () => (
  <>
    {[0, 1, 2].map((i) => (
      <Card key={i} className="card--tight" style={{ marginBottom: 16 }}>
        <Skeleton width="55%" height={13} />
        <Skeleton width="80%" height={14} style={{ marginTop: 16 }} />
        <Skeleton width="45%" height={15} style={{ marginTop: 16 }} />
      </Card>
    ))}
  </>
);

/* Both history tabs page the same way, so they share one hook: fetch page one,
   append each further page, and reload from the top when a push says the data
   changed. Nothing is requested until its tab is opened. */
const usePagedList = (path, key, enabled) => {
  const [items, setItems] = useState([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  /* A click, a push and a return to the foreground all only record which page
     the list wants; the effect below is the one thing that fetches. That keeps
     the request tied to the screen — it is abandoned when the screen goes —
     and leaves one copy of the loading and error handling instead of one per
     caller. `attempt` rises on every ask, so requesting page one again while
     already showing page one still counts as a new request. */
  const [request, setRequest] = useState({ page: 1, attempt: 0 });

  // The last page that actually arrived. "Load older entries" asks for the one
  // after it, so a page that failed is retried rather than skipped over.
  const [loadedPage, setLoadedPage] = useState(0);

  const reload = useCallback(
    () => setRequest((prev) => ({ page: 1, attempt: prev.attempt + 1 })),
    []
  );

  const loadMore = useCallback(
    () =>
      setRequest((prev) => ({
        page: loadedPage + 1,
        attempt: prev.attempt + 1,
      })),
    [loadedPage]
  );

  // Which request has already been sent. Opening a tab, leaving it and coming
  // back re-runs the effect, and without this the list would ask for the page
  // it is already showing.
  const fetched = useRef('');

  useEffect(() => {
    if (!enabled) return;

    const token = `${path}|${request.page}|${request.attempt}`;
    if (fetched.current === token) return;
    fetched.current = token;

    let ignore = false;
    let settled = false;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const res = await API.get(`${path}?page=${request.page}`);
        settled = true;
        if (ignore) return;

        // Replaced on page one, appended after — so "load more" grows the list
        // and a refresh resets it.
        setItems((prev) =>
          request.page === 1 ? res.data[key] : [...prev, ...res.data[key]]
        );
        setHasMore(res.data.hasMore);
        setLoadedPage(request.page);
      } catch (err) {
        settled = true;
        if (ignore) return;

        // Forget the token as well, so the same page can be asked for again.
        fetched.current = '';
        setError(
          err.response?.data?.message || "Couldn't load this list. Try again."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    return () => {
      ignore = true;

      // Leaving the tab before the reply arrives throws that reply away, so
      // the request does not count as sent: without this the list would come
      // back to a skeleton it never stops showing, waiting on an answer that
      // was already discarded.
      if (!settled) fetched.current = '';
    };
  }, [enabled, path, key, request]);

  // Only while the tab is open: an unopened tab has nothing on screen to keep
  // up to date, and fetching for it would undo the point of loading on demand.
  useEffect(() => {
    if (!enabled) return;

    const refresh = () => reload();
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener('focus', refresh);

    return () => {
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener('focus', refresh);
    };
  }, [enabled, reload]);

  return { items, hasMore, loading, error, loadMore, reload };
};

export default function ChildDetails() {
  const { id } = useParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState('purchases');
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingNotice, setPendingNotice] = useState('');

  const [walletEnabled, setWalletEnabled] = useState(false);
  const [walletLimit, setWalletLimit] = useState(500);
  const [walletType, setWalletType] = useState('WEEKLY');
  const [walletBanner, setWalletBanner] = useState({ type: '', message: '' });
  const [saving, setSaving] = useState(false);

  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalBanner, setApprovalBanner] = useState({ type: '', message: '' });

  // "Try again" bumps this to run the effect below again, which keeps the one
  // copy of the request inside the effect that owns and cancels it.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    // A reply for a child this screen has already left must not land on it.
    let ignore = false;

    const load = async () => {
      setLoadError('');

      try {
        const res = await API.get(`/parent/child/${id}`);
        if (ignore) return;

        setApprovalRequired(Boolean(res.data.student?.requiresParentApproval));

        const control = res.data.student?.walletControl;

        if (control) {
          setWalletEnabled(control.enabled);
          setWalletLimit(control.limitAmount || 500);
          setWalletType(control.limitType || 'WEEKLY');
        }

        setData(res.data);

        // Approval availability enhances this screen but must not make the
        // child's balance and history unavailable if that secondary request
        // fails. It can catch up on focus or the next push.
        try {
          const pending = await API.get('/pending-orders/parent');
          if (!ignore) {
            const childOrders = (pending.data.orders || []).filter(
              (order) => String(order.studentId?._id) === id
            );
            setPendingOrders(childOrders);
            if (childOrders.length === 0) {
              setActiveTab((tab) => (tab === 'pending' ? 'purchases' : tab));
            }
          }
        } catch {
          // Keep the last known pending list.
        }
      } catch (err) {
        if (ignore) return;

        // A failed request used to fall through to the "records not found"
        // screen, so a dropped connection read as a missing student.
        console.error('Error fetching purchase records:', err);
        setLoadError(
          err.response
            ? err.response.data?.message || 'Could not load this account.'
            : "Couldn't reach the server. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    // The balance shown here changes with every purchase and top-up made
    // elsewhere, so it is refreshed on a push and on returning to the app —
    // this screen used to sit on whatever it loaded on arrival.
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);

    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [id, attempt]);

  const bills = usePagedList(
    `/parent/child/${id}/bills`,
    'bills',
    activeTab === 'purchases'
  );

  const recharges = usePagedList(
    `/parent/child/${id}/recharges`,
    'recharges',
    activeTab === 'recharges'
  );

  const packages = usePagedList(
    `/parent/child/${id}/packages`,
    'packages',
    activeTab === 'packages'
  );

  /* Saved on the switch rather than behind a button. There is one thing to
     decide and no second field to get right first, and a toggle that looks set
     but was never saved is the worst outcome for this particular setting. */
  const toggleApproval = async (required) => {
    setApprovalRequired(required);
    setApprovalBanner({ type: '', message: '' });
    setApprovalSaving(true);

    try {
      await API.put(`/parent/purchase-approval/${id}`, { required });

      setApprovalBanner({
        type: 'success',
        message: required
          ? 'Purchases will now wait for your approval.'
          : 'Purchases no longer need your approval.',
      });
    } catch (err) {
      // Put the switch back: it should never show a state the server rejected.
      setApprovalRequired(!required);
      setApprovalBanner({
        type: 'error',
        message: err.response?.data?.message || 'Could not change that setting.',
      });
    } finally {
      setApprovalSaving(false);
    }
  };

  const saveWalletControl = async () => {
    setWalletBanner({ type: '', message: '' });

    if (walletEnabled && (!Number.isFinite(walletLimit) || walletLimit <= 0)) {
      setWalletBanner({
        type: 'error',
        message: 'Enter a spending limit greater than ₹0.',
      });
      return;
    }

    setSaving(true);

    try {
      await API.put(`/parent/wallet-control/${id}`, {
        enabled: walletEnabled,
        limitAmount: walletLimit,
        limitType: walletType,
      });

      setWalletBanner({ type: 'success', message: 'Wallet control updated.' });
    } catch (err) {
      setWalletBanner({
        type: 'error',
        message:
          err.response?.data?.message || 'Failed to update wallet control.',
      });
    } finally {
      setSaving(false);
    }
  };

  const backLink = (
    <Link to="/accounts" className="page-back">
      <Icon name="arrowLeft" size={17} /> Back to accounts
    </Link>
  );

  if (loading) {
    return (
      <div className="page">
        {backLink}
        <DetailsSkeleton />
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="page">
        {backLink}
        <Banner variant="alert" icon="⚠️">
          {loadError}{' '}
          <button type="button" className="link-button" onClick={retry}>
            Try again
          </button>
        </Banner>
      </div>
    );
  }

  if (!data?.student) {
    return (
      <div className="page">
        {backLink}
        <EmptyState icon="🔍" title="Student record not found">
          This account may have been removed, or it isn&apos;t linked to your
          phone number. Please contact the school office.
        </EmptyState>
      </div>
    );
  }

  const student = data.student;
  const tabs = pendingOrders.length
    ? [
        { id: 'pending', icon: '⏳', label: `Pending (${pendingOrders.length})` },
        ...BASE_TABS,
      ]
    : BASE_TABS;

  const refreshPending = async (message) => {
    setPendingNotice(message || 'Approval updated.');
    try {
      const response = await API.get('/pending-orders/parent');
      const childOrders = (response.data.orders || []).filter(
        (order) => String(order.studentId?._id) === id
      );
      setPendingOrders(childOrders);
      if (childOrders.length === 0) setActiveTab('purchases');
    } catch {
      // The action succeeded. A foreground refresh or push will reconcile the
      // list if this follow-up read happens to fail.
    }
  };

  /* Shared by both history tabs: the first load shows skeletons, a failure
     offers to retry, and a full page offers the next one. */
  const renderList = (list, { empty, children }) => {
    if (list.loading && list.items.length === 0) return <ListSkeleton />;

    if (list.error && list.items.length === 0) {
      return (
        <Banner variant="alert" icon="⚠️">
          {list.error}{' '}
          <button type="button" className="link-button" onClick={list.reload}>
            Try again
          </button>
        </Banner>
      );
    }

    if (list.items.length === 0) return empty;

    return (
      <>
        {children}

        {list.hasMore && (
          <Button
            variant="ghost"
            block
            onClick={list.loadMore}
            disabled={list.loading}
            style={{ marginTop: 8 }}
          >
            {list.loading ? 'Loading…' : 'Load older entries'}
          </Button>
        )}
      </>
    );
  };

  return (
    <div className="page">
      {backLink}

      <Card className="child-hero">
        <div className="student-identity">
          <span className="student-avatar" aria-hidden="true">
            {student.name?.charAt(0).toUpperCase() || 'S'}
          </span>
          <div>
            <h1 style={{ fontSize: 25, fontWeight: 850 }}>{student.name}</h1>
            <p className="student-meta">
              Grade {student.grade || '—'} · Room {student.hostelNumber || '—'}
            </p>
          </div>
        </div>

        <div className="child-balance">
          <p className="stat-label">Available balance</p>
          <p className="stat-value">{formatINR(student.pocketMoney)}</p>
        </div>
      </Card>

      <div className="tabs child-tabs" role="tablist" aria-label={`${student.name}'s account sections`}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            id={`tab-${tab.id}`}
            role="tab"
            aria-selected={activeTab === tab.id}
            aria-controls={`panel-${tab.id}`}
            tabIndex={activeTab === tab.id ? 0 : -1}
            className={`tab${activeTab === tab.id ? ' tab--active' : ''}`}
            onClick={() => setActiveTab(tab.id)}
          >
            <span aria-hidden="true">{tab.icon}</span> {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'pending' && pendingOrders.length > 0 && (
        <div role="tabpanel" id="panel-pending" aria-labelledby="tab-pending" tabIndex={0}>
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Pending approval</h2>
              <p className="section-copy">Review this kiosk order before it expires.</p>
            </div>
          </div>

          {pendingNotice && (
            <Banner variant="success" icon="✅" style={{ marginBottom: 18 }}>
              {pendingNotice}
            </Banner>
          )}

          {pendingOrders.map((order) => (
            <PendingApprovalCard
              key={order._id}
              order={order}
              onResolved={refreshPending}
            />
          ))}
        </div>
      )}

      {activeTab === 'purchases' && (
        <div role="tabpanel" id="panel-purchases" aria-labelledby="tab-purchases" tabIndex={0}>
          <h2 className="section-title">Purchase History</h2>

          {renderList(bills, {
            empty: (
              <EmptyState icon="🧾" title="No purchases yet">
                Nothing has been bought on this account so far.
              </EmptyState>
            ),
            children: bills.items.map((bill, i) => (
              <AnimateIn key={bill._id} index={i}>
                <Card className="card--tight" style={{ marginBottom: 16 }}>
                  <div className="ledger-head">
                    <span>
                      Invoice:{' '}
                      <span style={{ color: 'var(--ink)', fontWeight: 600 }}>
                        #{bill._id.slice(-6).toUpperCase()}
                      </span>
                    </span>
                    <span>{formatDate(bill.createdAt)}</span>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                    {(bill.items || bill.products || []).map((item, idx) => (
                      <li key={idx} className="ledger-row">
                        <span>
                          {item.name || item.productName}
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 12,
                              fontWeight: 600,
                              color: 'var(--muted-soft)',
                            }}
                          >
                            x{item.quantity}
                          </span>
                        </span>
                        <span style={{ fontWeight: 500, color: 'var(--ink)' }}>
                          {formatINR((item.price || 0) * (item.quantity || 0))}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div className="ledger-total">
                    <span>Total Deducted</span>
                    <span className="amount-out">
                      −{formatINR(bill.totalAmount)}
                    </span>
                  </div>
                </Card>
              </AnimateIn>
            )),
          })}
        </div>
      )}

      {activeTab === 'packages' && (
        <div role="tabpanel" id="panel-packages" aria-labelledby="tab-packages" tabIndex={0}>
          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Dorm Packages</h2>
              <p className="section-copy">
                Paid orders are delivered to the student&apos;s dorm within 48 hours.
              </p>
            </div>
          </div>

          {renderList(packages, {
            empty: (
              <EmptyState icon="📦" title="No packages yet">
                A package will appear here after an order is paid.
              </EmptyState>
            ),
            children: packages.items.map((item, i) => (
              <AnimateIn key={item.id} index={i}>
                <Card className="card--tight" style={{ marginBottom: 16 }}>
                  <div className="ledger-head">
                    <strong style={{ color: 'var(--ink)' }}>
                      {PACKAGE_LABELS[item.status] || item.status}
                    </strong>
                    <span>{formatDate(item.orderedAt)}</span>
                  </div>

                  <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 16px' }}>
                    {(item.items || []).map((product, idx) => (
                      <li key={`${product.name}-${idx}`} className="ledger-row">
                        <span>{product.name} × {product.quantity}</span>
                        <span>{formatINR(product.price * product.quantity)}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="ledger-row">
                    <span>{item.deliveredAt ? 'Delivered' : item.overdue ? 'Delivery overdue since' : 'Deliver by'}</span>
                    <strong style={{ color: item.overdue ? 'var(--danger)' : 'var(--ink)' }}>
                      {formatDateTime(item.deliveredAt || item.deliverBy)}
                    </strong>
                  </div>

                  <div className="ledger-row">
                    <span>Dorm room</span>
                    <span>{item.hostelNumber || '—'}</span>
                  </div>

                  {item.receivedBy && (
                    <div className="ledger-row">
                      <span>Received by</span>
                      <span>{item.receivedBy}</span>
                    </div>
                  )}
                </Card>
              </AnimateIn>
            )),
          })}
        </div>
      )}

      {activeTab === 'recharges' && (
        <div role="tabpanel" id="panel-recharges" aria-labelledby="tab-recharges" tabIndex={0}>
          <h2 className="section-title">Recharge History</h2>

          {renderList(recharges, {
            empty: (
              <EmptyState icon="⚡" title="No recharges yet">
                Top-ups made at the school accounts counter will appear here.
              </EmptyState>
            ),
            // Already newest-first from the server, which is what the reversed
            // client-side copy was approximating.
            children: recharges.items.map((r, i) => (
              <AnimateIn key={`${r.date}-${i}`} index={i}>
                <Card className="card--tight" style={{ marginBottom: 16 }}>
                  <div className="ledger-head">
                    <span>
                      {r.kind === 'ORDER_CANCELLATION_REFUND'
                        ? 'Cancelled Order Refund'
                        : 'Wallet Recharge'}
                    </span>
                    <span>{formatDate(r.date)}</span>
                  </div>

                  <div className="ledger-total" style={{ border: 'none', paddingTop: 0 }}>
                    <span>
                      {r.kind === 'ORDER_CANCELLATION_REFUND' ? 'Refund Amount' : 'Recharge Amount'}
                    </span>
                    <span className="amount-in">+{formatINR(r.amount)}</span>
                  </div>

                  <div className="ledger-row">
                    <span>Previous Balance</span>
                    <span>{formatINR(r.previousBalance)}</span>
                  </div>

                  {r.kind === 'ORDER_CANCELLATION_REFUND' && r.reason && (
                    <div className="ledger-row">
                      <span>Reason</span>
                      <span>{r.reason}</span>
                    </div>
                  )}

                  <div className="ledger-row">
                    <span>New Balance</span>
                    <span>{formatINR(r.newBalance)}</span>
                  </div>
                </Card>
              </AnimateIn>
            )),
          })}
        </div>
      )}

      {activeTab === 'wallet' && (
        <div role="tabpanel" id="panel-wallet" aria-labelledby="tab-wallet" tabIndex={0} className="settings-grid">
          <Card className="settings-card">
            <h2 className="section-title" style={{ fontSize: 20 }}>
              Purchase Approval
            </h2>

            {approvalBanner.message && (
              <Banner
                variant={approvalBanner.type === 'error' ? 'alert' : 'success'}
                icon={approvalBanner.type === 'error' ? '⚠️' : '✅'}
                style={{ marginBottom: 20 }}
              >
                {approvalBanner.message}
              </Banner>
            )}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={approvalRequired}
                disabled={approvalSaving}
                onChange={(e) => toggleApproval(e.target.checked)}
              />
              Ask me before each purchase
            </label>

            <p
              style={{
                marginTop: 12,
                fontSize: 13,
                lineHeight: 1.5,
                color: 'var(--muted)',
              }}
            >
              {approvalRequired
                ? `The counter can no longer charge ${student.name} directly. Each purchase is sent here for your approval, and nothing is taken from the wallet until you agree. Requests expire after three days.`
                : `${student.name} can buy at the counter with their purchase code, and the wallet is charged there and then.`}
            </p>
          </Card>

          <Card className="settings-card">
            <h2 className="section-title" style={{ fontSize: 20 }}>
              Wallet Control
            </h2>

            {walletBanner.message && (
              <Banner
                variant={walletBanner.type === 'error' ? 'alert' : 'success'}
                icon={walletBanner.type === 'error' ? '⚠️' : '✅'}
                style={{ marginBottom: 20 }}
              >
                {walletBanner.message}
              </Banner>
            )}

            <label className="checkbox-row" style={{ marginBottom: 20 }}>
              <input
                type="checkbox"
                checked={walletEnabled}
                disabled={saving}
                onChange={(e) => setWalletEnabled(e.target.checked)}
              />
              Enable Spending Limit
            </label>

            <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
              <div>
                <label className="field-label" htmlFor="wallet-limit">
                  Limit Amount (₹)
                </label>
                <input
                  id="wallet-limit"
                  className="input"
                  type="number"
                  min="0"
                  value={walletLimit}
                  disabled={!walletEnabled || saving}
                  onChange={(e) => setWalletLimit(Number(e.target.value))}
                  placeholder="Enter amount"
                />
              </div>

              <div>
                <label className="field-label" htmlFor="wallet-frequency">
                  Frequency
                </label>
                <select
                  id="wallet-frequency"
                  className="select"
                  value={walletType}
                  disabled={!walletEnabled || saving}
                  onChange={(e) => setWalletType(e.target.value)}
                >
                  <option value="DAILY">Daily</option>
                  <option value="WEEKLY">Weekly</option>
                  <option value="MONTHLY">Monthly</option>
                </select>
              </div>
            </div>

            {/* Disabled while in flight so the limit cannot be submitted twice. */}
            <Button onClick={saveWalletControl} disabled={saving}>
              {saving ? 'Saving…' : 'Save Wallet Control'}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
}
