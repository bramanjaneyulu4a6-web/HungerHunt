import { useState, useEffect } from 'react';
import api from '../utils/api';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [stockGroups, setStockGroups] = useState([]);
  const [units, setUnits] = useState([]);

  // Modal Visibility States
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [unitForm, setUnitForm] = useState({ name: "", symbol: "" });
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state manages both creating and updating
  const [form, setForm] = useState({
  name: '',
  stockGroup: '',
  unit: '',
  price: '',
  image: null
});
  const [editingId, setEditingId] = useState(null); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchStockGroups();
    fetchUnits();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (error) {
      console.error(error);
      alert('Failed to fetch product catalog');
    }
  };

  const fetchStockGroups = async () => {
    try {
      const res = await api.get("/stock-groups");
      setStockGroups(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await api.get("/units");
      setUnits(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async (e) => {

  e.preventDefault();

  setLoading(true);

  try {

    const data = new FormData();

    data.append("name", form.name);

    data.append("stockGroup", form.stockGroup);

    data.append("unit", form.unit);

    data.append("price", form.price);

    if (form.image) {

      data.append("image", form.image);

    }

    if (editingId) {

      await api.put(`/products/${editingId}`, data);

      alert("Product updated");

    } else {

      await api.post("/products", data);

      alert("Product added");

    }

    clearForm();

    setIsProductOpen(false);

    fetchProducts();

  } catch (err) {

    alert(err.response?.data?.message || "Failed to save product");

  }

  setLoading(false);

};

  const handleEditInit = (product) => {
    setEditingId(product._id);
    setForm({
  name: product.name || "",
  stockGroup: product.stockGroup?._id || "",
  unit: product.unit?._id || "",
  price: product.price || "",
  image: null,
});
    setIsProductOpen(true);
  };

  const clearForm = () => {
  setForm({
    name: "",
    stockGroup: "",
    unit: "",
    price: "",
    image: null,
  });

  setEditingId(null);
};
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product permanently?')) {
      try {
        await api.delete(`/products/${id}`);
        if (editingId === id) clearForm();
        fetchProducts();
      } catch (error) {
        console.error(error);
        alert('Failed to delete product item');
      }
    }
  };

  const addStockGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    try {
      await api.post("/stock-groups", { name: groupName });
      setGroupName("");
      fetchStockGroups();
      setIsGroupOpen(false);
      alert('Stock group added successfully!');
    } catch (error) {
      console.error(error);
    }
  };

  const addUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;
    try {
      await api.post("/units", unitForm);
      setUnitForm({ name: "", symbol: "" });
      fetchUnits();
      setIsUnitOpen(false);
      alert('Unit added successfully!');
    } catch (error) {
      console.error(error);
    }
  };

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase().trim();
    return p.name?.toLowerCase().includes(query);
  });

  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "var(--bg-subtle)",
      padding: "40px 24px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    container: {
      width: "100%",
      maxWidth: "1400px",
      margin: "0 auto",
    },
    headerWrapper: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px",
      marginBottom: "32px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "800",
      color: "var(--ink)",
      letterSpacing: "-0.5px",
      margin: 0,
    },
    subtitle: {
      fontSize: "15px",
      color: "var(--muted)",
      marginTop: "6px",
      marginBottom: 0,
    },
    actionButtonGroup: {
      display: "flex",
      gap: "12px",
    },
    actionBtn: {
      padding: "10px 18px",
      backgroundColor: "var(--surface)",
      border: "1px solid var(--border-strong)",
      borderRadius: "10px",
      color: "var(--ink-soft)",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      transition: "all 0.2s",
    },
    activeBtn: {
      backgroundColor: "var(--primary)",
      color: "var(--on-dark)",
      border: "1px solid var(--primary)",
    },
    tableContainer: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      overflow: "hidden",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
    },
    th: {
      backgroundColor: "var(--bg)",
      color: "var(--ink-dim)",
      fontWeight: "600",
      padding: "16px",
      fontSize: "13px",
      borderBottom: "1px solid var(--border)",
    },
    td: {
      padding: "16px",
      fontSize: "14px",
      color: "var(--ink-soft)",
      borderBottom: "1px solid var(--bg-subtle)",
    },
    actionFlex: {
      display: "flex",
      gap: "14px",
    },
    editBtn: {
      background: "none",
      border: "none",
      color: "var(--primary)",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
    },
    deleteBtn: {
      background: "none",
      border: "none",
      color: "var(--danger-light)",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
    },
    alertBanner: {
      backgroundColor: "var(--success-bg)",
      border: "1px solid var(--success-border)",
      color: "var(--success-deep)",
      padding: "12px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      marginBottom: "20px",
    },
    emptyState: {
      padding: "40px",
      textAlign: "center",
      color: "var(--muted)",
      fontSize: "15px"
    },
    // Modal Overlay Styling Component Styles
    modalOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(15, 23, 42, 0.4)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalCard: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      padding: "28px",
      width: "100%",
      maxWidth: "520px",
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      boxSizing: "border-box",
    },
    modalCardLarge: {
      maxWidth: "680px",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
      borderBottom: "1px solid var(--bg-subtle)",
      paddingBottom: "12px",
    },
    modalTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "var(--ink)",
      margin: 0,
    },
    closeXBtn: {
      background: "none",
      border: "none",
      fontSize: "20px",
      color: "var(--muted-soft)",
      cursor: "pointer",
    },
    formGrid: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid var(--border-strong)",
      borderRadius: "8px",
      fontSize: "14px",
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
    },
    label: {
      display: 'block', 
      fontSize: '13px', 
      fontWeight: '600', 
      color: 'var(--ink-dim)', 
      marginBottom: '6px'
    },
    modalFooter: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
      marginTop: "24px",
      borderTop: "1px solid var(--bg-subtle)",
      paddingTop: "16px",
    },
    saveBtn: {
      padding: "10px 20px",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
    }
  };

  const handleFocus = (e) => {
    e.currentTarget.style.borderColor = "var(--primary)";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
  };

  const handleBlur = (e) => {
    e.currentTarget.style.borderColor = "var(--border-strong)";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        
        {/* Main Application Page Control Header */}
        <div style={styles.headerWrapper}>
          <div>
            <h1 style={styles.title}>Inventory Catalog Manager</h1>
            <p style={styles.subtitle}>Configure inventory structural parameters and manage products cleanly inside models.</p>
          </div>
          
          <div style={styles.actionButtonGroup}>
            <button style={styles.actionBtn} onClick={() => setIsGroupOpen(true)}>+ Stock Group</button>
            <button style={styles.actionBtn} onClick={() => setIsUnitOpen(true)}>+ Measurement Unit</button>
            <button style={{ ...styles.actionBtn, ...styles.activeBtn }} onClick={() => { clearForm(); setIsProductOpen(true); }}>
              + Add Product Entry
            </button>
          </div>
        </div>

        {/* DATA SEARCH VIEW ENTRY CONTAINER */}
        <div>
          <div style={{ marginBottom: "20px" }}>
            <input 
              type="text"
              style={styles.input}
              placeholder="🔍 Search or verify products inside database..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
            <div style={styles.alertBanner}>
              ✨ <strong>Matches Found:</strong> Found records aligning with "{searchQuery}".
            </div>
          )}

          <div style={styles.tableContainer}>
            {filteredProducts.length === 0 ? (
              <div style={styles.emptyState}>
                {searchQuery.trim() !== "" 
                  ? `No matching records found for "${searchQuery}". Use the entry forms to register it!` 
                  : "No products in system. Add parameters to begin catalog management."
                }
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
<tr>
  <th style={styles.th}>Image</th>
  <th style={styles.th}>Product Name</th>
  <th style={styles.th}>Stock Group</th>
  <th style={styles.th}>Unit Configuration</th>
  <th style={styles.th}>Actions</th>
</tr>
</thead>
                <tbody>
  {filteredProducts.map((p) => (
    <tr key={p._id}>

      <td style={styles.td}>
        {p.image ? (
          <img
            src={p.image}
            alt={p.name}
            style={{
              width: 60,
              height: 60,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        ) : (
          "No Image"
        )}
      </td>

      <td style={styles.td}>
        <strong>{p.name}</strong>
      </td>

      <td style={styles.td}>
        {p.stockGroup?.name}
      </td>

      <td style={styles.td}>
        {p.unit?.symbol}
      </td>
                      <td style={styles.td}>
                        <div style={styles.actionFlex}>
                          <button
                            style={styles.editBtn}
                            onClick={() => handleEditInit(p)}
                            onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"}
                            onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}
                          >
                            Edit
                          </button>
                          <button
                            style={styles.deleteBtn}
                            onClick={() => handleDelete(p._id)}
                            onMouseOver={(e) => e.currentTarget.style.color = "var(--danger-strong)"}
                            onMouseOut={(e) => e.currentTarget.style.color = "var(--danger-light)"}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ========================================= MODAL OVERLAYS ========================================= */}

        {/* 1. STOCK GROUP MODAL */}
        {isGroupOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Quick Add: Stock Group</h3>
                <button style={styles.closeXBtn} onClick={() => setIsGroupOpen(false)}>&times;</button>
              </div>
              <form onSubmit={addStockGroup} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Stock Group Name</label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., Electronics, Raw Materials"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div style={styles.modalFooter}>
                  <button type="button" style={styles.actionBtn} onClick={() => setIsGroupOpen(false)}>Cancel</button>
                  <button type="submit" style={{ ...styles.saveBtn, backgroundColor: "var(--primary)" }}>Add Group</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. MEASUREMENT UNIT MODAL */}
        {isUnitOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Quick Add: Measurement Unit</h3>
                <button style={styles.closeXBtn} onClick={() => setIsUnitOpen(false)}>&times;</button>
              </div>
              <form onSubmit={addUnit} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Unit Configuration Name</label>
                  <input
                    type="text"
                    required
                    value={unitForm.name}
                    onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                    placeholder="e.g., Kilogram, Litre"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label style={styles.label}>Standard Unit Symbol</label>
                  <input
                    type="text"
                    required
                    value={unitForm.symbol}
                    onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
                    placeholder="e.g., kg, L, pcs"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div style={styles.modalFooter}>
                  <button type="button" style={styles.actionBtn} onClick={() => setIsUnitOpen(false)}>Cancel</button>
                  <button type="submit" style={{ ...styles.saveBtn, backgroundColor: "var(--primary)" }}>Add Unit Setup</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. REGISTER/EDIT PRODUCT MODAL */}
        {isProductOpen && (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.modalCard, ...styles.modalCardLarge }}>
              <div style={styles.modalHeader}>
                <h3 style={{ ...styles.modalTitle, color: editingId ? 'var(--primary)' : 'var(--ink)' }}>
                  {editingId ? '📝 Edit Product Parameters' : 'Product Details Entry'}
                </h3>
                <button style={styles.closeXBtn} onClick={() => { setIsProductOpen(false); clearForm(); }}>&times;</button>
              </div>
              <form onSubmit={handleSave} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Product Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter unique catalog item name" 
                    required 
                    value={form.name} 
                    onChange={e => setForm({...form, name: e.target.value})} 
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                 
                <div>
                  <label style={styles.label}>Stock Group Assignment</label>
                  <select
                    value={form.stockGroup}
                    onChange={(e) => setForm({ ...form, stockGroup: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">Select Stock Group</option>
                    {stockGroups.map(group => (
                      <option key={group._id} value={group._id}>{group.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Unit Dimension</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">Select Unit Option</option>
                    {units.map(unit => (
                      <option key={unit._id} value={unit._id}>{unit.symbol} ({unit.name})</option>
                    ))}
                  </select>
                </div>
<div>
  <label style={styles.label}>Product Image</label>

  <input
    type="file"
    accept="image/*"
    onChange={(e) =>
      setForm({
        ...form,
        image: e.target.files[0],
      })
    }
    style={styles.input}
  />
</div>
                <div style={styles.modalFooter}>
                  <button 
                    type="button" 
                    style={styles.actionBtn} 
                    onClick={() => { setIsProductOpen(false); clearForm(); }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    style={{
                      ...styles.saveBtn,
                      backgroundColor: loading ? "#93c5fd" : (editingId ? "var(--success)" : "var(--primary)"),
                      cursor: loading ? "not-allowed" : "pointer"
                    }}
                  >
                    {loading ? 'Saving Parameters...' : (editingId ? 'Update Item' : 'Save Catalog Product')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Products;