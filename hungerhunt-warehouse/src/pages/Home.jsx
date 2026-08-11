import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const remainingUnits = (po) =>
  po.items.reduce((sum, item) => sum + Math.max(0, item.quantity - (item.received || 0)), 0);

const Home = () => {
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/purchases/open");
      setOrders(res.data);
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
        orders.map((po) => (
          <div
            key={po._id}
            className="wh-card wh-card--tappable"
            role="button"
            tabIndex={0}
            onClick={() => navigate(`/receive/${po._id}`)}
            onKeyDown={(e) => e.key === "Enter" && navigate(`/receive/${po._id}`)}
          >
            <div className="wh-row">
              <span className="wh-product">
                {po.supplierId?.name || "No supplier recorded"}
              </span>
              <span className={`wh-badge wh-badge--${po.status === "PARTIAL" ? "partial" : "new"}`}>
                {po.status === "PARTIAL" ? "PARTLY RECEIVED" : "NEW"}
              </span>
            </div>
            <p className="wh-remaining" style={{ margin: "6px 0 0" }}>
              {po.items.length} line{po.items.length === 1 ? "" : "s"} ·{" "}
              <span className="wh-num">{remainingUnits(po)}</span> units still to come ·
              raised {new Date(po.createdAt).toLocaleDateString()}
            </p>
          </div>
        ))
      )}
    </div>
  );
};

export default Home;
