import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useSearchParams } from 'react-router-dom';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { claimBackgroundRefresh, onBackgroundRefreshResumed } from '../utils/paymentHold';
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
import OrderCard from '../components/OrderCard';
import DemoUpiCheckout from '../components/DemoUpiCheckout';
import WalletDialog from '../components/WalletDialog';
import StatusToggleTile from '../components/StatusToggleTile';
import { ErrorFeedback, InlineFieldError } from '../components/error/ErrorFeedback';
import { presentError } from '../utils/errorPresentation';
import { demoAmountProblem } from '../utils/demoUpi';
import { tick } from '../utils/haptics';
import { createTopup, DEMO_UPI_ENABLED, PAYMENTS_ENABLED, pollIntent, startPayment, TERMINAL_STATUSES } from '../services/payments';

const BASE_TABS = [
  { id: 'orders', icon: '📦', label: 'Orders' },
  { id: 'wallet', icon: '💳', label: 'Wallet' },
];

const QUICK_TOPUP_AMOUNTS = [100, 200, 500];

// How long a wallet tile stays pressed after its sheet closes.
const TILE_PRESS_HOLD_MS = 200;

// Wording matches PaymentReturn.jsx's verdict copy, so a parent reads the
// same language wherever a payment lands.
const TOPUP_TERMINAL_COPY = {
  APPLIED: {
    variant: 'success',
    icon: '✅',
    text: 'Payment received. The wallet has been topped up.',
  },
  FAILED: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment failed. Nothing was charged. You can try again.',
  },
  EXPIRED: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment window closed. The payment was not completed in time. Nothing was charged.',
  },
  AMOUNT_MISMATCH: {
    variant: 'alert',
    icon: '⚠️',
    text: 'Payment needs a check. The payment arrived but did not match what was expected. The school office will sort it out — your money is safe.',
  },
};

// pollIntent's 5-minute cap lapsed without a terminal status — it gave up,
// the payment did not fail. Same framing PaymentReturn.jsx uses for the
// same situation.
const TOPUP_STILL_PROCESSING = {
  variant: 'warn',
  icon: 'ℹ️',
  text:
    "Still checking. Your payment is still being processed. It's safe — the school's system will finish confirming it even if you close this page. Check back in a few minutes.",
};

// pollIntent only rejects after several consecutive network failures, which
// happens after checkout already opened — the payment may have gone
// through. Same reassurance PaymentReturn.jsx gives for the same failure.
const TOPUP_POLL_FAILED_COPY = {
  variant: 'alert',
  icon: '⚠️',
  text:
    "Can't reach the server right now. Your money is safe — nothing on this page decides whether a payment went through, so a connection hiccup here doesn't affect it. Try again, or check back in a few minutes.",
};

const formatDate = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

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

/* Long account lists page the same way: fetch page one, append each further
   page, and reload from the top when a push says the data changed. Nothing is
   requested until its tab is opened. */
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
  const [searchParams] = useSearchParams();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [activeTab, setActiveTab] = useState(
    searchParams.get('tab') === 'wallet' ? 'wallet' : 'orders'
  );
  const [pendingOrders, setPendingOrders] = useState([]);
  const [pendingNotice, setPendingNotice] = useState('');

  const [walletEnabled, setWalletEnabled] = useState(false);
  const [walletLimit, setWalletLimit] = useState(500);
  const [walletType, setWalletType] = useState('WEEKLY');
  const [walletBanner, setWalletBanner] = useState({ type: '', message: '' });
  // null | 'topup' | 'control' — which of the two wallet actions is open.
  const [walletDialog, setWalletDialog] = useState(null);
  /* Which tile is drawn pressed. It trails `walletDialog` rather than mirroring
     it: the sheet lifts off a screen the parent has not looked at in a while,
     and releasing the tile in the same frame gives them nothing to land on.
     Holding it a moment lets the tile they came out of be the first thing they
     see, then let go. */
  const [pressedTile, setPressedTile] = useState(null);
  const [saving, setSaving] = useState(false);

  // Only the release is deferred — the press itself lands with the tap, in
  // openWalletDialog below. Reopening either tile cancels a pending release.
  useEffect(() => {
    if (walletDialog) return undefined;
    const timer = window.setTimeout(() => setPressedTile(null), TILE_PRESS_HOLD_MS);
    return () => window.clearTimeout(timer);
  }, [walletDialog]);

  const [approvalRequired, setApprovalRequired] = useState(false);
  const [approvalSaving, setApprovalSaving] = useState(false);
  const [approvalBanner, setApprovalBanner] = useState({ type: '', message: '' });

  const [topupAmount, setTopupAmount] = useState('');
  const [demoCheckoutOpen, setDemoCheckoutOpen] = useState(false);
  const [demoPaymentResult, setDemoPaymentResult] = useState(null);
  // null | the intent itself (mid-poll or terminal, from pollIntent) | a
  // client-made { synthetic: true, status, message } for a validation
  // failure, a start failure, or a poll failure.
  const [topupState, setTopupState] = useState(null);
  // Separate from `topupState`: this is the one flag that actually blocks
  // the button and picks the "Waiting for the bank…" label, independent of
  // which shape `topupState` currently holds.
  const [topupBusy, setTopupBusy] = useState(false);
  const topupAbortRef = useRef(null);
  const mountedRef = useRef(true);
  // The last intent this form started paying — kept so "Try again" after a
  // poll failure can resume checking the same payment instead of starting
  // a second one.
  const lastTopupIntentRef = useRef(null);

  // "Try again" bumps this to run the effect below again, which keeps the one
  // copy of the request inside the effect that owns and cancels it.
  const [attempt, setAttempt] = useState(0);
  const retry = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  // A parent who navigates away mid-payment must not leave pollIntent's
  // 3-second loop running in the background for up to 5 minutes.
  useEffect(
    () => () => {
      mountedRef.current = false;
      topupAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    // A reply for a child this screen has already left must not land on it.
    let ignore = false;

    const load = async () => {
      setLoadError('');

      try {
        const [res, walletRes] = await Promise.all([
          API.get(`/parent/child/${id}`),
          API.get(`/parent/child/${id}/wallet`),
        ]);
        if (ignore) return;

        const student = {
          ...res.data.student,
          pocketMoney: walletRes.data.wallet.balance,
        };

        setApprovalRequired(Boolean(student.requiresParentApproval));

        const control = student.walletControl;

        if (control) {
          setWalletEnabled(control.enabled);
          setWalletLimit(control.limitAmount || 500);
          setWalletType(control.limitType || 'WEEKLY');
        }

        setData({ ...res.data, student, wallet: walletRes.data.wallet });

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
    // this screen used to sit on whatever it loaded on arrival. It waits on
    // an open payment sheet, which this load would otherwise unmount by
    // refreshing the paid order out of the pending list below.
    const refresh = () => {
      if (claimBackgroundRefresh()) load();
    };

    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener('focus', refresh);
    const stopWaitingOnPayment = onBackgroundRefreshResumed(load);

    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener('focus', refresh);
      stopWaitingOnPayment();
    };
  }, [id, attempt]);

  const recharges = usePagedList(
    `/parent/child/${id}/recharges`,
    'recharges',
    activeTab === 'wallet'
  );

  const fulfillmentOrders = usePagedList(
    `/parent/child/${id}/packages`,
    'packages',
    activeTab === 'orders'
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
        <ErrorFeedback issue={presentError({ request: true, message: loadError })} action={{ label: 'Try again', onClick: retry }} />
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
  const tabs = BASE_TABS.map((tab) =>
    tab.id === 'orders' && pendingOrders.length
      ? { ...tab, label: `Orders (${pendingOrders.length})` }
      : tab
  );

  const refreshPending = async (message, { degradedToTopup = false } = {}) => {
    setPendingNotice(message || 'Approval updated.');
    // A degraded UPI order payment moved the money into wallet balance
    // instead of paying for the order — the balance line on this page is
    // now stale and needs its own refresh, separate from the pending list.
    if (degradedToTopup) refreshWallet();
    try {
      const response = await API.get('/pending-orders/parent');
      const childOrders = (response.data.orders || []).filter(
        (order) => String(order.studentId?._id) === id
      );
      setPendingOrders(childOrders);
    } catch {
      // The action succeeded. A foreground refresh or push will reconcile the
      // list if this follow-up read happens to fail.
    }
  };

  // A targeted re-fetch of just the balance, so a successful top-up updates
  // this page's balance line without disturbing the pending-orders list or
  // showing the full-page skeleton the way `retry` does.
  const refreshWallet = async () => {
    try {
      const walletRes = await API.get(`/parent/child/${id}/wallet`);
      if (!mountedRef.current) return;
      setData((prev) =>
        prev
          ? {
              ...prev,
              wallet: walletRes.data.wallet,
              student: { ...prev.student, pocketMoney: walletRes.data.wallet.balance },
            }
          : prev
      );
    } catch {
      // The payment already applied server-side. A push or the next
      // foreground refresh will catch up if this follow-up read fails.
    }
  };

  /* The spending limit, wherever it is asked for. It reads and writes the
     page's own wallet state, so the dialog that shows it stays a shell. */
  const renderWalletControl = () => (
    <>
      {walletBanner.message && (
        <Banner
          variant={walletBanner.type === 'error' ? 'alert' : 'success'}
          icon={walletBanner.type === 'error' ? '⚠️' : '✅'}
          style={{ marginBottom: 20 }}
        >
          {walletBanner.message}
        </Banner>
      )}

      <StatusToggleTile
        label="Spending limit"
        value={walletEnabled}
        disabled={saving}
        onTap={() => setWalletEnabled(!walletEnabled)}
        activeLabel="On"
        inactiveLabel="Off"
        activeIcon={<Icon name="shield" size={24} />}
        inactiveIcon={<Icon name="wallet" size={24} />}
        activeDescription={`Wallet spending is capped for ${student.name}. Set the amount and period below.`}
        inactiveDescription={`${student.name} can spend the whole balance. Tap to set a limit.`}
      />

      <div style={{ display: 'grid', gap: 16, marginBottom: 24 }}>
        <div>
          <label className="field-label" htmlFor="wallet-limit">
            Limit Amount (₹)
          </label>
          <input
            id="wallet-limit"
            className={`input${walletBanner.type === 'error' ? ' field-has-error' : ''}`}
            type="number"
            min="0"
            value={walletLimit}
            disabled={!walletEnabled || saving}
            onChange={(e) => setWalletLimit(Number(e.target.value))}
            placeholder="Enter amount"
            aria-invalid={walletBanner.type === 'error'}
            aria-describedby={walletBanner.type === 'error' ? 'wallet-limit-error' : undefined}
          />
          {walletBanner.type === 'error' && walletBanner.message === 'Enter a spending limit greater than ₹0.' && (
            <InlineFieldError id="wallet-limit-error">{walletBanner.message}</InlineFieldError>
          )}
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
      <Button block onClick={saveWalletControl} disabled={saving}>
        {saving ? 'Saving…' : 'Save wallet control'}
      </Button>
    </>
  );

  const openWalletDialog = async (which) => {
    await tick();
    setPressedTile(which);
    setWalletDialog(which);
  };

  const setQuickTopupAmount = (amount) => {
    setTopupAmount(String(amount));
    setTopupState(null);
    setDemoPaymentResult(null);
  };

  const openDemoTopup = () => {
    const problem = demoAmountProblem(topupAmount);
    if (problem) {
      setTopupState({ status: 'INVALID', synthetic: true, message: problem });
      return;
    }
    setTopupState(null);
    setDemoPaymentResult(null);
    setDemoCheckoutOpen(true);
  };

  const isAuthRequiredError = (err) =>
    err?.response?.status === 401 && err?.response?.data?.code === 'AUTH_REQUIRED';

  // Split from addMoney so "Try again" after a poll failure can resume
  // checking the same intent without creating a second one (a second
  // startPayment call would open a second checkout).
  const runTopupPoll = async (intentId, controller) => {
    try {
      const finalIntent = await pollIntent(intentId, {
        onUpdate: (intent) => mountedRef.current && setTopupState(intent),
        signal: controller.signal,
      });
      if (!mountedRef.current) return;

      setTopupState(finalIntent);

      if (finalIntent?.status === 'APPLIED') {
        // Two things are stale after a successful top-up: the balance shown
        // on this page, and the recharge history immediately below this
        // form — the parent's own top-up must appear in it without a
        // manual reload.
        refreshWallet();
        recharges.reload();
      }
    } catch (err) {
      if (!mountedRef.current) return;
      // The shared axios instance is already redirecting to /login for
      // this case; a FAILED banner here too would just flash confusing
      // text on the way out.
      if (isAuthRequiredError(err)) return;

      // pollIntent only rejects after several consecutive network
      // failures, which happens after checkout already opened — the
      // payment may well have gone through. This is a connectivity
      // problem with checking, not evidence the payment failed.
      setTopupState({ status: 'POLL_FAILED', synthetic: true });
    } finally {
      if (mountedRef.current) setTopupBusy(false);
    }
  };

  const addMoney = async () => {
    const amountRupees = Number(topupAmount);
    if (!Number.isInteger(amountRupees) || amountRupees < 1 || amountRupees > 20000) {
      setTopupState({
        status: 'INVALID',
        synthetic: true,
        message: 'Enter a whole rupee amount between 1 and 20,000.',
      });
      return;
    }

    setTopupState(null);
    setTopupBusy(true);
    const controller = new AbortController();
    topupAbortRef.current = controller;

    let intentId;
    try {
      ({ intentId } = await startPayment(() => createTopup(id, amountRupees)));
    } catch (err) {
      if (mountedRef.current) {
        if (!isAuthRequiredError(err)) {
          setTopupState({
            status: 'FAILED',
            synthetic: true,
            message: err.response?.data?.message || 'Could not start the payment.',
          });
        }
        setTopupBusy(false);
      }
      return;
    }

    if (!mountedRef.current) return;
    lastTopupIntentRef.current = intentId;
    await runTopupPoll(intentId, controller);
  };

  // Resumes checking the same intent after a poll failure, rather than
  // starting an entirely new payment.
  const retryTopupPoll = () => {
    const intentId = lastTopupIntentRef.current;
    if (!intentId) return;
    setTopupState(null);
    setTopupBusy(true);
    const controller = new AbortController();
    topupAbortRef.current = controller;
    runTopupPoll(intentId, controller);
  };

  // Keyed on the client-made `synthetic` flag rather than presence of a
  // `.message` field, so a future backend field happening to be named
  // `message` on a non-terminal intent can't be mistaken for one of ours.
  const topupTerminal =
    topupState &&
    typeof topupState === 'object' &&
    (topupState.synthetic || TERMINAL_STATUSES.includes(topupState.status));

  // pollIntent's 5-minute cap lapsed and handed back the last non-terminal
  // status it saw — the poll gave up, the payment itself did not fail.
  const topupGaveUp = !topupBusy && topupState && typeof topupState === 'object' && !topupTerminal;

  const topupCopy = topupTerminal
    ? topupState.synthetic
      ? topupState.status === 'POLL_FAILED'
        ? TOPUP_POLL_FAILED_COPY
        : { variant: 'alert', icon: '⚠️', text: topupState.message }
      : TOPUP_TERMINAL_COPY[topupState.status]
    : topupGaveUp
      ? TOPUP_STILL_PROCESSING
      : null;

  /* Shared by both history tabs: the first load shows skeletons, a failure
     offers to retry, and a full page offers the next one. */
  const renderList = (list, { empty, children }) => {
    if (list.loading && list.items.length === 0) return <ListSkeleton />;

    if (list.error && list.items.length === 0) {
      return (
        <ErrorFeedback issue={presentError({ request: true, message: list.error })} action={{ label: 'Try again', onClick: list.reload }} />
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

      {activeTab === 'orders' && (
        <div role="tabpanel" id="panel-orders" aria-labelledby="tab-orders" tabIndex={0}>
          {pendingOrders.length > 0 && (
            <section style={{ marginBottom: 28 }}>
              <div className="section-heading-row">
                <div>
                  <h2 className="section-title">Pending approval</h2>
                  <p className="section-copy">Review kiosk orders before they expire.</p>
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
            </section>
          )}

          <div className="section-heading-row">
            <div>
              <h2 className="section-title">Orders</h2>
              <p className="section-copy">
                Track paid orders from confirmation through dorm delivery.
              </p>
            </div>
          </div>

          {renderList(fulfillmentOrders, {
            empty: (
              <EmptyState icon="📦" title="No orders to track yet">
                Paid orders will appear here with live delivery updates.
              </EmptyState>
            ),
            children: (
              <div className="order-list">
                {fulfillmentOrders.items.map((item, i) => (
                  <AnimateIn key={item.id} index={i}>
                    <OrderCard order={item} index={i} showAllOrdersLink={false} />
                  </AnimateIn>
                ))}
              </div>
            ),
          })}
        </div>
      )}

      {activeTab === 'wallet' && (
        <div role="tabpanel" id="panel-wallet" aria-labelledby="tab-wallet" tabIndex={0}>
          <div className="wallet-actions">
            {(PAYMENTS_ENABLED || DEMO_UPI_ENABLED) && (
              <button
                type="button"
                className={`wallet-action${pressedTile === 'topup' ? ' wallet-action--on' : ''}`}
                aria-haspopup="dialog"
                aria-expanded={walletDialog === 'topup'}
                onClick={() => openWalletDialog('topup')}
              >
                <span className="wallet-action__icon" aria-hidden="true">
                  <Icon name="plus" size={22} />
                </span>
                <strong>Add money to wallet</strong>
                <small>Top up {student.name}&apos;s balance by UPI.</small>
              </button>
            )}

            <button
              type="button"
              className={`wallet-action wallet-action--control${pressedTile === 'control' ? ' wallet-action--on' : ''}`}
              aria-haspopup="dialog"
              aria-expanded={walletDialog === 'control'}
              onClick={() => openWalletDialog('control')}
            >
              <span className="wallet-action__icon" aria-hidden="true">
                <Icon name="shield" size={22} />
              </span>
              <strong>Wallet control</strong>
              <small>
                {walletEnabled
                  ? `${formatINR(walletLimit)} ${walletType.toLowerCase()} spending limit.`
                  : 'No spending limit set.'}
              </small>
            </button>
          </div>

          {walletDialog === 'topup' && (
          <WalletDialog
            eyebrow="Wallet"
            title="Add money"
            description={
              !DEMO_UPI_ENABLED && PAYMENTS_ENABLED
                ? `Top up ${student.name}'s wallet by UPI.`
                : `Choose an amount to add to ${student.name}'s wallet using UPI.`
            }
            /* The UPI checkout opens on top of this dialog and this one waits
               underneath for the receipt — so while it is up, this sheet is
               not the one Escape or a backdrop click should be closing. */
            busy={demoCheckoutOpen}
            onClose={() => setWalletDialog(null)}
          >
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              {QUICK_TOPUP_AMOUNTS.map((amount) => (
                <Button
                  key={amount}
                  variant="ghost"
                  className="btn--sm"
                  disabled={topupBusy || demoCheckoutOpen}
                  onClick={() => setQuickTopupAmount(amount)}
                >
                  {formatINR(amount)}
                </Button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ flex: '1 1 160px' }}>
                <label className="field-label" htmlFor="topup-amount">
                  Amount (₹)
                </label>
                <input
                  id="topup-amount"
                  className="input"
                  type="number"
                  inputMode="numeric"
                  min="1"
                  max="20000"
                  step="1"
                  value={topupAmount}
                  disabled={topupBusy || demoCheckoutOpen}
                  onChange={(e) => {
                    setTopupAmount(e.target.value);
                    setTopupState(null);
                    setDemoPaymentResult(null);
                  }}
                  placeholder="Enter amount"
                />
              </div>
              <Button
                disabled={topupBusy || demoCheckoutOpen}
                onClick={DEMO_UPI_ENABLED ? openDemoTopup : addMoney}
              >
                {topupBusy
                  ? 'Waiting for the bank…'
                  : !DEMO_UPI_ENABLED && PAYMENTS_ENABLED
                    ? 'Add money by UPI'
                    : 'Add money to wallet'}
              </Button>
            </div>

            {topupCopy && (
              <Banner variant={topupCopy.variant} icon={topupCopy.icon} style={{ marginTop: 16 }}>
                {topupCopy.text}
              </Banner>
            )}
            {topupState?.status === 'POLL_FAILED' && !topupBusy && (
              <Button variant="ghost" block onClick={retryTopupPoll} style={{ marginTop: 8 }}>
                Try again
              </Button>
            )}
            {demoPaymentResult && (
              <Banner variant="success" icon="✓" style={{ marginTop: 16 }}>
                Payment completed with {demoPaymentResult.provider}.
              </Banner>
            )}
          </WalletDialog>
          )}

          {walletDialog === 'control' && (
            <WalletDialog
              eyebrow="Wallet"
              title="Wallet control"
              description={`Cap what ${student.name} can spend from the wallet over a set period.`}
              busy={saving}
              onClose={() => setWalletDialog(null)}
            >
              {renderWalletControl()}
            </WalletDialog>
          )}

          {demoCheckoutOpen && (
            <DemoUpiCheckout
              amount={Number(topupAmount)}
              studentName={student.name}
              onClose={() => setDemoCheckoutOpen(false)}
              onComplete={setDemoPaymentResult}
            />
          )}

          <h2 className="section-title">Wallet activity</h2>

          {renderList(recharges, {
            empty: (
              <EmptyState icon="⚡" title="No wallet activity yet">
                Top-ups, order payments and cancellation refunds will appear here.
              </EmptyState>
            ),
            // Already newest-first from the server, which is what the reversed
            // client-side copy was approximating.
            children: recharges.items.map((r, i) => (
              <AnimateIn key={`${r.date}-${i}`} index={i}>
                <Card className="card--tight" style={{ marginBottom: 16 }}>
                  <div className="ledger-head">
                    <span>
                      {r.kind === 'ORDER_PAYMENT'
                        ? 'Order payment'
                        : r.kind === 'ORDER_CANCELLATION_REFUND'
                          ? 'Cancelled Order Refund'
                          : 'Money added'}
                    </span>
                    <span>{formatDate(r.date)}</span>
                  </div>

                  <div className="ledger-total" style={{ border: 'none', paddingTop: 0 }}>
                    <span>
                      {r.kind === 'ORDER_PAYMENT'
                        ? 'Amount deducted'
                        : r.kind === 'ORDER_CANCELLATION_REFUND'
                          ? 'Refund amount'
                          : 'Amount added'}
                    </span>
                    <span className={r.kind === 'ORDER_PAYMENT' ? 'amount-out' : 'amount-in'}>
                      {r.kind === 'ORDER_PAYMENT' ? '-' : '+'}{formatINR(r.amount)}
                    </span>
                  </div>

                  <div className="ledger-row">
                    <span>Previous Balance</span>
                    <span>{formatINR(r.previousBalance)}</span>
                  </div>

                  {/* Top-ups carry no reason; a payment names its order and a
                      refund carries what the storeroom wrote. */}
                  {r.reason && (
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
          <div className="settings-grid wallet-settings-grid">
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

          </div>
        </div>
      )}
    </div>
  );
}
