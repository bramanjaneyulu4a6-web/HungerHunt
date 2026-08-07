import { useState, useEffect } from "react";
import { ShoppingCart, X } from "lucide-react";
import toast from "react-hot-toast";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";
import { formatINR } from "../utils/format";
import hungerLogo from "../assets/Logo.png";

const KioskBilling = ({ onLogout }) => {
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [products, setProducts] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState("All");
  const [cart, setCart] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [, setIsSearched] = useState(false); // Tracks if a search has been executed
 
  // Track configurations for staging quantities before appending to cart
  // Format: { [productId]: quantity }
  const [stagedQuantities, setStagedQuantities] = useState({});

const [loadingProducts, setLoadingProducts] = useState(false);
const [showWelcome, setShowWelcome] = useState(true);
const [showCart, setShowCart] = useState(false);
 const [showVerifyModal, setShowVerifyModal] = useState(false);

const [purchasePassword, setPurchasePassword] = useState("");
const [paying, setPaying] = useState(false);
const [inventoryError, setInventoryError] = useState("");

const refreshPage = async () => {
  try {
    setLoadingProducts(true);

   const res = await api.get("/inventory");

const data = Array.isArray(res.data) ? res.data : [];

const inventoryProducts = data
  .filter(item => item.stock > 0 && item.productId)
  .map(item => ({
    _id: item.productId?._id,
    name: item.productId?.name,
    price: item.productId?.price,
    image: item.productId?.image,
    stock: item.stock,
    stockGroup: item.productId?.stockGroup,
  }))
  .filter(item => item._id);

    // Refresh product list
    setProducts(inventoryProducts);
    setInventoryError("");

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
// Drop the selected student so their balance is re-read on the next lookup.
// The cart survives — it was just reconciled against fresh stock above.
setSelectedStudent(null);
setSearchResults([]);
setSearchQuery("");
setIsSearched(false);
  } catch (err) {
    console.error(err);
    toast.error("Failed to refresh products.");
  } finally {
    setLoadingProducts(false);
  }
};

  useEffect(() => {
    // A cleared quantity box prices as 1, which is what checkout posts and what
    // the steppers clamp to. Treating it as 0 here understated the bill.
    const total = cart.reduce(
      (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 1),
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

    const res = await api.get("/inventory");

    if (!Array.isArray(res.data)) {
      setInventoryError("Inventory data could not be loaded. Please try refreshing.");
      setProducts([]);
      return;
    }

    const inventoryProducts = res.data
      .filter(item => item.stock > 0 && item.productId)
      .map(item => ({
        _id: item.productId?._id,
        name: item.productId?.name,
        price: item.productId?.price,
        image: item.productId?.image,
        stock: item.stock,
        stockGroup: item.productId?.stockGroup,
      }))
      .filter(item => item._id);

    setProducts(inventoryProducts);
    setInventoryError("");

  } catch (err) {
    console.error(err);
    setInventoryError("Failed to load inventory. Please try refreshing.");
  } finally {
    setLoadingProducts(false);
  }
};



  // The cart belongs to whoever is selected. Switching to a different student
  // must not carry the previous one's goods onto their bill; re-selecting the
  // same student leaves the cart alone.
  const selectStudent = (student) => {
    if (selectedStudent && selectedStudent._id !== student._id) setCart([]);
    setSelectedStudent(student);
  };

  const handleStudentSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Please enter student name or hostel number");
      return;
    }

    if (searchQuery.trim().length < 2) {
      toast.error("Please enter at least 2 characters to search");
      return;
    }

    try {
     const res = await api.get(
  `/students/search?q=${encodeURIComponent(searchQuery)}`
);

      setIsSearched(true);

      // A search that finds nothing, or that needs the cashier to pick from a
      // list, has not changed who is being served — so it leaves both the
      // selected student and the cart alone.
      if (res.data.length === 0) {
        setSearchResults([]);
        toast.error("No student found matching that name or hostel number");
        return;
      }

      if (res.data.length === 1) {
        selectStudent(res.data[0]);
        setSearchResults([]);
        return;
      }

      setSearchResults(res.data);
    } catch (error) {
      console.error(error);
      toast.error("Student search failed");
    }
  };

  const updateStagedQuantity = (productId, amount, maxStock) => {
    setStagedQuantities(prev => {
      const current = parseInt(prev[productId], 10) || 0;
      const updated = current + amount;
      if (updated < 1) return prev;
      if (updated > maxStock) {
        toast.error(`Only ${maxStock} items available in stock!`);
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
      toast.error(`Only ${maxStock} items available in stock!`);
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
      return toast.error(`Insufficient stock! Total in cart cannot exceed available stock (${product.stock}).`);
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
            toast.error(`Cannot exceed available warehouse stock of ${maxStock}!`);
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
            toast.error(`Cannot exceed available warehouse stock of ${maxStock}!`);
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
  toast.error("Please search and select a student first.");
  return;
}

    const calibratedCart = cart.map(item => ({
      ...item,
      quantity: parseInt(item.quantity, 10) || 1
    }));

    if (invoiceTotal > selectedStudent.pocketMoney) {
      return toast.error("Insufficient wallet balance!");
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

      toast.success("Payment successful!");

await fetchCatalog();

setCart([]);
setSelectedStudent(null);
setSearchQuery("");
setProductSearchQuery("");
setIsSearched(false);
setShowCart(false);
setShowWelcome(true);
    } catch (err) {

  console.error("Checkout Error:", err);

  toast.error(
    err.response?.data?.message ||
    err.response?.data?.error ||
    "Checkout failed"
  );
}
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
if (showWelcome) {
  return (
    <div className="kiosk-welcome">
      
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

{/* <h1 className="kiosk-welcome-title">
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
  <button className="kiosk-start" onClick={() => setShowWelcome(false)}>
    START ORDER
  </button>
</div>
    </div>
  );
}
  return (
    <div className="page">
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

      

      {/* BOTTOM SECTION - DUAL SIDE-BY-SIDE PANEL */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr" }}>
          {/* LEFT SIDE: AVAILABLE PRODUCTS */}
          <div className="card">
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
  <h3 className="kiosk-title" style={{ marginBottom: 0 }}>
    Hunger Hunt
  </h3>

  
</div>

  <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
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
            background: "var(--danger-light)",
            color: "var(--on-dark)",
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

    {onLogout && (
    <button
      onClick={onLogout}
      style={{
        padding: "10px 18px",
        background: "var(--danger)",
        color: "var(--on-dark)",
        border: "none",
        borderRadius: "8px",
        fontWeight: "600",
        fontSize: "13px",
        cursor: "pointer",
      }}
    >
      Logout
    </button>
    )}
  </div>
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
            ? "var(--primary)"
            : "var(--border)",

        color:
          selectedCategory === category
            ? "var(--surface)"
            : "var(--ink)",
      }}
    >
      {category}
    </button>
  ))}
</div>
            {inventoryError && (
              <div
                style={{
                  background: "var(--danger-bg-strong)",
                  color: "var(--danger)",
                  padding: "12px 14px",
                  borderRadius: "8px",
                  fontSize: "13px",
                  fontWeight: "600",
                  marginBottom: "16px",
                }}
              >
                {inventoryError}
              </div>
            )}

            <input
              className="kiosk-search"
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

            <div className="product-scroll-panel kiosk-scroll">
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
  <p className="kiosk-empty" style={{ textAlign: "center", padding: "20px 0" }}>
    No active items match your product filters.
  </p>
) : (
                <div className="kiosk-grid">
  {filteredProducts.map((p) => {

    const cartItem = cart.find(item => item._id === p._id);

    const currentQty =
      cartItem
        ? cartItem.quantity
        : (stagedQuantities[p._id] ?? 1);

    return (

      <div key={p._id} className="kiosk-product">

        <img
          src={p.image || "https://placehold.co/400x300?text=No+Image"}
          alt={p.name}
          className="kiosk-product-img"
        />

        <div className="kiosk-product-body">
<div
  style={{
    fontSize: "18px",
    fontWeight: "700",
    color: "var(--ink-soft)",
    marginBottom: "8px",
    textAlign: "left",
  }}
>
  {p.name}
</div>

<div
  style={{
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: "12px",
  }}
>
  <div>
    <div
      style={{
        fontSize: "18px",
        fontWeight: "700",
        color: "var(--ink)",
      }}
    >
      {formatINR(p.price)}
    </div>
  </div>

  <div
    style={{
      fontSize: "15px",
      fontWeight: "500",
      color: "var(--ink-soft)",
    }}
  >
    {p.stock} Stock
  </div>
</div>

          <div className="kiosk-card-footer">

            <div className="kiosk-qty">

              <button
                className="kiosk-qty-btn"
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
                className="kiosk-qty-input"
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
                className="kiosk-qty-btn"
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
              className="btn btn--primary btn--sm"
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
        background: "var(--surface)",
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

      <div className="kiosk-lookup">
  <input
    className="kiosk-input"
    placeholder="Search Student Name / Hostel Number"
    value={searchQuery}
    onChange={(e) => setSearchQuery(e.target.value)}
  />

  <button
    className="btn btn--brand"
    onClick={handleStudentSearch}
  >
    Search
  </button>
</div>
{searchResults.length > 0 && (
  <div className="kiosk-results">
    <table className="kiosk-table">
      <thead>
        <tr>
          <th>Student</th>
          <th>Hostel</th>
          <th></th>
        </tr>
      </thead>

      <tbody>
        {searchResults.map((student) => (
          <tr key={student._id}>
            <td>{student.name}</td>

            <td>
              {student.hostelNumber}
            </td>

            <td>
              <button
                className="btn btn--primary btn--sm"
                onClick={() => {
                  selectStudent(student);
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
      border: "1px solid var(--border)",
      borderRadius: 12,
      background: "var(--bg)",
    }}
  >
    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Student
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.name}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Father
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.fatherName}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Hostel No
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.hostelNumber}
      </div>
    </div>

    <div>
      <div style={{ fontSize: 12, color: "var(--muted)" }}>
        Phone
      </div>
      <div style={{ fontWeight: 700, fontSize: 17 }}>
        {selectedStudent.parentPhoneNumber}
      </div>
    </div>

    <div
      style={{
        marginLeft: "auto",
        background: "var(--warn-bg)",
        color: "var(--warn-ink)",
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
        {formatINR(selectedStudent.pocketMoney)}
      </div>
    </div>
  </div>
)}

      {cart.length === 0 ? (
  <p className="kiosk-empty">Cart is empty.</p>
) : (
  <table className="kiosk-table">
    <thead>
  <tr>
    <th>Image</th>
    <th>Product Name</th>
    <th>Unit Price</th>
    <th>Quantity</th>
    <th>Total Price</th>
    <th></th>
  </tr>
</thead>

    <tbody>
  {cart.map((item) => (
    <tr key={item._id}>

      {/* Product Image */}
      <td>
        <img
          src={item.image || "https://placehold.co/80x80?text=No+Image"}
          alt={item.name}
          style={{
            width: 70,
            height: 70,
            objectFit: "cover",
            borderRadius: 8,
            border: "1px solid var(--border-strong)",
          }}
        />
      </td>

      {/* Product Name */}
      <td>
        <strong>{item.name}</strong>
      </td>

      {/* Unit Price */}
      <td>
        {formatINR(item.price)}
      </td>

      {/* Quantity */}
      <td>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <button
            className="kiosk-cart-qty-btn"
            onClick={() =>
              updateCartItemQuantity(item._id, -1)
            }
          >
            -
          </button>

          <input
            value={item.quantity}
            className="kiosk-cart-qty"
            onChange={(e) =>
              handleCartManualQuantityChange(
                item._id,
                e.target.value
              )
            }
          />

          <button
            className="kiosk-cart-qty-btn"
            onClick={() =>
              updateCartItemQuantity(item._id, 1)
            }
          >
            +
          </button>
        </div>
      </td>

      {/* Total */}
      <td>
        {formatINR(item.price * (parseInt(item.quantity, 10) || 1))}
      </td>

      {/* Remove */}
      <td>
        <button
          className="kiosk-remove"
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
<div className="kiosk-checkout">
  <div className="kiosk-total-row">
    <span className="kiosk-total-label">
      Total Bill
    </span>

    <span className="kiosk-total-amount">
      {formatINR(invoiceTotal)}
    </span>
  </div>
                {selectedStudent && (
  <div
    className={`kiosk-balance${
      selectedStudent.pocketMoney - invoiceTotal < 0
        ? " kiosk-balance--negative"
        : ""
    }`}
  >
                   {selectedStudent.pocketMoney - invoiceTotal < 0
                    ? `Balance short by ${formatINR(Math.abs(selectedStudent.pocketMoney - invoiceTotal))}`
                     : `Remaining Balance: ${formatINR(selectedStudent.pocketMoney - invoiceTotal)}`}
                 </div>)}

                 <div className="kiosk-actions">
                  <button
                     className="btn btn--danger"
                    onClick={handleCancelPayment}
                     onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--danger-strong)")}
                     onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--danger)")}
                  >
                     Cancel Payment
                  </button>
                  <button
                    className="btn btn--success" style={{ flex: 1 }}
                    onClick={() => {
  if (!selectedStudent) {
    toast.error("Please select a student.");
    return;
  }

  setShowVerifyModal(true);
}}
                    onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "var(--success-strong)")}
                     onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--success)")}
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
          border: "1px solid var(--border-strong)",
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
          border: "1px solid var(--border-strong)",
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
            border: "1px solid var(--border-strong)",
            cursor: "pointer"
          }}
          disabled={paying}
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
          disabled={paying}
          onClick={async () => {
            // Without this guard a second tap during the verify round-trip
            // re-enters from the same closure and bills the student twice.
            if (paying) return;
            setPaying(true);

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

              toast.error(
                err.response?.data?.message ||
                "Verification Failed"
              );

            } finally {
              setPaying(false);
            }
          }}
        >
          {paying ? "Processing…" : "Verify & Pay"}
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



