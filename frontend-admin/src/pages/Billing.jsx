import { useState, useEffect } from "react";
import api from "../utils/api";

const Billing = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [isSearched, setIsSearched] = useState(false); // Tracks if a search has been executed
  const [showVerifyModal, setShowVerifyModal] = useState(false);
  const [purchasePassword, setPurchasePassword] = useState("");
  
  // Track configurations for staging quantities before appending to cart
  // Format: { [productId]: quantity }
  const [stagedQuantities, setStagedQuantities] = useState({});

  useEffect(() => {
    const total = cart.reduce(
      (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 0),
      0
    );
    setInvoiceTotal(total);
  }, [cart]);

//   const fetchCatalog = async () => {
//     try {
//       const res = await api.get("/products");
//       const activeProducts = res.data.filter((p) => p.stock > 0);
//       setProducts(activeProducts);
      
//       // Initialize staged quantities to 1 for all fetched products
//       const initialQuantities = {};
//       activeProducts.forEach(p => {
//         initialQuantities[p._id] = 1;
//       });
//       setStagedQuantities(initialQuantities);
//     } catch (error) {
//       console.error(error);
//       alert("Failed to fetch product catalog");
//     }
//   };


const fetchCatalog = async () => {
  try {
    const res = await api.get("/inventory");

    const inventoryProducts = res.data
      .filter(item => item.stock > 0)
      .map(item => ({
        _id: item.productId._id,
        name: item.productId.name,
        price: item.productId.price,
        stock: item.stock
      }));

    setProducts(inventoryProducts);

    const initialQuantities = {};
    inventoryProducts.forEach(product => {
      initialQuantities[product._id] = 1;
    });

    setStagedQuantities(initialQuantities);

  } catch (error) {
    console.error(error);
    alert("Failed to fetch inventory");
  }
};




  const handleStudentSearch = async () => {
    if (!searchQuery.trim()) {
      alert("Please enter student name or hostel number");
      return;
    }

    if (searchQuery.trim().length < 2) {
      setSelectedStudent(null);
      setSearchResults([]);
      setIsSearched(false);
      return;
    }

    try {
      const res = await api.get(
        `/students/search?q=${encodeURIComponent(searchQuery)}`
      );

      setIsSearched(true);

      if (res.data.length === 0) {
        setSelectedStudent(null);
        setSearchResults([]);
        setProducts([]);
        setCart([]);
        alert("No student found matching that name or hostel number");
        return;
      }

      if (res.data.length === 1) {
        setSelectedStudent(res.data[0]);
        setSearchResults([]);
        fetchCatalog();
        return;
      }

      // Multiple students found
      setSelectedStudent(null);
      setSearchResults(res.data);
      setProducts([]);
      setCart([]);
    } catch (error) {
      console.error(error);
      alert("Student search failed");
    }
  };

  const updateStagedQuantity = (productId, amount, maxStock) => {
    setStagedQuantities(prev => {
      const current = parseInt(prev[productId], 10) || 0;
      const updated = current + amount;
      if (updated < 1) return prev;
      if (updated > maxStock) {
        alert(`Only ${maxStock} items available in stock!`);
        return prev;
      }
      return { ...prev, [productId]: updated };
    });
  };

  const handleManualQuantityChange = (productId, value, maxStock) => {
    if (value === "") {
      setStagedQuantities(prev => ({ ...prev, [productId]: "" }));
      return;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;

    if (parsed < 1) {
      setStagedQuantities(prev => ({ ...prev, [productId]: 1 }));
      return;
    }
    if (parsed > maxStock) {
      alert(`Only ${maxStock} items available in stock!`);
      setStagedQuantities(prev => ({ ...prev, [productId]: maxStock }));
      return;
    }
    setStagedQuantities(prev => ({ ...prev, [productId]: parsed }));
  };

  const addToCart = (product) => {
    const qtyToAdd = parseInt(stagedQuantities[product._id], 10) || 1;
    const exists = cart.find((item) => item._id === product._id);
    const currentCartQty = exists ? parseInt(exists.quantity, 10) || 0 : 0;

    if (currentCartQty + qtyToAdd > product.stock) {
      return alert(`Insufficient stock! Total in cart cannot exceed available stock (${product.stock}).`);
    }

    if (exists) {
      setCart(
        cart.map((item) =>
          item._id === product._id
            ? { ...item, quantity: (parseInt(item.quantity, 10) || 0) + qtyToAdd }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: qtyToAdd }]);
    }
    
    setStagedQuantities(prev => ({ ...prev, [product._id]: 1 }));
  };

  const updateCartItemQuantity = (productId, amount) => {
    const targetProduct = products.find(p => p._id === productId);
    const maxStock = targetProduct ? targetProduct.stock : 999;

    setCart(prevCart => {
      return prevCart.map(item => {
        if (item._id === productId) {
          const currentQty = parseInt(item.quantity, 10) || 0;
          const updatedQty = currentQty + amount;
          
          if (updatedQty > maxStock) {
            alert(`Cannot exceed available warehouse stock of ${maxStock}!`);
            return item;
          }
          
          if (updatedQty < 1) {
            return null;
          }
          
          return { ...item, quantity: updatedQty };
        }
        return item;
      }).filter(Boolean);
    });
  };

  const handleCartManualQuantityChange = (productId, value) => {
    if (value === "") {
      setCart(prevCart => prevCart.map(item => 
        item._id === productId ? { ...item, quantity: "" } : item
      ));
      return;
    }

    const targetProduct = products.find(p => p._id === productId);
    const maxStock = targetProduct ? targetProduct.stock : 999;
    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) return;

    setCart(prevCart => {
      return prevCart.map(item => {
        if (item._id === productId) {
          if (parsed < 1) {
            return { ...item, quantity: 1 };
          }
          if (parsed > maxStock) {
            alert(`Cannot exceed available warehouse stock of ${maxStock}!`);
            return { ...item, quantity: maxStock };
          }
          return { ...item, quantity: parsed };
        }
        return item;
      });
    });
  };

  const removeFromCart = (productId) => {
    setCart(prevCart => prevCart.filter(item => item._id !== productId));
  };

  const handleCancelPayment = () => {
    if (window.confirm("Are you sure you want to cancel payment? This will reset the terminal.")) {
      setCart([]);
      setSelectedStudent(null);
      setSearchResults([]);
      setSearchQuery("");
      setProductSearchQuery("");
      setIsSearched(false);
    }
  };

  const handleCheckout = async () => {
    if (!selectedStudent) return;

    const calibratedCart = cart.map(item => ({
      ...item,
      quantity: parseInt(item.quantity, 10) || 1
    }));

    if (invoiceTotal > selectedStudent.pocketMoney) {
      return alert("Insufficient wallet balance!");
    }

    try {
      await api.post("/transactions/bill", {

        studentId: selectedStudent._id,
        items: calibratedCart.map((item) => ({
          productId: item._id,
          quantity: item.quantity,
        })),
        totalAmount: invoiceTotal,
      });

      alert("Payment successful!");
      setCart([]);
      setSelectedStudent(null);
      setSearchQuery("");
      setProductSearchQuery("");
      setIsSearched(false);
   } catch (err) {

  alert(
    err.response?.data?.message ||
    err.response?.data?.error ||
    "Checkout failed"
  );

}
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    topSection: {
      marginBottom: "24px",
    },
    bottomGrid: {
      display: "grid",
      gridTemplateColumns: "1.1fr 0.9fr",
      gap: "24px",
      alignItems: "start",
    },
    card: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "14px",
      padding: "20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      boxSizing: "border-box",
    },
    lookupFlex: {
      display: "flex",
      gap: "16px",
      alignItems: "center",
    },
    panelTitle: {
      fontSize: "30px",
      fontWeight: "600",
      color: "var(--ink)",
      marginTop: 0,
      marginBottom: "16px",
    },
    input: {
      flex: 1,
      padding: "12px 14px",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      fontSize: "14px",
      color: "var(--ink)",
      backgroundColor: "var(--surface)",
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },
    productSearchInput: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      fontSize: "13px",
      color: "var(--ink)",
      backgroundColor: "var(--bg)",
      outline: "none",
      transition: "border-color 0.2s, background-color 0.2s",
      boxSizing: "border-box",
      marginBottom: "16px",
    },
    primaryBtn: {
      padding: "12px 24px",
      background: "var(--primary)",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      whiteSpace: "nowrap",
    },
    resultsSection: {
      marginTop: "20px",
    },
    resultsTitle: {
      fontSize: "15px",
      fontWeight: "600",
      color: "var(--ink-strong)",
      marginBottom: "12px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "8px",
      textAlign: "left",
    },
    th: {
      backgroundColor: "var(--bg-subtle)",
      color: "var(--ink-soft)",
      fontWeight: "600",
      padding: "12px",
      fontSize: "13px",
      borderBottom: "2px solid var(--border)",
    },
    tr: {
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    td: {
      padding: "12px",
      fontSize: "14px",
      color: "var(--ink)",
      borderBottom: "1px solid var(--border)",
    },
    selectBtn: {
      padding: "6px 12px",
      background: "#0284c7",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "6px",
      fontWeight: "600",
      fontSize: "12px",
      cursor: "pointer",
    },
    studentRowDetails: {
      display: "flex",
      gap: "24px",
      alignItems: "center",
      marginTop: "16px",
      paddingTop: "16px",
      borderTop: "1px solid var(--bg-subtle)",
    },
    studentInlineBanner: {
      display: "flex",
      gap: "16px",
      fontSize: "14px",
      color: "var(--ink-dim)",
      fontWeight: "500",
      backgroundColor: "var(--bg-subtle)",
      padding: "10px 14px",
      borderRadius: "8px",
      marginBottom: "16px",
    },
    studentName: {
      fontSize: "15px",
      fontWeight: "600",
      color: "var(--ink)",
    },
    studentMeta: {
      fontSize: "13px",
      color: "var(--ink-soft)",
      fontWeight: "500",
    },
    walletBadge: {
      padding: "8px 14px",
      background: "var(--warn-bg)",
      color: "var(--warn-ink)",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      marginLeft: "auto",
    },
    scrollContainer: {
      maxHeight: "440px",
      overflowY: "auto",
      paddingRight: "6px",
    },
    productItem: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 14px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "10px",
      marginBottom: "10px",
    },
    productName: {
      fontWeight: "600",
      fontSize: "14px",
      color: "var(--ink)",
    },
    productStock: {
      fontSize: "12px",
      color: "var(--muted)",
      marginTop: "2px",
    },
    actionControlWrap: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
    },
    qtySelector: {
      display: "flex",
      alignItems: "center",
      border: "1px solid var(--border)",
      borderRadius: "8px",
      overflow: "hidden",
      backgroundColor: "var(--bg)",
    },
    qtyBtn: {
      width: "32px",
      height: "32px",
      border: "none",
      background: "transparent",
      color: "var(--ink-soft)",
      fontSize: "16px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background-color 0.15s",
    },
    qtyInput: {
      width: "40px",
      height: "32px",
      borderTop: "none",
      borderBottom: "none",
      borderLeft: "1px solid var(--border)",
      borderRight: "1px solid var(--border)",
      background: "var(--surface)",
      textAlign: "center",
      fontSize: "13px",
      fontWeight: "600",
      color: "var(--ink)",
      outline: "none",
    },
    addBtn: {
      padding: "8px 14px",
      background: "var(--primary)",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    checkoutSection: {
      marginTop: "24px",
      paddingTop: "16px",
      borderTop: "1px solid var(--border)",
    },
    totalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalLabel: {
      fontSize: "16px",
      fontWeight: "600",
      color: "var(--muted)",
    },
    totalAmount: {
      fontSize: "22px",
      fontWeight: "700",
      color: "var(--ink)",
    },
    remainingBalance: (isNegative) => ({
      fontSize: "13px",
      color: isNegative ? "var(--danger)" : "var(--success)",
      fontWeight: "500",
      marginTop: "4px",
      textAlign: "right",
    }),
    btnActionGroup: {
      display: "flex",
      gap: "12px",
      marginTop: "16px",
    },
    successBtn: {
      flex: 1,
      padding: "12px",
      background: "var(--success)",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    cancelBtn: {
      padding: "12px 20px",
      background: "var(--danger)",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    highlightPrice: {
      color: "var(--ink)",
      fontWeight: "700",
      fontSize: "14px",
      marginRight: "8px",
    },
    emptyState: {
      color: "var(--muted)",
      fontSize: "14px",
      margin: 0,
    },
    cartQtyText: {
      width: "35px",
      height: "24px",
      textAlign: "center",
      fontSize: "13px",
      fontWeight: "600",
      color: "var(--ink)",
      border: "1px solid var(--border-strong)",
      borderRadius: "4px",
      outline: "none",
      backgroundColor: "var(--surface)",
    },
    cartQtyBtn: {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      border: "1px solid var(--border-strong)",
      background: "var(--bg)",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "700",
      fontSize: "12px",
      color: "var(--ink-dim)",
    },
    removeBtn: {
      width: "26px",
      height: "26px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      background: "var(--danger-bg-strong)",
      color: "var(--danger-light)",
      border: "none",
      borderRadius: "6px",
      fontSize: "16px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "all 0.2s ease",
      lineHeight: "1",
      padding: 0,
    }
  };

  return (
    <div style={styles.page}>
      <style>{`
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        ::-webkit-scrollbar-track {
          background: var(--bg-subtle);
          border-radius: 8px;
        }
        ::-webkit-scrollbar-thumb {
          background: var(--primary);
          border-radius: 8px;
          border: 2px solid var(--bg-subtle);
        }
        ::-webkit-scrollbar-thumb:hover {
          background: var(--primary-hover);
        }
        .product-scroll-panel::-webkit-scrollbar {
          width: 6px;
        }
        .product-scroll-panel::-webkit-scrollbar-track {
          background: var(--bg);
          border-radius: 4px;
        }
        .product-scroll-panel::-webkit-scrollbar-thumb {
          background: var(--primary-light);
          border-radius: 4px;
        }
        .product-scroll-panel::-webkit-scrollbar-thumb:hover {
          background: var(--primary);
        }
      `}</style>

      {/* TOP SECTION - STUDENT SEARCH */}
      <div style={styles.topSection}>
        <div style={styles.card}>
          <h2 style={styles.panelTitle}>Student Lookup</h2>
          
          <div style={styles.lookupFlex}>
            <input
              style={styles.input}
              placeholder="Search student profile by name or hostel number..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
              onKeyDown={(e) => e.key === 'Enter' && handleStudentSearch()}
            />
            <button
              style={styles.primaryBtn}
              onClick={handleStudentSearch}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-hover)")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
            >
              Search
            </button>
          </div>

          {/* MULTIPLE SEARCH RESULTS */}
          {searchResults.length > 0 && (
            <div style={styles.resultsSection}>
              <h4 style={styles.resultsTitle}>Multiple Matches Found. Select a Profile:</h4>
              <table style={styles.table}>
                <thead>
                  <tr>
                    <th style={styles.th}>Student Name</th>
                    <th style={styles.th}>Hostel No.</th>
                    <th style={styles.th}>Father's Name</th>
                    <th style={styles.th}>Wallet Balance</th>
                    <th style={{ ...styles.th, textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((student) => (
                    <tr 
                      key={student._id} 
                      style={styles.tr}
                      onClick={() => {
                        setSelectedStudent(student);
                        setSearchResults([]);
                        fetchCatalog();
                      }}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--bg)")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={styles.td}><strong>{student.name}</strong></td>
                      <td style={styles.td}>{student.hostelNumber || "N/A"}</td>
                      <td style={styles.td}>{student.fatherName}</td>
                      <td style={styles.td}>₹{student.pocketMoney}</td>
                      <td style={{ ...styles.td, textAlign: "right" }}>
                        <button style={styles.selectBtn}>Select Profile</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* SINGLE TARGET SELECTED STUDENT PANEL */}
          {selectedStudent && (
            <div style={styles.studentRowDetails}>
              <div>
                <span style={styles.studentName}>{selectedStudent.name}</span>
                <span style={{ color: "var(--border-strong)", margin: "0 8px" }}>|</span>
                <span style={styles.studentMeta}>Hostel: {selectedStudent.hostelNumber || "N/A"}</span>
                <span style={{ color: "var(--border-strong)", margin: "0 8px" }}>|</span>
                <span style={styles.studentMeta}>Father: {selectedStudent.fatherName}</span>
              </div>
              <div style={styles.walletBadge}>
                Wallet Balance: ₹{selectedStudent.pocketMoney}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* BOTTOM SECTION - DUAL SIDE-BY-SIDE PANEL */}
      {!selectedStudent ? (
        <div style={styles.card}>
          <p style={styles.emptyState}>
            {isSearched 
              ? "No student profile is currently selected. Locate a student above to activate checkout." 
              : "Please query and locate a student profile above by name or hostel number to activate the terminal checkout session."
            }
          </p>
        </div>
      ) : (
        <div style={styles.bottomGrid}>
          {/* LEFT SIDE: AVAILABLE PRODUCTS */}
          <div style={styles.card}>
            <h3 style={styles.panelTitle}>Available Products</h3>
            
            <input
              style={styles.productSearchInput}
              placeholder="🔍 Quick filter products by name..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "var(--primary)";
                e.currentTarget.style.backgroundColor = "var(--surface)";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "var(--border)";
                e.currentTarget.style.backgroundColor = "var(--bg)";
              }}
            />

            <div className="product-scroll-panel" style={styles.scrollContainer}>
              {filteredProducts.length === 0 ? (
                <p style={{ ...styles.emptyState, textAlign: "center", padding: "20px 0" }}>
                  No active items match your product filters.
                </p>
              ) : (
                filteredProducts.map((p) => {
                  const currentStagedQty = stagedQuantities[p._id] !== undefined ? stagedQuantities[p._id] : 1;
                  return (
                    <div key={p._id} style={styles.productItem}>
                      <div>
                        <div style={styles.productName}>{p.name}</div>
                        <div style={styles.productStock}>Stock: {p.stock}</div>
                      </div>
                      
                      <div style={styles.actionControlWrap}>
                        <span style={styles.highlightPrice}>₹{p.price}</span>
                        
                        <div style={styles.qtySelector}>
                          <button 
                            style={styles.qtyBtn} 
                            type="button"
                            onClick={() => updateStagedQuantity(p._id, -1, p.stock)}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--border)")}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >-</button>
                          <input 
                            type="text" 
                            style={styles.qtyInput}
                            value={currentStagedQty}
                            onChange={(e) => handleManualQuantityChange(p._id, e.target.value, p.stock)}
                          />
                          <button 
                            style={styles.qtyBtn} 
                            type="button"
                            onClick={() => updateStagedQuantity(p._id, 1, p.stock)}
                            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--border)")}
                            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                          >+</button>
                        </div>

                        <button
                          style={styles.addBtn}
                          onClick={() => addToCart(p)}
                          onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--primary-hover)")}
                          onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--primary)")}
                        >
                          Add
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* RIGHT SIDE: CURRENT CART & BILLING */}
          <div style={styles.card}>
            <h3 style={styles.panelTitle}>Current Cart</h3>
            
            <div style={styles.studentInlineBanner}>
              <div><strong>Student Name:</strong> {selectedStudent.name}</div>
              <div><strong>Hostel Number:</strong> {selectedStudent.hostelNumber || "N/A"}</div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", minHeight: "340px", justifyContent: "space-between" }}>
              
              <div style={{ overflowX: "auto" }}>
                {cart.length === 0 ? (
                  <p style={{ ...styles.emptyState, fontStyle: "italic", padding: "10px 0" }}>
                    Cart is empty. Select quantities and click Add from the product sheet.
                  </p>
                ) : (
                  <table style={styles.table}>
                    <thead>
                      <tr>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px", width: "40px" }}>S.No</th>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px" }}>Item</th>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px" }}>Price</th>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px", textAlign: "center" }}>Qty</th>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px", textAlign: "right" }}>Total</th>
                        <th style={{ ...styles.th, backgroundColor: "transparent", padding: "8px 4px", textAlign: "center" }}></th>
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, index) => (
                        <tr key={item._id}>
                          <td style={{ ...styles.td, padding: "10px 4px", color: "var(--muted)" }}>
                            {index + 1}
                          </td>
                          <td style={{ ...styles.td, padding: "10px 4px", fontWeight: "500" }}>
                            {item.name}
                          </td>
                          <td style={{ ...styles.td, padding: "10px 4px" }}>
                            ₹{item.price}
                          </td>
                          <td style={{ ...styles.td, padding: "10px 4px" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "6px", justifyContent: "center" }}>
                              <button 
                                style={styles.cartQtyBtn}
                                onClick={() => updateCartItemQuantity(item._id, -1)}
                              >-</button>
                              
                              <input 
                                type="text"
                                style={styles.cartQtyText}
                                value={item.quantity}
                                onChange={(e) => handleCartManualQuantityChange(item._id, e.target.value)}
                              />

                              <button 
                                style={styles.cartQtyBtn}
                                onClick={() => updateCartItemQuantity(item._id, 1)}
                              >+</button>
                            </div>
                          </td>
                          <td style={{ ...styles.td, padding: "10px 4px", textAlign: "right", fontWeight: "600" }}>
                            ₹{item.price * (parseInt(item.quantity, 10) || 0)}
                          </td>
                          <td style={{ ...styles.td, padding: "10px 4px", textAlign: "center" }}>
                            <button 
                              style={styles.removeBtn} 
                              onClick={() => removeFromCart(item._id)}
                              onMouseOver={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--danger-light)";
                                e.currentTarget.style.color = "var(--surface)";
                              }}
                              onMouseOut={(e) => {
                                e.currentTarget.style.backgroundColor = "var(--danger-bg-strong)";
                                e.currentTarget.style.color = "var(--danger-light)";
                              }}
                              title="Remove item"
                            >
                              &times;
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              {/* CHECKOUT ACTION FOOTER */}
              <div style={styles.checkoutSection}>
                <div style={styles.totalRow}>
                  <span style={styles.totalLabel}>Total Bill</span>
                  <span style={styles.totalAmount}>₹{invoiceTotal}</span>
                </div>

                <div style={styles.remainingBalance(selectedStudent.pocketMoney - invoiceTotal < 0)}>
                  {selectedStudent.pocketMoney - invoiceTotal < 0
                    ? `Overdraft Limit Exceeded by ₹${Math.abs(selectedStudent.pocketMoney - invoiceTotal)}`
                    : `Remaining Balance: ₹${selectedStudent.pocketMoney - invoiceTotal}`}
                </div>

                <div style={styles.btnActionGroup}>
                  <button
                    style={styles.cancelBtn}
                    onClick={handleCancelPayment}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--danger-strong)")}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--danger)")}
                  >
                    Cancel Payment
                  </button>
                  <button
                    style={styles.successBtn}
                    onClick={() => {
                      if (!selectedStudent) {
                        alert("Please select a student.");
                        return;
                      }
                      setShowVerifyModal(true);
                    }}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--success-strong)")}
                    onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--success)")}
                    disabled={cart.length === 0 || (selectedStudent.pocketMoney - invoiceTotal < 0)}
                  >
                    Complete Payment
                  </button>
                </div>
              </div>

            </div>
          </div>
        </div>
      )}

      {showVerifyModal && (
        <>
          <div
            onClick={() => {
              setShowVerifyModal(false);
              setPurchasePassword("");
            }}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,.45)",
              zIndex: 1000
            }}
          />

          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              width: 430,
              background: "var(--surface)",
              borderRadius: 18,
              padding: 30,
              zIndex: 1001,
              boxShadow: "0 20px 50px rgba(0,0,0,.3)"
            }}
          >
            <h2 style={{ marginBottom: 25 }}>
              Parent Verification
            </h2>

            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600
              }}
            >
              Father's Mobile Number
            </label>

            <input
              readOnly
              value={selectedStudent?.parentPhoneNumber || ""}
              style={{
                width: "100%",
                padding: 14,
                border: "1px solid #ddd",
                borderRadius: 8,
                marginBottom: 20
              }}
            />

            <label
              style={{
                display: "block",
                marginBottom: 8,
                fontWeight: 600
              }}
            >
              Purchase Password
            </label>

            <input
              type="password"
              placeholder="Enter Purchase Password"
              value={purchasePassword}
              onChange={(e) =>
                setPurchasePassword(e.target.value)
              }
              style={{
                width: "100%",
                padding: 14,
                border: "1px solid #ddd",
                borderRadius: 8
              }}
            />

            <div
              style={{
                display: "flex",
                gap: 15,
                marginTop: 30
              }}
            >
              <button
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  border: "1px solid #ccc",
                  cursor: "pointer"
                }}
                onClick={() => {
                  setShowVerifyModal(false);
                  setPurchasePassword("");
                }}
              >
                Cancel
              </button>

              <button
                style={{
                  flex: 1,
                  padding: 14,
                  borderRadius: 10,
                  border: "none",
                  background: "var(--success)",
                  color: "var(--on-dark)",
                  cursor: "pointer"
                }}
                onClick={async () => {
                  try {
                    await api.post(
                      "/transactions/verify-payment",
                      {
                        studentId: selectedStudent._id,
                        phone: selectedStudent.parentPhoneNumber,
                        password: purchasePassword
                      }
                    );

                    setShowVerifyModal(false);
                    setPurchasePassword("");

                    await handleCheckout();
                  } catch (err) {
                    alert(
                      err.response?.data?.message ||
                      "Verification Failed"
                    );
                  }
                }}
              >
                Verify & Pay
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default Billing;