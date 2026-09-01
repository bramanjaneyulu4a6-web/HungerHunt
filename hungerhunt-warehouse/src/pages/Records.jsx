import { useCallback, useEffect, useMemo, useState } from "react";

import { Banner, EmptyState, Skeleton } from "../components/ui";
import api from "../utils/api";
import { groupOrdersByBlock } from "../utils/orderGroups";

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

const STATUS_LABELS = {
  PENDING: "New",
  PACKED: "Packed",
  OUT_FOR_DELIVERY: "Out for delivery",
  DELIVERED: "Delivered",
  COLLECTED: "Collected",
  CANCELLED: "Cancelled",
};

const Records = () => {
  const range = initialRange();
  const [view, setView] = useState("history");
  const [from, setFrom] = useState(range.from);
  const [to, setTo] = useState(range.to);
  const [orders, setOrders] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (view === "history") {
        const response = await api.get(`/v1/fulfillment-orders/history?from=${from}&to=${to}&limit=100`);
        setOrders(response.data.data || []);
      } else {
        const response = await api.get(`/v1/fulfillment-orders/report?from=${from}&to=${to}`);
        setReport(response.data.data || null);
      }
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [from, to, view]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);
  const blocks = useMemo(() => groupOrdersByBlock(orders), [orders]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div><h1 className="wh-title">Records</h1><p className="wh-subtitle">Completed work and delivery performance</p></div>
      </div>

      <div className="wh-view-tabs" role="tablist" aria-label="Warehouse records">
        <button type="button" role="tab" aria-selected={view === "history"} className={view === "history" ? "active" : ""} onClick={() => setView("history")}>History</button>
        <button type="button" role="tab" aria-selected={view === "report"} className={view === "report" ? "active" : ""} onClick={() => setView("report")}>Reports</button>
      </div>

      <div className="wh-date-range">
        <label>From<input className="wh-input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} /></label>
        <label>To<input className="wh-input" type="date" value={to} onChange={(event) => setTo(event.target.value)} /></label>
      </div>

      {loadError && <Banner variant="alert" icon="⚠️">Could not load these records.</Banner>}
      {loading ? (
        <Skeleton height={300} radius={14} />
      ) : view === "history" ? (
        blocks.length === 0 && !loadError ? (
          <EmptyState icon="📦" title="No order history found">Try another date range.</EmptyState>
        ) : (
          <div className="wh-block-stacks wh-history-stacks">
            {blocks.map((block) => (
              <section key={block.key} className="wh-block-stack">
                <header className="wh-block-stack-head">
                  <div><span>{block.hostelCount} hostel{block.hostelCount === 1 ? "" : "s"}</span><h2>{block.label}</h2><small>{block.itemCount} items in this period</small></div>
                </header>
                <div className="wh-hostel-scroll">
                  {block.hostels.map((hostel) => {
                    const statuses = Object.entries(hostel.orders.reduce((counts, order) => ({
                      ...counts,
                      [order.status]: (counts[order.status] || 0) + 1,
                    }), {}));
                    return (
                      <article key={hostel.key} className="wh-hostel-tile wh-history-tile">
                        <div className="wh-hostel-tile-head">
                          <div><span className="wh-hostel-kicker">Hostel</span><h3>{hostel.hostelNumber}</h3></div>
                          <span className="wh-hostel-count"><strong>{hostel.itemCount}</strong><small>items</small></span>
                        </div>
                        <div className="wh-history-statuses">
                          {statuses.map(([status, count]) => <span key={status}><strong>{count}</strong> {STATUS_LABELS[status] || status}</span>)}
                        </div>
                      </article>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        )
      ) : report ? (
        <>
          <div className="wh-card wh-metric-grid">
            <div><strong>{report.summary.packages}</strong><span>Packages ordered</span></div>
            <div><strong>{report.summary.openOverdue}</strong><span>Currently overdue</span></div>
            <div><strong>{report.delivery.delivered}</strong><span>Delivered</span></div>
            <div><strong>{report.delivery.awaitingCollection}</strong><span>Waiting at hostels</span></div>
            <div><strong>{report.delivery.onTimeRate === null ? "—" : `${Math.round(report.delivery.onTimeRate * 100)}%`}</strong><span>Delivered on time</span></div>
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
      ) : null}
    </div>
  );
};

export default Records;
