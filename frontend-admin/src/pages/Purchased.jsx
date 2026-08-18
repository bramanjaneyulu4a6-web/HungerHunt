import { useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import { formatINR } from "../utils/format";
import RefreshButton from "../components/RefreshButton";
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

const Purchased = () => {
  const [activeTab, setActiveTab] = useState("new");
  const [newPurchases, setNewPurchases] = useState([]);
  const [completedPurchases, setCompletedPurchases] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [completingId, setCompletingId] = useState(null);
  const [cancellingId, setCancellingId] = useState(null);
  const [openReceipts, setOpenReceipts] = useState({}); // purchaseId -> rows | "loading"

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setLoading(true);
    setLoadError(false);

    try {
      const [newRes, completedRes] = await Promise.all([
        api.get("/purchases/new"),
        api.get("/purchases/completed"),
      ]);

      /* Received quantity defaults to what is still outstanding, not to what
         was ordered. This list now carries part-delivered orders too, and a
         line the storeroom has already booked six of ten against owes four —
         prefilling ten would apply the six a second time and file a receipt
         for a delivery that never came. */
      setNewPurchases(
        newRes.data.map((purchase) => ({
          ...purchase,
          items: purchase.items.map((item) => ({
            ...item,
            receivedQuantity:
              item.receivedQuantity !== undefined
                ? item.receivedQuantity
                : Math.max(0, item.quantity - (item.received || 0)),
            purchasePrice: item.purchasePrice || 0,
          })),
        }))
      );

      setCompletedPurchases(
        completedRes.data.sort(
          (a, b) =>
            new Date(b.completedAt ?? b.cancelledAt ?? 0) -
            new Date(a.completedAt ?? a.cancelledAt ?? 0)
        )
      );
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const handleItemChange = (purchaseId, productId, key, value) => {
    setNewPurchases((prev) =>
      prev.map((purchase) => {
        if (purchase._id !== purchaseId) return purchase;

        return {
          ...purchase,
          items: purchase.items.map((item) =>
            item.productId?._id === productId
              ? { ...item, [key]: Number(value) }
              : item
          ),
        };
      })
    );
  };

  /* What actually arrived on a closed order. `quantity` is what was asked for
     and is never edited now, so reading it as "received" would print a full
     delivery over the top of a shortfall badge and bill the school for units
     that never came. The ?? fallback is for rows closed before receipts
     existed, where the old code had already overwritten quantity with what
     arrived — for those the two are the same number. It is deliberately not
     ||: a genuine received of 0 on a new order means nothing arrived. */
  const receivedOf = (item) => item.received ?? item.quantity;

  // ordered - received across the whole order; > 0 means the supplier
  // short-shipped and the gap is now permanent record, not edited history.
  const shortfall = (purchase) =>
    purchase.items.reduce(
      (sum, item) => sum + Math.max(0, item.quantity - receivedOf(item)),
      0
    );

  const completePurchase = async (purchase) => {
    setCompletingId(purchase._id);

    try {
      // A product deleted after the order was raised leaves item.productId
      // null. Serialising that sent an item with no product reference at all,
      // since JSON.stringify drops an undefined value.
      const items = purchase.items
        .filter((item) => item.productId?._id)
        .map((item) => ({
          productId: item.productId._id,
          quantity: item.receivedQuantity,
          purchasePrice: item.purchasePrice,
        }));

      if (items.length === 0) {
        toast.error("Every product on this order has been deleted");
        return;
      }

      await api.put(`/purchases/complete/${purchase._id}`, { items });

      await loadData();
      toast.success("Purchase order completed and stock applied");
    } catch (err) {
      console.error(err);
      toast.error(
        err.response?.data?.message || "Failed to complete the purchase order"
      );

      // The order was completed elsewhere, so this list is showing a stale
      // pending row.
      if (err.response?.status === 409) await loadData();
    } finally {
      setCompletingId(null);
    }
  };

  const cancelOrder = async (purchase) => {
    const started = purchase.items.some((item) => (item.received || 0) > 0);

    if (
      !window.confirm(
        started
          ? "Cancel the rest of this order? Deliveries already booked stay booked — only what is still outstanding is voided."
          : "Cancel this order? Nothing has been received against it."
      )
    )
      return;

    setCancellingId(purchase._id);

    try {
      await api.put(`/purchases/cancel/${purchase._id}`);
      await loadData();
      toast.success("Order cancelled");
    } catch (err) {
      console.error(err);
      toast.error(err.response?.data?.message || "Failed to cancel the order");
      // Closed elsewhere — this list is stale.
      if (err.response?.status === 409) await loadData();
    } finally {
      setCancellingId(null);
    }
  };

  const toggleReceipts = async (purchaseId) => {
    if (openReceipts[purchaseId]) {
      setOpenReceipts((prev) => {
        const next = { ...prev };
        delete next[purchaseId];
        return next;
      });
      return;
    }

    setOpenReceipts((prev) => ({ ...prev, [purchaseId]: "loading" }));

    try {
      const res = await api.get(`/purchases/${purchaseId}/receipts`);
      setOpenReceipts((prev) => ({
        ...prev,
        [purchaseId]: Array.isArray(res.data) ? res.data : [],
      }));
    } catch (err) {
      console.error(err);
      toast.error("Failed to load the deliveries for this order");
      setOpenReceipts((prev) => {
        const next = { ...prev };
        delete next[purchaseId];
        return next;
      });
    }
  };

  const receiptsBlock = (purchase) => {
    const rows = openReceipts[purchase._id];

    return (
      <div style={{ marginTop: 12 }}>
        <Button variant="ghost" className="btn--sm" onClick={() => toggleReceipts(purchase._id)}>
          {rows ? "Hide deliveries" : "View deliveries"}
        </Button>

        {rows === "loading" ? (
          <Skeleton height={16} style={{ marginTop: 10 }} />
        ) : Array.isArray(rows) && rows.length === 0 ? (
          <p style={{ marginTop: 10, color: "var(--muted-soft)" }}>
            No deliveries have been booked against this order.
          </p>
        ) : Array.isArray(rows) ? (
          rows.map((receipt) => (
            <div key={receipt._id} className="card" style={{ marginTop: 10, padding: 14 }}>
              <p className="card-meta" style={{ marginBottom: 8 }}>
                {new Date(receipt.createdAt).toLocaleString()}
                {receipt.receivedBy?.email ? ` · received by ${receipt.receivedBy.email}` : ""}
                {receipt.invoiceNumber ? ` · invoice ${receipt.invoiceNumber}` : ""}
              </p>
              {receipt.note && (
                <p style={{ marginBottom: 8, color: "var(--muted-soft)" }}>{receipt.note}</p>
              )}
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 110 }}>Received</th>
                      <th style={{ width: 110 }}>Damaged</th>
                      <th>Reason</th>
                    </tr>
                  </thead>
                  <tbody>
                    {receipt.lines.map((line, i) => (
                      <tr key={line.productId?._id || i}>
                        <td>{line.productId?.name || "Unlinked product"}</td>
                        <td>{line.received || 0}</td>
                        <td style={{ color: line.damaged > 0 ? "var(--danger)" : undefined }}>
                          {line.damaged || 0}
                        </td>
                        <td>{line.reason || ""}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        ) : null}
      </div>
    );
  };

  return (
    <div className="page">
      <PageHeader
        title="Purchased Invoices"
        subtitle="Receive incoming stock, record unit costs, and review completed orders."
      />

      <div className="tabs" style={{ maxWidth: 420, marginBottom: 28 }}>
        <button
          type="button"
          className={`tab${activeTab === "new" ? " tab--active" : ""}`}
          onClick={() => setActiveTab("new")}
        >
          Pending Receipts
        </button>
        <button
          type="button"
          className={`tab${activeTab === "completed" ? " tab--active" : ""}`}
          onClick={() => setActiveTab("completed")}
        >
          Closed
        </button>
      </div>

      {loading ? (
        <div className="card">
          <Skeleton height={22} width="40%" />
          <Skeleton height={16} style={{ marginTop: 16 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
          <Skeleton height={16} style={{ marginTop: 10 }} />
        </div>
      ) : loadError ? (
        <Banner variant="alert" icon="⚠️">
          Couldn't load purchase orders. Check your connection and{" "}
          <button type="button" className="link-button" onClick={loadData}>
            try again
          </button>
          .
        </Banner>
      ) : activeTab === "new" ? (
        newPurchases.length === 0 ? (
          <EmptyState icon="✓" title="Receiving queue is clear" variant="success">
            No supplier orders are waiting to be received. New approved orders will appear here automatically.
          </EmptyState>
        ) : (
          newPurchases.map((purchase) => {
            const grandTotal = purchase.items.reduce(
              (acc, item) =>
                acc + (item.receivedQuantity || 0) * (item.purchasePrice || 0),
              0
            );
            const completing = completingId === purchase._id;

            return (
              <Card key={purchase._id} style={{ marginBottom: 24 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    flexWrap: "wrap",
                    gap: 12,
                    marginBottom: 16,
                  }}
                >
                  <h3 className="card-title">
                    Purchase Sheet #{purchase._id.slice(-6).toUpperCase()}
                  </h3>
                  <Badge variant="neutral">
                    Order total: {formatINR(grandTotal)}
                  </Badge>
                </div>

                <div className="table-wrap" style={{ marginBottom: 20 }}>
                  <table className="table table--stack">
                    <thead>
                      <tr>
                        <th>Product</th>
                        <th style={{ width: 100 }}>Ordered</th>
                        <th style={{ width: 140 }}>Receiving now</th>
                        <th style={{ width: 160 }}>Unit Cost (₹)</th>
                        <th style={{ width: 150 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchase.items.map((item, index) => {
                        const name = item.productId?.name || "Unlinked product";
                        const dangling = !item.productId?._id;
                        const productTotal =
                          (item.receivedQuantity || 0) *
                          (item.purchasePrice || 0);

                        return (
                          <tr key={item.productId?._id || index}>
                            <td data-label="Product">
                              <strong>{name}</strong>
                            </td>
                            <td data-label="Ordered">
                              {item.quantity}
                              {item.received > 0 && (
                                <div
                                  style={{
                                    fontSize: 12,
                                    color: "var(--muted-soft)",
                                  }}
                                >
                                  {item.received} already received
                                </div>
                              )}
                            </td>
                            <td data-label="Received">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                className="input"
                                style={{ width: 110 }}
                                aria-label={`Received quantity for ${name}`}
                                disabled={dangling}
                                title={
                                  dangling
                                    ? "This product no longer exists"
                                    : undefined
                                }
                                value={item.receivedQuantity ?? ""}
                                onChange={(e) => {
                                  if (!item.productId) return;
                                  handleItemChange(
                                    purchase._id,
                                    item.productId._id,
                                    "receivedQuantity",
                                    e.target.value
                                  );
                                }}
                              />
                            </td>
                            <td data-label="Unit Cost">
                              <input
                                type="number"
                                min="0"
                                placeholder="0.00"
                                className="input"
                                style={{ width: 110 }}
                                aria-label={`Unit cost for ${name}`}
                                disabled={dangling}
                                title={
                                  dangling
                                    ? "This product no longer exists"
                                    : undefined
                                }
                                value={item.purchasePrice ?? ""}
                                onChange={(e) => {
                                  if (!item.productId) return;
                                  handleItemChange(
                                    purchase._id,
                                    item.productId._id,
                                    "purchasePrice",
                                    e.target.value
                                  );
                                }}
                              />
                            </td>
                            <td
                              data-label="Total"
                              style={{
                                fontWeight: 600,
                                color:
                                  productTotal > 0
                                    ? "var(--ink)"
                                    : "var(--muted-soft)",
                              }}
                            >
                              {formatINR(productTotal)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Button
                    variant="success"
                    onClick={() => completePurchase(purchase)}
                    disabled={completingId !== null || cancellingId !== null}
                  >
                    {completing ? "Completing…" : "Complete & Apply Stock"}
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => cancelOrder(purchase)}
                    disabled={completingId !== null || cancellingId !== null}
                  >
                    {cancellingId === purchase._id ? "Cancelling…" : "Cancel order"}
                  </Button>
                </div>
                {receiptsBlock(purchase)}
              </Card>
            );
          })
        )
      ) : completedPurchases.length === 0 ? (
        <EmptyState icon="🗂️" title="No order history yet">
          Completed and cancelled supplier orders will be archived here.
        </EmptyState>
      ) : (
        completedPurchases.map((purchase) => {
          const completedGrandTotal = purchase.items.reduce(
            (acc, item) => acc + receivedOf(item) * (item.purchasePrice || 0),
            0
          );
          const cancelled = purchase.status === "CANCELLED";

          return (
            <Card key={purchase._id} style={{ marginBottom: 24 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: 12,
                  marginBottom: 16,
                }}
              >
                <div>
                  <h3 className="card-title">
                    Invoice #{purchase._id.slice(-6).toUpperCase()}
                  </h3>
                  <p className="card-meta">
                    {cancelled
                      ? `Cancelled on ${new Date(purchase.cancelledAt).toLocaleString()}`
                      : `Closed on ${new Date(purchase.completedAt).toLocaleString()}`}
                    {purchase.supplierId?.name ? ` · ${purchase.supplierId.name}` : ""}
                  </p>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                  {cancelled && <Badge variant="alert">Cancelled</Badge>}
                  {!cancelled && shortfall(purchase) > 0 && (
                    <Badge variant="alert">{shortfall(purchase)} short</Badge>
                  )}
                  <Badge variant="success">
                    Total spent: {formatINR(completedGrandTotal)}
                  </Badge>
                </div>
              </div>

              <div className="table-wrap">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 120 }}>Ordered</th>
                      <th style={{ width: 120 }}>Received</th>
                      <th style={{ width: 180 }}>Unit Cost</th>
                      <th style={{ width: 180 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item, index) => {
                      /* receivedOf's ?? fallback reads a missing `received` as
                         fully delivered — right for a COMPLETED legacy row,
                         since only a delivery could have closed it. A
                         cancelled order carries no such guarantee: a row that
                         predates receipts and was left NEW, then cancelled,
                         has no `received` key and nothing ever arrived. */
                      const received = cancelled ? item.received || 0 : receivedOf(item);
                      const historicalProductTotal =
                        received * (item.purchasePrice || 0);
                      const short = Math.max(0, item.quantity - received);

                      return (
                        <tr key={item.productId?._id || index}>
                          <td data-label="Product">
                            <strong>
                              {item.productId?.name || "Unlinked product"}
                            </strong>
                          </td>
                          <td data-label="Ordered">{item.quantity}</td>
                          <td data-label="Received">
                            {received}
                            {!cancelled && short > 0 && (
                              <span style={{ color: "var(--danger)" }}>
                                {" "}
                                ({short} short)
                              </span>
                            )}
                          </td>
                          <td
                            data-label="Unit Cost"
                            style={{ color: "var(--ink-dim)" }}
                          >
                            {formatINR(item.purchasePrice || 0)}
                          </td>
                          <td
                            data-label="Total"
                            style={{ color: "var(--success)", fontWeight: 600 }}
                          >
                            {formatINR(historicalProductTotal)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {receiptsBlock(purchase)}
            </Card>
          );
        })
      )}

      <RefreshButton onRefresh={loadData} loading={loading} />
    </div>
  );
};

export default Purchased;
