import React, { useState, useEffect, useCallback } from "react";
import toast from "react-hot-toast";
import Icon from "../components/Icon";
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
import { EntryDetails } from "../components/WalletActivity";
import {
  businessDateToday,
  describeEntry,
  entryAmount,
  entryActor,
  entryLabel,
  entryReference,
  hasDetails,
} from "../utils/ledgerEntry";
import { ReceiptButton } from "../components/ReceiptButton";

/* The feed is the whole ledger now — money in as well as out. The day filter
   moved to the server with it: a date is a business day in the school's
   timezone, and the client cannot narrow to one it never fetched.

   One day at a time, always. The feed used to open on "everything, most
   recent first", which read as a day's takings but was a window reaching back
   however far the last few hundred rows happened to go — so the totals above
   it counted a day the school never had. The picker moves between days; it
   never widens to all of them, and clearing it comes back to today. */
const FEED_LIMIT = 200;

const Dashboard = () => {
  const [expandedTransaction, setExpandedTransaction] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [studentCount, setStudentCount] = useState(0);
  const [activeCount, setActiveCount] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedDate, setSelectedDate] = useState(businessDateToday);

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
      const res = await api.get("/transactions/ledger", {
        params: { limit: FEED_LIMIT, date: selectedDate },
      });
      setHistory(res.data.entries);
      setLoadError(false);
    } catch (err) {
      console.error(err);
      // Keep showing existing rows if a background refresh fails; only
      // surface the error when there is nothing on screen to trust.
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [selectedDate]);

  // Refresh transaction history every 30 seconds, plus whenever the window
  // regains focus.
  useEffect(() => {
    const initial = setTimeout(fetchHistory, 0);

    const interval = setInterval(fetchHistory, 30000);
    window.addEventListener("focus", fetchHistory);

    return () => {
      clearTimeout(initial);
      clearInterval(interval);
      window.removeEventListener("focus", fetchHistory);
    };
  }, [fetchHistory]);

  const filteredHistory = history.filter((entry) => {
    const studentName = entry.student?.name || "Deleted Account";
    return studentName.toLowerCase().includes(searchQuery.toLowerCase());
  });

  /* The tiles used to say "All" or "Selected Day"; now that the feed is always
     one day, they name which one. Parsed at local midnight rather than through
     Date("2026-09-07"), which is read as UTC and prints the day before for
     anyone east of Greenwich. */
  const dayLabel =
    selectedDate === businessDateToday()
      ? "Today"
      : new Date(`${selectedDate}T00:00:00`).toLocaleDateString();

  // Spent and added are counted apart on purpose: one total covering both
  // directions would net a day's sales against its recharges and mean nothing.
  const sumWhere = (direction) => filteredHistory.reduce(
    (sum, entry) => (describeEntry(entry).direction === direction ? sum + (entry.amount || 0) : sum),
    0
  );
  const totalSales = sumWhere("out");
  const totalAdded = sumWhere("in");

  const downloadExcel = () => {
    if (filteredHistory.length === 0) {
      toast.error("No data available to export for the current filters");
      return;
    }

    const headers = [
      "S.No.",
      "Entry ID",
      "Student Name",
      "Date/Time",
      "Type",
      "Processed By",
      "Reference",
      "Receipt No.",
      "UTR",
      "Purchased Items (Qty x Price)",
      "Money In",
      "Money Out",
      "Balance",
    ];

    const csvRows = [
      headers.join(","),
      ...filteredHistory.map((entry, index) => {
        const { label } = entryLabel(entry);
        const { direction } = describeEntry(entry);
        const studentName = `"${(entry.student?.name || "Deleted Account").replace(/"/g, '""')}"`;
        const timestamp = `"${new Date(entry.date).toLocaleString().replace(/"/g, '""')}"`;
        const itemSummary = entry.items?.length
          ? `"${entry.items.map((i) => `${i.name} (${i.quantity}x₹${i.price})`).join(" | ")}"`
          : '""';
        const reference = `"${(entryReference(entry) || "").replace(/"/g, '""')}"`;
        const processedBy = `"${entryActor(entry).name.replace(/"/g, '""')}"`;

        return [
          index + 1,
          entry._id,
          studentName,
          timestamp,
          `"${label}"`,
          processedBy,
          reference,
          `"${entry.receiptNumber || ""}"`,
          `"${entry.utr || ""}"`,
          itemSummary,
          direction === "in" ? entry.amount : "",
          direction === "out" ? entry.amount : "",
          entry.newBalance ?? "",
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
      `Transactions_Report_${selectedDate}.csv`
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="page">
      <PageHeader
        title="School Wallet Dashboard"
        subtitle="Every movement on a student wallet — money in, money out, and what bounced"
      />

      <div className="card-grid" style={{ marginBottom: 24 }}>
        <Card className="card--tight">
          <div className="stat-label">
            Wallet Entries ({dayLabel})
          </div>
          <div className="stat-value">{filteredHistory.length}</div>
        </Card>

        <Card className="card--tight">
          <div className="stat-label">
            Total Sales ({dayLabel})
          </div>
          <div className="stat-value">{formatINR(totalSales)}</div>
        </Card>

        <Card className="card--tight">
          <div className="stat-label">
            Money Added ({dayLabel})
          </div>
          <div className="stat-value">{formatINR(totalAdded)}</div>
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
              // A cleared picker is not a request for the whole archive; it is
              // someone emptying a field. Come back to today.
              onChange={(e) => setSelectedDate(e.target.value || businessDateToday())}
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
              ? `Sales, top-ups and refunds for ${dayLabel.toLowerCase()} appear here in real time.`
              : "Try clearing the search, or pick another day."}
          </EmptyState>
        ) : (
          <div className="table-wrap">
            <table className="table table--stack table--hover">
              <thead>
                <tr>
                  <th style={{ width: 60 }}>S.No.</th>
                  <th>Student Name</th>
                  <th>Date/Time</th>
                  <th style={{ width: 190 }}>Type</th>
                  <th>Processed by</th>
                  <th>Reference</th>
                  <th style={{ textAlign: "right" }}>Amount</th>
                  <th style={{ textAlign: "right", width: 130 }}>Balance</th>
                  <th style={{ width: 132 }} />
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((entry, index) => {
                  const { label, variant } = entryLabel(entry);
                  const { direction } = describeEntry(entry);
                  const actor = entryActor(entry);
                  const rowKey = `${entry.kind}-${entry._id}`;
                  const isExpanded = expandedTransaction === rowKey;
                  // A charge or a refund has a basket and a package to open;
                  // a top-up has its receipt and nothing more to say.
                  const expandable = hasDetails(entry);
                  const studentName = entry.student?.name || "Deleted Account";

                  return (
                    <React.Fragment key={rowKey}>
                      <tr
                        className={
                          expandable ? "ledger-row--expandable" : undefined
                        }
                        aria-expanded={expandable ? isExpanded : undefined}
                        onClick={
                          expandable
                            ? () =>
                                setExpandedTransaction(
                                  isExpanded ? null : rowKey
                                )
                            : undefined
                        }
                        style={{
                          background: isExpanded
                            ? "var(--bg-subtle)"
                            : undefined,
                        }}
                      >
                        <td data-label="S.No." style={{ color: "var(--muted)" }}>
                          {index + 1}
                        </td>
                        <td data-label="Student">{studentName}</td>
                        <td
                          data-label="Date/Time"
                          style={{ fontSize: 13, color: "var(--muted)" }}
                        >
                          {new Date(entry.date).toLocaleString()}
                        </td>
                        <td data-label="Type">
                          <Badge variant={variant}>{label}</Badge>
                        </td>
                        <td
                          data-label="Processed by"
                          style={actor.muted ? { color: "var(--muted)", fontSize: 13 } : undefined}
                        >
                          {actor.name}
                        </td>
                        <td data-label="Reference" className="ledger-mono">
                          {entryReference(entry) || "—"}
                        </td>
                        <td
                          data-label="Amount"
                          className={direction === "none" ? "amount-void" : undefined}
                          style={{
                            textAlign: "right",
                            fontWeight: 700,
                            color:
                              direction === "in" ? "var(--success)" : "var(--ink)",
                          }}
                        >
                          {entryAmount(entry)}
                        </td>
                        <td
                          data-label="Balance"
                          style={{
                            textAlign: "right",
                            fontSize: 13,
                            color: "var(--muted)",
                          }}
                        >
                          {entry.newBalance === undefined
                            ? "—"
                            : formatINR(entry.newBalance)}
                        </td>
                        <td className="ledger-actions">
                          {(entry.adjustmentId || entry.reversalId) &&
                            entry.student?.id && (
                            <ReceiptButton studentId={entry.student.id} entry={entry} />
                          )}
                          {expandable && (
                            <span
                              className={`ledger-chevron${
                                isExpanded ? " ledger-chevron--open" : ""
                              }`}
                              aria-hidden="true"
                            >
                              <Icon name="caret" size={16} />
                            </span>
                          )}
                        </td>
                      </tr>

                      {isExpanded && (
                        <tr className="ledger-detail-row">
                          <td colSpan="9">
                            <EntryDetails entry={entry} />
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
