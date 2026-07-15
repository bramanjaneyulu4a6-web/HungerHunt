


import React, { useState, useEffect } from "react";
import { ShoppingCart, X } from "lucide-react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import hungerLogo from "../assets/Logo.png";

const KioskBilling = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [isSearched, setIsSearched] = useState(false); // Tracks if a search has been executed
 
  // Track configurations for staging quantities before appending to cart
  // Format: { [productId]: quantity }
  const [stagedQuantities, setStagedQuantities] = useState({});

const [loadingProducts, setLoadingProducts] = useState(false);
const [showWelcome, setShowWelcome] = useState(true);
const [showCart, setShowCart] = useState(false);
 const [showVerifyModal, setShowVerifyModal] = useState(false);

const [purchasePassword, setPurchasePassword] = useState("");
const refreshPage = async () => {
  try {
    setLoadingProducts(true);

   const res = await api.get("/inventory/public");

console.log("Response:", res);
console.log("Response Data:", res.data);
console.log("Is Array:", Array.isArray(res.data));
const data = Array.isArray(res.data) ? res.data : [];

const inventoryProducts = data
  .filter(item => item.stock > 0)
  .map(item => ({
    _id: item.productId._id,
    name: item.productId.name,
    price: item.productId.price,
    image: item.productId.image,
    stock: item.stock,
    stockGroup: item.productId.stockGroup,
  }));

    // Refresh product list
    setProducts(inventoryProducts);

    // Reset staged quantities
    const initialQuantities = {};
    inventoryProducts.forEach(product => {
      initialQuantities[product._id] = 1;
    });
    setStagedQuantities(initialQuantities);

    // ✅ Refresh cart items too
    setCart(prevCart =>
      prevCart
        .map(cartItem => {
          const latest = inventoryProducts.find(
            p => p._id === cartItem._id
          );

          // Product removed from stock
          if (!latest) return null;

          return {
            ...cartItem,
            price: latest.price,
            stock: latest.stock,
            quantity: Math.min(cartItem.quantity, latest.stock),
          };
        })
        .filter(item => item && item.stock > 0)
    );
// Refresh selected student details
// Clear student details
setSelectedStudent(null);
setSearchResults([]);
setSearchQuery("");
setIsSearched(false);
setCart([]);
  } catch (err) {
    console.error(err);
    alert("Failed to refresh products.");
  } finally {
    setLoadingProducts(false);
  }
};

  useEffect(() => {
    const total = cart.reduce(
      (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 0),
      0
    );
    setInvoiceTotal(total);
  }, [cart]);

useEffect(() => {
  fetchCatalog();
}, []);


const fetchCatalog = async () => {
  try {
    setLoadingProducts(true);

    const res = await api.get("/inventory/public");

    console.log("STATUS:", res.status);
    console.log("DATA:", res.data);
    console.log("IS ARRAY:", Array.isArray(res.data));

    if (!Array.isArray(res.data)) {
      alert("Inventory API did not return an array. Check console.");
      return;
    }

    const inventoryProducts = res.data
      .filter(item => item.stock > 0)
      .map(item => ({
        _id: item.productId._id,
        name: item.productId.name,
        price: item.productId.price,
        image: item.productId.image,
        stock: item.stock,
        stockGroup: item.productId.stockGroup,
      }));

    setProducts(inventoryProducts);

  } catch (err) {
    console.error(err);
  } finally {
    setLoadingProducts(false);
  }
};



  const handleStudentSearch = async () => {
    if (!searchQuery.trim()) {
      alert("Please enter student name or hostel number");
      return;
    }

    try {
     const res = await api.get(
  `/students/public-search?q=${encodeURIComponent(searchQuery)}`
);

      setIsSearched(true);

      if (res.data.length === 0) {
        setSelectedStudent(null);
        setSearchResults([]);
        // setProducts([]);
        setCart([]);
        alert("No student found matching that name or hostel number");
        return;
      }

      if (res.data.length === 1) {
  setSelectedStudent(res.data[0]);
  setSearchResults([]);
  return;
}

      // Multiple students found
      setSelectedStudent(null);
      setSearchResults(res.data);
      // setProducts([]);
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
    
   if (!cart.find(item => item._id === product._id)) {
  setStagedQuantities(prev => ({
    ...prev,
    [product._id]: 1,
  }));
}
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
   if (!selectedStudent) {
  alert("Please search and select a student first.");
  return;
}

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

await fetchCatalog();

setCart([]);
setSelectedStudent(null);
setSearchQuery("");
setProductSearchQuery("");
setIsSearched(false);
    } catch {
      alert("Checkout failed");
    }
  };
const getCartQuantity = (productId) => {
  const item = cart.find((c) => c._id === productId);
  return item ? item.quantity : 0;
};
  const filteredProducts = products.filter((p) => {

  const matchesCategory =
    selectedCategory === "All" ||
    p.stockGroup?.name === selectedCategory;

  const matchesSearch =
    p.name
      .toLowerCase()
      .includes(productSearchQuery.toLowerCase());

  return matchesCategory && matchesSearch;
});
const categories = [
  "All",
  ...new Set(
    products.map(p => p.stockGroup?.name).filter(Boolean)
  ),
];
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    topSection: {
      marginBottom: "24px",
    },
   bottomGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
},
    card: {
      width: "100%",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
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
  fontSize: "42px",
  fontWeight: "900",
  fontFamily: "'Arial Black', 'Montserrat', 'Poppins', sans-serif",
  color: "#2563EB",
  letterSpacing: "2px",
  textTransform: "uppercase",
  textShadow: "2px 2px 6px rgba(37,99,235,0.25)",
  marginTop: 0,
  marginBottom: "16px",
},
    input: {
      flex: 1,
      padding: "12px 14px",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },
    productSearchInput: {
      width: "100%",
      padding: "10px 12px",
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      fontSize: "13px",
      color: "#0f172a",
      backgroundColor: "#f8fafc",
      outline: "none",
      transition: "border-color 0.2s, background-color 0.2s",
      boxSizing: "border-box",
      marginBottom: "16px",
    },
    primaryBtn: {
      padding: "12px 24px",
      background: "#2563eb",
      color: "#ffffff",
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
      color: "#1e293b",
      marginBottom: "12px",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      marginTop: "8px",
      textAlign: "left",
    },
    th: {
      backgroundColor: "#f1f5f9",
      color: "#334155",
      fontWeight: "600",
      padding: "12px",
      fontSize: "13px",
      borderBottom: "2px solid #e2e8f0",
    },
    tr: {
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    td: {
      padding: "12px",
      fontSize: "14px",
      color: "#0f172a",
      borderBottom: "1px solid #e2e8f0",
    },
    selectBtn: {
      padding: "6px 12px",
      background: "#0284c7",
      color: "#ffffff",
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
      borderTop: "1px solid #f1f5f9",
    },
    studentInlineBanner: {
      display: "flex",
      gap: "16px",
      fontSize: "14px",
      color: "#475569",
      fontWeight: "500",
      backgroundColor: "#f1f5f9",
      padding: "10px 14px",
      borderRadius: "8px",
      marginBottom: "16px",
    },
    studentName: {
      fontSize: "15px",
      fontWeight: "600",
      color: "#0f172a",
    },
    studentMeta: {
      fontSize: "13px",
      color: "#334155",
      fontWeight: "500",
    },
    walletBadge: {
      padding: "8px 14px",
      background: "#fef3c7",
      color: "#92400e",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      marginLeft: "auto",
    },
    scrollContainer: {
  maxHeight: "750px",
      overflowY: "auto",
      paddingRight: "6px",
    },
    productItem: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      padding: "12px 14px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      marginBottom: "10px",
    },
    productName: {
      fontWeight: "600",
      fontSize: "14px",
      color: "#0f172a",
    },
    productStock: {
      fontSize: "12px",
      color: "#64748b",
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
      border: "1px solid #e2e8f0",
      borderRadius: "8px",
      overflow: "hidden",
      backgroundColor: "#f8fafc",
    },
    qtyBtn: {
      width: "32px",
      height: "32px",
      border: "none",
      background: "transparent",
      color: "#334155",
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
      borderLeft: "1px solid #e2e8f0",
      borderRight: "1px solid #e2e8f0",
      background: "#ffffff",
      textAlign: "center",
      fontSize: "13px",
      fontWeight: "600",
      color: "#0f172a",
      outline: "none",
    },
    addBtn: {
      padding: "8px 14px",
      background: "#2563eb",
      color: "#ffffff",
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
      borderTop: "1px solid #e2e8f0",
    },
    totalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
    },
    totalLabel: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#64748b",
    },
    totalAmount: {
      fontSize: "22px",
      fontWeight: "700",
      color: "#0f172a",
    },
    remainingBalance: (isNegative) => ({
      fontSize: "13px",
      color: isNegative ? "#dc2626" : "#16a34a",
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
      background: "#16a34a",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    cancelBtn: {
      padding: "12px 20px",
      background: "#dc2626",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
    },
    highlightPrice: {
      color: "#0f172a",
      fontWeight: "700",
      fontSize: "14px",
      marginRight: "8px",
    },
    emptyState: {
      color: "#64748b",
      fontSize: "14px",
      margin: 0,
    },
    cartQtyText: {
      width: "35px",
      height: "24px",
      textAlign: "center",
      fontSize: "13px",
      fontWeight: "600",
      color: "#0f172a",
      border: "1px solid #cbd5e1",
      borderRadius: "4px",
      outline: "none",
      backgroundColor: "#ffffff",
    },
    cartQtyBtn: {
      width: "24px",
      height: "24px",
      borderRadius: "4px",
      border: "1px solid #cbd5e1",
      background: "#f8fafc",
      cursor: "pointer",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      fontWeight: "700",
      fontSize: "12px",
      color: "#475569",
    },
    removeBtn: {
  width: "26px",
  height: "26px",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#fee2e2",
  color: "#ef4444",
  border: "none",
  borderRadius: "6px",
  fontSize: "16px",
  fontWeight: "600",
  cursor: "pointer",
  transition: "all 0.2s ease",
  lineHeight: "1",
  padding: 0,
},

welcomeScreen: {
  minHeight: "100vh",
  display: "flex",
  flexDirection: "column",
  justifyContent: "center",
  alignItems: "center",
  textAlign: "center",

  background:
    "linear-gradient(135deg,#FF6B35 0%, #F59E0B 50%, #FACC15 100%)",

  color: "#ffffff",
  overflow: "hidden",
},

welcomeTitle: {
  fontSize: "72px",
  fontWeight: "900",
  letterSpacing: "2px",
  color: "#ffffff",
  textShadow: "3px 3px 10px rgba(0,0,0,.25)",
  marginTop: 25,
  marginBottom: 15,
},

welcomeSubTitle: {
  fontSize: "28px",
  fontWeight: "500",
  color: "#FFF7ED",
  // marginBottom: "45px",
},

startButton: {
  padding: "22px 85px",
  fontSize: "28px",
  fontWeight: "700",
  border: "none",
  borderRadius: "60px",
  background: "#ffffff",
  color: "#EA580C",
  cursor: "pointer",
  boxShadow: "0 15px 30px rgba(0,0,0,.25)",
  transition: ".3s",
  marginTop: 0,       // remove top margin
},



productGrid: {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill,minmax(220px,1fr))",
  gap: 22,
},

productCard: {
  background: "#fff",
  borderRadius: 18,
  overflow: "hidden",
  boxShadow: "0 8px 25px rgba(0,0,0,.08)",
  border: "1px solid #eee",
  transition: ".25s",
},

productImage: {
  width: "100%",
  height: 170,
  objectFit: "cover",
},

productBody: {
  padding: 15,
},

productTitle: {
  fontWeight: 700,
  fontSize: 18,
  marginBottom: 8,
},

priceText: {
  color: "#2563EB",
  fontWeight: 700,
  fontSize: 20,
},

stockBadge: {
  display: "inline-block",
  background: "#DCFCE7",
  color: "#166534",
  padding: "4px 10px",
  borderRadius: 20,
  fontSize: 12,
  marginTop: 6,
},

cardFooter: {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  marginTop: 14,
},

    
  };
if (showWelcome) {
  return (
    <div style={styles.welcomeScreen}>
      
     <img
  src={hungerLogo}
  alt="Hunger Hunt"
  style={{
    width: "420px",
    maxWidth: "85%",
    height: "auto",
    marginBottom: "20px",
  }}
/>

{/* <h1 style={styles.welcomeTitle}>
  HUNGER HUNT
</h1> */}

<div
  style={{
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    gap: "0px", // No gap between text and button
  }}
>
  {/* <p
    style={{
      fontSize: "28px",
      fontWeight: "500",
      color: "#FFF7ED",
      margin: 0,
      lineHeight: 1.4,
      textAlign: "center",
    }}
  >
   • Fresh • Fast • Delicious
  
  </p> */}

  <button
    style={{
      ...styles.startButton,
      marginTop: 0,
    }}
    onClick={() => setShowWelcome(false)}
  >
    START ORDER
  </button>
</div>
    </div>
  );
}
  return (
    <div style={styles.page}>
      <style>{`
        ::-webkit-scrollbar {
          width: 10px;
          height: 10px;
        }
        ::-webkit-scrollbar-track {
          background: #f1f5f9;
          border-radius: 8px;
        }
        ::-webkit-scrollbar-thumb {
          background: #2563eb;
          border-radius: 8px;
          border: 2px solid #f1f5f9;
        }
        ::-webkit-scrollbar-thumb:hover {
          background: #1d4ed8;
        }
        .product-scroll-panel::-webkit-scrollbar {
          width: 6px;
        }
        .product-scroll-panel::-webkit-scrollbar-track {
          background: #f8fafc;
          border-radius: 4px;
        }
        .product-scroll-panel::-webkit-scrollbar-thumb {
          background: #3b82f6;
          border-radius: 4px;
        }
        .product-scroll-panel::-webkit-scrollbar-thumb:hover {
          background: #2563eb;
        }
      `}</style>

      

      {/* BOTTOM SECTION - DUAL SIDE-BY-SIDE PANEL */}
      <div style={styles.bottomGrid}>
          {/* LEFT SIDE: AVAILABLE PRODUCTS */}
          <div style={styles.card}>
            <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  }}
>
  <div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "16px",
  }}
>
  <h3 style={{ ...styles.panelTitle, marginBottom: 0 }}>
    HUNGER HUNT
  </h3>

  
</div>

  <button
    onClick={() => setShowCart(true)}
    style={{
      border: "none",
      background: "transparent",
      cursor: "pointer",
      position: "relative",
    }}
  >
    <ShoppingCart size={34} />

    {cart.length > 0 && (
      <span
        style={{
          position: "absolute",
          top: -6,
          right: -8,
          background: "#ef4444",
          color: "#fff",
          width: 20,
          height: 20,
          borderRadius: "50%",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          fontSize: 12,
          fontWeight: "bold",
        }}
      >
        {cart.length}
      </span>
    )}
  </button>
</div>
            <div
  style={{
    display: "flex",
    gap: 12,
    overflowX: "auto",
    marginBottom: 20,
    paddingBottom: 6,
  }}
>
  {categories.map(category => (
    <button
      key={category}
      onClick={() => setSelectedCategory(category)}
      style={{
        padding: "12px 22px",
        borderRadius: 30,
        border: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
        fontWeight: 700,
        fontSize: 15,

        background:
          selectedCategory === category
            ? "#2563EB"
            : "#E5E7EB",

        color:
          selectedCategory === category
            ? "#fff"
            : "#111827",
      }}
    >
      {category}
    </button>
  ))}
</div>
            <input
              style={styles.productSearchInput}
              placeholder="🔍 Quick filter products by name..."
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
              onFocus={(e) => {
                e.currentTarget.style.borderColor = "#2563eb";
                e.currentTarget.style.backgroundColor = "#ffffff";
              }}
              onBlur={(e) => {
                e.currentTarget.style.borderColor = "#e2e8f0";
                e.currentTarget.style.backgroundColor = "#f8fafc";
              }}
            />

            <div className="product-scroll-panel" style={styles.scrollContainer}>
              {loadingProducts ? (
  <div
    style={{
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      height: 250,
      fontSize: 18,
      fontWeight: 600,
    }}
  >
    Loading Products...
  </div>
) : filteredProducts.length === 0 ? (
  <p
    style={{
      ...styles.emptyState,
      textAlign: "center",
      padding: "20px 0",
    }}
  >
    No active items match your product filters.
  </p>
) : (
                <div style={styles.productGrid}>
  {filteredProducts.map((p) => {

    const cartItem = cart.find(item => item._id === p._id);

    const currentQty =
      cartItem
        ? cartItem.quantity
        : (stagedQuantities[p._id] ?? 1);

    return (

      <div key={p._id} style={styles.productCard}>

        <img
          src={p.image || "https://placehold.co/400x300?text=No+Image"}
          alt={p.name}
          style={styles.productImage}
        />

        <div style={styles.productBody}>

          <div style={styles.productTitle}>
            {p.name}
          </div>

          <div style={styles.priceText}>
            ₹{p.price}
          </div>

          <div style={styles.stockBadge}>
            Stock : {p.stock}
          </div>

          <div style={styles.cardFooter}>

            <div style={styles.qtySelector}>

              <button
                style={styles.qtyBtn}
                onClick={() => {
                  if (cartItem)
                    updateCartItemQuantity(p._id, -1);
                  else
                    updateStagedQuantity(p._id, -1, p.stock);
                }}
              >
                -
              </button>

              <input
                value={currentQty}
                style={styles.qtyInput}
                onChange={(e) => {
                  if (cartItem)
                    handleCartManualQuantityChange(
                      p._id,
                      e.target.value
                    );
                  else
                    handleManualQuantityChange(
                      p._id,
                      e.target.value,
                      p.stock
                    );
                }}
              />

              <button
                style={styles.qtyBtn}
                onClick={() => {
                  if (cartItem)
                    updateCartItemQuantity(p._id, 1);
                  else
                    updateStagedQuantity(p._id, 1, p.stock);
                }}
              >
                +
              </button>

            </div>

            <button
              style={styles.addBtn}
              onClick={() => addToCart(p)}
            >
              Add
            </button>

          </div>

        </div>

      </div>

    );

  })}
</div>
              )}
            </div>
          </div>

        </div>
      {showCart && (
  <>
    <div
      onClick={() => setShowCart(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.45)",
        backdropFilter: "blur(5px)",
        zIndex: 998,
      }}
    />

    <div
      style={{
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: "90%",
        maxWidth: "900px",
        height: "85vh",
        background: "#fff",
        borderRadius: "18px",
        boxShadow: "0 20px 60px rgba(0,0,0,0.3)",
        zIndex: 999,
        padding: 25,
        overflowY: "auto",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 20,
        }}
      >
        <h2>My Cart</h2>

        <button
          onClick={() => setShowCart(false)}
          style={{
            border: "none",
            background: "transparent",
            cursor: "pointer",
          }}
        >
          <X size={28} />
        </button>
      </div>

      <div style={styles.lookupFlex}>
  <input
    style={styles.input}
    placeholder="Search Student Name / Hostel Number"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />

  <button
    style={styles.primaryBtn}
    onClick={handleStudentSearch}
  >
    Search
  </button>
</div>
{searchResults.length > 0 && (
  <div style={styles.resultsSection}>
    <table style={styles.table}>
      <thead>
        <tr>
          <th style={styles.th}>Student</th>
          <th style={styles.th}>Hostel</th>
          <th style={styles.th}></th>
        </tr>
      </thead>

      <tbody>
        {searchResults.map((student) => (
          <tr key={student._id}>
            <td style={styles.td}>{student.name}</td>

            <td style={styles.td}>
              {student.hostelNumber}
            </td>

            <td style={styles.td}>
              <button
                style={styles.selectBtn}
                onClick={() => {
                  setSelectedStudent(student);
                  setSearchResults([]);
                }}
              >
                Select
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
)}

    {selectedStudent && (
  <div
    style={{
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: 18,
      padding: "16px 20px",
      margin: "18px 0",
      border: "1px solid #E5E7EB",
      borderRadius: 12,
      background: "#F8FAFC",
    }}
  >
    <div>
      <div style={{ fontSize: 12, color: "#64748B" }}>
        Student
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.name}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "#64748B" }}>
        Father
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.fatherName}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "#64748B" }}>
        Hostel No
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.hostelNumber}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "#64748B" }}>
        Phone
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.parentPhoneNumber}
      </div>
    </div>

    <div
      style={{
        marginLeft: "auto",
        background: "#FEF3C7",
        color: "#92400E",
        padding: "12px 18px",
        borderRadius: 10,
        textAlign: "center",
        minWidth: 180,
      }}
    >
      <div style={{ fontSize: 12 }}>
        Wallet Balance
      </div>

      <div
        style={{
          fontSize: 26,
          fontWeight: 700,
        }}
      >
        ₹{selectedStudent.pocketMoney}
      </div>
    </div>
  </div>
)}

      {cart.length === 0 ? (
  <p style={styles.emptyState}>Cart is empty.</p>
) : (
  <table style={styles.table}>
    <thead>
  <tr>
    <th style={styles.th}>Image</th>
    <th style={styles.th}>Product Name</th>
    <th style={styles.th}>Unit Price</th>
    <th style={styles.th}>Quantity</th>
    <th style={styles.th}>Total Price</th>
    <th style={styles.th}></th>
  </tr>
</thead>

    <tbody>
  {cart.map((item) => (
    <tr key={item._id}>

      {/* Product Image */}
      <td style={styles.td}>
        <img
          src={item.image || "https://placehold.co/80x80?text=No+Image"}
          alt={item.name}
          style={{
            width: 70,
            height: 70,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid #ddd",
          }}
        />
      </td>

      {/* Product Name */}
      <td style={styles.td}>
        <strong>{item.name}</strong>
      </td>

      {/* Unit Price */}
      <td style={styles.td}>
        ₹{item.price}
      </td>

      {/* Quantity */}
      <td style={styles.td}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            style={styles.cartQtyBtn}
            onClick={() =>
              updateCartItemQuantity(item._id, -1)
            }
          >
            -
          </button>

          <input
            value={item.quantity}
            style={styles.cartQtyText}
            onChange={(e) =>
              handleCartManualQuantityChange(
                item._id,
                e.target.value
              )
            }
          />

          <button
            style={styles.cartQtyBtn}
            onClick={() =>
              updateCartItemQuantity(item._id, 1)
            }
          >
            +
          </button>
        </div>
      </td>

      {/* Total */}
      <td style={styles.td}>
        ₹{item.price * item.quantity}
      </td>

      {/* Remove */}
      <td style={styles.td}>
        <button
          style={styles.removeBtn}
          onClick={() => removeFromCart(item._id)}
        >
          ×
        </button>
      </td>

    </tr>
  ))}
</tbody>
  </table>
)}
       {/* <div style={styles.checkoutSection}>
                <div style={styles.totalRow}>
                  <span style={styles.totalLabel}>Total Bill</span>
                  <span style={styles.totalAmount}>₹{invoiceTotal}</span>
           </div> */}
<div style={styles.checkoutSection}>
  <div style={styles.totalRow}>
    <span style={styles.totalLabel}>
      Total Bill
    </span>

    <span style={styles.totalAmount}>
      ₹{invoiceTotal}
    </span>
  </div>
                {selectedStudent && (
  <div style={styles.remainingBalance(selectedStudent.pocketMoney - invoiceTotal < 0)}>
                   {selectedStudent.pocketMoney - invoiceTotal < 0
                    ? `Overdraft Limit Exceeded by ₹${Math.abs(selectedStudent.pocketMoney - invoiceTotal)}`
                     : `Remaining Balance: ₹${selectedStudent.pocketMoney - invoiceTotal}`}
                 </div>)}

                 <div style={styles.btnActionGroup}>
                  <button
                     style={styles.cancelBtn}
                    onClick={handleCancelPayment}
                     onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#b91c1c")}
                     onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#dc2626")}
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
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#15803d")}
                     onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#16a34a")}
                     disabled={
   !selectedStudent ||
  cart.length === 0 ||
  selectedStudent.pocketMoney - invoiceTotal < 0
 }
                  >
                     Complete Payment
                  </button>
             </div>
             </div>
         </div>
    </>
)}

{/* ===== Parent Verification Popup ===== */}

{/* ===== Parent Verification Popup ===== */}

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
        background: "#fff",
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
            background: "#16A34A",
            color: "#fff",
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

<RefreshButton
  onRefresh={refreshPage}
  loading={loadingProducts}
/>
    </div>
  );
};

export default KioskBilling;