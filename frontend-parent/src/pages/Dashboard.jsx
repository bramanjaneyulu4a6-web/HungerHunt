import { useEffect, useMemo, useRef, useState } from 'react';
import API from '../services/api';
import { PUSH_EVENT } from '../utils/events';
import { formatINR } from '../utils/format';
import { AnimateIn, Banner, Button, Card, EmptyState, Skeleton } from '../components/ui';
import Icon from '../components/Icon';

const quantitiesOf = (order) =>
  Object.fromEntries(
    order.items.map((item) => [String(item.productId), item.quantity])
  );

const draftFor = (drafts, order) => drafts[order._id] ?? quantitiesOf(order);

const isEdited = (drafts, order) => {
  const draft = draftFor(drafts, order);
  return order.items.some(
    (item) => draft[String(item.productId)] !== item.quantity
  );
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

const DashboardSkeleton = () => (
  <div className="dashboard-shell">
    <Skeleton width={210} height={56} radius="16px" />
    <Skeleton width="55%" height={34} style={{ marginTop: 28 }} />
    <Skeleton width="38%" height={16} style={{ marginTop: 12 }} />
    {[0, 1].map((item) => (
      <Card key={item} className="pending-card" style={{ marginTop: 20 }}>
        <Skeleton width="42%" height={22} />
        <Skeleton width="65%" height={14} style={{ marginTop: 10 }} />
        <Skeleton height={54} style={{ marginTop: 24 }} />
      </Card>
    ))}
  </div>
);

function StudentPicker({ children, selectedId, onSelect }) {
  const [open, setOpen] = useState(false);
  const pickerRef = useRef(null);
  const selected = children.find((child) => child._id === selectedId);

  useEffect(() => {
    if (!open) return undefined;

    const closeOutside = (event) => {
      if (!pickerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', closeOutside);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOutside);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  const choose = (id) => {
    onSelect(id);
    setOpen(false);
  };

  return (
    <div className={`student-picker${open ? ' student-picker--open' : ''}`} ref={pickerRef}>
      <button
        type="button"
        className="student-picker-trigger"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="student-picker-avatar" aria-hidden="true">
          {selected ? selected.name?.charAt(0).toUpperCase() : <Icon name="user" size={20} />}
        </span>
        <span className="student-picker-copy">
          <small>Viewing</small>
          <b>{selected?.name || 'All students'}</b>
        </span>
        <span className="student-picker-chevron" aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="student-picker-menu" role="listbox" aria-label="Choose a student">
          <div className="student-picker-menu-head">
            <span>Choose student</span>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close student list">
              <Icon name="close" size={18} />
            </button>
          </div>

          <button
            type="button"
            role="option"
            aria-selected={!selectedId}
            className={`student-picker-option${!selectedId ? ' student-picker-option--active' : ''}`}
            onClick={() => choose('')}
          >
            <span className="student-picker-avatar student-picker-avatar--all" aria-hidden="true">
              <Icon name="user" size={19} />
            </span>
            <span><b>All students</b><small>See every pending approval</small></span>
            {!selectedId && <Icon name="check" size={18} />}
          </button>

          {children.map((child) => (
            <button
              type="button"
              role="option"
              aria-selected={selectedId === child._id}
              className={`student-picker-option${selectedId === child._id ? ' student-picker-option--active' : ''}`}
              key={child._id}
              onClick={() => choose(child._id)}
            >
              <span className="student-picker-avatar" aria-hidden="true">
                {child.name?.charAt(0).toUpperCase() || 'S'}
              </span>
              <span>
                <b>{child.name}</b>
                <small>Grade {child.grade || '—'} · {formatINR(child.pocketMoney || 0)}</small>
              </span>
              {selectedId === child._id && <Icon name="check" size={18} />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [children, setChildren] = useState([]);
  const [orders, setOrders] = useState([]);
  const [selectedId, setSelectedId] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState({});
  const [busyId, setBusyId] = useState(null);
  const [confirming, setConfirming] = useState(null);
  const [attempt, setAttempt] = useState(0);

  const reload = () => {
    setLoading(true);
    setAttempt((value) => value + 1);
  };

  useEffect(() => {
    let ignore = false;

    const load = async () => {
      try {
        const [dashboard, pending] = await Promise.all([
          API.get('/parent/dashboard'),
          API.get('/pending-orders/parent'),
        ]);
        if (ignore) return;

        const nextChildren = dashboard.data.children || [];
        const nextOrders = pending.data.orders || [];
        setChildren(nextChildren);
        setOrders(nextOrders);
        setSelectedId((current) =>
          current && !nextChildren.some((child) => child._id === current)
            ? ''
            : current
        );
        setDrafts((current) =>
          Object.fromEntries(
            Object.entries(current).filter(([orderId]) =>
              nextOrders.some((order) => order._id === orderId)
            )
          )
        );
        setError('');
      } catch (err) {
        if (ignore) return;
        setError(
          err.response?.data?.message ||
            "Couldn't load the family dashboard. Check your connection."
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

  const selected = children.find((child) => child._id === selectedId);
  const visibleOrders = useMemo(
    () =>
      selectedId
        ? orders.filter((order) => String(order.studentId?._id) === selectedId)
        : orders,
    [orders, selectedId]
  );

  const setQuantity = (order, productId, quantity) =>
    setDrafts((previous) => ({
      ...previous,
      [order._id]: {
        ...draftFor(previous, order),
        [String(productId)]: quantity,
      },
    }));

  const discardDraft = (orderId) =>
    setDrafts((previous) =>
      Object.fromEntries(
        Object.entries(previous).filter(([key]) => key !== orderId)
      )
    );

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
      'Approved. The wallet has been charged.'
    );

  const decline = (order) =>
    run(order, () => API.post(`/pending-orders/${order._id}/reject`), 'Request declined.');

  if (loading) return <div className="page"><DashboardSkeleton /></div>;

  return (
    <div className="page dashboard-page">
      <section className="dashboard-hero">
        <StudentPicker children={children} selectedId={selectedId} onSelect={setSelectedId} />

        <div className="dashboard-heading">
          <p className="dashboard-eyebrow">Family dashboard</p>
          <h1>{selected ? `${selected.name}'s approvals` : 'Pending approvals'}</h1>
          <p>
            {selected
              ? `Review purchases waiting for your approval for ${selected.name}.`
              : 'Review purchases waiting for your approval across all students.'}
          </p>
        </div>

        <div className="dashboard-summary">
          <span><b>{visibleOrders.length}</b> waiting</span>
          <span><b>{children.length}</b> {children.length === 1 ? 'student' : 'students'}</span>
          {selected && (
            <Button variant="ghost" to={`/child/${selected._id}`}>
              View account <Icon name="chevronRight" size={16} />
            </Button>
          )}
        </div>
      </section>

      {notice && <Banner variant="success" icon="✅" style={{ marginBottom: 20 }}>{notice}</Banner>}
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
          {error}{' '}<button type="button" className="link-button" onClick={reload}>Try again</button>
        </Banner>
      )}

      {!error && children.length === 0 && (
        <EmptyState icon="🎒" title="No students linked yet">
          No student records match this parent account. Contact the school office to link them.
        </EmptyState>
      )}

      {!error && children.length > 0 && visibleOrders.length === 0 && (
        <EmptyState icon="✅" title={selected ? `Nothing waiting for ${selected.name}` : 'All caught up'} action={
          selected ? <Button variant="ghost" to={`/child/${selected._id}`}>View {selected.name}'s account</Button> : null
        }>
          {selected
            ? 'There are no purchases waiting for your approval for this student.'
            : 'There are no pending purchase approvals for any linked student.'}
        </EmptyState>
      )}

      {!error && visibleOrders.map((order, index) => {
        const student = order.studentId || {};
        const draft = draftFor(drafts, order);
        const total = draftTotal(drafts, order);
        const edited = isEdited(drafts, order);
        const busy = busyId === order._id;
        const empty = total === 0;
        const insufficient = total > Number(student.pocketMoney || 0);

        return (
          <AnimateIn key={order._id} index={index}>
            <Card className={`pending-card${busy ? ' pending-card--busy' : ''}`} aria-busy={busy}>
              <div className="pending-head">
                <button type="button" className="pending-student" onClick={() => setSelectedId(student._id)}>
                  <span className="student-avatar" aria-hidden="true">{student.name?.charAt(0).toUpperCase() || 'S'}</span>
                  <span><b>{student.name || 'Your child'}</b><small>Grade {student.grade || '—'} · Room {student.hostelNumber || '—'}</small></span>
                </button>
                <div className="pending-balance"><small>Wallet</small><b>{formatINR(student.pocketMoney || 0)}</b></div>
              </div>

              <p className="pending-expiry"><Icon name="clock" size={14} /> Expires {formatExpiry(order.expiresAt)}</p>

              <ul className="pending-items">
                {order.items.map((item) => {
                  const itemId = String(item.productId);
                  const quantity = draft[itemId] ?? 0;
                  return (
                    <li key={itemId} className="ledger-row">
                      <span className={quantity === 0 ? 'pending-item--removed' : ''}>
                        {item.name}<small>{formatINR(item.price)} each</small>
                      </span>
                      <span className="quantity-control">
                        <Button variant="ghost" aria-label={`One fewer ${item.name}`} disabled={busy || quantity === 0} onClick={() => setQuantity(order, item.productId, quantity - 1)}><Icon name="minus" size={16} /></Button>
                        <output aria-label={`${item.name} quantity`}>{quantity}</output>
                        <Button variant="ghost" aria-label={`One more ${item.name}`} disabled={busy || quantity >= item.quantity} onClick={() => setQuantity(order, item.productId, quantity + 1)}><Icon name="plus" size={16} /></Button>
                      </span>
                    </li>
                  );
                })}
              </ul>

              <div className="ledger-total"><span>Order total</span><span className="amount-out">{formatINR(total)}</span></div>

              {empty && <Banner variant="warn" icon="⚠️" style={{ marginTop: 14 }}>Everything has been removed. Decline this request instead.</Banner>}
              {insufficient && !empty && <Banner variant="alert" icon="⚠️" className="insufficient-note">This order is {formatINR(total - Number(student.pocketMoney || 0))} over the available balance.</Banner>}

              {edited && !empty && (
                <div className="pending-actions">
                  <Button block disabled={busy} onClick={() => saveEdits(order)}>{busy ? 'Saving…' : 'Save changes'}</Button>
                  <Button variant="ghost" block disabled={busy} onClick={() => discardDraft(order._id)}>Undo</Button>
                </div>
              )}

              {confirming?.id === order._id ? (
                <div className="pending-confirm-copy">
                  <p>{confirming.action === 'approve' ? `Charge ${formatINR(total)} from ${student.name || 'this student'}'s wallet now?` : 'Decline this request? The kiosk order will be cancelled.'}</p>
                  <div className="pending-actions">
                    <Button variant={confirming.action === 'approve' ? 'dark' : 'alert'} block disabled={busy} onClick={() => confirming.action === 'approve' ? approve(order) : decline(order)}>{confirming.action === 'approve' ? 'Yes, approve' : 'Yes, decline'}</Button>
                    <Button variant="ghost" block disabled={busy} onClick={() => setConfirming(null)}>Cancel</Button>
                  </div>
                </div>
              ) : (
                <div className="pending-actions">
                  <Button variant="dark" block disabled={busy || edited || empty || insufficient} onClick={() => setConfirming({ id: order._id, action: 'approve' })}>{busy ? 'Working…' : `Approve ${formatINR(total)}`}</Button>
                  <Button variant="alert" block disabled={busy} onClick={() => setConfirming({ id: order._id, action: 'decline' })}>Decline</Button>
                </div>
              )}
            </Card>
          </AnimateIn>
        );
      })}
    </div>
  );
}
