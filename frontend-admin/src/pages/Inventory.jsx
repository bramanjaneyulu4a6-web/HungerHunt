import { useEffect, useState } from "react";
import api from "../utils/api";

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get("/inventory");
      setInventory(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load inventory assets.");
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
    // setEditPrice(product.price !== undefined ? product.price.toString() : "0");
  };

  const saveEdit = async (id) => {
    try {
      // Parses to a safe float to ensure the backend receives a valid number field
      const updatedPrice = parseFloat(editPrice);
      
      await api.put(`/products/${id}`, {
        name: editName,
        price: isNaN(updatedPrice) ? 0 : updatedPrice
      });

      await fetchInventory();
      setEditingProduct(null);
      alert("Product parameters updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Update operation failed.");
    }
  };

  const deleteProduct = async (id) => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to permanently delete this product from stock registers?"))
      return;

    try {
      await api.delete(`/products/${id}`);
      await fetchInventory();
      alert("Product deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Delete transaction failed.");
    }
  };

  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f1f5f9",
      padding: "40px 24px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    container: {
      width: "100%",
      maxWidth: "1400px",
      margin: "0 auto",
    },
    headerBlock: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "800",
      color: "#0f172a",
      letterSpacing: "-0.5px",
      margin: 0,
    },
    subtitle: {
      fontSize: "15px",
      color: "#64748b",
      marginTop: "6px",
      marginBottom: 0,
    },
    searchBar: {
      width: "100%",
      padding: "12px 16px",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
      marginBottom: "28px"
    },
    cardWrapper: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      padding: "24px",
      marginBottom: "24px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
    },
    th: {
      backgroundColor: "#f8fafc",
      color: "#475569",
      fontWeight: "600",
      padding: "14px 16px",
      fontSize: "13px",
      borderBottom: "2px solid #e2e8f0",
    },
    td: {
      padding: "14px 16px",
      fontSize: "14px",
      color: "#334155",
      borderBottom: "1px solid #f1f5f9",
    },
    emptyState: {
      padding: "48px",
      textAlign: "center",
      color: "#64748b",
      fontSize: "15px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
    },
    blueBtn: {
      padding: "8px 14px",
      color: "#ffffff",
      backgroundColor: "#2563eb",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "all 0.2s",
      marginRight: "8px",
      boxShadow: "0 2px 4px rgba(37, 99, 235, 0.15)"
    },
    dangerBtn: {
      padding: "8px 14px",
      color: "#ffffff",
      backgroundColor: "#dc2626",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: "0 2px 4px rgba(220, 38, 38, 0.15)"
    },
    modalBackdrop: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(15, 23, 42, 0.4)",
      backdropFilter: "blur(4px)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999
    },
    modalContent: {
      background: "#ffffff",
      padding: "28px",
      borderRadius: "16px",
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      width: "100%",
      maxWidth: "440px",
      border: "1px solid #e2e8f0"
    },
    modalTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      margin: "0 0 16px 0"
    },
    modalInput: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      outline: "none",
      boxSizing: "border-box",
      marginBottom: "14px",
      transition: "all 0.2s"
    },
    saveBtn: {
      padding: "10px 18px",
      backgroundColor: "#16a34a",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      marginRight: "10px"
    },
    cancelBtn: {
      padding: "10px 18px",
      backgroundColor: "#64748b",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer"
    }
  };

  const handleFocus = (e) => {
    e.currentTarget.style.borderColor = "#2563eb";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
  };

  const handleBlur = (e) => {
    e.currentTarget.style.borderColor = "#cbd5e1";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        
        {/* Main Section Header */}
        <div style={styles.headerBlock}>
          <h1 style={styles.title}>Store Inventory</h1>
          <p style={styles.subtitle}>Audit current live stock levels, modify master retail pricing, and regulate active unlinked items.</p>
        </div>

        {/* Filter Input System */}
        <input
          type="text"
          placeholder="Quick search inventory logs by item description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.searchBar}
        />

        {/* =============== PRODUCT EDIT MODAL REGISTRY =============== */}
        {editingProduct && (
          <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
              <h3 style={styles.modalTitle}>Modify Catalog Specifications</h3>

              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Identifier Label</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Item designation title"
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.modalInput}
              />

              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Standard Base Selling Price (₹)</label>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="0.00"
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.modalInput}
              />

              <div style={{ display: 'flex', marginTop: '20px' }}>
                <button onClick={() => saveEdit(editingProduct)} style={styles.saveBtn}>
                  Apply Modifications
                </button>
                <button onClick={() => setEditingProduct(null)} style={styles.cancelBtn}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =============== STOCK REGISTRY INTERFACE =============== */}
        {filteredInventory.length === 0 ? (
          <div style={styles.emptyState}>
            🔍 No live item profiles match your target structural criteria.
          </div>
        ) : (
          <div style={styles.cardWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: "70px" }}>Index</th>
                  <th style={styles.th}>Product Catalog Details</th>
                  <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Current Valuation Price</th>
                  <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Requisition Balance</th>
                  <th style={{ ...styles.th, width: "220px", textAlign: "center" }}>Administrative Controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item, index) => {
                  const isLowStock = (item.stock || 0) < 5;
                  
                  return (
                    <tr
                      key={item._id}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={styles.td}>{index + 1}</td>
                      <td style={{ ...styles.td, fontWeight: "700", color: "#0f172a" }}>
                        {item.productId?.name || "Unlinked Catalog Profile"}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center", fontWeight: "600", color: "#2563eb" }}>
                        ₹ {(item.productId?.price || 0).toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <span
                          style={{
                            backgroundColor: isLowStock ? "#fee2e2" : "#eff6ff",
                            color: isLowStock ? "#dc2626" : "#2563eb",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "700",
                            display: "inline-block",
                            border: isLowStock ? "1px solid #fecaca" : "1px solid #bfdbfe"
                          }}
                        >
                          {item.stock || 0} units
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <button
                          onClick={() => startEdit(item.productId)}
                          style={styles.blueBtn}
                          disabled={!item.productId}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteProduct(item.productId?._id)}
                          style={styles.dangerBtn}
                          disabled={!item.productId?._id}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};

export default Inventory;