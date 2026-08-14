import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../utils/api";
import Icon from "../components/Icon";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

/* The supplier side of the storeroom, which used to be two tabs: what has been
   ordered and is still owed, and what has already been booked in. They are the
   same story either side of a delivery, so they are one screen with two views.

   Coming is where a delivery gets received; Done is the logbook that proves it
   was. */

const VIEWS = [
  ["coming", "Coming"],
  ["done", "Done"],
];

const OPEN_STATUSES = ["PENDING_REVIEW", "APPROVED", "PARTIALLY_RECEIVED"];

const remainingUnits = (po) =>
  po.items.reduce(
    (sum, item) => sum + Math.max(0, item.quantity - (item.receivedQuantity || 0)),
    0
  );

const unitsIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.received || 0), 0);

const damagedIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.damaged || 0), 0);

const Purchases = () => {
  const navigate = useNavigate();
  const [view, setView] = useState("coming");
  const [orders, setOrders] = useState([]);
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      if (view === "coming") {
        const response = await api.get("/v1/purchase-orders");
        setOrders(
          response.data.data.filter((order) => OPEN_STATUSES.includes(order.status))
        );
      } else {
        const response = await api.get("/receipts");
        setReceipts(response.data);
      }
    } catch (error) {
      console.error(error);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [view]);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const comingView = orders.length === 0 && !loadError ? (
    <EmptyState icon="✓" title="You're all caught up" variant="success">
      No supplier deliveries are waiting to arrive. Raise a new request from Inventory when stock runs low.
    </EmptyState>
  ) : (
    orders.map((po) => {
      const receivable = ["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status);
      const open = () => receivable && navigate(`/purchases/receive/${po.id}`);

      return (
        <div
          key={po.id}
          className={`wh-card wh-po${receivable ? " wh-card--tappable" : " wh-po--waiting"}`}
          role={receivable ? "button" : undefined}
          tabIndex={receivable ? 0 : undefined}
          onClick={open}
          onKeyDown={(event) => event.key === "Enter" && open()}
        >
          <div className="wh-row">
            <span className="wh-who">{po.supplierName || "No supplier recorded"}</span>
            <span className={`wh-badge wh-badge--${po.status === "PARTIALLY_RECEIVED" ? "partial" : "new"}`}>
              {po.status === "PENDING_REVIEW" ? "AWAITING ACCOUNTS" : po.status.replaceAll("_", " ")}
            </span>
          </div>

          <div className="wh-po-foot">
            <p className="wh-remaining">
              {po.items.length} line{po.items.length === 1 ? "" : "s"} ·{" "}
              <span className="wh-num">{remainingUnits(po)}</span> units still to come ·
              raised {new Date(po.submittedAt).toLocaleDateString()}
            </p>
            {receivable ? (
              <span className="wh-po-go">
                It arrived <Icon name="chevronRight" size={18} />
              </span>
            ) : (
              <span className="wh-remaining">Accounts is checking this one</span>
            )}
          </div>
        </div>
      );
    })
  );

  const doneView = receipts.length === 0 && !loadError ? (
    <EmptyState icon="🧾" title="No delivery history yet">
      Received supplier deliveries will appear here with who booked them in.
    </EmptyState>
  ) : (
    receipts.map((receipt) => (
      <div key={receipt._id} className="wh-card">
        <div className="wh-row">
          <span className="wh-who">
            {receipt.purchaseId?.supplierId?.name || "No supplier recorded"}
          </span>
          {damagedIn(receipt) > 0 && (
            <span className="wh-badge wh-badge--short">{damagedIn(receipt)} damaged</span>
          )}
        </div>
        <p className="wh-remaining" style={{ margin: "6px 0 0" }}>
          <span className="wh-num">{unitsIn(receipt)}</span> units to the shelf
          {receipt.invoiceNumber && <> · inv {receipt.invoiceNumber}</>}
          {" "}· {new Date(receipt.createdAt).toLocaleString()}
          {" "}· by {receipt.receivedBy?.email || "unknown"}
        </p>
      </div>
    ))
  );

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Purchases</h1>
          <p className="wh-subtitle">
            {view === "coming"
              ? "Tap an order when its delivery arrives"
              : "The last deliveries booked, newest first"}
          </p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      <div className="wh-view-tabs" role="tablist" aria-label="Purchase views">
        {VIEWS.map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            className={view === id ? "active" : ""}
            onClick={() => setView(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {loadError && (
        <Banner variant="alert" icon="⚠️">
          Could not load {view === "coming" ? "orders" : "the logbook"}. Refresh to try again.
        </Banner>
      )}

      {loading ? (
        <>
          <Skeleton height={112} radius={14} style={{ marginBottom: 12 }} />
          <Skeleton height={112} radius={14} />
        </>
      ) : view === "coming" ? (
        comingView
      ) : (
        doneView
      )}
    </div>
  );
};

export default Purchases;
