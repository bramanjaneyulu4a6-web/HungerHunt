import { useState, useEffect, useRef } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import { formatINR } from "../utils/format";
import { Banner, Button, Card, PageHeader } from "../components/ui";

const Billing = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [productSearchQuery, setProductSearchQuery] = useState("");
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [products, setProducts] = useState([]);
  const [catalogError, setCatalogError] = useState(false);
  const [cart, setCart] = useState([]);
  const [invoiceTotal, setInvoiceTotal] = useState(0);
  const [isSearched, setIsSearched] = useState(false);
  const [paying, setPaying] = useState(false);

  // `paying` drives the disabled state and the label, but it cannot be the
  // lock: setPaying does not apply until the next render, so submits landing in
  // the same tick all read false and every one of them raises an order. A ref
  // flips synchronously, so the second one bails however fast it arrives.
  const payingRef = useRef(false);

  // Staged quantities before appending to cart: { [productId]: quantity }
  const [stagedQuantities, setStagedQuantities] = useState({});

  useEffect(() => {
    // A cleared quantity box prices as 1, which is what checkout posts and what
    // the steppers clamp to. Treating it as 0 here understated the bill.
    const total = cart.reduce(
      (sum, item) => sum + item.price * (parseInt(item.quantity, 10) || 1),
      0
    );
    setInvoiceTotal(total);
  }, [cart]);

  const fetchCatalog = async () => {
    setCatalogError(false);

    try {
      const res = await api.get("/inventory");

      const inventoryProducts = (Array.isArray(res.data) ? res.data : [])
        .filter(
          (item) =>
            item.productId && item.stock > 0 && item.productId.active !== false
        )
        .map((item) => ({
          _id: item.productId._id,
          name: item.productId.name,
          price: item.productId.price,
          stock: item.stock,
        }));

      setProducts(inventoryProducts);

      const initialQuantities = {};
      inventoryProducts.forEach((product) => {
        initialQuantities[product._id] = 1;
      });
      setStagedQuantities(initialQuantities);
    } catch (error) {
      console.error(error);
      setCatalogError(true);
    }
  };

  // The cart belongs to whoever is selected. Switching to a different student
  // must not carry the previous one's goods onto their bill; re-selecting the
  // same student leaves the cart alone.
  const selectStudent = (student) => {
    if (selectedStudent && selectedStudent._id !== student._id) setCart([]);
    setSelectedStudent(student);
    fetchCatalog();
  };

  const handleStudentSearch = async () => {
    if (!searchQuery.trim()) {
      toast.error("Enter a student name or hostel number");
      return;
    }

    if (searchQuery.trim().length < 2) {
      setSelectedStudent(null);
      setSearchResults([]);
      setIsSearched(false);
      return;
    }

    setSearching(true);

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
      toast.error("Student search failed — check your connection and retry");
    } finally {
      setSearching(false);
    }
  };

  // Decisions and toasts happen here rather than inside the updater: React
  // double-invokes updaters under StrictMode, which fired every warning twice.
  const updateStagedQuantity = (productId, amount, maxStock) => {
    const updated = (parseInt(stagedQuantities[productId], 10) || 0) + amount;

    if (updated < 1) return;
    if (updated > maxStock) {
      toast.error(`Only ${maxStock} in stock`);
      return;
    }

    setStagedQuantities((prev) => ({ ...prev, [productId]: updated }));
  };

  const handleManualQuantityChange = (productId, value, maxStock) => {
    if (value === "") {
      setStagedQuantities((prev) => ({ ...prev, [productId]: "" }));
      return;
    }

    const parsed = parseInt(value, 10);
    if (isNaN(parsed)) return;

    if (parsed < 1) {
      setStagedQuantities((prev) => ({ ...prev, [productId]: 1 }));
      return;
    }
    if (parsed > maxStock) {
      toast.error(`Only ${maxStock} in stock`);
      setStagedQuantities((prev) => ({ ...prev, [productId]: maxStock }));
      return;
    }
    setStagedQuantities((prev) => ({ ...prev, [productId]: parsed }));
  };

  const addToCart = (product) => {
    const qtyToAdd = parseInt(stagedQuantities[product._id], 10) || 1;
    const exists = cart.find((item) => item._id === product._id);
    const currentCartQty = exists ? parseInt(exists.quantity, 10) || 0 : 0;

    if (currentCartQty + qtyToAdd > product.stock) {
      toast.error(`Insufficient stock — only ${product.stock} available`);
      return;
    }

    if (exists) {
      setCart(
        cart.map((item) =>
          item._id === product._id
            ? {
                ...item,
                quantity: (parseInt(item.quantity, 10) || 0) + qtyToAdd,
              }
            : item
        )
      );
    } else {
      setCart([...cart, { ...product, quantity: qtyToAdd }]);
    }

    setStagedQuantities((prev) => ({ ...prev, [product._id]: 1 }));
  };

  const updateCartItemQuantity = (productId, amount) => {
    const targetProduct = products.find((p) => p._id === productId);
    const maxStock = targetProduct ? targetProduct.stock : 999;

    const item = cart.find((i) => i._id === productId);
    if (!item) return;

    const updatedQty = (parseInt(item.quantity, 10) || 0) + amount;

    if (updatedQty > maxStock) {
      toast.error(`Only ${maxStock} in stock`);
      return;
    }

    if (updatedQty < 1) {
      setCart((prev) => prev.filter((i) => i._id !== productId));
      return;
    }

    setCart((prev) =>
      prev.map((i) => (i._id === productId ? { ...i, quantity: updatedQty } : i))
    );
  };

  const handleCartManualQuantityChange = (productId, value) => {
    if (value === "") {
      setCart((prevCart) =>
        prevCart.map((item) =>
          item._id === productId ? { ...item, quantity: "" } : item
        )
      );
      return;
    }

    const targetProduct = products.find((p) => p._id === productId);
    const maxStock = targetProduct ? targetProduct.stock : 999;
    const parsed = parseInt(value, 10);

    if (isNaN(parsed)) return;

    let next = parsed;

    if (parsed < 1) {
      next = 1;
    } else if (parsed > maxStock) {
      toast.error(`Only ${maxStock} in stock`);
      next = maxStock;
    }

    setCart((prev) =>
      prev.map((i) => (i._id === productId ? { ...i, quantity: next } : i))
    );
  };

  const removeFromCart = (productId) => {
    setCart((prevCart) => prevCart.filter((item) => item._id !== productId));
  };

  const handleCancelPayment = () => {
    if (!window.confirm("Cancel this payment and reset the terminal?")) return;
    setCart([]);
    setSelectedStudent(null);
    setSearchResults([]);
    setSearchQuery("");
    setProductSearchQuery("");
    setIsSearched(false);
  };

  // The cart priced as lines the server can charge. A cleared quantity box
  // bills as 1, the same way it prices.
  const billedItems = () =>
    cart.map((item) => ({
      productId: item._id,
      quantity: parseInt(item.quantity, 10) || 1,
    }));

  /* This screen no longer charges anything.
   *
   * It used to ask the child for their four-digit code and take the money on
   * the spot. That code was standing in for consent, which is not what it was
   * ever able to prove — only that whoever was at the counter knew four
   * digits. So the console stopped asking, and every order raised here goes to
   * the parent, who sees the exact items and answers. Nothing moves until they
   * do, whatever the student's approval setting says.
   *
   * A student can still buy on the spot: at the kiosk, with their own code,
   * against their own wallet. */
  const sendForApproval = async () => {
    if (payingRef.current) return;
    payingRef.current = true;
    setPaying(true);

    try {
      await api.post("/pending-orders", {
        studentId: selectedStudent._id,
        items: billedItems(),
      });

      toast.success(
        `Sent to ${selectedStudent.name}'s parent to approve — nothing has been charged yet.`,
        { duration: 8000 }
      );

      setCart([]);
      setSelectedStudent(null);
      setSearchQuery("");
      setProductSearchQuery("");
      setIsSearched(false);
    } catch (err) {
      toast.error(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Could not send the order for approval",
        { duration: 8000 }
      );
    } finally {
      payingRef.current = false;
      setPaying(false);
    }
  };

  const filteredProducts = products.filter((p) =>
    p.name.toLowerCase().includes(productSearchQuery.toLowerCase())
  );

  const remaining = selectedStudent
    ? selectedStudent.pocketMoney - invoiceTotal
    : 0;

  // Nothing raised here can be approved without a parent on the other end.
  const parentMissing = Boolean(selectedStudent) && !selectedStudent.isParentRegistered;

  return (
    <div className="page">
      <PageHeader
        title="Billing Terminal"
        subtitle="Look up a student, build a cart, and charge their wallet."
      />

      <Card className="card--tight" style={{ marginBottom: 24 }}>
        <h2 className="section-title">Student Lookup</h2>

        <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
          <input
            className="input"
            aria-label="Search student"
            placeholder="Search student by name or hostel number…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleStudentSearch()}
          />
          <Button onClick={handleStudentSearch} disabled={searching}>
            {searching ? "Searching…" : "Search"}
          </Button>
        </div>

        {searchResults.length > 0 && (
          <div style={{ marginTop: 20 }}>
            <h4
              style={{
                marginBottom: 12,
                fontSize: 15,
                fontWeight: 600,
                color: "var(--ink-strong)",
              }}
            >
              Multiple matches found — select a profile:
            </h4>
            <div className="table-wrap">
              <table className="table table--stack table--hover">
                <thead>
                  <tr>
                    <th>Student Name</th>
                    <th>Hostel No.</th>
                    <th>Father's Name</th>
                    <th>Wallet Balance</th>
                    <th style={{ textAlign: "right" }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {searchResults.map((student) => (
                    <tr key={student._id}>
                      <td data-label="Name">
                        <strong>{student.name}</strong>
                      </td>
                      <td data-label="Hostel No.">
                        {student.hostelNumber || "N/A"}
                      </td>
                      <td data-label="Father's Name">{student.fatherName}</td>
                      <td data-label="Wallet">
                        {formatINR(student.pocketMoney)}
                      </td>
                      <td data-label="Action" style={{ textAlign: "right" }}>
                        <Button
                          className="btn--sm"
                          onClick={() => {
                            selectStudent(student);
                            setSearchResults([]);
                          }}
                        >
                          Select Profile
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {selectedStudent && (
          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "center",
              flexWrap: "wrap",
              marginTop: 16,
              paddingTop: 16,
              borderTop: "1px solid var(--bg-subtle)",
            }}
          >
            <div>
              <span
                style={{ fontSize: 15, fontWeight: 600, color: "var(--ink)" }}
              >
                {selectedStudent.name}
              </span>
              <span style={{ color: "var(--border-strong)", margin: "0 8px" }}>
                |
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                }}
              >
                Hostel: {selectedStudent.hostelNumber || "N/A"}
              </span>
              <span style={{ color: "var(--border-strong)", margin: "0 8px" }}>
                |
              </span>
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 500,
                  color: "var(--ink-soft)",
                }}
              >
                Father: {selectedStudent.fatherName}
              </span>
            </div>
            <div
              style={{
                marginLeft: "auto",
                padding: "8px 14px",
                background: "var(--warn-bg)",
                color: "var(--warn-ink)",
                borderRadius: "var(--radius-sm)",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Wallet Balance: {formatINR(selectedStudent.pocketMoney)}
            </div>
          </div>
        )}
      </Card>

      {!selectedStudent ? (
        <Card className="card--tight">
          <p style={{ margin: 0, fontSize: 14, color: "var(--muted)" }}>
            {isSearched
              ? "No student profile is currently selected. Locate a student above to activate checkout."
              : "Search for a student above by name or hostel number to start a billing session."}
          </p>
        </Card>
      ) : (
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 24,
            alignItems: "flex-start",
          }}
        >
          <Card className="card--tight" style={{ flex: "1.1 1 380px", minWidth: 0 }}>
            <h3 className="section-title">Available Products</h3>

            <input
              type="search"
              className="kiosk-search"
              aria-label="Filter products"
              placeholder="🔍 Quick filter products by name…"
              value={productSearchQuery}
              onChange={(e) => setProductSearchQuery(e.target.value)}
            />

            <div style={{ maxHeight: 440, overflowY: "auto", paddingRight: 6 }}>
              {catalogError ? (
                <Banner variant="alert" icon="⚠️">
                  Couldn't load the product catalog.{" "}
                  <button
                    type="button"
                    className="link-button"
                    onClick={fetchCatalog}
                  >
                    Try again
                  </button>
                  .
                </Banner>
              ) : filteredProducts.length === 0 ? (
                <p
                  style={{
                    margin: 0,
                    padding: "20px 0",
                    textAlign: "center",
                    fontSize: 14,
                    color: "var(--muted)",
                  }}
                >
                  No in-stock products match your filter.
                </p>
              ) : (
                filteredProducts.map((p) => {
                  const currentStagedQty =
                    stagedQuantities[p._id] !== undefined
                      ? stagedQuantities[p._id]
                      : 1;
                  return (
                    <div
                      key={p._id}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: 12,
                        flexWrap: "wrap",
                        padding: "12px 14px",
                        background: "var(--surface)",
                        border: "1px solid var(--border)",
                        borderRadius: "var(--radius)",
                        marginBottom: 10,
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: 14,
                            color: "var(--ink)",
                          }}
                        >
                          {p.name}
                        </div>
                        <div
                          style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            marginTop: 2,
                          }}
                        >
                          Stock: {p.stock}
                        </div>
                      </div>

                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                        }}
                      >
                        <span
                          style={{
                            fontWeight: 700,
                            fontSize: 14,
                            color: "var(--ink)",
                          }}
                        >
                          {formatINR(p.price)}
                        </span>

                        <div className="kiosk-qty">
                          <button
                            type="button"
                            className="kiosk-qty-btn"
                            aria-label={`Decrease quantity of ${p.name}`}
                            onClick={() =>
                              updateStagedQuantity(p._id, -1, p.stock)
                            }
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="numeric"
                            className="kiosk-qty-input"
                            aria-label={`Quantity of ${p.name}`}
                            value={currentStagedQty}
                            onChange={(e) =>
                              handleManualQuantityChange(
                                p._id,
                                e.target.value,
                                p.stock
                              )
                            }
                          />
                          <button
                            type="button"
                            className="kiosk-qty-btn"
                            aria-label={`Increase quantity of ${p.name}`}
                            onClick={() =>
                              updateStagedQuantity(p._id, 1, p.stock)
                            }
                          >
                            +
                          </button>
                        </div>

                        <Button className="btn--sm" onClick={() => addToCart(p)}>
                          Add
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </Card>

          <Card className="card--tight" style={{ flex: "0.9 1 340px", minWidth: 0 }}>
            <h3 className="section-title">Current Cart</h3>

            <div
              style={{
                display: "flex",
                gap: 16,
                flexWrap: "wrap",
                fontSize: 14,
                color: "var(--ink-dim)",
                fontWeight: 500,
                background: "var(--bg-subtle)",
                padding: "10px 14px",
                borderRadius: "var(--radius-sm)",
                marginBottom: 16,
              }}
            >
              <div>
                <strong>Student:</strong> {selectedStudent.name}
              </div>
              <div>
                <strong>Hostel:</strong> {selectedStudent.hostelNumber || "N/A"}
              </div>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                minHeight: 340,
                justifyContent: "space-between",
              }}
            >
              <div style={{ overflowX: "auto" }}>
                {cart.length === 0 ? (
                  <p
                    style={{
                      margin: 0,
                      padding: "10px 0",
                      fontStyle: "italic",
                      fontSize: 14,
                      color: "var(--muted)",
                    }}
                  >
                    Cart is empty. Select quantities and click Add from the
                    product list.
                  </p>
                ) : (
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ background: "none", padding: "8px 4px", width: 40 }}>
                          S.No
                        </th>
                        <th style={{ background: "none", padding: "8px 4px" }}>
                          Item
                        </th>
                        <th style={{ background: "none", padding: "8px 4px" }}>
                          Price
                        </th>
                        <th
                          style={{
                            background: "none",
                            padding: "8px 4px",
                            textAlign: "center",
                          }}
                        >
                          Qty
                        </th>
                        <th
                          style={{
                            background: "none",
                            padding: "8px 4px",
                            textAlign: "right",
                          }}
                        >
                          Total
                        </th>
                        <th style={{ background: "none", padding: "8px 4px" }} />
                      </tr>
                    </thead>
                    <tbody>
                      {cart.map((item, index) => (
                        <tr key={item._id}>
                          <td
                            style={{ padding: "10px 4px", color: "var(--muted)" }}
                          >
                            {index + 1}
                          </td>
                          <td style={{ padding: "10px 4px", fontWeight: 500 }}>
                            {item.name}
                          </td>
                          <td style={{ padding: "10px 4px" }}>
                            {formatINR(item.price)}
                          </td>
                          <td style={{ padding: "10px 4px" }}>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: 6,
                              }}
                            >
                              <button
                                type="button"
                                className="kiosk-cart-qty-btn"
                                aria-label={`Decrease quantity of ${item.name}`}
                                onClick={() =>
                                  updateCartItemQuantity(item._id, -1)
                                }
                              >
                                -
                              </button>
                              <input
                                type="text"
                                inputMode="numeric"
                                className="kiosk-cart-qty"
                                aria-label={`Quantity of ${item.name}`}
                                value={item.quantity}
                                onChange={(e) =>
                                  handleCartManualQuantityChange(
                                    item._id,
                                    e.target.value
                                  )
                                }
                              />
                              <button
                                type="button"
                                className="kiosk-cart-qty-btn"
                                aria-label={`Increase quantity of ${item.name}`}
                                onClick={() =>
                                  updateCartItemQuantity(item._id, 1)
                                }
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td
                            style={{
                              padding: "10px 4px",
                              textAlign: "right",
                              fontWeight: 600,
                            }}
                          >
                            {formatINR(
                              item.price * (parseInt(item.quantity, 10) || 1)
                            )}
                          </td>
                          <td style={{ padding: "10px 4px", textAlign: "center" }}>
                            <button
                              type="button"
                              className="kiosk-remove"
                              title="Remove item"
                              aria-label={`Remove ${item.name} from cart`}
                              onClick={() => removeFromCart(item._id)}
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

              <div
                style={{
                  marginTop: 24,
                  paddingTop: 16,
                  borderTop: "1px solid var(--border)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <span
                    style={{
                      fontSize: 16,
                      fontWeight: 600,
                      color: "var(--muted)",
                    }}
                  >
                    Total Bill
                  </span>
                  <span
                    style={{
                      fontSize: 22,
                      fontWeight: 700,
                      color: "var(--ink)",
                    }}
                  >
                    {formatINR(invoiceTotal)}
                  </span>
                </div>

                <div
                  style={{
                    marginTop: 4,
                    fontSize: 13,
                    fontWeight: 500,
                    textAlign: "right",
                    color: remaining < 0 ? "var(--danger)" : "var(--success)",
                  }}
                >
                  {remaining < 0
                    ? `Balance short by ${formatINR(Math.abs(remaining))}`
                    : `Remaining Balance: ${formatINR(remaining)}`}
                </div>

                {/* Said before the button rather than after the request comes
                    back refused. The server checks it too — this only saves
                    the round trip and explains what to do instead. */}
                {parentMissing && (
                  <div
                    style={{
                      marginTop: 12,
                      padding: "10px 12px",
                      borderRadius: 8,
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--danger)",
                      background: "var(--danger-soft, rgba(200,60,60,0.08))",
                    }}
                    role="status"
                  >
                    {selectedStudent?.name}&rsquo;s parent has not registered in
                    the app, so there is nobody to approve an order. They can
                    still buy at the kiosk with their purchase code.
                  </div>
                )}

                <div style={{ display: "flex", gap: 12, marginTop: 16 }}>
                  <Button variant="danger" onClick={handleCancelPayment}>
                    Cancel Payment
                  </Button>
                  <Button
                    variant="success"
                    style={{ flex: 1 }}
                    disabled={
                      cart.length === 0 || remaining < 0 || paying || parentMissing
                    }
                    onClick={sendForApproval}
                  >
                    {paying ? "Sending…" : "Send for approval"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      )}

    </div>
  );
};

export default Billing;
