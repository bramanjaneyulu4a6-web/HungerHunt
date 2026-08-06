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
      await api.put(`/products/${editingProduct}`, {
        name: editName.trim(),
        price: isNaN(updatedPrice) ? 0 : updatedPrice,
      });

      await fetchInventory();
      setEditingProduct(null);
      toast.success("Product updated");
    } catch (err) {
      console.error(err);
      toast.error("Failed to update product");
    } finally {
      setSaving(false);
    }
  };

  const deleteProduct = async (id) => {
    if (!id) return;
    if (!window.confirm("Permanently delete this product?")) return;

    try {
      await api.delete(`/products/${id}`);
      await fetchInventory();
      toast.success("Product deleted");
    } catch (err) {
      console.error(err);
      toast.error("Failed to delete product");
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
                const isLowStock = (item.stock || 0) < 5;

                return (
                  <tr key={item._id}>
                    <td data-label="#">{index + 1}</td>
                    <td
                      data-label="Product"
                      style={{ fontWeight: 700, color: "var(--ink)" }}
                    >
                      {item.productId?.name || "Unlinked product"}
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
                          variant="danger"
                          className="btn--sm"
                          onClick={() => deleteProduct(item.productId?._id)}
                          disabled={!item.productId?._id}
                        >
                          Delete
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
