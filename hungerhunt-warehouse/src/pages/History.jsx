import { useCallback, useEffect, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const unitsIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.received || 0), 0);

const damagedIn = (receipt) =>
  receipt.lines.reduce((sum, line) => sum + (line.damaged || 0), 0);

const History = () => {
  const [receipts, setReceipts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/receipts");
      setReceipts(res.data);
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
          <h1 className="wh-title">History</h1>
          <p className="wh-subtitle">The last deliveries booked, newest first</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      {loadError && <Banner variant="alert" icon="⚠️">Could not load the logbook.</Banner>}

      {loading ? (
        <Skeleton height={260} radius={14} />
      ) : receipts.length === 0 && !loadError ? (
        <EmptyState icon="🧾" title="No deliveries yet">
          Booked deliveries appear here with who received them.
        </EmptyState>
      ) : (
        receipts.map((receipt) => (
          <div key={receipt._id} className="wh-card">
            <div className="wh-row">
              <span className="wh-product">
                {receipt.purchaseId?.supplierId?.name || "No supplier recorded"}
              </span>
              {damagedIn(receipt) > 0 && (
                <span className="wh-badge wh-badge--short">
                  {damagedIn(receipt)} damaged
                </span>
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
      )}
    </div>
  );
};

export default History;
