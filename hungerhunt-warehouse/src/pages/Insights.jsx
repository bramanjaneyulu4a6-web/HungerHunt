import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const Insights = () => {
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [error, setError] = useState(false);
  const [drafting, setDrafting] = useState(false);

  const createDraft = async () => {
    setDrafting(true);
    try {
      const response = await api.post("/v1/replenishment-drafts");
      if (!response.data.data.items.length) {
        toast.success("No replenishment is needed after open orders are counted");
        return;
      }
      navigate("/new-order", { state: { replenishmentDraft: response.data.data } });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Could not create a replenishment draft");
    } finally {
      setDrafting(false);
    }
  };

  const load = useCallback(async () => {
    setError(false);
    try {
      const response = await api.get("/v1/analytics/inventory");
      setReport(response.data.data);
    } catch (err) {
      console.error(err);
      setError(true);
    }
  }, []);

  useEffect(() => {
    const initial = setTimeout(load, 0);
    return () => clearTimeout(initial);
  }, [load]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Inventory insights</h1>
          <p className="wh-subtitle">Deterministic 30/60/90-day recommendations</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {error && <Banner variant="alert" icon="⚠️">Could not calculate analytics.</Banner>}
      {!report && !error ? (
        <Skeleton height={180} radius={14} />
      ) : report ? (
        <>
          <div className="wh-card wh-metric-grid">
            <div><strong>{report.summary.highVelocityCount}</strong><span>fast-moving</span></div>
            <div><strong>{report.summary.deadStockCount}</strong><span>dead stock</span></div>
            <div><strong>{report.summary.reorderNowCount}</strong><span>reorder now</span></div>
            <div><strong>{report.summary.costOverrunFlagCount}</strong><span>batch flags</span></div>
          </div>
          {report.summary.reorderNowCount > 0 && (
            <button type="button" className="wh-cta" disabled={drafting} onClick={createDraft}>
              {drafting ? "Building draft…" : "Create editable replenishment draft"}
            </button>
          )}
          {report.items.filter((item) => item.reorder.reorderNow || item.costOverrun.flagged).map((item) => (
            <div className="wh-card" key={item.productId}>
              <div className="wh-row">
                <span className="wh-product">{item.productName}</span>
                <span className="wh-badge wh-badge--new">{item.velocity.classification.replaceAll("_", " ")}</span>
              </div>
              <p className="wh-remaining">
                Stock {item.currentStock} · suggested reorder point {item.reorder.suggestedReorderPoint}
                {item.reorder.recommendedOrderQuantityEoq
                  ? ` · EOQ ${item.reorder.recommendedOrderQuantityEoq}`
                  : ""}
              </p>
              {item.costOverrun.message && <p className="wh-remaining">{item.costOverrun.message}</p>}
            </div>
          ))}
          {!report.items.some((item) => item.reorder.reorderNow || item.costOverrun.flagged) && (
            <EmptyState icon="✓" title="No action flags">Stock levels and ordering batches look healthy.</EmptyState>
          )}
        </>
      ) : null}
    </div>
  );
};

export default Insights;
