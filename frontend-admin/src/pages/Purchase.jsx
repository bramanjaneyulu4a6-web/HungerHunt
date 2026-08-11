import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { Banner, Button, EmptyState, PageHeader, Skeleton } from "../components/ui";

const Purchase = () => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [suppliers, setSuppliers] = useState([]);
  const [supplierId, setSupplierId] = useState("");

  useEffect(() => {
    fetchProducts();
  }, []);

  useEffect(() => {
    api.get("/suppliers")
      .then((res) => setSuppliers(res.data))
      .catch((err) => console.error(err));
  }, []);

  const fetchProducts = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get("/products");
      setProducts(res.data.map((product) => ({ ...product, quantity: 0 })));
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const updateQuantity = (id, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product._id === id ? { ...product, quantity: Number(value) } : product
      )
    );
  };

  const createPurchase = async () => {
    const selectedItems = products
      .filter((p) => p.quantity > 0)
      .map((p) => ({ productId: p._id, quantity: p.quantity }));

    if (selectedItems.length === 0) {
      toast.error("Select at least one product with a quantity greater than 0");
      return;
    }

    setSubmitting(true);

    try {
      await api.post("/purchases", {
        items: selectedItems,
        ...(supplierId ? { supplierId } : {}),
      });
      toast.success("Purchase request created");
      setProducts((prev) => prev.map((p) => ({ ...p, quantity: 0 })));
    } catch (err) {
      console.error(err);
      toast.error("Failed to create purchase request");
    } finally {
      setSubmitting(false);
    }
  };

  const filteredProducts = products.filter((p) => {
    const query = searchQuery.toLowerCase().trim();
    // Without the empty-query guard, a product with no name returns undefined
    // here and vanishes from the list even when nothing is being searched.
    if (!query) return true;
    return p.name?.toLowerCase().includes(query);
  });

  return (
    <div className="page">
      <PageHeader
        title="Purchase Products"
        subtitle="Log inventory acquisitions and update stock quantities."
        actions={
          <Button onClick={createPurchase} disabled={submitting || loading}>
            {submitting ? "Processing…" : "Submit Purchase Order"}
          </Button>
        }
      />

      <div style={{ maxWidth: 420, marginBottom: 20 }}>
        <label className="field-label" htmlFor="po-supplier">
          Supplier
        </label>
        <select
          id="po-supplier"
          className="select"
          value={supplierId}
          onChange={(e) => setSupplierId(e.target.value)}
        >
          <option value="">— no supplier —</option>
          {suppliers.map((s) => (
            <option key={s._id} value={s._id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div style={{ marginBottom: 20 }}>
        <input
          type="search"
          className="input"
          aria-label="Search products"
          placeholder="🔍 Search products…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load the product catalog. Check your connection and{" "}
          <button type="button" className="link-button" onClick={fetchProducts}>
            try again
          </button>
          .
        </Banner>
      ) : filteredProducts.length === 0 ? (
        <EmptyState
          icon="📦"
          title={searchQuery.trim() ? "No matching products" : "No products yet"}
        >
          {searchQuery.trim()
            ? `Nothing matches "${searchQuery}".`
            : "Add products before logging a purchase."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack">
            <thead>
              <tr>
                <th>Product</th>
                <th>Stock Group</th>
                <th>Unit</th>
                <th style={{ width: 160 }}>Purchase Quantity</th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => (
                <tr
                  key={product._id}
                  style={{
                    background:
                      product.quantity > 0 ? "var(--success-bg)" : undefined,
                  }}
                >
                  <td data-label="Product">
                    <strong>{product.name}</strong>
                  </td>
                  <td data-label="Stock Group">
                    {product.stockGroup?.name || (
                      <span style={{ color: "var(--muted-soft)" }}>None</span>
                    )}
                  </td>
                  <td data-label="Unit">
                    {product.unit?.symbol || (
                      <span style={{ color: "var(--muted-soft)" }}>None</span>
                    )}
                  </td>
                  <td data-label="Quantity">
                    <input
                      type="number"
                      min="0"
                      /* Whole units only, because receipts are counted in
                         whole units: an order for 2.5 could never be
                         received to the end. The server refuses one too. */
                      step="1"
                      className="input"
                      style={{ width: 120, textAlign: "center" }}
                      aria-label={`Purchase quantity for ${product.name}`}
                      value={product.quantity}
                      onChange={(e) => updateQuantity(product._id, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <RefreshButton onRefresh={fetchProducts} loading={loading} />
    </div>
  );
};

export default Purchase;
