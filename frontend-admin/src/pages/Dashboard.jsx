import React, { useState, useEffect } from "react";
import api from "../utils/api";

// Transaction model has no status field; every record is a completed debit.
const TRANSACTION_STATUS = "Wallet Deducted";

const Dashboard = () => {
  const [expandedTransaction, setExpandedTransaction] = useState(null);
  const [history, setHistory] = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");

const [selectedDate, setSelectedDate] = useState("");

  // Fetch student analytics on component mount
  useEffect(() => {
    const fetchCounts = async () => {
      try {
        const [totalRes, activeRes] = await Promise.all([
          api.get("/students/count"),
          api.get("/students/active-count"),
        ]);

        setStudentCount(totalRes.data.totalStudents);
        setActiveCount(activeRes.data.activeStudents);
      } catch {
        // student counts are non-critical; leave defaults on failure
      }
    };

    fetchCounts();
  }, []);

  // Refresh transaction history every 30 seconds, plus whenever the window regains focus
  useEffect(() => {
    const fetchData = () => {
      api
        .get("/transactions/history")
        .then((res) => setHistory(res.data))
        .catch(() => {});
    };

    fetchData(); // initial load

    const interval = setInterval(fetchData, 30000);
    window.addEventListener("focus", fetchData);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", fetchData);
    };
  }, []);

  // Filter history records based on selected calendar date AND student name search query
  const filteredHistory = history.filter((transaction) => {
    // 1. Date Filter Logic
    let matchesDate = true;
    if (selectedDate) {
      const transactionDate = new Date(transaction.createdAt)
        .toISOString()
        .split("T")[0];
      matchesDate = transactionDate === selectedDate;
    }

    // 2. Search Query Logic (Case-Insensitive)
    const studentName = transaction.studentId?.name || "Deleted Account";
    const matchesSearch = studentName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return matchesDate && matchesSearch;
  });

  // Compute metrics based on filtered subset
  const totalSales = filteredHistory.reduce(
    (sum, b) => sum + (b.totalAmount || 0),
    0
  );

  // Native CSV/Excel Download Handler
  const downloadExcel = () => {
    if (filteredHistory.length === 0) {
      alert("No data available to export for the current filters.");
      return;
    }

    // Define table headers
    const headers = [
      "S.No.",
      "Transaction ID",
      "Student Name",
      "Timestamp",
      "Purchased Items (Qty x Price)",
      "Total Amount",
      "Status",
    ];

    // Build comma-separated data rows
    const csvRows = [
      headers.join(","), // Header row
      ...filteredHistory.map((bill, index) => {
        const sNo = index + 1;
        const transactionId = bill._id;
        const studentName = `"${(bill.studentId?.name || "Deleted Account").replace(/"/g, '""')}"`;
        const timestamp = `"${new Date(bill.createdAt).toLocaleString().replace(/"/g, '""')}"`;

        // Flatten subtable items string block safely
        const itemSummary = bill.items
          ? `"${bill.items.map((i) => `${i.name} (${i.quantity}x₹${i.price})`).join(" | ")}"`
          : '""';

        const totalAmount = bill.totalAmount;
        const status = `"${TRANSACTION_STATUS}"`;

        return [
          sNo,
          transactionId,
          studentName,
          timestamp,
          itemSummary,
          totalAmount,
          status,
        ].join(",");
      }),
    ];

    // Create file payload binary object and deploy download link trigger
    const csvContent = "\uFEFF" + csvRows.join("\n"); // Add UTF-8 BOM for Excel formatting compatibility
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute(
      "download",
      `Transactions_Report_${selectedDate || "All"}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Dashboard Styles Object
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    header: {
      marginBottom: "24px",
    },
    title: {
      fontSize: "28px",
      fontWeight: "700",
      color: "#0f172a",
      letterSpacing: "-0.5px",
      margin: 0,
    },
    subtitle: {
      fontSize: "14px",
      color: "#64748b",
      marginTop: "4px",
      marginBottom: 0,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
      gap: "16px",
      marginBottom: "24px",
    },
    statCard: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "18px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    },
    statLabel: {
      fontSize: "12px",
      color: "#64748b",
    },
    statValue: {
      fontSize: "22px",
      fontWeight: "700",
      color: "#0f172a",
      marginTop: "6px",
    },
    section: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    },
    sectionHeaderRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
      marginBottom: "16px",
    },
    sectionTitle: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#0f172a",
      margin: 0,
    },
    controlsGroup: {
      display: "flex",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
    },
    searchInput: {
      padding: "8px 14px",
      borderRadius: "8px",
      border: "1px solid #cbd5e1",
      backgroundColor: "#ffffff",
      color: "#0f172a", /* FIX: Explicitly set text color so typed values are readable */
      fontSize: "14px",
      outline: "none",
      fontFamily: "inherit",
      width: "220px",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },
    dateInput: {
      padding: "8px 12px",
      borderRadius: "8px",
      border: "1px solid #2563eb",
      fontSize: "14px",
      color: "#ffffff", /* Keeps white text on blue background */
      outline: "none",
      fontFamily: "inherit",
      backgroundColor: "#2563eb",
      cursor: "pointer",
    },
    downloadBtn: {
      backgroundColor: "#16a34a",
      color: "#ffffff",
      border: "none",
      padding: "8px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      transition: "background-color 0.2s",
    },
    mainTableContainer: {
      width: "100%",
      overflowX: "auto",
      borderRadius: "10px",
      border: "1px solid #e2e8f0",
    },
    mainTable: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
      fontSize: "14px",
    },
    mainTh: {
      backgroundColor: "#f1f5f9",
      color: "#334155",
      fontWeight: "600",
      padding: "14px",
      borderBottom: "2px solid #e2e8f0",
      fontSize: "13px",
    },
    mainTd: {
      padding: "14px",
      color: "#0f172a",
      borderBottom: "1px solid #e2e8f0",
      verticalAlign: "middle",
    },
    sNoText: {
      color: "#64748b",
      fontWeight: "500",
    },
    nameLink: {
      color: "#2563eb",
      fontWeight: "600",
      cursor: "pointer",
      display: "inline-block",
    },
    timeText: {
      fontSize: "13px",
      color: "#64748b",
    },
    amountText: {
      fontWeight: "700",
      color: "#0f172a",
    },
    statusBadge: {
      fontSize: "11px",
      color: "#16a34a",
      fontWeight: "600",
      backgroundColor: "#f0fdf4",
      padding: "4px 10px",
      borderRadius: "8px",
      display: "inline-block",
      border: "1px solid #bbf7d0",
    },
    expandedContainer: {
      padding: "16px",
      background: "#ffffff",
      borderRadius: "10px",
      border: "1px solid #cbd5e1",
      boxSizing: "border-box",
      margin: "4px 0 12px 0",
      boxShadow:
        "inset 0 2px 4px rgba(0, 0, 0, 0.02), 0 4px 6px -1px rgba(0, 0, 0, 0.05)",
    },
    expandedTitle: {
      display: "block",
      fontSize: "13px",
      fontWeight: "700",
      color: "#1e293b",
      marginBottom: "12px",
      letterSpacing: "0.2px",
    },
    subTable: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
      fontSize: "13px",
    },
    subTh: {
      backgroundColor: "#f8fafc",
      color: "#475569",
      fontWeight: "600",
      padding: "10px 12px",
      borderBottom: "1px solid #e2e8f0",
      borderTop: "1px solid #e2e8f0",
    },
    subTd: {
      padding: "10px 12px",
      color: "#0f172a",
      borderBottom: "1px solid #f1f5f9",
    },
    textMuted: {
      color: "#64748b",
    },
    textBold: {
      fontWeight: "600",
    },
    emptyState: {
      color: "#64748b",
      fontSize: "14px",
      textAlign: "center",
      padding: "40px 0",
      margin: 0,
    },
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <h1 style={styles.title}>School Wallet Dashboard</h1>
        <p style={styles.subtitle}>
          Real-time transactions and student wallet activity
        </p>
      </div>

      {/* Stats Cards Row */}
      <div style={styles.grid}>
        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            Total Transactions ({selectedDate ? "Selected Day" : "All"})
          </div>
          <div style={styles.statValue}>{filteredHistory.length}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>
            Total Sales ({selectedDate ? "Selected Day" : "All"})
          </div>
          <div style={styles.statValue}>₹{totalSales}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Total Students</div>
          <div style={styles.statValue}>{studentCount}</div>
        </div>

        <div style={styles.statCard}>
          <div style={styles.statLabel}>Active Students</div>
          <div style={styles.statValue}>{activeCount}</div>
        </div>
      </div>

      {/* Live Transaction Feed Component */}
      <div style={styles.section}>
        <div style={styles.sectionHeaderRow}>
          <div style={styles.sectionTitle}>Live Transaction Feed</div>

          <div style={styles.controlsGroup}>
            {/* Live Search Bar input field */}
            <input
              type="text"
              placeholder="🔍 Search student name..."
              style={styles.searchInput}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
            />

            {/* Calendar Input Field */}
            <input
              type="date"
              style={styles.dateInput}
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />

            {/* Excel Export Button */}
            <button
              style={styles.downloadBtn}
              onClick={downloadExcel}
              onMouseOver={(e) =>
                (e.currentTarget.style.backgroundColor = "#15803d")
              }
              onMouseOut={(e) =>
                (e.currentTarget.style.backgroundColor = "#16a34a")
              }
            >
              📊 Export Sheet
            </button>
          </div>
        </div>

        {filteredHistory.length === 0 ? (
          <p style={styles.emptyState}>
            No transactions found matching the selected parameters.
          </p>
        ) : (
          <div style={styles.mainTableContainer}>
            <table style={styles.mainTable}>
              <thead>
                <tr>
                  <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
                  <th style={styles.mainTh}>Student Name</th>
                  <th style={styles.mainTh}>Timestamp</th>
                  <th style={{ ...styles.mainTh, textAlign: "right" }}>
                    Total Amount
                  </th>
                  <th
                    style={{
                      ...styles.mainTh,
                      textAlign: "center",
                      width: "160px",
                    }}
                  >
                    Status
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((bill, index) => {
                  const isExpanded = expandedTransaction === bill._id;
                  return (
                    <React.Fragment key={bill._id}>
                      {/* Main Record Data Row */}
                      <tr
                        style={{
                          backgroundColor: isExpanded
                            ? "#f1f5f9"
                            : "transparent",
                          transition: "background-color 0.2s",
                        }}
                        onMouseOver={(e) => {
                          if (!isExpanded)
                            e.currentTarget.style.backgroundColor = "#f8fafc";
                        }}
                        onMouseOut={(e) => {
                          e.currentTarget.style.backgroundColor = isExpanded
                            ? "#f1f5f9"
                            : "transparent";
                        }}
                      >
                        <td style={{ ...styles.mainTd, ...styles.sNoText }}>
                          {index + 1}
                        </td>
                        <td style={styles.mainTd}>
                          <div
                            style={styles.nameLink}
                            onClick={() =>
                              setExpandedTransaction(
                                isExpanded ? null : bill._id
                              )
                            }
                          >
                            {bill.studentId?.name || "Deleted Account"}
                          </div>
                        </td>
                        <td style={{ ...styles.mainTd, ...styles.timeText }}>
                          {new Date(bill.createdAt).toLocaleString()}
                        </td>
                        <td
                          style={{
                            ...styles.mainTd,
                            ...styles.amountText,
                            textAlign: "right",
                          }}
                        >
                          ₹{bill.totalAmount}
                        </td>
                        <td style={{ ...styles.mainTd, textAlign: "center" }}>
                          <span style={styles.statusBadge}>
                            {TRANSACTION_STATUS}
                          </span>
                        </td>
                      </tr>

                      {/* Collapsible Items Dropdown Table Row */}
                      {isExpanded && (
                        <tr>
                          <td
                            colSpan="5"
                            style={{
                              ...styles.mainTd,
                              padding: "0 20px",
                              backgroundColor: "#f1f5f9",
                            }}
                          >
                            <div style={styles.expandedContainer}>
                              <span style={styles.expandedTitle}>
                                Purchased Items Summary
                              </span>
                              <table style={styles.subTable}>
                                <thead>
                                  <tr>
                                    <th style={styles.subTh}>Item Name</th>
                                    <th
                                      style={{
                                        ...styles.subTh,
                                        textAlign: "center",
                                        width: "80px",
                                      }}
                                    >
                                      Quantity
                                    </th>
                                    <th
                                      style={{
                                        ...styles.subTh,
                                        textAlign: "right",
                                        width: "120px",
                                      }}
                                    >
                                      Unit Price
                                    </th>
                                    <th
                                      style={{
                                        ...styles.subTh,
                                        textAlign: "right",
                                        width: "140px",
                                      }}
                                    >
                                      Subtotal
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bill.items?.map((item, subIndex) => (
                                    <tr key={subIndex}>
                                      <td
                                        style={{
                                          ...styles.subTd,
                                          fontWeight: "600",
                                        }}
                                      >
                                        {item.name}
                                      </td>
                                      <td
                                        style={{
                                          ...styles.subTd,
                                          textAlign: "center",
                                          ...styles.textMuted,
                                        }}
                                      >
                                        {item.quantity}
                                      </td>
                                      <td
                                        style={{
                                          ...styles.subTd,
                                          textAlign: "right",
                                          ...styles.textMuted,
                                        }}
                                      >
                                        ₹{item.price}
                                      </td>
                                      <td
                                        style={{
                                          ...styles.subTd,
                                          textAlign: "right",
                                          ...styles.textBold,
                                        }}
                                      >
                                        ₹{item.price * item.quantity}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Dashboard;