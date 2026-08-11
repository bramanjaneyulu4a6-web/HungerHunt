import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import toast from "react-hot-toast";
import api from "../utils/api";
import { Banner, Skeleton } from "../components/ui";

/* Raising an order from the storeroom: the person staring at the empty shelf
   acts on it. Stock is shown per product so "running low" is visible at the
   moment of ordering; the back office still pays the invoice. */
const NewOrder = () => {
  const navigate = useNavigate();
  const [products, setProducts] = useState([]);
  const [stockByProduct, setStockByProduct] = useState({});
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");
  const [quantities, setQuantities] = useState({});
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const [productsRes, suppliersRes, inventoryRes] = await Promise.all([
          api.get("/products"),
          api.get("/suppliers"),
          api.get("/inventory"),
        ]);
        setProducts(productsRes.data);
        setSuppliers(suppliersRes.data);
        const stock = {};
        for (const row of inventoryRes.data) {
          if (row.productId?._id) stock[row.productId._id] = row.stock;
        }
        setStockByProduct(stock);
      } catch (err) {
        console.error(err);
        setLoadError(true);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visible = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return products;
    return products.filter((p) => p.name?.toLowerCase().includes(q));
  }, [products, search]);

  const lineCount = Object.values(quantities).filter((q) => Number(q) > 0).length;

  const submit = async () => {
    const items = products
      .filter((p) => Number(quantities[p._id]) > 0)
      .map((p) => ({ productId: p._id, quantity: Number(quantities[p._id]) }));

    if (items.length === 0) {
      toast.error("Add a quantity to at least one product");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/purchases", { items, ...(supplierId ? { supplierId } : {}) });
      toast.success("Order raised — the office will see it too");
      navigate("/", { replace: true });
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Could not raise the order");
      setSubmitting(false);
    }
  };

  if (loadError) {
    return (
      <div className="wh-page">
        <Banner variant="alert" icon="⚠️">Could not load the catalogue.</Banner>
      </div>
    );
  }

  return (
    <div className="wh-page">
      <h1 className="wh-title">New order</h1>
      <p className="wh-subtitle">Current shelf count shown per product</p>

      <label className="wh-field-label" htmlFor="supplier">Supplier</label>
      <select
        id="supplier"
        className="wh-input"
        value={supplierId}
        onChange={(e) => setSupplierId(e.target.value)}
      >
        <option value="">— not chosen yet —</option>
        {suppliers.map((s) => (
          <option key={s._id} value={s._id}>{s.name}</option>
        ))}
      </select>

      <label className="wh-field-label" htmlFor="search">Find a product</label>
      <input
        id="search"
        className="wh-input"
        placeholder="Search the catalogue"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      {loading ? (
        <Skeleton height={220} radius={14} style={{ marginTop: 12 }} />
      ) : (
        <div className="wh-card" style={{ marginTop: 12 }}>
          {visible.map((product) => (
            <div key={product._id} className="wh-line-item">
              <div>
                <div className="wh-product">{product.name}</div>
                <div className="wh-remaining">
                  on shelf: <span className="wh-num">{stockByProduct[product._id] ?? 0}</span>
                </div>
              </div>
              <div className="wh-stepper" aria-label={`Order ${product.name}`}>
                <button
                  type="button"
                  disabled={!quantities[product._id]}
                  onClick={() =>
                    setQuantities((q) => ({ ...q, [product._id]: Math.max(0, Number(q[product._id] || 0) - 1) }))
                  }
                >−</button>
                <input
                  inputMode="numeric"
                  value={quantities[product._id] ?? ""}
                  placeholder="0"
                  onChange={(e) =>
                    setQuantities((q) => ({ ...q, [product._id]: e.target.value.replace(/\D/g, "") }))
                  }
                />
                <button
                  type="button"
                  onClick={() =>
                    setQuantities((q) => ({ ...q, [product._id]: Number(q[product._id] || 0) + 1 }))
                  }
                >+</button>
              </div>
            </div>
          ))}
          {visible.length === 0 && (
            <p className="wh-remaining" style={{ padding: 12 }}>Nothing matches that search.</p>
          )}
        </div>
      )}

      <button type="button" className="wh-cta" disabled={submitting || lineCount === 0} onClick={submit}>
        {submitting ? "Raising…" : `Raise order${lineCount ? ` · ${lineCount} line${lineCount === 1 ? "" : "s"}` : ""}`}
      </button>
    </div>
  );
};

export default NewOrder;
