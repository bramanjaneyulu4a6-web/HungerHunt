import { useEffect, useState } from "react";
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

const RechargeHistory = () => {
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    fetchStudents();
  }, []);

  const fetchStudents = async () => {
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
  };

  const filteredStudents = students.filter((st) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      st.name?.toLowerCase().includes(query) ||
      st.hostelNumber?.toString().toLowerCase().includes(query)
    );
  });

  const handleToggleDropdown = (id) => {
    setSelectedStudentId(selectedStudentId === id ? null : id);
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
      "Hostel Number",
      "Grade",
      "Father's Name",
      "Current Wallet Balance (INR)",
      "Total Transactions Logged",
    ];

    const rows = filteredStudents.map((st, index) =>
      [
        index + 1,
        esc(st.name),
        esc(st.hostelNumber),
        esc(st.grade),
        esc(st.fatherName),
        st.pocketMoney ?? 0,
        st.rechargeHistory ? st.rechargeHistory.length : 0,
      ].join(",")
    );

    downloadCsv([headers.join(","), ...rows], "All_Students_Wallet_Report.csv");
  };

  const downloadExcel = (e, student) => {
    e.stopPropagation();

    if (!student?.rechargeHistory?.length) {
      toast.error("No transaction history available to export");
      return;
    }

    const metaRows = [
      `"STUDENT TRANSACTION STATEMENT"`,
      `"Student Name:",${esc(student.name)}`,
      `"Hostel Number:",${esc(student.hostelNumber)}`,
      `"Grade:",${esc(student.grade)}`,
      `"Father's Name:",${esc(student.fatherName)}`,
      `""`,
    ];

    const tableHeaders = [
      "S.No.",
      "Timestamp",
      "Previous Balance (INR)",
      "Credit Allocation (INR)",
      "Closing Balance (INR)",
    ];

    const transactionRows = student.rechargeHistory.map((r, index) =>
      [
        index + 1,
        `"${new Date(r.date).toLocaleString()}"`,
        r.previousBalance,
        r.amount,
        r.newBalance,
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
        subtitle="Audit every top-up and current balance across the roster."
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
            placeholder="🔍 Search by student name or hostel number…"
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
                        Hostel ID: H—{st.hostelNumber || "N/A"}
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
                        {st.rechargeHistory?.length > 0 && (
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

                      {!st.rechargeHistory || st.rechargeHistory.length === 0 ? (
                        <p
                          style={{
                            margin: 0,
                            padding: "24px 0",
                            textAlign: "center",
                            fontSize: 14,
                            color: "var(--muted)",
                          }}
                        >
                          No recharges recorded for this student yet.
                        </p>
                      ) : (
                        <div className="table-wrap">
                          <table className="table table--stack table--hover">
                            <thead>
                              <tr>
                                <th style={{ width: 60 }}>#</th>
                                <th>Timestamp</th>
                                <th style={{ width: 180, textAlign: "right" }}>
                                  Previous Balance
                                </th>
                                <th style={{ width: 180, textAlign: "center" }}>
                                  Amount Added
                                </th>
                                <th style={{ width: 180, textAlign: "right" }}>
                                  Closing Balance
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {st.rechargeHistory.map((r, index) => (
                                <tr key={index}>
                                  <td data-label="#" style={{ color: "var(--muted)" }}>
                                    {index + 1}
                                  </td>
                                  <td data-label="Timestamp">
                                    {new Date(r.date).toLocaleString()}
                                  </td>
                                  <td
                                    data-label="Previous Balance"
                                    style={{
                                      textAlign: "right",
                                      fontWeight: 700,
                                      color: "var(--ink)",
                                    }}
                                  >
                                    {formatINR(r.previousBalance)}
                                  </td>
                                  <td
                                    data-label="Amount Added"
                                    style={{ textAlign: "center" }}
                                  >
                                    <Badge variant="success">
                                      + {formatINR(r.amount)}
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
                                    {formatINR(r.newBalance)}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
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
