import { useCallback, useEffect, useState } from "react";
import toast from "react-hot-toast";
import api from "../utils/api";
import { formatINR } from "../utils/format";
import { describeEntry } from "../utils/ledgerEntry";
import { ReceiptButton } from "../components/ReceiptButton";
import {
  Badge,
  Banner,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
} from "../components/ui";

/* Top-ups only. The registry answers "what has been added to this wallet, and
   what does the receipt say" — a refused attempt moved no money and belongs in
   the dashboard feed and the student's own activity, where it is labelled as
   the non-event it is. */
const TOP_UP = "TOP_UP";

const RechargeHistory = () => {
  const [students, setStudents] = useState([]);
  /* One student's top-ups, keyed by id, fetched when their row is opened.
     The roster used to carry a rechargeHistory array and this page used to
     read it — but only the office's own top-ups ever wrote to it, so every
     UPI recharge a parent made was missing from a page whose whole subject is
     recharges. The ledger has both. */
  const [ledgers, setLedgers] = useState({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchStudents();
  }, []);

  async function fetchStudents() {
    setLoading(true);
    setLoadError(false);

    try {
      const res = await api.get("/students");
      setStudents(res.data || []);
    } catch (err) {
      console.error(err);
      setLoadError(true);
    } finally {
      setLoading(false);
    }
  }

  const filteredStudents = students.filter((st) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      st.name?.toLowerCase().includes(query) ||
      st.roomNumber?.toString().toLowerCase().includes(query)
    );
  });

  const loadLedger = useCallback(async (studentId) => {
    setLedgers((current) => ({
      ...current,
      [studentId]: { loading: true, failed: false, entries: current[studentId]?.entries || [] },
    }));

    try {
      const { data } = await api.get(`/students/${studentId}/ledger`, {
        params: { limit: 200 },
      });
      setLedgers((current) => ({
        ...current,
        [studentId]: {
          loading: false,
          failed: false,
          entries: (data.entries || []).filter((entry) => entry.kind === TOP_UP),
        },
      }));
    } catch (error) {
      console.error(error);
      setLedgers((current) => ({
        ...current,
        [studentId]: { loading: false, failed: true, entries: [] },
      }));
    }
  }, []);

  const handleToggleDropdown = (id) => {
    const opening = selectedStudentId !== id;
    setSelectedStudentId(opening ? id : null);
    // Re-reading on every open keeps a registry current while the desk is
    // taking money at it; the response is small and the page is not a feed.
    if (opening) loadLedger(id);
  };

  const downloadCsv = (rows, filename) => {
    const blob = new Blob([rows.join("\n")], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    // The blob is held in memory until this is revoked; an admin exporting
    // repeatedly would otherwise accumulate them for the life of the tab.
    URL.revokeObjectURL(url);
  };

  const esc = (value) =>
    `"${(value ?? "N/A").toString().replace(/"/g, '""')}"`;

  const downloadAllStudentsExcel = () => {
    if (filteredStudents.length === 0) {
      toast.error("No student data available to export");
      return;
    }

    const headers = [
      "S.No.",
      "Student Name",
      "Admission Number",
      "Room Number",
      "Class",
      "Father's Name",
      "Current Wallet Balance (INR)",
    ];

    const rows = filteredStudents.map((st, index) =>
      [
        index + 1,
        esc(st.name),
        esc(st.admissionNumber),
        esc(st.roomNumber),
        esc([st.className || st.grade, st.section].filter(Boolean).join("-")),
        esc(st.fatherName),
        st.pocketMoney ?? 0,
      ].join(",")
    );

    downloadCsv([headers.join(","), ...rows], "All_Students_Wallet_Report.csv");
  };

  const downloadExcel = (e, student) => {
    e.stopPropagation();

    const entries = ledgers[student._id]?.entries || [];
    if (entries.length === 0) {
      toast.error("No recharges to export for this student");
      return;
    }

    const metaRows = [
      `"STUDENT RECHARGE STATEMENT"`,
      `"Student Name:",${esc(student.name)}`,
      `"Admission Number:",${esc(student.admissionNumber)}`,
      `"Room Number:",${esc(student.roomNumber)}`,
      `"Class:",${esc([student.className || student.grade, student.section].filter(Boolean).join("-"))}`,
      `"Father's Name:",${esc(student.fatherName)}`,
      `""`,
    ];

    const tableHeaders = [
      "S.No.",
      "Timestamp",
      "Type",
      "Receipt No.",
      "Previous Balance (INR)",
      "Amount Added (INR)",
      "Closing Balance (INR)",
    ];

    const transactionRows = entries.map((entry, index) =>
      [
        index + 1,
        `"${new Date(entry.date).toLocaleString()}"`,
        esc(describeEntry(entry).label),
        esc(entry.receiptNumber),
        entry.previousBalance,
        entry.amount,
        entry.newBalance,
      ].join(",")
    );

    const safeName = (student.name || "student").replace(/\s+/g, "_");
    downloadCsv(
      [...metaRows, tableHeaders.join(","), ...transactionRows],
      `${safeName}_recharge_history.csv`
    );
  };

  return (
    <div className="page">
      <PageHeader
        title="Wallet Recharge Registry"
        subtitle="Every top-up on a wallet — the desk’s and a parent’s own UPI payments alike — with the receipt for each."
        actions={
          students.length > 0 && (
            <Button onClick={downloadAllStudentsExcel}>
              📊 Export All Students (.csv)
            </Button>
          )
        }
      />

      <Card>
        <div style={{ marginBottom: 16 }}>
          <input
            type="search"
            className="input"
            aria-label="Search students"
            placeholder="🔍 Search by student name or room number…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        {loading ? (
          <div>
            <Skeleton height={56} />
            <Skeleton height={56} style={{ marginTop: 12 }} />
            <Skeleton height={56} style={{ marginTop: 12 }} />
          </div>
        ) : loadError ? (
          <Banner variant="alert" icon="⚠️">
            Couldn't load the student roster. Check your connection and{" "}
            <button
              type="button"
              className="link-button"
              onClick={fetchStudents}
            >
              try again
            </button>
            .
          </Banner>
        ) : filteredStudents.length === 0 ? (
          <EmptyState
            icon="🎓"
            title={
              students.length === 0 ? "No students yet" : "No matching students"
            }
          >
            {students.length === 0
              ? "Students you add will appear here with their recharge history."
              : `Nothing matches "${searchQuery}".`}
          </EmptyState>
        ) : (
          <div className="accordion">
            {filteredStudents.map((st) => {
              const isOpen = selectedStudentId === st._id;
              return (
                <div
                  key={st._id}
                  className={`accordion-item${
                    isOpen ? " accordion-item--open" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="accordion-trigger"
                    aria-expanded={isOpen}
                    onClick={() => handleToggleDropdown(st._id)}
                  >
                    <span
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <span
                        style={{
                          fontWeight: 600,
                          fontSize: 15,
                          color: "var(--ink)",
                        }}
                      >
                        {st.name}
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 500,
                          color: "var(--muted)",
                        }}
                      >
                        Room ID: R—{st.roomNumber || "N/A"}
                      </span>
                    </span>

                    <span
                      style={{ display: "flex", alignItems: "center", gap: 16 }}
                    >
                      <span
                        style={{
                          fontWeight: 700,
                          fontSize: 15,
                          color: "var(--ink)",
                        }}
                      >
                        {formatINR(st.pocketMoney)}
                      </span>
                      <span className="accordion-chevron" aria-hidden="true">
                        ▼
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="accordion-body">
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 12,
                          marginBottom: 16,
                        }}
                      >
                        <h4
                          style={{
                            margin: 0,
                            fontSize: 14,
                            fontWeight: 600,
                            color: "var(--ink-dim)",
                          }}
                        >
                          Recharge History
                        </h4>
                        {(ledgers[st._id]?.entries.length || 0) > 0 && (
                          <button
                            type="button"
                            className="link-button"
                            style={{ color: "var(--primary)" }}
                            onClick={(e) => downloadExcel(e, st)}
                          >
                            💾 Export Statement (.csv)
                          </button>
                        )}
                      </div>

                      {(() => {
                        const ledger = ledgers[st._id];

                        if (!ledger || (ledger.loading && ledger.entries.length === 0)) {
                          return (
                            <div>
                              <Skeleton height={40} />
                              <Skeleton height={40} style={{ marginTop: 8 }} />
                            </div>
                          );
                        }

                        if (ledger.failed) {
                          return (
                            <Banner variant="alert">
                              That history could not be loaded.{" "}
                              <button
                                type="button"
                                className="link-button"
                                onClick={() => loadLedger(st._id)}
                              >
                                Try again
                              </button>
                              .
                            </Banner>
                          );
                        }

                        if (ledger.entries.length === 0) {
                          return (
                            <p
                              style={{
                                margin: 0,
                                padding: "24px 0",
                                textAlign: "center",
                                fontSize: 14,
                                color: "var(--muted)",
                              }}
                            >
                              No money has been added to this wallet yet.
                            </p>
                          );
                        }

                        return (
                          <div className="table-wrap">
                            <table className="table table--stack table--hover">
                              <thead>
                                <tr>
                                  <th style={{ width: 60 }}>#</th>
                                  <th>Timestamp</th>
                                  <th style={{ width: 150 }}>Type</th>
                                  <th>Receipt No.</th>
                                  <th style={{ width: 150, textAlign: "right" }}>
                                    Previous Balance
                                  </th>
                                  <th style={{ width: 150, textAlign: "center" }}>
                                    Amount Added
                                  </th>
                                  <th style={{ width: 150, textAlign: "right" }}>
                                    Closing Balance
                                  </th>
                                  <th style={{ width: 110 }} />
                                </tr>
                              </thead>
                              <tbody>
                                {ledger.entries.map((entry, index) => (
                                  <tr key={entry._id}>
                                    <td data-label="#" style={{ color: "var(--muted)" }}>
                                      {index + 1}
                                    </td>
                                    <td data-label="Timestamp">
                                      {new Date(entry.date).toLocaleString()}
                                    </td>
                                    <td data-label="Type">
                                      <Badge variant="neutral">
                                        {describeEntry(entry).label}
                                      </Badge>
                                    </td>
                                    <td data-label="Receipt No." className="ledger-mono">
                                      {entry.receiptNumber || "\u2014"}
                                    </td>
                                    <td
                                      data-label="Previous Balance"
                                      style={{
                                        textAlign: "right",
                                        fontWeight: 700,
                                        color: "var(--ink)",
                                      }}
                                    >
                                      {formatINR(entry.previousBalance)}
                                    </td>
                                    <td
                                      data-label="Amount Added"
                                      style={{ textAlign: "center" }}
                                    >
                                      <Badge variant="success">
                                        + {formatINR(entry.amount)}
                                      </Badge>
                                    </td>
                                    <td
                                      data-label="Closing Balance"
                                      style={{
                                        textAlign: "right",
                                        fontWeight: 700,
                                        color: "var(--ink)",
                                      }}
                                    >
                                      {formatINR(entry.newBalance)}
                                    </td>
                                    <td style={{ textAlign: "right" }}>
                                      {entry.adjustmentId && (
                                        <ReceiptButton studentId={st._id} entry={entry} />
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        );
                      })()}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
};

export default RechargeHistory;
