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

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setLoadError(false);

    try {
      const [newRes, completedRes] = await Promise.all([
        api.get("/purchases/new"),
        api.get("/purchases/completed"),
      ]);

      // Received quantity defaults to the ordered quantity until edited.
      setNewPurchases(
        newRes.data.map((purchase) => ({
          ...purchase,
          items: purchase.items.map((item) => ({
            ...item,
            receivedQuantity:
              item.receivedQuantity !== undefined
                ? item.receivedQuantity
                : item.quantity,
            purchasePrice: item.purchasePrice || 0,
          })),
        }))
      );

      setCompletedPurchases(
        completedRes.data.sort(
          (a, b) => new Date(b.completedAt) - new Date(a.completedAt)
        )
      );
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  };

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

  const completePurchase = async (purchase) => {
    setCompletingId(purchase._id);

    try {
      await api.put(`/purchases/complete/${purchase._id}`, {
        items: purchase.items.map((item) => ({
          productId: item.productId?._id,
          quantity: item.receivedQuantity,
          purchasePrice: item.purchasePrice,
        })),
      });

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
          Completed
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
          <EmptyState icon="✨" title="No pending orders">
            New purchase orders will appear here for receiving.
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
                        <th style={{ width: 140 }}>Received</th>
                        <th style={{ width: 160 }}>Unit Cost (₹)</th>
                        <th style={{ width: 150 }}>Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchase.items.map((item, index) => {
                        const name = item.productId?.name || "Unlinked product";
                        const productTotal =
                          (item.receivedQuantity || 0) *
                          (item.purchasePrice || 0);

                        return (
                          <tr key={item.productId?._id || index}>
                            <td data-label="Product">
                              <strong>{name}</strong>
                            </td>
                            <td data-label="Ordered">{item.quantity}</td>
                            <td data-label="Received">
                              <input
                                type="number"
                                min="0"
                                placeholder="0"
                                className="input"
                                style={{ width: 110 }}
                                aria-label={`Received quantity for ${name}`}
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
                                value={item.purchasePrice || ""}
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

                <Button
                  variant="success"
                  onClick={() => completePurchase(purchase)}
                  disabled={completingId !== null}
                >
                  {completing ? "Completing…" : "Complete & Apply Stock"}
                </Button>
              </Card>
            );
          })
        )
      ) : completedPurchases.length === 0 ? (
        <EmptyState icon="🗂️" title="No completed orders yet">
          Orders you complete will be archived here.
        </EmptyState>
      ) : (
        completedPurchases.map((purchase) => {
          const completedGrandTotal = purchase.items.reduce(
            (acc, item) => acc + (item.quantity || 0) * (item.purchasePrice || 0),
            0
          );

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
                    Closed on {new Date(purchase.completedAt).toLocaleString()}
                  </p>
                </div>
                <Badge variant="success">
                  Total spent: {formatINR(completedGrandTotal)}
                </Badge>
              </div>

              <div className="table-wrap">
                <table className="table table--stack">
                  <thead>
                    <tr>
                      <th>Product</th>
                      <th style={{ width: 120 }}>Received</th>
                      <th style={{ width: 180 }}>Unit Cost</th>
                      <th style={{ width: 180 }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {purchase.items.map((item, index) => {
                      const historicalProductTotal =
                        (item.quantity || 0) * (item.purchasePrice || 0);

                      return (
                        <tr key={item.productId?._id || index}>
                          <td data-label="Product">
                            <strong>
                              {item.productId?.name || "Unlinked product"}
                            </strong>
                          </td>
                          <td data-label="Received">{item.quantity}</td>
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
            </Card>
          );
        })
      )}

      <RefreshButton onRefresh={loadData} loading={loading} />
    </div>
  );
};

export default Purchased;
