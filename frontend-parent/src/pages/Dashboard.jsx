import { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { PUSH_EVENT } from '../utils/events';

const Dashboard = () => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  const fetchDashboard = async () => {
    try {
      const res = await API.get("/parent/dashboard");
      setChildren(res.data.children || []);
    } catch (err) {
      console.error("Error loading linked students:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboard();

    // Balances change from recharges and purchases made elsewhere.
    const refresh = () => fetchDashboard();
    window.addEventListener(PUSH_EVENT, refresh);
    window.addEventListener("focus", refresh);

    return () => {
      window.removeEventListener(PUSH_EVENT, refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);


  // Dashboard Unified Styles Object matching system look and feel
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "var(--bg)",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
    },
    header: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "800",
      color: "var(--ink)",
      letterSpacing: "-0.75px",
      margin: 0,
    },
    subtitle: {
      fontSize: "14px",
      color: "var(--muted)",
      marginTop: "6px",
      marginBottom: 0,
      lineHeight: "1.5", // FIX: Changed from line-height to camelCase lineHeight
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
      gap: "24px",
      marginBottom: "24px",
    },
    childCard: {
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "14px",
      padding: "24px",
      boxShadow: "0 1px 3px rgba(0,0,0,0.02), 0 1px 2px rgba(0,0,0,0.04)",
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      boxSizing: "border-box",
    },
    cardHeaderRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "flex-start",
      marginBottom: "16px",
      gap: "12px",
    },
    childName: {
      fontSize: "20px",
      fontWeight: "700",
      color: "var(--ink)",
      margin: 0,
    },
    childMeta: {
      fontSize: "13px",
      color: "var(--muted)",
      marginTop: "4px",
      marginBottom: 0,
    },
    balanceBadge: (amt) => ({
      fontSize: "13px",
      fontWeight: "700",
      backgroundColor: amt > 500 ? "var(--success-bg)" : "var(--alert-bg)",
      color: amt > 500 ? "var(--success)" : "var(--alert)",
      padding: "6px 12px",
      borderRadius: "20px",
      whiteSpace: "nowrap",
      border: amt > 500 ? "1px solid var(--success-border)" : "1px solid var(--alert-border)",
    }),
    warningBanner: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      color: "var(--alert)",
      backgroundColor: "var(--alert-bg)",
      padding: "10px 12px",
      borderRadius: "8px",
      fontSize: "12px",
      fontWeight: "500",
      marginTop: "12px",
      border: "1px solid var(--alert-border)",
    },
    actionBtn: {
      display: "block",
      textAlign: "center",
      backgroundColor: "var(--ink)",
      color: "var(--on-dark)",
      textDecoration: "none",
      padding: "12px 16px",
      borderRadius: "10px",
      fontSize: "14px",
      fontWeight: "600",
      transition: "background-color 0.15s ease",
      marginTop: "20px",
    },
    infoBanner: {
      backgroundColor: "#fef08a",
      border: "1px solid #fef08a",
      color: "#713f12",
      padding: "16px 20px",
      borderRadius: "12px",
      fontSize: "14px",
      lineHeight: "1.5",
    },
    loadingText: {
      textAlign: "center",
      padding: "60px 0",
      fontSize: "16px",
      fontWeight: "500",
      color: "var(--muted)",
    }
  };

  if (loading) {
    return (
      <div style={styles.page}>
        <div style={styles.loadingText}>Loading student records...</div>
      </div>
    );
  }

  return (
    <div style={styles.page}>
      {/* Header Section */}
      <div style={styles.header}>
        <h1 style={styles.title}>Linked Children Accounts</h1>
        <p style={styles.subtitle}>
          Monitor student account balances, digital smart-wallet transactions, and purchase logs
        </p>
      </div>

      {/* Main Grid View */}
      {children.length === 0 ? (
        <div style={styles.infoBanner}>
          ⚠️ No students found matching your registered phone number. Please contact the school office administration to link your ward's records.
        </div>
      ) : (
        <div style={styles.grid}>
          {children.map((child) => (
            <div key={child._id} style={styles.childCard}>
              <div>
                <div style={styles.cardHeaderRow}>
                  <div>
                    <h2 style={styles.childName}>{child.name}</h2>
                    <p style={styles.childMeta}>
                      Grade: {child.grade || "N/A"} | Room: {child.hostelNumber || "N/A"}
                    </p>
                  </div>
                  <span style={styles.balanceBadge(child.pocketMoney || 0)}>
                    Bal: ₹{child.pocketMoney || 0}
                  </span>
                </div>

                {/* Depleted Balance Alert Banner */}
                {(child.pocketMoney || 0) <= 0 && (
                  <div style={styles.warningBanner}>
                    <span>⚠️ Balance exhausted. Please top up at the school accounts counter.</span>
                  </div>
                )}
              </div>

              {/* Redirection Navigation Link */}
              <div style={{ display: "flex", gap: 10, marginTop: 20 }}>
  <Link
    to={`/child/${child._id}`}
    style={{
      ...styles.actionBtn,
      flex: 1,
      marginTop: 0,
    }}
  >
    View Details
  </Link>

  <Link
    to={`/purchase-password/${child._id}`}
    style={{
      ...styles.actionBtn,
      flex: 1,
      marginTop: 0,
      background: "var(--primary)",
    }}
  >
    Set Password
  </Link>
</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Dashboard;