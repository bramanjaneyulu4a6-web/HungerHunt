import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import API from "../services/api";



export default function PendingOrders() {
     const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState(null);
  const [editingId, setEditingId] = useState(null);

  const fetchPendingOrders = async () => {
    try {
      setLoading(true);

      const res = await API.get("/pending-orders/parent");

      setOrders(res.data.orders || []);
    } catch (err) {
      console.error("Failed to load pending orders:", err);

      alert(
        err.response?.data?.message ||
          "Unable to load pending orders."
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingOrders();
  }, []);

  // --------------------------------------------------
  // CHANGE QUANTITY LOCALLY
  // --------------------------------------------------

  const changeQuantity = (orderId, productId, amount) => {
    setOrders((currentOrders) =>
      currentOrders.map((order) => {
        if (order._id !== orderId) return order;

        return {
          ...order,
          items: order.items
            .map((item) => {
              if (
                item.productId?._id?.toString() !==
                productId?.toString()
              ) {
                return item;
              }

              const newQuantity =
                Number(item.quantity || 0) + amount;

              return {
                ...item,
                quantity: newQuantity,
              };
            })
            .filter((item) => Number(item.quantity) > 0),
        };
      })
    );
  };

  // --------------------------------------------------
  // CALCULATE ORDER TOTAL
  // --------------------------------------------------

  const calculateTotal = (order) => {
    return (order.items || []).reduce(
      (total, item) =>
        total +
        Number(item.price || 0) *
          Number(item.quantity || 0),
      0
    );
  };

  // --------------------------------------------------
  // SAVE EDITED ORDER
  // --------------------------------------------------

  const saveOrder = async (order) => {
    try {
      if (!order.items || order.items.length === 0) {
        alert("Order must contain at least one item.");
        return;
      }

      setProcessingId(order._id);

      const items = order.items.map((item) => ({
        productId:
          item.productId?._id || item.productId,
        quantity: Number(item.quantity),
      }));

      const res = await API.put(
        `/pending-orders/${order._id}`,
        {
          items,
        }
      );

      setOrders((currentOrders) =>
        currentOrders.map((existingOrder) =>
          existingOrder._id === order._id
            ? {
                ...existingOrder,
                ...res.data.order,
              }
            : existingOrder
        )
      );

      setEditingId(null);

      alert("Order updated successfully.");
    } catch (err) {
      console.error("Update order error:", err);

      alert(
        err.response?.data?.message ||
          "Failed to update order."
      );

      // Reload backend version if update failed
      fetchPendingOrders();
    } finally {
      setProcessingId(null);
    }
  };

  // --------------------------------------------------
  // APPROVE ORDER
  // --------------------------------------------------

 // --------------------------------------------------
// APPROVE ORDER
// --------------------------------------------------

const approveOrder = async (order) => {
  const total = calculateTotal(order);

  const confirmed = window.confirm(
    `Approve this order for ₹${total.toFixed(2)}?`
  );

  if (!confirmed) return;

  try {
    setProcessingId(order._id);

    await API.post(
      `/pending-orders/${order._id}/approve`
    );

    alert("Order approved successfully.");

    // Get student ID
    const studentId =
      order.studentId?._id || order.studentId;

    // Go to student's details page
    if (studentId) {
      navigate(`/child/${studentId}`);
      return;
    }

    // Fallback if student ID is unavailable
    setOrders((currentOrders) =>
      currentOrders.filter(
        (item) => item._id !== order._id
      )
    );

  } catch (err) {
    console.error("Approve order error:", err);

    alert(
      err.response?.data?.message ||
        "Failed to approve order."
    );

    fetchPendingOrders();

  } finally {
    setProcessingId(null);
  }
};
  // --------------------------------------------------
  // REJECT ORDER
  // --------------------------------------------------

  const rejectOrder = async (order) => {
    const confirmed = window.confirm(
      `Reject the purchase request from ${
        order.studentId?.name || "this student"
      }?`
    );

    if (!confirmed) return;

    try {
      setProcessingId(order._id);

      await API.post(
        `/pending-orders/${order._id}/reject`
      );

      alert("Order rejected.");

      // Remove rejected order from pending list
      setOrders((currentOrders) =>
        currentOrders.filter(
          (item) => item._id !== order._id
        )
      );
    } catch (err) {
      console.error("Reject order error:", err);

      alert(
        err.response?.data?.message ||
          "Failed to reject order."
      );

      fetchPendingOrders();
    } finally {
      setProcessingId(null);
    }
  };

  // --------------------------------------------------
  // LOADING
  // --------------------------------------------------

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loading}>
          Loading pending orders...
        </div>
      </div>
    );
  }

  // --------------------------------------------------
  // PAGE
  // --------------------------------------------------

return (
  <div style={styles.page}>

    {/* BACK BUTTON */}
    <button
  onClick={() => navigate("/")}
  style={styles.backButton}
>
  ← Back to Accounts
</button>

    <div style={styles.header}>
        <div>
          <h1 style={styles.title}>
            Pending Purchase Orders
          </h1>

          <p style={styles.subtitle}>
            Review purchase requests from your children
            before approving them.
          </p>
        </div>

        <button
          onClick={fetchPendingOrders}
          style={styles.refreshButton}
        >
          ↻ Refresh
        </button>
      </div>

      {/* NO ORDERS */}

      {orders.length === 0 ? (
        <div style={styles.emptyCard}>
          <div style={styles.emptyIcon}>✓</div>

          <h2 style={styles.emptyTitle}>
            No Pending Orders
          </h2>

          <p style={styles.emptyText}>
            There are currently no purchase requests
            waiting for your approval.
          </p>
        </div>
      ) : (
        <div style={styles.ordersContainer}>
          {orders.map((order) => {
            const isEditing =
              editingId === order._id;

            const isProcessing =
              processingId === order._id;

            const total = calculateTotal(order);

            return (
              <div
                key={order._id}
                style={styles.orderCard}
              >
                {/* ORDER HEADER */}

                <div style={styles.orderHeader}>
                  <div>
                    <h2 style={styles.studentName}>
                      {order.studentId?.name ||
                        "Student"}
                    </h2>

                    <p style={styles.studentInfo}>
                      Grade:{" "}
                      {order.studentId?.grade || "N/A"}{" "}
                      | Room:{" "}
                      {order.studentId?.hostelNumber ||
                        "N/A"}
                    </p>
                  </div>

                  <div style={styles.pendingBadge}>
                    PENDING
                  </div>
                </div>

                {/* BALANCE */}

                <div style={styles.balanceBox}>
                  <span>
                    Current Balance
                  </span>

                  <strong>
                    ₹
                    {Number(
                      order.studentId?.pocketMoney || 0
                    ).toFixed(2)}
                  </strong>
                </div>

                {/* ITEMS */}

                <div style={styles.itemsSection}>
                  <h3 style={styles.sectionTitle}>
                    Requested Items
                  </h3>

                  {order.items?.map(
                    (item, index) => {
                      const productId =
                        item.productId?._id ||
                        item.productId;

                      return (
                        <div
                          key={`${order._id}-${productId}-${index}`}
                          style={styles.itemRow}
                        >
                          <div style={styles.itemInfo}>
                            {item.productId?.image ? (
                              <img
                                src={
                                  item.productId.image
                                }
                                alt={item.name}
                                style={
                                  styles.productImage
                                }
                              />
                            ) : (
                              <div
                                style={
                                  styles.imagePlaceholder
                                }
                              >
                                🍽️
                              </div>
                            )}

                            <div>
                              <div
                                style={
                                  styles.itemName
                                }
                              >
                                {item.name}
                              </div>

                              <div
                                style={
                                  styles.itemPrice
                                }
                              >
                                ₹
                                {Number(
                                  item.price || 0
                                ).toFixed(2)}{" "}
                                each
                              </div>
                            </div>
                          </div>

                          {/* QUANTITY */}

                          {isEditing ? (
                            <div
                              style={
                                styles.quantityControls
                              }
                            >
                              <button
                                disabled={
                                  isProcessing
                                }
                                onClick={() =>
                                  changeQuantity(
                                    order._id,
                                    productId,
                                    -1
                                  )
                                }
                                style={
                                  styles.quantityButton
                                }
                              >
                                −
                              </button>

                              <span
                                style={
                                  styles.quantityValue
                                }
                              >
                                {item.quantity}
                              </span>

                              <button
                                disabled={
                                  isProcessing
                                }
                                onClick={() =>
                                  changeQuantity(
                                    order._id,
                                    productId,
                                    1
                                  )
                                }
                                style={
                                  styles.quantityButton
                                }
                              >
                                +
                              </button>
                            </div>
                          ) : (
                            <div
                              style={
                                styles.quantityDisplay
                              }
                            >
                              × {item.quantity}
                            </div>
                          )}

                          {/* ITEM TOTAL */}

                          <div
                            style={
                              styles.itemTotal
                            }
                          >
                            ₹
                            {(
                              Number(
                                item.price || 0
                              ) *
                              Number(
                                item.quantity || 0
                              )
                            ).toFixed(2)}
                          </div>
                        </div>
                      );
                    }
                  )}
                </div>

                {/* TOTAL */}

                <div style={styles.totalRow}>
                  <span>Total</span>

                  <strong>
                    ₹{total.toFixed(2)}
                  </strong>
                </div>

                {/* ACTIONS */}

                <div style={styles.actions}>
                  {isEditing ? (
                    <>
                      <button
                        disabled={isProcessing}
                        onClick={() =>
                          saveOrder(order)
                        }
                        style={styles.saveButton}
                      >
                        {isProcessing
                          ? "Saving..."
                          : "Save Changes"}
                      </button>

                      <button
                        disabled={isProcessing}
                        onClick={() => {
                          setEditingId(null);
                          fetchPendingOrders();
                        }}
                        style={styles.cancelButton}
                      >
                        Cancel
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        disabled={isProcessing}
                        onClick={() =>
                          setEditingId(order._id)
                        }
                        style={styles.editButton}
                      >
                        ✏️ Edit
                      </button>

                      <button
                        disabled={isProcessing}
                        onClick={() =>
                          rejectOrder(order)
                        }
                        style={styles.rejectButton}
                      >
                        {isProcessing
                          ? "Processing..."
                          : "✕ Reject"}
                      </button>

                      <button
                        disabled={isProcessing}
                        onClick={() =>
                          approveOrder(order)
                        }
                        style={styles.approveButton}
                      >
                        {isProcessing
                          ? "Processing..."
                          : "✓ Approve"}
                      </button>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ======================================================
// STYLES
// ======================================================

const styles = {
  page: {
    minHeight: "100vh",
    background: "#f8fafc",
    padding: "32px",
    fontFamily:
      "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
    boxSizing: "border-box",
  },
backButton: {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 16px",
  marginBottom: "20px",
  border: "1px solid #cbd5e1",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#334155",
  fontSize: "14px",
  fontWeight: 700,
  cursor: "pointer",
},
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: "20px",
    marginBottom: "28px",
  },

  title: {
    margin: 0,
    fontSize: "30px",
    fontWeight: 800,
    color: "#0f172a",
  },

  subtitle: {
    margin: "7px 0 0",
    fontSize: "14px",
    color: "#64748b",
  },

  refreshButton: {
    padding: "10px 16px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 600,
    cursor: "pointer",
  },

  loading: {
    textAlign: "center",
    padding: "100px 20px",
    color: "#64748b",
    fontSize: "16px",
  },

  emptyCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "60px 30px",
    textAlign: "center",
    maxWidth: "650px",
    margin: "50px auto",
  },

  emptyIcon: {
    width: "60px",
    height: "60px",
    margin: "0 auto 20px",
    borderRadius: "50%",
    background: "#dcfce7",
    color: "#16a34a",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "28px",
    fontWeight: 800,
  },

  emptyTitle: {
    margin: 0,
    color: "#0f172a",
    fontSize: "22px",
  },

  emptyText: {
    color: "#64748b",
    marginTop: "8px",
  },

  ordersContainer: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(420px, 1fr))",
    gap: "24px",
  },

  orderCard: {
    background: "#ffffff",
    border: "1px solid #e2e8f0",
    borderRadius: "16px",
    padding: "24px",
    boxShadow:
      "0 2px 5px rgba(15,23,42,0.04)",
  },

  orderHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: "15px",
  },

  studentName: {
    margin: 0,
    fontSize: "21px",
    fontWeight: 750,
    color: "#0f172a",
  },

  studentInfo: {
    margin: "5px 0 0",
    fontSize: "13px",
    color: "#64748b",
  },

  pendingBadge: {
    padding: "6px 10px",
    borderRadius: "20px",
    background: "#fef2f2",
    border: "1px solid #fecaca",
    color: "#dc2626",
    fontSize: "11px",
    fontWeight: 800,
  },

  balanceBox: {
    marginTop: "18px",
    padding: "12px 14px",
    borderRadius: "10px",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    fontSize: "13px",
    color: "#64748b",
  },

  balanceBoxStrong: {
    color: "#0f172a",
  },

  itemsSection: {
    marginTop: "22px",
  },

  sectionTitle: {
    margin: "0 0 10px",
    fontSize: "14px",
    fontWeight: 700,
    color: "#334155",
  },

  itemRow: {
    display: "flex",
    alignItems: "center",
    gap: "12px",
    padding: "12px 0",
    borderBottom: "1px solid #f1f5f9",
  },

  itemInfo: {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: "10px",
  },

  productImage: {
    width: "48px",
    height: "48px",
    borderRadius: "9px",
    objectFit: "cover",
    border: "1px solid #e2e8f0",
  },

  imagePlaceholder: {
    width: "48px",
    height: "48px",
    borderRadius: "9px",
    background: "#f1f5f9",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "22px",
  },

  itemName: {
    fontSize: "14px",
    fontWeight: 650,
    color: "#0f172a",
  },

  itemPrice: {
    marginTop: "3px",
    fontSize: "12px",
    color: "#64748b",
  },

  quantityDisplay: {
    minWidth: "45px",
    textAlign: "center",
    fontSize: "14px",
    fontWeight: 700,
    color: "#334155",
  },

  quantityControls: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
  },

  quantityButton: {
    width: "30px",
    height: "30px",
    borderRadius: "7px",
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: "18px",
    fontWeight: 700,
    cursor: "pointer",
  },

  quantityValue: {
    minWidth: "25px",
    textAlign: "center",
    fontWeight: 700,
    color: "#0f172a",
  },

  itemTotal: {
    minWidth: "75px",
    textAlign: "right",
    fontWeight: 700,
    color: "#0f172a",
    fontSize: "14px",
  },

  totalRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: "18px",
    paddingTop: "16px",
    borderTop: "2px solid #e2e8f0",
    fontSize: "16px",
    fontWeight: 700,
    color: "#0f172a",
  },

  actions: {
    display: "flex",
    gap: "10px",
    marginTop: "20px",
  },

  editButton: {
    flex: 1,
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },

  rejectButton: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "9px",
    background: "#dc2626",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  approveButton: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "9px",
    background: "#16a34a",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  saveButton: {
    flex: 1,
    padding: "12px",
    border: "none",
    borderRadius: "9px",
    background: "#2563eb",
    color: "#ffffff",
    fontWeight: 700,
    cursor: "pointer",
  },

  cancelButton: {
    flex: 1,
    padding: "12px",
    border: "1px solid #cbd5e1",
    borderRadius: "9px",
    background: "#ffffff",
    color: "#334155",
    fontWeight: 700,
    cursor: "pointer",
  },
};