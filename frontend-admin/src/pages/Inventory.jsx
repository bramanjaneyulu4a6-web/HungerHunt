import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import { formatINR } from "../utils/format";
import {
  Badge,
  Banner,
  Button,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");
  const [saving, setSaving] = useState(false);
  const [editReorderLevel, setEditReorderLevel] = useState("");
  const [adjusting, setAdjusting] = useState(null); // inventory row being adjusted
  const [adjustDelta, setAdjustDelta] = useState("");
  const [adjustReason, setAdjustReason] = useState("");
  const [savingAdjust, setSavingAdjust] = useState(false);
  const [historyFor, setHistoryFor] = useState(null); // product whose ledger is open
  const [history, setHistory] = useState(null); // null = loading

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get("/inventory");
      setInventory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return item.productId?.name?.toLowerCase().includes(query);
  });

  const startEdit = (product) => {
    if (!product) return;
    setEditingProduct(product._id);
    setEditName(product.name || "");
    setEditPrice(product?.price ?? 0);
    setEditReorderLevel(product?.reorderLevel ?? 5);
  };

  const saveEdit = async (e) => {
    e.preventDefault();

    if (!editName.trim()) {
      toast.error("Product name can't be empty");
      return;
    }

    setSaving(true);

    try {
      const updatedPrice = parseFloat(editPrice);
      const level = parseInt(editReorderLevel, 10);
      await api.put(`/products/${editingProduct}`, {
        name: editName.trim(),
        price: isNaN(updatedPrice) ? 0 : updatedPrice,
        ...(isNaN(level) || level < 0 ? {} : { reorderLevel: level }),
      });

      await fetchInventory();
      setEditingProduct(null);
      toast.success("Product updated");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  const setArchived = async (product, archived) => {
    if (!product?._id) return;
    if (
      archived &&
      !window.confirm(
        `Archive ${product.name}? It disappears from sale everywhere; its stock and history stay, and you can restore it from here or the Products page.`
      )
    )
      return;

    try {
      await api.put(`/products/${product._id}`, { active: !archived });
      await fetchInventory();
      toast.success(archived ? "Product archived" : "Product restored");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to update product");
    }
  };

  const submitAdjustment = async (e) => {
    e.preventDefault();

    const delta = parseInt(adjustDelta, 10);
    if (isNaN(delta) || delta === 0) {
      toast.error("Enter a whole number of units, positive or negative.");
      return;
    }
    if (!adjustReason.trim()) {
      toast.error("A reason is required.");
      return;
    }

    setSavingAdjust(true);

    try {
      await api.post(`/inventory/${adjusting.productId._id}/adjust`, {
        delta,
        reason: adjustReason.trim(),
      });
      await fetchInventory();
      setAdjusting(null);
      toast.success("Stock adjusted");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to adjust stock");
    } finally {
      setSavingAdjust(false);
    }
  };

  const openHistory = async (product) => {
    if (!product?._id) return;
    setHistoryFor(product);
    setHistory(null);

    try {
      const res = await api.get(`/inventory/${product._id}/adjustments`);
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error(err);
      setHistory([]);
      toast.error("Failed to load the adjustment history");
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Store Inventory"
        subtitle="Track live stock levels and manage retail pricing."
      />

      <div style={{ marginBottom: 24 }}>
        <input
          type="search"
          className="input"
          aria-label="Search inventory"
          placeholder="🔍 Search inventory by product name…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>

      {editingProduct && (
        <div className="modal-backdrop" onClick={() => !saving && setEditingProduct(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={saveEdit}
          >
            <h3 className="modal-title">Edit Product</h3>

            <label className="field-label" htmlFor="edit-name">
              Product Name
            </label>
            <input
              id="edit-name"
              type="text"
              className="input"
              style={{ marginBottom: 14 }}
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
            />

            <label className="field-label" htmlFor="edit-price">
              Selling Price (₹)
            </label>
            <input
              id="edit-price"
              type="number"
              step="0.01"
              min="0"
              className="input"
              placeholder="0.00"
              value={editPrice}
              onChange={(e) => setEditPrice(e.target.value)}
            />

            <label className="field-label" htmlFor="edit-reorder">
              Reorder level (flag when stock falls below this; 0 never flags)
            </label>
            <input
              id="edit-reorder"
              type="number"
              min="0"
              step="1"
              className="input"
              value={editReorderLevel}
              onChange={(e) => setEditReorderLevel(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="submit" variant="success" disabled={saving}>
                {saving ? "Saving…" : "Save Changes"}
              </Button>
              <Button
                variant="ghost"
                onClick={() => setEditingProduct(null)}
                disabled={saving}
              >
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {adjusting && (
        <div className="modal-backdrop" onClick={() => !savingAdjust && setAdjusting(null)}>
          <form
            className="modal"
            onClick={(e) => e.stopPropagation()}
            onSubmit={submitAdjustment}
          >
            <h3 className="modal-title">Adjust Stock — {adjusting.productId?.name}</h3>
            <p style={{ marginBottom: 14, color: "var(--muted-soft)" }}>
              Currently {adjusting.stock || 0} in stock. Positive adds units,
              negative removes them; every adjustment is recorded with your
              account and the reason.
            </p>

            <label className="field-label" htmlFor="adjust-delta">
              Adjustment (whole units, e.g. -3 or 12)
            </label>
            <input
              id="adjust-delta"
              type="number"
              step="1"
              className="input"
              style={{ marginBottom: 14 }}
              required
              value={adjustDelta}
              onChange={(e) => setAdjustDelta(e.target.value)}
            />

            <label className="field-label" htmlFor="adjust-reason">
              Reason
            </label>
            <input
              id="adjust-reason"
              type="text"
              className="input"
              maxLength={200}
              required
              placeholder="e.g. stocktake correction, spoiled in storage"
              value={adjustReason}
              onChange={(e) => setAdjustReason(e.target.value)}
            />

            <div className="modal-actions">
              <Button type="submit" variant="success" disabled={savingAdjust}>
                {savingAdjust ? "Saving…" : "Apply Adjustment"}
              </Button>
              <Button variant="ghost" onClick={() => setAdjusting(null)} disabled={savingAdjust}>
                Cancel
              </Button>
            </div>
          </form>
        </div>
      )}

      {historyFor && (
        <div className="modal-backdrop" onClick={() => setHistoryFor(null)}>
          <div className="modal" style={{ maxWidth: 640 }} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-title">Adjustments — {historyFor.name}</h3>

            {history === null ? (
              <Skeleton height={16} style={{ marginTop: 10 }} />
            ) : history.length === 0 ? (
              <p style={{ color: "var(--muted-soft)" }}>
                No manual adjustments recorded. Receipts and sales move stock
                without appearing here.
              </p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Change</th>
                      <th>Reason</th>
                      <th>By</th>
                      <th>Stock after</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((row) => (
                      <tr key={row._id}>
                        <td>{new Date(row.createdAt).toLocaleString()}</td>
                        <td style={{ fontWeight: 600, color: row.delta < 0 ? "var(--danger)" : "var(--success)" }}>
                          {row.delta > 0 ? `+${row.delta}` : row.delta}
                        </td>
                        <td>{row.reason}</td>
                        <td>{row.adjustedBy?.email || "—"}</td>
                        <td>{row.stockAfter}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="modal-actions">
              <Button variant="ghost" onClick={() => setHistoryFor(null)}>
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load the inventory. Check your connection and{" "}
          <button type="button" className="link-button" onClick={fetchInventory}>
            try again
          </button>
          .
        </Banner>
      ) : filteredInventory.length === 0 ? (
        <EmptyState
          icon="📦"
          title={searchQuery.trim() ? "No matching items" : "Inventory is empty"}
        >
          {searchQuery.trim()
            ? `Nothing matches "${searchQuery}".`
            : "Purchased stock will appear here."}
        </EmptyState>
      ) : (
        <div className="table-wrap">
          <table className="table table--stack table--hover">
            <thead>
              <tr>
                <th style={{ width: 70 }}>#</th>
                <th>Product</th>
                <th style={{ width: 180 }}>Price</th>
                <th style={{ width: 180 }}>Stock</th>
                <th style={{ width: 220 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredInventory.map((item, index) => {
                const reorderLevel = item.productId?.reorderLevel ?? 5;
                const archived = item.productId?.active === false;
                // An archived product does not appear on either ordering
                // screen, so a reorder badge on one is a reorder nobody can
                // act on — it just tells the office to chase stock for
                // something no longer sold.
                const isLowStock = !archived && (item.stock || 0) < reorderLevel;

                return (
                  <tr key={item._id}>
                    <td data-label="#">{index + 1}</td>
                    <td
                      data-label="Product"
                      style={{ fontWeight: 700, color: "var(--ink)" }}
                    >
                      {item.productId?.name || "Unlinked product"}
                      {archived && (
                        <Badge variant="neutral" style={{ marginLeft: 8 }}>
                          Archived
                        </Badge>
                      )}
                    </td>
                    <td
                      data-label="Price"
                      style={{ fontWeight: 600, color: "var(--primary)" }}
                    >
                      {formatINR(item.productId?.price || 0)}
                    </td>
                    <td data-label="Stock">
                      <Badge variant={isLowStock ? "alert" : "neutral"}>
                        {isLowStock && <span aria-hidden="true">⚠︎</span>}
                        {item.stock || 0} units
                      </Badge>
                    </td>
                    <td data-label="Actions">
                      <div style={{ display: "flex", gap: 8 }}>
                        <Button
                          className="btn--sm"
                          onClick={() => startEdit(item.productId)}
                          disabled={!item.productId}
                        >
                          Edit
                        </Button>
                        <Button
                          className="btn--sm"
                          onClick={() => {
                            setAdjusting(item);
                            setAdjustDelta("");
                            setAdjustReason("");
                          }}
                          disabled={!item.productId}
                        >
                          Adjust
                        </Button>
                        <Button
                          variant="ghost"
                          className="btn--sm"
                          onClick={() => openHistory(item.productId)}
                          disabled={!item.productId}
                        >
                          History
                        </Button>
                        <Button
                          variant={archived ? "success" : "danger"}
                          className="btn--sm"
                          onClick={() => setArchived(item.productId, !archived)}
                          disabled={!item.productId?._id}
                        >
                          {archived ? "Restore" : "Archive"}
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default Inventory;
