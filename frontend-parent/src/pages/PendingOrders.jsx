import { useEffect, useState } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { formatINR } from '../utils/format';
import {
  AnimateIn,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from '../components/ui';
import Icon from '../components/Icon';

const ListSkeleton = () => (
  <>
    {[0, 1].map((i) => (
      <Card key={i} style={{ marginBottom: 16 }}>
        <Skeleton width="45%" height={20} />
        <Skeleton width="65%" height={13} style={{ marginTop: 10 }} />
        <Skeleton height={44} radius="var(--radius)" style={{ marginTop: 20 }} />
      </Card>
    ))}
  </>
);

const quantitiesOf = (order) =>
  Object.fromEntries(order.items.map((item) => [String(item.productId), item.quantity]));

// A parent may take lines off an order but not add to it, so the quantity the
// till rang up is the ceiling. Kept here as well as enforced on the server, so
// the button greys out rather than the save failing.
const draftFor = (drafts, order) => drafts[order._id] ?? quantitiesOf(order);

const isEdited = (drafts, order) => {
  const draft = draftFor(drafts, order);
  return order.items.some((item) => draft[String(item.productId)] !== item.quantity);
};

const draftTotal = (drafts, order) => {
  const draft = draftFor(drafts, order);
  return order.items.reduce(
    (sum, item) => sum + item.price * (draft[String(item.productId)] ?? 0),
    0
  );
};

const formatExpiry = (value) =>
  new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));

export default function PendingOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Edits the parent has made but not saved, keyed by order and product.
  const [drafts, setDrafts] = useState({});

  // Which order is mid-request, and which is asking "are you sure".
  const [busyId, setBusyId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [notice, setNotice] = useState('');

  const [attempt, setAttempt] = useState(0);
  const reload = () => {
    setLoading(true);
    setAttempt((n) => n + 1);
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const res = await API.get('/pending-orders/parent');
        if (ignore) return;

        setOrders(res.data.orders || []);
        setDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([orderId]) =>
              (res.data.orders || []).some((order) => order._id === orderId)
            )
          )
        );
        setError('');
      } catch (err) {
        if (ignore) return;

        setError(
          err.response?.data?.message ||
            "Couldn't load your approval requests. Check your connection."
        );
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    load();

    // A request is raised at the counter while the parent is holding the phone,
    // so this list is only right if it follows the notification that announces
    // it — and if it catches up when the app comes back to the foreground.
    window.addEventListener(PUSH_EVENT, load);
    window.addEventListener('focus', load);

    return () => {
      ignore = true;
      window.removeEventListener(PUSH_EVENT, load);
      window.removeEventListener('focus', load);
    };
  }, [attempt]);

  const setQuantity = (order, productId, quantity) =>
    setDrafts((prev) => ({
      ...prev,
      [order._id]: { ...draftFor(prev, order), [String(productId)]: quantity },
    }));

  const discardDraft = (orderId) =>
    setDrafts((prev) =>
      Object.fromEntries(Object.entries(prev).filter(([key]) => key !== orderId))
    );

  // Every action here ends the same way: report what happened, drop any draft,
  // and reload, because the answer changes what is still open.
  const run = async (order, request, success) => {
    setBusyId(order._id);
    setConfirming(null);
    setError('');
    setNotice('');

    try {
      await request();
      discardDraft(order._id);
      setNotice(success);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'That did not go through. Please try again.');
    } finally {
      setBusyId(null);
    }
  };

  const saveEdits = (order) => {
    const draft = draftFor(drafts, order);

    return run(
      order,
      () =>
        API.put(`/pending-orders/${order._id}`, {
          items: order.items.map((item) => ({
            productId: item.productId,
            quantity: draft[String(item.productId)] ?? 0,
          })),
        }),
      'Order updated.'
    );
  };

  const approve = (order) =>
    run(
      order,
      () => API.post(`/pending-orders/${order._id}/approve`),
      'Approved. The amount has been taken from the wallet.'
    );

  const decline = (order) =>
    run(order, () => API.post(`/pending-orders/${order._id}/reject`), 'Request declined.');

  return (
    <div className="page">
      <PageHeader
        title="Approval Requests"
        subtitle="Review, adjust and approve kiosk orders before any money leaves the wallet."
      />

      {notice && (
        <Banner variant="success" icon="✅" style={{ marginBottom: 20 }}>
          {notice}
        </Banner>
      )}

      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
          {error}{' '}
          <button type="button" className="link-button" onClick={reload}>
            Try again
          </button>
        </Banner>
      )}

      {loading && <ListSkeleton />}

      {!loading && orders.length === 0 && (
        <EmptyState icon="✅" title="Nothing waiting">
          When a purchase needs your approval it will appear here, and you will
          get a notification.
        </EmptyState>
      )}

      {!loading &&
        orders.map((order, i) => {
          const student = order.studentId || {};
          const draft = draftFor(drafts, order);
          const total = draftTotal(drafts, order);
          const edited = isEdited(drafts, order);
          const busy = busyId === order._id;
          const empty = total === 0;
          const insufficient = total > Number(student.pocketMoney || 0);

          return (
            <AnimateIn key={order._id} index={i}>
              <Card className={`pending-card${busy ? ' pending-card--busy' : ''}`} aria-busy={busy}>
                <div className="pending-head">
                  <div>
                    <h2 className="card-title">{student.name || 'Your child'}</h2>
                    <p className="card-meta">
                      Grade {student.grade || '—'} · Room {student.hostelNumber || '—'}
                    </p>
                    <p className="pending-expiry">
                      <Icon name="clock" size={14} /> Expires {formatExpiry(order.expiresAt)}
                    </p>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <p className="stat-label">Wallet Balance</p>
                    <p className="stat-value" style={{ fontSize: 20 }}>
                      {formatINR(student.pocketMoney || 0)}
                    </p>
                  </div>
                </div>

                <ul style={{ listStyle: 'none', padding: 0, margin: '20px 0 0' }}>
                  {order.items.map((item) => {
                    const id = String(item.productId);
                    const quantity = draft[id] ?? 0;

                    return (
                      <li key={id} className="ledger-row">
                        <span style={{ color: quantity === 0 ? 'var(--muted-soft)' : undefined }}>
                          {item.name}
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 12,
                              color: 'var(--muted-soft)',
                            }}
                          >
                            {formatINR(item.price)} each
                          </span>
                        </span>

                        <span className="quantity-control">
                          <Button
                            variant="ghost"
                            aria-label={`One fewer ${item.name}`}
                            disabled={busy || quantity === 0}
                            onClick={() => setQuantity(order, item.productId, quantity - 1)}
                          >
                            <Icon name="minus" size={16} />
                          </Button>

                          <output aria-label={`${item.name} quantity`}>
                            {quantity}
                          </output>

                          <Button
                            variant="ghost"
                            aria-label={`One more ${item.name}`}
                            disabled={busy || quantity >= item.quantity}
                            onClick={() => setQuantity(order, item.productId, quantity + 1)}
                          >
                            <Icon name="plus" size={16} />
                          </Button>
                        </span>
                      </li>
                    );
                  })}
                </ul>

                <div className="ledger-total">
                  <span>Total</span>
                  <span className="amount-out">{formatINR(total)}</span>
                </div>

                <p className="card-meta" style={{ marginTop: 12 }}>
                  Until this is answered or expires, {student.name || 'your child'} cannot place another kiosk order.
                </p>

                {empty && (
                  <Banner variant="warn" icon="⚠️" style={{ marginTop: 16 }}>
                    Everything has been removed. Decline the request instead of
                    approving an empty order.
                  </Banner>
                )}

                {insufficient && !empty && (
                  <Banner variant="alert" icon="⚠️" className="insufficient-note">
                    This order is {formatINR(total - Number(student.pocketMoney || 0))} over the available balance. Reduce it before approving.
                  </Banner>
                )}

                {edited && !empty && (
                  <div className="pending-actions">
                    <Button block disabled={busy} onClick={() => saveEdits(order)}>
                      {busy ? 'Saving…' : 'Save changes'}
                    </Button>
                    <Button
                      variant="ghost"
                      block
                      disabled={busy}
                      onClick={() => discardDraft(order._id)}
                    >
                      Undo
                    </Button>
                  </div>
                )}

                {confirming?.id === order._id ? (
                  <div className="pending-confirm" style={{ display: 'block' }}>
                    <p style={{ fontSize: 14, color: 'var(--muted)', marginBottom: 12 }}>
                      {confirming.action === 'approve'
                        ? `This takes ${formatINR(total)} from ${student.name || 'your child'}'s wallet now.`
                        : 'The counter will not be paid and the order is cancelled.'}
                    </p>

                    <div className="pending-actions" style={{ marginTop: 0 }}>
                      <Button
                        variant={confirming.action === 'approve' ? 'dark' : 'alert'}
                        block
                        disabled={busy}
                        onClick={() =>
                          confirming.action === 'approve' ? approve(order) : decline(order)
                        }
                      >
                        {confirming.action === 'approve' ? 'Yes, approve' : 'Yes, decline'}
                      </Button>
                      <Button
                        variant="ghost"
                        block
                        disabled={busy}
                        onClick={() => setConfirming(null)}
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="pending-actions">
                    <Button
                      variant="dark"
                      block
                      disabled={busy || edited || empty || insufficient}
                      onClick={() => setConfirming({ id: order._id, action: 'approve' })}
                    >
                      {busy ? 'Working…' : `Approve ${formatINR(total)}`}
                    </Button>
                    <Button
                      variant="alert"
                      block
                      disabled={busy}
                      onClick={() => setConfirming({ id: order._id, action: 'decline' })}
                    >
                      Decline
                    </Button>
                  </div>
                )}

                {edited && !empty && (
                  <p className="card-meta" style={{ marginTop: 12 }}>
                    Save your changes before approving, so you approve the amount
                    you will actually be charged.
                  </p>
                )}
              </Card>
            </AnimateIn>
          );
        })}
    </div>
  );
}
