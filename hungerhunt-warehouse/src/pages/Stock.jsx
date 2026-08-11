import { useCallback, useEffect, useMemo, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, EmptyState, Skeleton } from "../components/ui";

const Stock = () => {
  const [rows, setRows] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await api.get("/inventory");
      setRows(res.data.filter((row) => row.productId));
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { (async () => { await load(); })(); }, [load]);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return rows;
    return rows.filter((row) => row.productId.name?.toLowerCase().includes(q));
  }, [rows, search]);

  return (
    <div className="wh-page">
      <div className="wh-row">
        <div>
          <h1 className="wh-title">Stock</h1>
          <p className="wh-subtitle">What is on the shelf right now — read-only</p>
        </div>
        <RefreshButton onRefresh={load} />
      </div>

      <input
        className="wh-input"
        placeholder="Search stock"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loadError && <Banner variant="alert" icon="⚠️">Could not load stock.</Banner>}

      {loading ? (
        <Skeleton height={260} radius={14} style={{ marginTop: 12 }} />
      ) : visible.length === 0 && !loadError ? (
        <EmptyState icon="📦" title="Nothing found">No stock rows match.</EmptyState>
      ) : (
        <div className="wh-card" style={{ marginTop: 12 }}>
          {visible.map((row) => (
            <div key={row._id} className="wh-line-item">
              <div className="wh-product">{row.productId.name}</div>
              <div
                className="wh-num"
                style={{ fontSize: 18, fontWeight: 800, color: row.stock === 0 ? "var(--wh-red)" : "var(--wh-ink)" }}
              >
                {row.stock}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Stock;
