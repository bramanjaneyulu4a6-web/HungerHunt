import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const remainingUnits = (po) =>
  po.items.reduce(
    (sum, item) =>
      sum + Math.max(0, item.quantity - (item.receivedQuantity || 0)),
    0
  );

const Home = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/v1/purchase-orders");
      setOrders(
        res.data.data.filter((order) =>
          ["PENDING_REVIEW", "APPROVED", "PARTIALLY_RECEIVED"].includes(order.status)
        )
      );
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Open orders</h1>
          <p className="wh-subtitle">Tap an order when its delivery arrives</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {loadError && (
        <Banner variant="alert" icon="⚠️">Could not load orders. Pull refresh to retry.</Banner>
      )}

      {loading ? (
        <>
          <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
          <Skeleton height={92} radius={14} style={{ marginBottom: 12 }} />
        </>
      ) : orders.length === 0 && !loadError ? (
        <EmptyState icon="📥" title="Nothing on the way">
          Every order has been fully received. Raise a new one from the New order tab.
        </EmptyState>
      ) : (
        orders.map((po) => {
          const receivable = ["APPROVED", "PARTIALLY_RECEIVED"].includes(po.status);
          return (
          <div
            key={po.id}
            className={`wh-card${receivable ? " wh-card--tappable" : ""}`}
            role={receivable ? "button" : undefined}
            tabIndex={receivable ? 0 : undefined}
            onClick={() => receivable && navigate(`/receive/${po.id}`)}
            onKeyDown={(e) =>
              receivable && e.key === "Enter" && navigate(`/receive/${po.id}`)
            }
          >
            <div className="wh-row">
              <span className="wh-product">
                {po.supplierName || "No supplier recorded"}
              </span>
              <span className={`wh-badge wh-badge--${po.status === "PARTIALLY_RECEIVED" ? "partial" : "new"}`}>
                {po.status === "PENDING_REVIEW"
                  ? "AWAITING ACCOUNTS"
                  : po.status.replaceAll("_", " ")}
              </span>
            </div>
            <p className="wh-remaining" style={{ margin: "6px 0 0" }}>
              {po.items.length} line{po.items.length === 1 ? "" : "s"} ·{" "}
              <span className="wh-num">{remainingUnits(po)}</span> units still to come ·
              raised {new Date(po.submittedAt).toLocaleDateString()}
            </p>
          </div>
          );
        })
      )}
    </div>
  );
};

export default Home;
