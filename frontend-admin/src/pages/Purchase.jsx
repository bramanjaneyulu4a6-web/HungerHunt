import { useEffect, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";

const Purchase = () => {
  const [products, setProducts] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
const refreshPage = async () => {
  setLoading(true);

  try {
    await fetchProducts();
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};
  useEffect(() => {
    fetchProducts();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get("/products");

      const formattedProducts = res.data.map((product) => ({
        ...product,
        quantity: 0,
      }));

      setProducts(formattedProducts);
    } catch (err) {
      console.error(err);
      alert("Failed to load products");
    }
  };
// const refreshPage = async () => {
//   setLoading(true);

//   try {
//     await fetchProducts();
//   } finally {
//     setLoading(false);
//   }
// };
  const updateQuantity = (id, value) => {
    setProducts((prev) =>
      prev.map((product) =>
        product._id === id
          ? {
              ...product,
              quantity: Number(value),
            }
          : product
      )
    );
  };

  const createPurchase = async () => {
    const selectedItems = products
      .filter((p) => p.quantity > 0)
      .map((p) => ({
        productId: p._id,
        quantity: p.quantity,
      }));

    if (selectedItems.length === 0) {
      return alert("Select at least one product with a quantity greater than 0");
    }

    try {
      setLoading(true);

      await api.post("/purchases", {
        items: selectedItems,
      });

      alert("Purchase request created successfully!");

      setProducts((prev) =>
        prev.map((p) => ({
          ...p,
          quantity: 0,
        }))
      );
    } catch (err) {
      console.error(err);
      alert("Failed to create purchase request");
    } finally {
      setLoading(false);
    }
  };

  const filteredProducts = products.filter((p) => {
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
    headerBlock: {
      marginBottom: "32px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px"
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
    quantityInput: {
      width: "120px",
      padding: "8px 12px",
      border: "1px solid var(--border-strong)",
      borderRadius: "8px",
      fontSize: "14px",
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
      textAlign: "center"
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
    tableContainer: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      overflow: "hidden",
      marginBottom: "24px"
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
    emptyState: {
      padding: "40px",
      textAlign: "center",
      color: "var(--muted)",
      fontSize: "15px"
    },
    submitBtn: {
      padding: "12px 24px",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      transition: "all 0.2s",
      boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)",
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
        
        {/* Page Header Layout Container */}
        <div style={styles.headerBlock}>
          <div>
            <h1 style={styles.title}>Purchase Products</h1>
            <p style={styles.subtitle}>Log standard inventory acquisitions, adjust structural processing quantities, and update stocks.</p>
          </div>
          
          <div>
            <button
              onClick={createPurchase}
              disabled={loading}
              style={{
                ...styles.submitBtn,
                backgroundColor: loading ? "#93c5fd" : "var(--primary)",
                cursor: loading ? "not-allowed" : "pointer",
              }}
            >
              {loading ? "Processing..." : "Submit Purchase Order"}
            </button>
          </div>
        </div>

        {/* Global Live Filtering Input Context */}
        <div style={{ marginBottom: "20px" }}>
          <input
            type="text"
            style={styles.input}
            placeholder="🔍 Search or filter product items for quick entry request..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
          />
        </div>

        {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
          <div style={styles.alertBanner}>
            ✨ <strong>Matches Found:</strong> Displaying {filteredProducts.length} items matching your query.
          </div>
        )}

        {/* Full View Table Catalog Layout Wrapper */}
        <div style={styles.tableContainer}>
          {filteredProducts.length === 0 ? (
            <div style={styles.emptyState}>
              {searchQuery.trim() !== ""
                ? `No matching items found for "${searchQuery}". Verify your target product entry settings.`
                : "No products available inside the catalog system database."}
            </div>
          ) : (
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={styles.th}>Product Details</th>
                  <th style={styles.th}>Stock Group</th>
                  <th style={styles.th}>Unit Type</th>
                  <th style={{ ...styles.th, width: "160px" }}>Purchase Quantity</th>
                </tr>
              </thead>
              <tbody>
                {filteredProducts.map((product) => (
                  <tr 
                    key={product._id}
                    style={{ backgroundColor: product.quantity > 0 ? 'var(--success-bg)' : 'transparent' }}
                  >
                    <td style={styles.td}>
                      <strong>{product.name}</strong>
                    </td>
                    <td style={styles.td}>
                      {product.stockGroup?.name || <span style={{ color: 'var(--muted-soft)' }}>None</span>}
                    </td>
                    <td style={styles.td}>
                      {product.unit?.symbol || <span style={{ color: 'var(--muted-soft)' }}>None</span>}
                    </td>
                    <td style={styles.td}>
                      <input
                        type="number"
                        min="0"
                        value={product.quantity}
                        onChange={(e) => updateQuantity(product._id, e.target.value)}
                        onFocus={handleFocus}
                        onBlur={handleBlur}
                        style={styles.quantityInput}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
<RefreshButton
  onRefresh={refreshPage}
  loading={loading}
/>
      </div>
    </div>
  );
};

export default Purchase;