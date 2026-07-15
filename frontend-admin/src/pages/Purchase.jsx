// import React, { useEffect, useState } from "react";
// import api from "../utils/api";

// const Purchase = () => {
//   const [products, setProducts] = useState([]);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     fetchProducts();
//   }, []);

//   const fetchProducts = async () => {
//     try {
//       const res = await api.get("/products");

//       const formattedProducts = res.data.map((product) => ({
//         ...product,
//         quantity: 0,
//       }));

//       setProducts(formattedProducts);
//     } catch (err) {
//       console.error(err);
//       alert("Failed to load products");
//     }
//   };

//   const updateQuantity = (id, value) => {
//     setProducts((prev) =>
//       prev.map((product) =>
//         product._id === id
//           ? {
//               ...product,
//               quantity: Number(value),
//             }
//           : product
//       )
//     );
//   };

//   const createPurchase = async () => {
//     const selectedItems = products
//       .filter((p) => p.quantity > 0)
//       .map((p) => ({
//         productId: p._id,
//         quantity: p.quantity,
//       }));

//     if (selectedItems.length === 0) {
//       return alert("Select at least one product");
//     }

//     try {
//       setLoading(true);

//       await api.post("/purchases", {
//         items: selectedItems,
//       });

//       alert("Purchase request created successfully");

//       setProducts((prev) =>
//         prev.map((p) => ({
//           ...p,
//           quantity: 0,
//         }))
//       );
//     } catch (err) {
//       console.error(err);
//       alert("Failed to create purchase");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div
//       style={{
//         padding: "24px",
//         minHeight: "100vh",
//         background: "#f8fafc",
//       }}
//     >
//       <h1
//         style={{
//           marginBottom: "20px",
//         }}
//       >
//         Purchase Products
//       </h1>

//       <div
//         style={{
//           background: "#fff",
//           borderRadius: "12px",
//           padding: "20px",
//           boxShadow: "0 1px 3px rgba(0,0,0,0.1)",
//         }}
//       >
//         <table
//           style={{
//             width: "100%",
//             borderCollapse: "collapse",
//           }}
//         >
//           <thead>
//             <tr>
//               <th
//                 style={{
//                   textAlign: "left",
//                   padding: "12px",
//                 }}
//               >
//                 Product
//               </th>

//               <th
//                 style={{
//                   textAlign: "left",
//                   padding: "12px",
//                 }}
//               >
//                 Quantity
//               </th>
//             </tr>
//           </thead>

//           <tbody>
//             {products.map((product) => (
//               <tr key={product._id}>
//                 <td
//                   style={{
//                     padding: "12px",
//                     borderTop: "1px solid #e5e7eb",
//                   }}
//                 >
//                   {product.name}
//                 </td>

//                 <td
//                   style={{
//                     padding: "12px",
//                     borderTop: "1px solid #e5e7eb",
//                   }}
//                 >
//                   <input
//                     type="number"
//                     min="0"
//                     value={product.quantity}
//                     onChange={(e) =>
//                       updateQuantity(
//                         product._id,
//                         e.target.value
//                       )
//                     }
//                     style={{
//                       width: "120px",
//                       padding: "8px",
//                       border: "1px solid #d1d5db",
//                       borderRadius: "6px",
//                     }}
//                   />
//                 </td>
//               </tr>
//             ))}
//           </tbody>
//         </table>

//         <button
//           onClick={createPurchase}
//           disabled={loading}
//           style={{
//             marginTop: "20px",
//             background: "#2563eb",
//             color: "#fff",
//             border: "none",
//             padding: "12px 20px",
//             borderRadius: "8px",
//             cursor: "pointer",
//           }}
//         >
//           {loading
//             ? "Creating..."
//             : "Create Purchase Request"}
//         </button>
//       </div>
//     </div>
//   );
// };

// export default Purchase;





import React, { useEffect, useState } from "react";
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
console.log("Purchase created successfully");
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
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px"
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
    input: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
    },
    quantityInput: {
      width: "120px",
      padding: "8px 12px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
      textAlign: "center"
    },
    alertBanner: {
      backgroundColor: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#166534",
      padding: "12px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      marginBottom: "20px",
    },
    tableContainer: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
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
      backgroundColor: "#f8fafc",
      color: "#475569",
      fontWeight: "600",
      padding: "16px",
      fontSize: "13px",
      borderBottom: "1px solid #e2e8f0",
    },
    td: {
      padding: "16px",
      fontSize: "14px",
      color: "#334155",
      borderBottom: "1px solid #f1f5f9",
    },
    emptyState: {
      padding: "40px",
      textAlign: "center",
      color: "#64748b",
      fontSize: "15px"
    },
    submitBtn: {
      padding: "12px 24px",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      transition: "all 0.2s",
      boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)",
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
                backgroundColor: loading ? "#93c5fd" : "#2563eb",
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
                    style={{ backgroundColor: product.quantity > 0 ? '#f0fdf4' : 'transparent' }}
                  >
                    <td style={styles.td}>
                      <strong>{product.name}</strong>
                    </td>
                    <td style={styles.td}>
                      {product.stockGroup?.name || <span style={{ color: '#94a3b8' }}>None</span>}
                    </td>
                    <td style={styles.td}>
                      {product.unit?.symbol || <span style={{ color: '#94a3b8' }}>None</span>}
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