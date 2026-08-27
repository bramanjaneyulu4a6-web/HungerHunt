import { useCallback, useEffect, useMemo, useState } from "react";
import toast from "react-hot-toast";

import RefreshButton from "../components/RefreshButton";
import ProductThumb from "../components/ProductThumb";
import { Banner, EmptyState, Skeleton } from "../components/ui";
import api from "../utils/api";
import { formatINR } from "../utils/format";

/* The first screen of the shift: what students and parents have paid for and
   are waiting on. Each card is one package and offers exactly one next step,
   so the job reads as a queue rather than a form. */

/* The shift ends at the hostel door. Handing the package to the caretaker is
   the warehouse's last act on it, and it is the one that asks a question:
   who took it. What happens after — the student turning up for it — is the
   caretaker's screen, and nothing here can close a package on their behalf. */
const ACTIONS = {
  PENDING: { status: "PACKED", label: "Mark packed" },
  PACKED: { status: "OUT_FOR_DELIVERY", label: "Send to dorm" },
  OUT_FOR_DELIVERY: { status: "DELIVERED", label: "Handed to caretaker" },
};

const VIEWS = [
  ["active", "Active"],
  ["alerts", "Overdue"],
  ["history", "History"],
  ["report", "Report"],
];

const dateOnly = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const initialRange = () => {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 29);
  return { from: dateOnly(from), to: dateOnly(to) };
};

const deadlineText = (deliverBy, asOf) => {
  const date = new Date(deliverBy);
  const overdue = date.getTime() < asOf;
  return `${overdue ? "Overdue since" : "Deliver by"} ${date.toLocaleString()}`;
};

const formatPhone = (value) => {
  const digits = String(value || "").replace(/\D/g, "");
  return digits.length === 10 ? `${digits.slice(0, 5)} ${digits.slice(5)}` : value;
};

const Orders = () => {
  const range = initialRange();
  const [view, setView] = useState("active");
  const [orders, setOrders] = useState([]);
  const [images, setImages] = useState(() => new Map());
  const [alertMeta, setAlertMeta] = useState(null);
  const [report, setReport] = useState(null);
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [asOf, setAsOf] = useState(0);
  const [handoff, setHandoff] = useState(null);

  /* A package line stores the name and price it was sold at, never a picture —
     that would freeze a photo into a financial record. The catalogue is asked
     once for the pictures instead, and a package whose product has since been
     deleted simply falls back to its letter tile. */
  useEffect(() => {
    (async () => {
      try {
        const response = await api.get("/products");
        setImages(
          new Map(response.data.map((product) => [String(product._id), product.image || ""]))
        );
      } catch (error) {
        console.error(error);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (view === "active") {
        const response = await api.get("/v1/fulfillment-orders");
        setOrders(response.data.data || []);
      } else if (view === "alerts") {
        const response = await api.get("/v1/fulfillment-orders/alerts");
        setOrders(response.data.data || []);
        setAlertMeta(response.data.meta || null);
      } else if (view === "history") {
        const response = await api.get(
          `/v1/fulfillment-orders/history?from=${from}&to=${to}&limit=100`
        );
        setOrders(response.data.data || []);
      } else {
        const response = await api.get(
          `/v1/fulfillment-orders/report?from=${from}&to=${to}`
        );
        setReport(response.data.data || null);
      }
      setAsOf(Date.now());
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to, view]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const advance = async (order) => {
    const action = ACTIONS[order.status];
    if (!action) return;

    if (action.status === "DELIVERED") {
      setHandoff({ order, receivedBy: "", receiverPhone: "", error: "" });
      return;
    }

    setBusyId(order.id);
    try {
      await api.post(`/v1/fulfillment-orders/${order.id}/transition`, {
        status: action.status,
      });
      toast.success(
        action.status === "OUT_FOR_DELIVERY"
          ? "Package sent to caretaker"
          : "Package updated"
      );
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not update this package");
    } finally {
      setBusyId(null);
    }
  };

  const submitHandoff = async (event) => {
    event.preventDefault();
    if (!handoff) return;

    const receivedBy = handoff.receivedBy.trim();
    const receiverPhone = handoff.receiverPhone.replace(/\D/g, "");
    if (receivedBy.length < 2) {
      setHandoff((current) => ({ ...current, error: "Enter the receiver's name." }));
      return;
    }
    if (receiverPhone.length !== 10) {
      setHandoff((current) => ({ ...current, error: "Enter a valid 10-digit phone number." }));
      return;
    }

    setBusyId(handoff.order.id);
    setHandoff((current) => ({ ...current, error: "" }));
    try {
      await api.post(`/v1/fulfillment-orders/${handoff.order.id}/transition`, {
        status: "DELIVERED",
        receivedBy,
        receiverPhone,
      });
      toast.success(`Handed to ${receivedBy} · the student collects it with their code`);
      setHandoff(null);
      await load();
    } catch (error) {
      console.error(error);
      setHandoff((current) => current ? {
        ...current,
        error: error.response?.data?.message || "Could not record this handoff.",
      } : current);
    } finally {
      setBusyId(null);
    }
  };

  const acknowledge = async (order) => {
    const note = window.prompt(
      "Add an optional follow-up note. This alert will return in 12 hours if the package is still overdue.",
      ""
    );
    if (note === null) return;

    setBusyId(order.id);
    try {
      await api.post(`/v1/fulfillment-orders/${order.id}/alerts/acknowledge`, { note });
      toast.success("Alert acknowledged for 12 hours");
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not acknowledge this alert");
    } finally {
      setBusyId(null);
    }
  };

  const cancel = async (order) => {
    const reason = window.prompt(
      "Why is this paid package being cancelled? Its wallet and stock will be restored.",
      ""
    )?.trim();
    if (!reason || !window.confirm("Cancel this package and refund the student's wallet now?")) return;

    setBusyId(order.id);
    try {
      const idempotencyKey = globalThis.crypto?.randomUUID?.() || `cancel-${order.id}-${Date.now()}`;
      const response = await api.post(
        `/v1/fulfillment-orders/${order.id}/transition`,
        { status: "CANCELLED", reason },
        { headers: { "Idempotency-Key": idempotencyKey } }
      );
      toast.success(`Package cancelled · ${formatINR(response.data.data.reversal.amount)} refunded`);
      await load();
    } catch (error) {
      console.error(error);
      toast.error(error.response?.data?.message || "Could not cancel this package");
    } finally {
      setBusyId(null);
    }
  };

  const orderCard = (order, { showActions = false, showAcknowledge = false } = {}) => {
    const action = ACTIONS[order.status];
    const overdue = new Date(order.deliverBy).getTime() < asOf &&
      !["DELIVERED", "COLLECTED", "CANCELLED"].includes(order.status);

    return (
      <article key={order.id} className="wh-card wh-order">
        <div className="wh-row">
          <div>
            <span className="wh-who">{order.student.name}</span>
            <p className="wh-remaining" style={{ margin: "4px 0 0" }}>
              Room {order.student.hostelNumber} · {order.student.admissionNumber || "No admission number"}
            </p>
          </div>
          <span className={`wh-badge wh-badge--${overdue ? "short" : order.status === "PENDING" ? "new" : "partial"}`}>
            {order.status.replaceAll("_", " ")}
          </span>
        </div>

        <div className="wh-summary wh-summary--lines">
          {order.items.map((item) => (
            <div key={item.productId || item.name} className="wh-order-line">
              <ProductThumb
                src={images.get(String(item.productId))}
                name={item.name}
                size={44}
              />
              <span className="wh-order-line-name">{item.name}</span>
              <span className="wh-order-line-qty wh-num">×{item.quantity}</span>
              <strong>{formatINR(item.price * item.quantity)}</strong>
            </div>
          ))}
          <div className="wh-row wh-order-total">
            <span>Total paid</span><strong>{formatINR(order.totalAmount)}</strong>
          </div>
        </div>

        <p className="wh-remaining" style={{ color: overdue ? "var(--wh-red)" : undefined }}>
          {order.collectedAt
            ? `Collected by the student ${new Date(order.collectedAt).toLocaleString()}`
            : order.deliveredAt
              ? `Handed over ${new Date(order.deliveredAt).toLocaleString()}`
              : deadlineText(order.deliverBy, asOf)}
        </p>
        {order.proofOfDelivery?.receivedBy && (
          <p className="wh-remaining">
            Handed to {order.proofOfDelivery.receivedBy}
            {order.proofOfDelivery.receiverPhone
              ? ` · ${formatPhone(order.proofOfDelivery.receiverPhone)}`
              : ""}
          </p>
        )}
        {showAcknowledge && (
          <button type="button" className="wh-cta" disabled={busyId === order.id} onClick={() => acknowledge(order)}>
            {busyId === order.id ? "Saving…" : "Acknowledge for 12 hours"}
          </button>
        )}
        {showActions && action && (
          <div>
            <button type="button" className="wh-cta" disabled={busyId === order.id} onClick={() => advance(order)}>
              {busyId === order.id ? "Updating…" : action.label}
            </button>
            {["PENDING", "PACKED"].includes(order.status) && (
              <button type="button" className="wh-cancel" disabled={busyId === order.id} onClick={() => cancel(order)}>
                Cancel and refund
              </button>
            )}
          </div>
        )}
      </article>
    );
  };

  const reportView = report && (
    <>
      <div className="wh-card wh-metric-grid">
        <div><strong>{report.summary.packages}</strong><span>Packages ordered</span></div>
        <div><strong>{report.summary.openOverdue}</strong><span>Currently overdue</span></div>
        <div><strong>{report.delivery.delivered}</strong><span>Delivered</span></div>
        <div><strong>{report.delivery.awaitingCollection}</strong><span>Waiting at hostels</span></div>
        <div>
          <strong>{report.delivery.onTimeRate === null ? "—" : `${Math.round(report.delivery.onTimeRate * 100)}%`}</strong>
          <span>Delivered on time</span>
        </div>
      </div>
      <div className="wh-card">
        <h2 className="wh-product">Cycle time</h2>
        <div className="wh-summary">
          <div className="wh-row"><span>Order to packing</span><strong>{report.durations.orderToPack.medianHours ?? "—"} h median</strong></div>
          <div className="wh-row"><span>Order to delivery</span><strong>{report.durations.orderToDeliver.medianHours ?? "—"} h median</strong></div>
          <div className="wh-row"><span>Receiver proof recorded</span><strong>{report.proofOfDelivery.recorded}/{report.delivery.delivered}</strong></div>
        </div>
      </div>
    </>
  );

  const waiting = useMemo(
    () => (view === "active" ? orders.filter((order) => order.status === "PENDING").length : 0),
    [orders, view]
  );

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Orders</h1>
          <p className="wh-subtitle">
            {view === "active" && waiting > 0
              ? `${waiting} still to pack · deliver within 48 hours`
              : "Paid student orders to pack and dispatch"}
          </p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      <div className="wh-view-tabs" role="tablist" aria-label="Package views">
        {VIEWS.map(([id, label]) => (
          <button key={id} type="button" role="tab" aria-selected={view === id}
            className={view === id ? "active" : ""} onClick={() => setView(id)}>
            {label}
          </button>
        ))}
      </div>

      {["history", "report"].includes(view) && (
        <div className="wh-date-range">
          <label>From<input className="wh-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
          <label>To<input className="wh-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
        </div>
      )}

      {view === "alerts" && alertMeta?.acknowledgedCount > 0 && (
        <Banner>{alertMeta.acknowledgedCount} overdue alert(s) are acknowledged and will return after the 12-hour snooze.</Banner>
      )}
      {loadError && <Banner variant="alert" icon="⚠️">Could not load this package view.</Banner>}

      {loading ? (
        <Skeleton height={260} radius={14} />
      ) : view === "report" ? (
        reportView
      ) : orders.length === 0 && !loadError ? (
        <EmptyState
          icon={["active", "alerts"].includes(view) ? "✓" : "📦"}
          title={view === "active" ? "You're all caught up" : view === "alerts" ? "No overdue packages need attention" : "No package history found"}
          variant={["active", "alerts"].includes(view) ? "success" : "default"}
        >
          {view === "active"
            ? "No paid orders are waiting to be packed or dispatched. New orders will appear here automatically."
            : view === "alerts"
              ? "Every overdue alert has been handled. Acknowledged alerts return after their snooze period."
              : "Try another date range or check back after an order is completed."}
        </EmptyState>
      ) : (
        orders.map((order) => orderCard(order, {
          showActions: view === "active",
          showAcknowledge: view === "alerts",
        }))
      )}

      {handoff && (
        <div className="wh-handoff-backdrop" role="presentation">
          <form
            className="wh-handoff-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="handoff-title"
            onSubmit={submitHandoff}
          >
            <div className="wh-handoff-heading">
              <span className="wh-handoff-mark" aria-hidden="true">✓</span>
              <div>
                <p className="wh-handoff-kicker">Final delivery step</p>
                <h2 id="handoff-title">Who received the package?</h2>
              </div>
            </div>

            <div className="wh-handoff-package">
              <div>
                <span>Student</span>
                <strong>{handoff.order.student.name}</strong>
              </div>
              <div>
                <span>Hostel</span>
                <strong>{handoff.order.student.hostelNumber}</strong>
              </div>
            </div>

            <p className="wh-handoff-copy">
              Record the caretaker who accepted this package so the handoff can be traced later.
            </p>

            {handoff.error && <div className="wh-handoff-error" role="alert">{handoff.error}</div>}

            <label className="wh-handoff-field" htmlFor="receiver-name">
              <span>Receiver name</span>
              <input
                id="receiver-name"
                className="wh-input"
                type="text"
                value={handoff.receivedBy}
                maxLength={60}
                autoComplete="name"
                autoFocus
                placeholder="e.g. Meena, hostel caretaker"
                onChange={(event) => setHandoff((current) => ({
                  ...current,
                  receivedBy: event.target.value,
                  error: "",
                }))}
              />
            </label>

            <label className="wh-handoff-field" htmlFor="receiver-phone">
              <span>Phone number</span>
              <div className="wh-handoff-phone">
                <span aria-hidden="true">+91</span>
                <input
                  id="receiver-phone"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel"
                  value={handoff.receiverPhone}
                  maxLength={10}
                  placeholder="98765 43210"
                  onChange={(event) => setHandoff((current) => ({
                    ...current,
                    receiverPhone: event.target.value.replace(/\D/g, "").slice(0, 10),
                    error: "",
                  }))}
                />
              </div>
            </label>

            <div className="wh-handoff-actions">
              <button
                type="button"
                className="wh-handoff-cancel"
                disabled={busyId === handoff.order.id}
                onClick={() => setHandoff(null)}
              >
                Go back
              </button>
              <button
                type="submit"
                className="wh-handoff-submit"
                disabled={busyId === handoff.order.id}
              >
                {busyId === handoff.order.id ? "Recording…" : "Confirm handoff"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};

export default Orders;
