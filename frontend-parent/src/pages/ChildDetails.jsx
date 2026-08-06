import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../services/api';

export default function ChildDetails() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Interactive View Toggle State: 'purchases' or 'recharges'
  const [activeTab, setActiveTab] = useState('purchases');

  const [walletEnabled,setWalletEnabled] =
useState(false);

const [walletLimit,setWalletLimit] =
useState(500);

const [walletType,setWalletType] =
useState("WEEKLY");

const [walletBanner, setWalletBanner] = useState({ type: "", message: "" });

const saveWalletControl = async () => {

  setWalletBanner({ type: "", message: "" });

  try {

    await API.put(
      `/parent/wallet-control/${id}`,
      {
        enabled: walletEnabled,
        limitAmount: walletLimit,
        limitType: walletType
      }
    );

    setWalletBanner({ type: "success", message: "Wallet control updated." });

  } catch(err) {

    setWalletBanner({
      type: "error",
      message: err.response?.data?.message || "Failed to update wallet control.",
    });

  }

};

  useEffect(() => {
    // Standardized routing block base matching your parent application route group
    API.get(`/parent/child/${id}`)
      .then(res => {
        if (res.data.student.walletControl) {

  setWalletEnabled(
    res.data.student.walletControl.enabled
  );

  setWalletLimit(
    res.data.student.walletControl.limitAmount || 500
  );

  setWalletType(
    res.data.student.walletControl.limitType || "WEEKLY"
  );
}
        setData(res.data);
      })
      .catch(err => {
        console.error("Error fetching purchase records:", err);
      })
      .finally(() => setLoading(false));
  }, [id]);

  // Dashboard Unified UI System Styles Object
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
    },
    backLink: {
      fontSize: "14px",
      fontWeight: "600",
      color: "var(--primary)",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      marginBottom: "24px",
    },
    profileCard: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "14px",
      padding: "24px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
      flexWrap: "wrap",
      gap: "16px",
    },
    studentName: {
      fontSize: "24px",
      fontWeight: "800",
      color: "var(--ink)",
      margin: 0,
    },
    studentMeta: {
      fontSize: "14px",
      color: "var(--muted)",
      marginTop: "4px",
      marginBottom: 0,
    },
    balanceContainer: {
      textAlign: "right",
    },
    balanceLabel: {
      fontSize: "12px",
      fontWeight: "600",
      color: "var(--muted)",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      margin: 0,
    },
    balanceValue: {
      fontSize: "32px",
      fontWeight: "800",
      color: "var(--ink)",
      margin: "2px 0 0 0",
    },
    toggleBar: {
      display: "flex",
      backgroundColor: "var(--border)",
      padding: "4px",
      borderRadius: "10px",
      marginBottom: "32px",
      maxWidth: "400px",
      gap: "4px",
    },
    toggleTab: (isActive) => ({
      flex: 1,
      textAlign: "center",
      padding: "10px 16px",
      fontSize: "14px",
      fontWeight: "600",
      borderRadius: "8px",
      cursor: "pointer",
      border: "none",
      backgroundColor: isActive ? "var(--surface)" : "transparent",
      color: isActive ? "var(--ink)" : "var(--muted)",
      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      transition: "all 0.15s ease",
    }),
    sectionTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "var(--ink)",
      marginBottom: "16px",
    },
    invoiceCard: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      padding: "20px",
      marginBottom: "16px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    },
    invoiceHeader: {
      display: "flex",
      justifyContent: "space-between",
      borderBottom: "1px dashed var(--border)",
      paddingBottom: "12px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "var(--muted)",
      fontWeight: "500",
    },
    invoiceId: {
      color: "var(--ink)",
      fontWeight: "600",
    },
    itemList: {
      listStyle: "none",
      padding: 0,
      margin: "0 0 16px 0",
    },
    itemRow: {
      display: "flex",
      justifyContent: "space-between",
      fontSize: "14px",
      color: "var(--ink-soft)",
      padding: "6px 0",
    },
    itemQty: {
      fontSize: "12px",
      color: "var(--muted-soft)",
      marginLeft: "6px",
      fontWeight: "600",
    },
    itemPrice: {
      fontWeight: "500",
      color: "var(--ink)",
    },
    invoiceTotalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: "12px",
      borderTop: "1px solid var(--border)",
      fontWeight: "700",
      fontSize: "15px",
      color: "var(--ink)",
      marginBottom: "8px",
    },
    totalDeductedAmount: {
      color: "var(--alert)",
    },
    totalCreditedAmount: {
      color: "var(--success)",
    },
    emptyState: {
      color: "var(--muted)",
      fontSize: "14px",
      textAlign: "center",
      padding: "40px 0",
      background: "var(--surface)",
      border: "1px dashed var(--border-strong)",
      borderRadius: "12px",
      margin: 0,
    },
    statusMessageContainer: {
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "32px",
      boxSizing: "border-box",
    },
    loadingText: {
      fontSize: "16px",
      fontWeight: "500",
      color: "var(--muted)",
    },
    errorText: {
      fontSize: "16px",
      fontWeight: "600",
      color: "var(--alert)",
      backgroundColor: "var(--alert-bg)",
      padding: "16px 24px",
      borderRadius: "12px",
      border: "1px solid var(--alert-border)",
    },
    banner: (type) => ({
      display: "flex",
      alignItems: "center",
      gap: "10px",
      backgroundColor: type === "error" ? "var(--alert-bg)" : "var(--success-bg)",
      border: type === "error" ? "1px solid var(--alert-border)" : "1px solid var(--success-border)",
      color: type === "error" ? "var(--alert)" : "var(--success-strong)",
      padding: "14px 16px",
      borderRadius: "12px",
      marginBottom: "20px",
      fontSize: "14px",
      fontWeight: "500",
    }),
  };

  if (loading) {
    return (
      <div style={styles.statusMessageContainer}>
        <div style={styles.loadingText}>Loading ledger statements...</div>
      </div>
    );
  }

  // Fallback Error Component parsing safe checks
  if (!data || !data.student) {
    return (
      <div style={styles.statusMessageContainer}>
        <div style={styles.errorText}>
          ⚠️ Student records not found. Double check registration mappings or endpoints.
        </div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Navigation Return Hook */}
      <Link to="/" style={styles.backLink}>
        ← Back to Accounts
      </Link>
      
      {/* Dynamic Profile Summary Banner */}
      <div style={styles.profileCard}>
        <div>
          <h1 style={styles.studentName}>{data.student.name}</h1>
          <p style={styles.studentMeta}>
            Hostel Room Ref: {data.student.hostelNumber || "N/A"} | Standard Grade: {data.student.grade || "N/A"}
          </p>
        </div>
        <div style={styles.balanceContainer}>
          <p style={styles.balanceLabel}>Available Smart-Wallet Balance</p>
          <p style={styles.balanceValue}>₹{data.student.pocketMoney || 0}</p>
        </div>
      </div>

      {/* Interactive Segmented Switcher Controls */}
     <div style={styles.toggleBar}>
  <button
    style={styles.toggleTab(activeTab === 'purchases')}
    onClick={() => setActiveTab('purchases')}
  >
    🛒 Purchase History
  </button>

  <button
    style={styles.toggleTab(activeTab === 'recharges')}
    onClick={() => setActiveTab('recharges')}
  >
    ⚡ Recharge Logs
  </button>

  <button
    style={styles.toggleTab(activeTab === 'wallet')}
    onClick={() => setActiveTab('wallet')}
  >
    💳 Wallet Control
  </button>
</div>



     {activeTab === "purchases" && (
  <div>
    <h3 style={styles.sectionTitle}>Transaction & Purchase History</h3>

    {!data.bills || data.bills.length === 0 ? (
      <p style={styles.emptyState}>
        No transaction bills recorded yet for this child account.
      </p>
    ) : (
      <div>
        {data.bills.map((bill) => (
          <div key={bill._id} style={styles.invoiceCard}>
            <div style={styles.invoiceHeader}>
              <span>
                Invoice:
                <span style={styles.invoiceId}>
                  #{bill._id.slice(-6).toUpperCase()}
                </span>
              </span>

              <span>
                {new Date(bill.createdAt).toLocaleDateString()}
              </span>
            </div>

            <ul style={styles.itemList}>
              {(bill.items || bill.products || []).map((item, idx) => (
                <li key={idx} style={styles.itemRow}>
                  <span>
                    {item.name || item.productName}
                    <span style={styles.itemQty}>
                      x{item.quantity}
                    </span>
                  </span>

                  <span style={styles.itemPrice}>
                    ₹{(item.price || 0) * (item.quantity || 0)}
                  </span>
                </li>
              ))}
            </ul>

            <div style={styles.invoiceTotalRow}>
              <span>Total Deducted</span>
              <span style={styles.totalDeductedAmount}>
                -₹{bill.totalAmount || 0}
              </span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}

{activeTab === "recharges" && (
  <div>
    <h3 style={styles.sectionTitle}>Recharge History</h3>

    {!data.recharges || data.recharges.length === 0 ? (
      <p style={styles.emptyState}>
        No recharge history available for this child account.
      </p>
    ) : (
      <div>
        {data.recharges.slice().reverse().map((r, index) => (
          <div key={index} style={styles.invoiceCard}>
            <div style={styles.invoiceHeader}>
              <span>Wallet Deposit</span>
              <span>
                {new Date(r.date).toLocaleDateString()}
              </span>
            </div>

            <div style={styles.invoiceTotalRow}>
              <span>Recharge Amount</span>
              <span style={styles.totalCreditedAmount}>
                +₹{r.amount}
              </span>
            </div>

            <div style={styles.itemRow}>
              <span>Previous Wallet Balance</span>
              <span>₹{r.previousBalance}</span>
            </div>

            <div style={styles.itemRow}>
              <span>Closing Updated Balance</span>
              <span>₹{r.newBalance}</span>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
)}
{activeTab === "wallet" && (
  <div
    style={{
      backgroundColor: "var(--surface)",
      padding: "24px",
      borderRadius: "16px",
      border: "1px solid var(--border)",
      boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
      maxWidth: "100%",
    }}
  >
  <h3
    style={{
      fontSize: "20px",
      fontWeight: "700",
      color: "var(--ink)",
      marginTop: 0,
      marginBottom: "20px",
    }}
  >
    Wallet Control
  </h3>

  {walletBanner.message && (
    <div style={styles.banner(walletBanner.type)}>
      {walletBanner.type === "error" ? "⚠️ " : "✅ "}
      {walletBanner.message}
    </div>
  )}

  {/* Toggle / Checkbox Container */}
  <label
    style={{
      display: "flex",
      alignItems: "center",
      gap: "10px",
      fontSize: "15px",
      fontWeight: "600",
      color: "var(--ink-soft)",
      cursor: "pointer",
      marginBottom: "20px",
    }}
  >
    <input
      type="checkbox"
      checked={walletEnabled}
      onChange={(e) => setWalletEnabled(e.target.checked)}
      style={{
        width: "18px",
        height: "18px",
        accentColor: "var(--primary)",
        cursor: "pointer",
      }}
    />
    Enable Spending Limit
  </label>

  {/* Inputs Group */}
  <div
    style={{
      display: "flex",
      flexDirection: "column",
      gap: "16px",
      marginBottom: "24px",
    }}
  >
    {/* Amount Input */}
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: "600",
          color: "var(--muted)",
          marginBottom: "6px",
        }}
      >
        Limit Amount (₹)
      </label>
      <input
        type="number"
        value={walletLimit}
        onChange={(e) => setWalletLimit(Number(e.target.value))}
        placeholder="Enter amount"
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: "15px",
          borderRadius: "8px",
          border: "1px solid var(--border-strong)",
          outline: "none",
          boxSizing: "border-box",
          color: "var(--ink)",
        }}
      />
    </div>

    {/* Frequency Select Dropdown */}
    <div>
      <label
        style={{
          display: "block",
          fontSize: "13px",
          fontWeight: "600",
          color: "var(--muted)",
          marginBottom: "6px",
        }}
      >
        Frequency
      </label>
      <select
        value={walletType}
        onChange={(e) => setWalletType(e.target.value)}
        style={{
          width: "100%",
          padding: "10px 14px",
          fontSize: "15px",
          borderRadius: "8px",
          border: "1px solid var(--border-strong)",
          backgroundColor: "var(--surface)",
          outline: "none",
          boxSizing: "border-box",
          color: "var(--ink)",
          cursor: "pointer",
        }}
      >
        <option value="DAILY">Daily</option>
        <option value="WEEKLY">Weekly</option>
        <option value="MONTHLY">Monthly</option>
      </select>
    
  </div>

  {/* Save Button (Matches 'Set Password' primary blue button) */}
  <button
    onClick={saveWalletControl}
    style={{
      width: "250px",
      padding: "12px",
      backgroundColor: "var(--primary)", // Matches the blue primary button style
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "8px",
      fontSize: "15px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "background-color 0.2s ease",
    }}
  >
    Save Wallet control
  </button>
</div>

        </div>
      )}
      
    </div>
  );
}