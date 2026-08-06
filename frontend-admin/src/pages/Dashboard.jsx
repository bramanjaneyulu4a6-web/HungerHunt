import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import { formatINR } from "../utils/format";
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

// Transaction model has no status field; every record is a completed debit.
const TRANSACTION_STATUS = "Wallet Deducted";

// Local calendar date (YYYY-MM-DD) — the date <input> is local, so comparing
// against toISOString() would shift late-evening IST transactions a day back.
const localDateString = (value) => {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

const Dashboard = () => {
  const [expandedTransaction, setExpandedTransaction] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
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

  const fetchHistory = useCallback(async () => {
    try {
      const res = await api.get("/transactions/history");
      setHistory(res.data);
      setLoadError(false);
    } catch (err) {
      console.error(err);
      // Keep showing existing rows if a background refresh fails; only
      // surface the error when there is nothing on screen to trust.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  // Refresh transaction history every 30 seconds, plus whenever the window
  // regains focus.
  useEffect(() => {
    fetchHistory();

    const interval = setInterval(fetchHistory, 30000);
    window.addEventListener("focus", fetchHistory);

    return () => {
      clearInterval(interval);
      window.removeEventListener("focus", fetchHistory);
    };
  }, [fetchHistory]);

  const filteredHistory = history.filter((transaction) => {
    const matchesDate =
      !selectedDate || localDateString(transaction.createdAt) === selectedDate;

    const studentName = transaction.studentId?.name || "Deleted Account";
    const matchesSearch = studentName
      .toLowerCase()
      .includes(searchQuery.toLowerCase());

    return matchesDate && matchesSearch;
  });

  const totalSales = filteredHistory.reduce(
    (sum, b) => sum + (b.totalAmount || 0),
    0
  );

  const downloadExcel = () => {
    if (filteredHistory.length === 0) {
      toast.error("No data available to export for the current filters");
      return;
    }

    const headers = [
      "S.No.",
      "Transaction ID",
      "Student Name",
      "Timestamp",
      "Purchased Items (Qty x Price)",
      "Total Amount",
      "Status",
    ];

    const csvRows = [
      headers.join(","),
      ...filteredHistory.map((bill, index) => {
        const studentName = `"${(bill.studentId?.name || "Deleted Account").replace(/"/g, '""')}"`;
        const timestamp = `"${new Date(bill.createdAt).toLocaleString().replace(/"/g, '""')}"`;
        const itemSummary = bill.items
          ? `"${bill.items.map((i) => `${i.name} (${i.quantity}x₹${i.price})`).join(" | ")}"`
          : '""';

        return [
          index + 1,
          bill._id,
          studentName,
          timestamp,
          itemSummary,
          bill.totalAmount,
          `"${TRANSACTION_STATUS}"`,
        ].join(",");
      }),
    ];

    // UTF-8 BOM keeps Excel from mangling the rupee signs.
    const csvContent = "﻿" + csvRows.join("\n");
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

  return (
    <div className="page">
      <PageHeader
        title="School Wallet Dashboard"
        subtitle="Real-time transactions and student wallet activity"
      />

      <div className="card-grid" style={{ marginBottom: 24 }}>
        <Card className="card--tight">
          <div className="stat-label">
            Total Transactions ({selectedDate ? "Selected Day" : "All"})
          </div>
          <div className="stat-value">{filteredHistory.length}</div>
        </Card>

        <Card className="card--tight">
          <div className="stat-label">
            Total Sales ({selectedDate ? "Selected Day" : "All"})
          </div>
          <div className="stat-value">{formatINR(totalSales)}</div>
        </Card>

        <Card className="card--tight">
          <div className="stat-label">Total Students</div>
          <div className="stat-value">{studentCount}</div>
        </Card>

        <Card className="card--tight">
          <div className="stat-label">Active Students</div>
          <div className="stat-value">{activeCount}</div>
        </Card>
      </div>

      <Card>
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
          <h2 className="section-title" style={{ marginBottom: 0 }}>
            Live Transaction Feed
          </h2>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <input
              type="search"
              className="input"
              style={{ width: 220 }}
              aria-label="Search by student name"
              placeholder="🔍 Search student name…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />

            <input
              type="date"
              className="input"
              style={{ width: "auto" }}
              aria-label="Filter by date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
            />

            <Button variant="success" onClick={downloadExcel}>
              📊 Export Sheet
            </Button>
          </div>
        </div>

        {loading ? (
          <div>
            <Skeleton height={48} />
            <Skeleton height={48} style={{ marginTop: 10 }} />
            <Skeleton height={48} style={{ marginTop: 10 }} />
          </div>
        ) : loadError && history.length === 0 ? (
          <Banner variant="alert" icon="⚠️">
            Couldn't load the transaction feed. Check your connection and{" "}
            <button type="button" className="link-button" onClick={fetchHistory}>
              try again
            </button>
            .
          </Banner>
        ) : filteredHistory.length === 0 ? (
          <EmptyState
            icon="🧾"
            title={
              history.length === 0
                ? "No transactions yet"
                : "No matching transactions"
            }
          >
            {history.length === 0
              ? "Sales made at the kiosk will appear here in real time."
              : "Try clearing the search or date filter."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--stack table--hover">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>S.No.</th>
                  <th>Student Name</th>
                  <th>Timestamp</th>
                  <th style={{ textAlign: "right" }}>Total Amount</th>
                  <th style={{ textAlign: "center", width: 160 }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((bill, index) => {
                  const isExpanded = expandedTransaction === bill._id;
                  return (
                    <React.Fragment key={bill._id}>
                      <tr
                        style={{
                          background: isExpanded
                            ? "var(--bg-subtle)"
                            : undefined,
                        }}
                      >
                        <td data-label="S.No." style={{ color: "var(--muted)" }}>
                          {index + 1}
                        </td>
                        <td data-label="Student">
                          <button
                            type="button"
                            className="link-button"
                            style={{
                              color: "var(--primary)",
                              textDecoration: "none",
                            }}
                            aria-expanded={isExpanded}
                            onClick={() =>
                              setExpandedTransaction(
                                isExpanded ? null : bill._id
                              )
                            }
                          >
                            {bill.studentId?.name || "Deleted Account"}
                          </button>
                        </td>
                        <td
                          data-label="Timestamp"
                          style={{ fontSize: 13, color: "var(--muted)" }}
                        >
                          {new Date(bill.createdAt).toLocaleString()}
                        </td>
                        <td
                          data-label="Amount"
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color: "var(--ink)",
                          }}
                        >
                          {formatINR(bill.totalAmount)}
                        </td>
                        <td data-label="Status" style={{ textAlign: "center" }}>
                          <Badge variant="success">{TRANSACTION_STATUS}</Badge>
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr>
                          <td
                            colSpan="5"
                            style={{
                              padding: "0 20px 12px",
                              background: "var(--bg-subtle)",
                            }}
                          >
                            <div
                              style={{
                                padding: 16,
                                marginTop: 4,
                                background: "var(--surface)",
                                border: "1px solid var(--border-strong)",
                                borderRadius: "var(--radius)",
                              }}
                            >
                              <span
                                style={{
                                  display: "block",
                                  marginBottom: 12,
                                  fontSize: 13,
                                  fontWeight: 700,
                                  color: "var(--ink-strong)",
                                }}
                              >
                                Purchased Items Summary
                              </span>
                              <table className="table">
                                <thead>
                                  <tr>
                                    <th>Item Name</th>
                                    <th style={{ textAlign: "center", width: 80 }}>
                                      Quantity
                                    </th>
                                    <th style={{ textAlign: "right", width: 120 }}>
                                      Unit Price
                                    </th>
                                    <th style={{ textAlign: "right", width: 140 }}>
                                      Subtotal
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {bill.items?.map((item, subIndex) => (
                                    <tr key={subIndex}>
                                      <td style={{ fontWeight: 600 }}>
                                        {item.name}
                                      </td>
                                      <td
                                        style={{
                                          textAlign: "center",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        {item.quantity}
                                      </td>
                                      <td
                                        style={{
                                          textAlign: "right",
                                          color: "var(--muted)",
                                        }}
                                      >
                                        {formatINR(item.price)}
                                      </td>
                                      <td
                                        style={{
                                          textAlign: "right",
                                          fontWeight: 600,
                                        }}
                                      >
                                        {formatINR(item.price * item.quantity)}
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
      </Card>
    </div>
  );
};

export default Dashboard;
