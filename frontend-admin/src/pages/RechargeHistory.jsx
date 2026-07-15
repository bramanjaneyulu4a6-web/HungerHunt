// // // // // import React, { useEffect, useState } from "react";
// // // // // import api from "../utils/api";

// // // // // const RechargeHistory = () => {
// // // // //   const [students, setStudents] = useState([]);
// // // // //   const [selectedStudent, setSelectedStudent] = useState(null);

// // // // //   useEffect(() => {
// // // // //     api.get("/students").then((res) => setStudents(res.data));
// // // // //   }, []);

// // // // //   return (
// // // // //     <div style={{ padding: "20px", fontFamily: "system-ui" }}>
// // // // //       <h2>Wallet Recharge History</h2>

// // // // //       {/* Student List */}
// // // // //       <div style={{ display: "grid", gap: "10px", marginBottom: "20px" }}>
// // // // //         {students.map((st) => (
// // // // //           <button
// // // // //             key={st._id}
// // // // //             onClick={() => setSelectedStudent(st)}
// // // // //             style={{
// // // // //               padding: "10px",
// // // // //               border: "1px solid #ccc",
// // // // //               borderRadius: "8px",
// // // // //               textAlign: "left",
// // // // //               cursor: "pointer",
// // // // //             }}
// // // // //           >
// // // // //             {st.name} - ₹{st.pocketMoney}
// // // // //           </button>
// // // // //         ))}
// // // // //       </div>

// // // // //       {/* History Table */}
// // // // //       {selectedStudent && (
// // // // //         <div>
// // // // //           <h3>
// // // // //             {selectedStudent.name} - Recharge History
// // // // //           </h3>

// // // // //           <table border="1" cellPadding="10" width="100%">
// // // // //             <thead>
// // // // //               <tr>
// // // // //                 <th>Date</th>
// // // // //                 <th>Previous Balance</th>
// // // // //                 <th>Recharge Amount</th>
// // // // //                 <th>New Balance</th>
// // // // //               </tr>
// // // // //             </thead>

// // // // //             <tbody>
// // // // //               {selectedStudent.rechargeHistory?.length > 0 ? (
// // // // //                 selectedStudent.rechargeHistory.map((r, i) => (
// // // // //                   <tr key={i}>
// // // // //                     <td>{new Date(r.date).toLocaleString()}</td>
// // // // //                     <td>₹{r.previousBalance}</td>
// // // // //                     <td>₹{r.amount}</td>
// // // // //                     <td>₹{r.newBalance}</td>
// // // // //                   </tr>
// // // // //                 ))
// // // // //               ) : (
// // // // //                 <tr>
// // // // //                   <td colSpan="4">No recharge history found</td>
// // // // //                 </tr>
// // // // //               )}
// // // // //             </tbody>
// // // // //           </table>
// // // // //         </div>
// // // // //       )}
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default RechargeHistory;




// // // // import React, { useEffect, useState } from "react";
// // // // import api from "../utils/api";

// // // // const RechargeHistory = () => {
// // // //   const [students, setStudents] = useState([]);
// // // //   const [selectedStudent, setSelectedStudent] = useState(null);
// // // //   const [searchQuery, setSearchQuery] = useState("");

// // // //   useEffect(() => {
// // // //     api.get("/students").then((res) => {
// // // //       setStudents(res.data);
// // // //       // Auto-select first student if available to populate layout beautifully
// // // //       if (res.data && res.data.length > 0) {
// // // //         setSelectedStudent(res.data[0]);
// // // //       }
// // // //     });
// // // //   }, []);

// // // //   const filteredStudents = students.filter((st) => {
// // // //     const query = searchQuery.toLowerCase().trim();
// // // //     if (!query) return true;
// // // //     return st.name?.toLowerCase().includes(query);
// // // //   });

// // // //   // Perfectly matched UI design paradigm styles
// // // //   const styles = {
// // // //     page: {
// // // //       minHeight: "100vh",
// // // //       backgroundColor: "#f8fafc",
// // // //       padding: "32px",
// // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // //       boxSizing: "border-box",
// // // //     },
// // // //     header: {
// // // //       marginBottom: "24px",
// // // //     },
// // // //     title: {
// // // //       fontSize: "28px",
// // // //       fontWeight: "700",
// // // //       color: "#0f172a",
// // // //       letterSpacing: "-0.5px",
// // // //       margin: 0,
// // // //     },
// // // //     subtitle: {
// // // //       fontSize: "14px",
// // // //       color: "#64748b",
// // // //       marginTop: "4px",
// // // //       marginBottom: 0,
// // // //     },
// // // //     layoutGrid: {
// // // //       display: "grid",
// // // //       gridTemplateColumns: "320px 1fr",
// // // //       gap: "24px",
// // // //       alignItems: "start",
// // // //     },
// // // //     section: {
// // // //       background: "#ffffff",
// // // //       border: "1px solid #e2e8f0",
// // // //       borderRadius: "14px",
// // // //       padding: "20px",
// // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // //     },
// // // //     searchBarContainer: {
// // // //       marginBottom: "16px",
// // // //     },
// // // //     input: {
// // // //       width: "100%",
// // // //       padding: "12px 14px",
// // // //       border: "1px solid #cbd5e1",
// // // //       borderRadius: "10px",
// // // //       fontSize: "14px",
// // // //       color: "#0f172a",
// // // //       backgroundColor: "#ffffff",
// // // //       outline: "none",
// // // //       transition: "border-color 0.2s",
// // // //       boxSizing: "border-box",
// // // //     },
// // // //     studentList: {
// // // //       display: "flex",
// // // //       flexDirection: "column",
// // // //       gap: "8px",
// // // //       maxHeight: "65vh",
// // // //       overflowY: "auto",
// // // //       paddingRight: "4px",
// // // //     },
// // // //     studentBtn: (isActive) => ({
// // // //       width: "100%",
// // // //       padding: "12px 16px",
// // // //       background: isActive ? "#eff6ff" : "#ffffff",
// // // //       border: isActive ? "1px solid #3b82f6" : "1px solid #e2e8f0",
// // // //       borderRadius: "10px",
// // // //       textAlign: "left",
// // // //       cursor: "pointer",
// // // //       display: "flex",
// // // //       justifyContent: "between",
// // // //       alignItems: "center",
// // // //       transition: "all 0.2s",
// // // //     }),
// // // //     studentName: (isActive) => ({
// // // //       fontWeight: "600",
// // // //       fontSize: "14px",
// // // //       color: isActive ? "#1d4ed8" : "#0f172a",
// // // //     }),
// // // //     studentWallet: {
// // // //       fontWeight: "700",
// // // //       fontSize: "14px",
// // // //       color: "#0f172a",
// // // //       marginLeft: "auto",
// // // //     },
// // // //     tableHeaderContainer: {
// // // //       marginBottom: "16px",
// // // //     },
// // // //     tableTitle: {
// // // //       fontSize: "18px",
// // // //       fontWeight: "700",
// // // //       color: "#0f172a",
// // // //       margin: 0,
// // // //     },
// // // //     mainTableContainer: {
// // // //       width: "100%",
// // // //       overflowX: "auto",
// // // //       borderRadius: "10px",
// // // //       border: "1px solid #e2e8f0",
// // // //     },
// // // //     mainTable: {
// // // //       width: "100%",
// // // //       borderCollapse: "collapse",
// // // //       textAlign: "left",
// // // //       fontSize: "14px",
// // // //     },
// // // //     mainTh: {
// // // //       backgroundColor: "#f1f5f9",
// // // //       color: "#334155",
// // // //       fontWeight: "600",
// // // //       padding: "14px",
// // // //       borderBottom: "2px solid #e2e8f0",
// // // //       fontSize: "13px",
// // // //     },
// // // //     mainTd: {
// // // //       padding: "14px",
// // // //       color: "#0f172a",
// // // //       borderBottom: "1px solid #e2e8f0",
// // // //       verticalAlign: "middle",
// // // //     },
// // // //     sNoText: {
// // // //       color: "#64748b",
// // // //       fontWeight: "500",
// // // //     },
// // // //     dateText: {
// // // //       color: "#334155",
// // // //       fontWeight: "500",
// // // //     },
// // // //     amountText: {
// // // //       fontWeight: "600",
// // // //       color: "#0f172a",
// // // //     },
// // // //     rechargeBadge: {
// // // //       backgroundColor: "#f0fdf4",
// // // //       color: "#16a34a",
// // // //       padding: "4px 10px",
// // // //       borderRadius: "8px",
// // // //       fontSize: "12px",
// // // //       fontWeight: "700",
// // // //       display: "inline-block",
// // // //       border: "1px solid #bbf7d0",
// // // //     },
// // // //     emptyState: {
// // // //       color: "#64748b",
// // // //       fontSize: "14px",
// // // //       textAlign: "center",
// // // //       padding: "40px 0",
// // // //       margin: 0,
// // // //     },
// // // //   };

// // // //   return (
// // // //     <div style={styles.page}>
// // // //       {/* Header */}
// // // //       <div style={styles.header}>
// // // //         <h1 style={styles.title}>Wallet Recharge History</h1>
// // // //         <p style={styles.subtitle}>
// // // //           Track institutional account credits, ledger transaction logs, and real-time student updates
// // // //         </p>
// // // //       </div>

// // // //       <div style={styles.layoutGrid}>
// // // //         {/* Left Panel: Student Selector */}
// // // //         <div style={styles.section}>
// // // //           <div style={styles.searchBarContainer}>
// // // //             <input
// // // //               type="text"
// // // //               style={styles.input}
// // // //               placeholder="Search students..."
// // // //               value={searchQuery}
// // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // //             />
// // // //           </div>

// // // //           <div style={styles.studentList}>
// // // //             {filteredStudents.length === 0 ? (
// // // //               <p style={styles.emptyState}>No records found.</p>
// // // //             ) : (
// // // //               filteredStudents.map((st) => {
// // // //                 const isActive = selectedStudent?._id === st._id;
// // // //                 return (
// // // //                   <button
// // // //                     key={st._id}
// // // //                     onClick={() => setSelectedStudent(st)}
// // // //                     style={styles.studentBtn(isActive)}
// // // //                     onMouseOver={(e) => {
// // // //                       if (!isActive) e.currentTarget.style.backgroundColor = "#f8fafc";
// // // //                     }}
// // // //                     onMouseOut={(e) => {
// // // //                       if (!isActive) e.currentTarget.style.backgroundColor = "#ffffff";
// // // //                     }}
// // // //                   >
// // // //                     <span style={styles.studentName(isActive)}>{st.name}</span>
// // // //                     <span style={styles.studentWallet}>₹{st.pocketMoney}</span>
// // // //                   </button>
// // // //                 );
// // // //               })
// // // //             )}
// // // //           </div>
// // // //         </div>

// // // //         {/* Right Panel: Selected Student Ledger History */}
// // // //         <div style={styles.section}>
// // // //           {selectedStudent ? (
// // // //             <div>
// // // //               <div style={styles.tableHeaderContainer}>
// // // //                 <h2 style={styles.tableTitle}>
// // // //                   {selectedStudent.name} — Transaction Ledger
// // // //                 </h2>
// // // //               </div>

// // // //               {!selectedStudent.rechargeHistory || selectedStudent.rechargeHistory.length === 0 ? (
// // // //                 <p style={styles.emptyState}>
// // // //                   No active statement metrics discovered for this account context.
// // // //                 </p>
// // // //               ) : (
// // // //                 <div style={styles.mainTableContainer}>
// // // //                   <table style={styles.mainTable}>
// // // //                     <thead>
// // // //                       <tr>
// // // //                         <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// // // //                         <th style={styles.mainTh}>Timestamp</th>
// // // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Previous Balance</th>
// // // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Credit Allocation</th>
// // // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Closing Balance</th>
// // // //                       </tr>
// // // //                     </thead>
// // // //                     <tbody>
// // // //                       {selectedStudent.rechargeHistory.map((r, index) => (
// // // //                         <tr
// // // //                           key={index}
// // // //                           style={{ transition: "background-color 0.2s" }}
// // // //                           onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // //                           onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // //                         >
// // // //                           <td style={{ ...styles.mainTd, ...styles.sNoText }}>
// // // //                             {index + 1}
// // // //                           </td>
// // // //                           <td style={{ ...styles.mainTd, ...styles.dateText }}>
// // // //                             {new Date(r.date).toLocaleString()}
// // // //                           </td>
// // // //                           <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// // // //                             ₹{r.previousBalance}
// // // //                           </td>
// // // //                           <td style={{ ...styles.mainTd, textAlign: "right" }}>
// // // //                             <span style={styles.rechargeBadge}>+ ₹{r.amount}</span>
// // // //                           </td>
// // // //                           <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// // // //                             ₹{r.newBalance}
// // // //                           </td>
// // // //                         </tr>
// // // //                       ))}
// // // //                     </tbody>
// // // //                   </table>
// // // //                 </div>
// // // //               )}
// // // //             </div>
// // // //           ) : (
// // // //             <p style={styles.emptyState}>
// // // //               Select an account file from the student roster directory to view specific balance logs.
// // // //             </p>
// // // //           )}
// // // //         </div>
// // // //       </div>
// // // //     </div>
// // // //   );
// // // // };

// // // // export default RechargeHistory;





// // // import React, { useEffect, useState } from "react";
// // // import api from "../utils/api";

// // // const RechargeHistory = () => {
// // //   const [students, setStudents] = useState([]);
// // //   const [selectedStudent, setSelectedStudent] = useState(null);
// // //   const [searchQuery, setSearchQuery] = useState("");

// // //   useEffect(() => {
// // //     api.get("/students").then((res) => {
// // //       setStudents(res.data);
// // //       // Auto-select first student if available to populate layout beautifully
// // //       if (res.data && res.data.length > 0) {
// // //         setSelectedStudent(res.data[0]);
// // //       }
// // //     });
// // //   }, []);

// // //   // Filter students by Name OR Hostel Number
// // //   const filteredStudents = students.filter((st) => {
// // //     const query = searchQuery.toLowerCase().trim();
// // //     if (!query) return true;
// // //     return (
// // //       st.name?.toLowerCase().includes(query) ||
// // //       st.hostelNumber?.toString().toLowerCase().includes(query)
// // //     );
// // //   });

// // //   // Perfectly matched UI design paradigm styles
// // //   const styles = {
// // //     page: {
// // //       minHeight: "100vh",
// // //       backgroundColor: "#f8fafc",
// // //       padding: "32px",
// // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // //       boxSizing: "border-box",
// // //     },
// // //     header: {
// // //       marginBottom: "24px",
// // //     },
// // //     title: {
// // //       fontSize: "28px",
// // //       fontWeight: "700",
// // //       color: "#0f172a",
// // //       letterSpacing: "-0.5px",
// // //       margin: 0,
// // //     },
// // //     subtitle: {
// // //       fontSize: "14px",
// // //       color: "#64748b",
// // //       marginTop: "4px",
// // //       marginBottom: 0,
// // //     },
// // //     layoutGrid: {
// // //       display: "grid",
// // //       gridTemplateColumns: "340px 1fr", // Slightly widened left column for hostel context badges
// // //       gap: "24px",
// // //       alignItems: "start",
// // //     },
// // //     section: {
// // //       background: "#ffffff",
// // //       border: "1px solid #e2e8f0",
// // //       borderRadius: "14px",
// // //       padding: "20px",
// // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // //     },
// // //     searchBarContainer: {
// // //       marginBottom: "16px",
// // //     },
// // //     input: {
// // //       width: "100%",
// // //       padding: "12px 14px",
// // //       border: "1px solid #cbd5e1",
// // //       borderRadius: "10px",
// // //       fontSize: "14px",
// // //       color: "#0f172a",
// // //       backgroundColor: "#ffffff",
// // //       outline: "none",
// // //       transition: "border-color 0.2s",
// // //       boxSizing: "border-box",
// // //     },
// // //     studentList: {
// // //       display: "flex",
// // //       flexDirection: "column",
// // //       gap: "8px",
// // //       maxHeight: "65vh",
// // //       overflowY: "auto",
// // //       paddingRight: "4px",
// // //     },
// // //     studentBtn: (isActive) => ({
// // //       width: "100%",
// // //       padding: "12px 16px",
// // //       background: isActive ? "#eff6ff" : "#ffffff",
// // //       border: isActive ? "1px solid #3b82f6" : "1px solid #e2e8f0",
// // //       borderRadius: "10px",
// // //       textAlign: "left",
// // //       cursor: "pointer",
// // //       display: "flex",
// // //       justifyContent: "space-between",
// // //       alignItems: "center",
// // //       transition: "all 0.2s",
// // //     }),
// // //     identityWrapper: {
// // //       display: "flex",
// // //       flexDirection: "column",
// // //       gap: "2px",
// // //     },
// // //     studentName: (isActive) => ({
// // //       fontWeight: "600",
// // //       fontSize: "14px",
// // //       color: isActive ? "#1d4ed8" : "#0f172a",
// // //     }),
// // //     hostelTag: {
// // //       fontSize: "12px",
// // //       color: "#64748b",
// // //       fontWeight: "500",
// // //     },
// // //     studentWallet: {
// // //       fontWeight: "700",
// // //       fontSize: "14px",
// // //       color: "#059669", // Replaced color with deep green to reflect wallet cash asset design
// // //       marginLeft: "auto",
// // //     },
// // //     tableHeaderContainer: {
// // //       marginBottom: "16px",
// // //     },
// // //     tableTitle: {
// // //       fontSize: "18px",
// // //       fontWeight: "700",
// // //       color: "#0f172a",
// // //       margin: 0,
// // //     },
// // //     tableTitleHostel: {
// // //       fontSize: "14px",
// // //       fontWeight: "500",
// // //       color: "#64748b",
// // //       marginLeft: "8px",
// // //     },
// // //     mainTableContainer: {
// // //       width: "100%",
// // //       overflowX: "auto",
// // //       borderRadius: "10px",
// // //       border: "1px solid #e2e8f0",
// // //     },
// // //     mainTable: {
// // //       width: "100%",
// // //       borderCollapse: "collapse",
// // //       textAlign: "left",
// // //       fontSize: "14px",
// // //     },
// // //     mainTh: {
// // //       backgroundColor: "#f1f5f9",
// // //       color: "#334155",
// // //       fontWeight: "600",
// // //       padding: "14px",
// // //       borderBottom: "2px solid #e2e8f0",
// // //       fontSize: "13px",
// // //     },
// // //     mainTd: {
// // //       padding: "14px",
// // //       color: "#0f172a",
// // //       borderBottom: "1px solid #e2e8f0",
// // //       verticalAlign: "middle",
// // //     },
// // //     sNoText: {
// // //       color: "#64748b",
// // //       fontWeight: "500",
// // //     },
// // //     dateText: {
// // //       color: "#334155",
// // //       fontWeight: "500",
// // //     },
// // //     amountText: {
// // //       fontWeight: "600",
// // //       color: "#0f172a",
// // //     },
// // //     rechargeBadge: {
// // //       backgroundColor: "#f0fdf4",
// // //       color: "#16a34a",
// // //       padding: "4px 10px",
// // //       borderRadius: "8px",
// // //       fontSize: "12px",
// // //       fontWeight: "700",
// // //       display: "inline-block",
// // //       border: "1px solid #bbf7d0",
// // //     },
// // //     emptyState: {
// // //       color: "#64748b",
// // //       fontSize: "14px",
// // //       textAlign: "center",
// // //       padding: "40px 0",
// // //       margin: 0,
// // //     },
// // //   };

// // //   return (
// // //     <div style={styles.page}>
// // //       {/* Header */}
// // //       <div style={styles.header}>
// // //         <h1 style={styles.title}>Wallet Recharge History</h1>
// // //         <p style={styles.subtitle}>
// // //           Track institutional account credits, ledger transaction logs, and real-time student updates
// // //         </p>
// // //       </div>

// // //       <div style={styles.layoutGrid}>
// // //         {/* Left Panel: Student Selector */}
// // //         <div style={styles.section}>
// // //           <div style={styles.searchBarContainer}>
// // //             <input
// // //               type="text"
// // //               style={styles.input}
// // //               placeholder="Search by name or hostel no..."
// // //               value={searchQuery}
// // //               onChange={(e) => setSearchQuery(e.target.value)}
// // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // //             />
// // //           </div>

// // //           <div style={styles.studentList}>
// // //             {filteredStudents.length === 0 ? (
// // //               <p style={styles.emptyState}>No records found.</p>
// // //             ) : (
// // //               filteredStudents.map((st) => {
// // //                 const isActive = selectedStudent?._id === st._id;
// // //                 return (
// // //                   <button
// // //                     key={st._id}
// // //                     onClick={() => setSelectedStudent(st)}
// // //                     style={styles.studentBtn(isActive)}
// // //                     onMouseOver={(e) => {
// // //                       if (!isActive) e.currentTarget.style.backgroundColor = "#f8fafc";
// // //                     }}
// // //                     onMouseOut={(e) => {
// // //                       if (!isActive) e.currentTarget.style.backgroundColor = "#ffffff";
// // //                     }}
// // //                   >
// // //                     <div style={styles.identityWrapper}>
// // //                       <span style={styles.studentName(isActive)}>{st.name}</span>
// // //                       <span style={styles.hostelTag}>H—{st.hostelNumber || "N/A"}</span>
// // //                     </div>
// // //                     <span style={styles.studentWallet}>₹{st.pocketMoney}</span>
// // //                   </button>
// // //                 );
// // //               })
// // //             )}
// // //           </div>
// // //         </div>

// // //         {/* Right Panel: Selected Student Ledger History */}
// // //         <div style={styles.section}>
// // //           {selectedStudent ? (
// // //             <div>
// // //               <div style={styles.tableHeaderContainer}>
// // //                 <h2 style={styles.tableTitle}>
// // //                   {selectedStudent.name} 
// // //                   <span style={styles.tableTitleHostel}>
// // //                     (Hostel Room: H-{selectedStudent.hostelNumber || "N/A"})
// // //                   </span>
// // //                   {" "}— Transaction Ledger
// // //                 </h2>
// // //               </div>

// // //               {!selectedStudent.rechargeHistory || selectedStudent.rechargeHistory.length === 0 ? (
// // //                 <p style={styles.emptyState}>
// // //                   No active statement metrics discovered for this account context.
// // //                 </p>
// // //               ) : (
// // //                 <div style={styles.mainTableContainer}>
// // //                   <table style={styles.mainTable}>
// // //                     <thead>
// // //                       <tr>
// // //                         <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// // //                         <th style={styles.mainTh}>Timestamp</th>
// // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Previous Balance</th>
// // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Credit Allocation</th>
// // //                         <th style={{ ...styles.mainTh, textAlign: "right" }}>Closing Balance</th>
// // //                       </tr>
// // //                     </thead>
// // //                     <tbody>
// // //                       {selectedStudent.rechargeHistory.map((r, index) => (
// // //                         <tr
// // //                           key={index}
// // //                           style={{ transition: "background-color 0.2s" }}
// // //                           onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // //                           onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // //                         >
// // //                           <td style={{ ...styles.mainTd, ...styles.sNoText }}>
// // //                             {index + 1}
// // //                           </td>
// // //                           <td style={{ ...styles.mainTd, ...styles.dateText }}>
// // //                             {new Date(r.date).toLocaleString()}
// // //                           </td>
// // //                           <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// // //                             ₹{r.previousBalance}
// // //                           </td>
// // //                           <td style={{ ...styles.mainTd, textAlign: "right" }}>
// // //                             <span style={styles.rechargeBadge}>+ ₹{r.amount}</span>
// // //                           </td>
// // //                           <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// // //                             ₹{r.newBalance}
// // //                           </td>
// // //                         </tr>
// // //                       ))}
// // //                     </tbody>
// // //                   </table>
// // //                 </div>
// // //               )}
// // //             </div>
// // //           ) : (
// // //             <p style={styles.emptyState}>
// // //               Select an account file from the student roster directory to view specific balance logs.
// // //             </p>
// // //           )}
// // //         </div>
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default RechargeHistory;



// // import React, { useEffect, useState } from "react";
// // import api from "../utils/api";

// // const RechargeHistory = () => {
// //   const [students, setStudents] = useState([]);
// //   const [selectedStudentId, setSelectedStudentId] = useState(null);
// //   const [searchQuery, setSearchQuery] = useState("");

// //   useEffect(() => {
// //     api.get("/students").then((res) => {
// //       setStudents(res.data || []);
// //     });
// //   }, []);

// //   // Filter students by Name OR Hostel Number
// //   const filteredStudents = students.filter((st) => {
// //     const query = searchQuery.toLowerCase().trim();
// //     if (!query) return true;
// //     return (
// //       st.name?.toLowerCase().includes(query) ||
// //       st.hostelNumber?.toString().toLowerCase().includes(query)
// //     );
// //   });

// //   // Toggle dropdown section for selected student
// //   const handleToggleDropdown = (id) => {
// //     setSelectedStudentId(selectedStudentId === id ? null : id);
// //   };

// //   // Export transaction ledger to Excel (CSV format)
// //   const downloadExcel = (e, student) => {
// //     e.stopPropagation(); // Prevent dropdown from closing when clicking download
    
// //     if (!student || !student.rechargeHistory || student.rechargeHistory.length === 0) {
// //       alert("No transaction history available to export.");
// //       return;
// //     }

// //     // CSV Headers
// //     const headers = ["S.No.", "Timestamp", "Previous Balance (INR)", "Credit Allocation (INR)", "Closing Balance (INR)"];
    
// //     // Transform history objects into CSV rows
// //     const rows = student.rechargeHistory.map((r, index) => [
// //       index + 1,
// //       `"${new Date(r.date).toLocaleString()}"`, // Quoted to handle native timestamp formatting commas
// //       r.previousBalance,
// //       r.amount,
// //       r.newBalance
// //     ]);

// //     // Combine headers and rows
// //     const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
// //     // Create blob download trigger
// //     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
// //     const url = URL.createObjectURL(blob);
// //     const link = document.createElement("a");
// //     link.setAttribute("href", url);
// //     link.setAttribute("download", `${student.name.replace(/\s+/g, "_")}_recharge_history.csv`);
// //     document.body.appendChild(link);
// //     link.click();
// //     document.body.removeChild(link);
// //   };

// //   // Modern UI design system inline styles
// //   const styles = {
// //     page: {
// //       minHeight: "100vh",
// //       backgroundColor: "#f8fafc",
// //       padding: "32px",
// //       fontFamily: "system-ui, -apple-system, sans-serif",
// //       boxSizing: "border-box",
// //     },
// //     header: {
// //       marginBottom: "24px",
// //     },
// //     title: {
// //       fontSize: "28px",
// //       fontWeight: "700",
// //       color: "#0f172a",
// //       letterSpacing: "-0.5px",
// //       margin: 0,
// //     },
// //     subtitle: {
// //       fontSize: "14px",
// //       color: "#64748b",
// //       marginTop: "4px",
// //       marginBottom: 0,
// //     },
// //     section: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "14px",
// //       padding: "20px",
// //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// //       maxWidth: "900px",
// //       margin: "0 auto",
// //     },
// //     searchBarContainer: {
// //       marginBottom: "20px",
// //     },
// //     input: {
// //       width: "100%",
// //       padding: "14px 16px",
// //       border: "1px solid #cbd5e1",
// //       borderRadius: "10px",
// //       fontSize: "15px",
// //       color: "#0f172a",
// //       backgroundColor: "#ffffff",
// //       outline: "none",
// //       transition: "border-color 0.2s, box-shadow 0.2s",
// //       boxSizing: "border-box",
// //     },
// //     studentList: {
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "12px",
// //     },
// //     accordionItem: (isOpen) => ({
// //       border: isOpen ? "1px solid #3b82f6" : "1px solid #e2e8f0",
// //       borderRadius: "12px",
// //       backgroundColor: "#ffffff",
// //       overflow: "hidden",
// //       transition: "all 0.2s ease",
// //       boxShadow: isOpen ? "0 4px 6px -1px rgba(0, 0, 0, 0.05)" : "none",
// //     }),
// //     studentHeaderBtn: (isOpen) => ({
// //       width: "100%",
// //       padding: "16px 20px",
// //       background: isOpen ? "#f8fafc" : "#ffffff",
// //       border: "none",
// //       textAlign: "left",
// //       cursor: "pointer",
// //       display: "flex",
// //       justifyContent: "space-between",
// //       alignItems: "center",
// //       transition: "background-color 0.2s",
// //     }),
// //     identityWrapper: {
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "4px",
// //     },
// //     studentName: {
// //       fontWeight: "600",
// //       fontSize: "15px",
// //       color: "#0f172a",
// //     },
// //     hostelTag: {
// //       fontSize: "12px",
// //       color: "#64748b",
// //       fontWeight: "500",
// //     },
// //     rightControls: {
// //       display: "flex",
// //       alignItems: "center",
// //       gap: "16px",
// //     },
// //     studentWallet: {
// //       fontWeight: "700",
// //       fontSize: "15px",
// //       color: "#059669",
// //     },
// //     chevron: (isOpen) => ({
// //       fontSize: "14px",
// //       color: "#64748b",
// //       transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
// //       transition: "transform 0.2s ease",
// //       display: "inline-block",
// //     }),
// //     // Dropdown Content Layout
// //     dropdownBody: {
// //       padding: "20px 20px 24px 20px",
// //       borderTop: "1px solid #e2e8f0",
// //       backgroundColor: "#ffffff",
// //     },
// //     dropdownHeaderAction: {
// //       display: "flex",
// //       justifyContent: "space-between",
// //       alignItems: "center",
// //       marginBottom: "14px",
// //     },
// //     dropdownTitle: {
// //       fontSize: "14px",
// //       fontWeight: "600",
// //       color: "#475569",
// //       margin: 0,
// //     },
// //     btnExcel: {
// //       backgroundColor: "#10b981",
// //       color: "#ffffff",
// //       border: "none",
// //       padding: "8px 14px",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       display: "flex",
// //       alignItems: "center",
// //       gap: "6px",
// //       transition: "background-color 0.2s",
// //     },
// //     mainTableContainer: {
// //       width: "100%",
// //       overflowX: "auto",
// //       borderRadius: "10px",
// //       border: "1px solid #e2e8f0",
// //     },
// //     mainTable: {
// //       width: "100%",
// //       borderCollapse: "collapse",
// //       textAlign: "left",
// //       fontSize: "14px",
// //     },
// //     mainTh: {
// //       backgroundColor: "#f1f5f9",
// //       color: "#334155",
// //       fontWeight: "600",
// //       padding: "12px 14px",
// //       borderBottom: "2px solid #e2e8f0",
// //       fontSize: "13px",
// //     },
// //     mainTd: {
// //       padding: "12px 14px",
// //       color: "#0f172a",
// //       borderBottom: "1px solid #e2e8f0",
// //       verticalAlign: "middle",
// //     },
// //     sNoText: {
// //       color: "#64748b",
// //       fontWeight: "500",
// //     },
// //     dateText: {
// //       color: "#334155",
// //       fontWeight: "500",
// //     },
// //     amountText: {
// //       fontWeight: "600",
// //       color: "#0f172a",
// //     },
// //     rechargeBadge: {
// //       backgroundColor: "#f0fdf4",
// //       color: "#16a34a",
// //       padding: "4px 10px",
// //       borderRadius: "8px",
// //       fontSize: "12px",
// //       fontWeight: "700",
// //       display: "inline-block",
// //       border: "1px solid #bbf7d0",
// //     },
// //     emptyState: {
// //       color: "#64748b",
// //       fontSize: "14px",
// //       textAlign: "center",
// //       padding: "20px 0",
// //       margin: 0,
// //     },
// //   };

// //   return (
// //     <div style={styles.page}>
// //       {/* Header */}
// //       <div style={styles.header}>
// //         <h1 style={styles.title}>Wallet Recharge Registry</h1>
// //         <p style={styles.subtitle}>
// //           Manage student roster data logs and extract ledger breakdowns instantly below.
// //         </p>
// //       </div>

// //       {/* Main Roster List */}
// //       <div style={styles.section}>
// //         <div style={styles.searchBarContainer}>
// //           <input
// //             type="text"
// //             style={styles.input}
// //             placeholder="Search roster by student name or hostel code..."
// //             value={searchQuery}
// //             onChange={(e) => setSearchQuery(e.target.value)}
// //             onFocus={(e) => {
// //               e.currentTarget.style.borderColor = "#2563eb";
// //               e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// //             }}
// //             onBlur={(e) => {
// //               e.currentTarget.style.borderColor = "#cbd5e1";
// //               e.currentTarget.style.boxShadow = "none";
// //             }}
// //           />
// //         </div>

// //         <div style={styles.studentList}>
// //           {filteredStudents.length === 0 ? (
// //             <p style={styles.emptyState}>No data matching evaluation contexts.</p>
// //           ) : (
// //             filteredStudents.map((st) => {
// //               const isOpen = selectedStudentId === st._id;
// //               return (
// //                 <div key={st._id} style={styles.accordionItem(isOpen)}>
// //                   {/* Dropdown Header Trigger */}
// //                   <button
// //                     onClick={() => handleToggleDropdown(st._id)}
// //                     style={styles.studentHeaderBtn(isOpen)}
// //                     onMouseOver={(e) => {
// //                       if (!isOpen) e.currentTarget.style.backgroundColor = "#f8fafc";
// //                     }}
// //                     onMouseOut={(e) => {
// //                       if (!isOpen) e.currentTarget.style.backgroundColor = "#ffffff";
// //                     }}
// //                   >
// //                     <div style={styles.identityWrapper}>
// //                       <span style={styles.studentName}>{st.name}</span>
// //                       <span style={styles.hostelTag}>Hostel ID: H—{st.hostelNumber || "N/A"}</span>
// //                     </div>
                    
// //                     <div style={styles.rightControls}>
// //                       <span style={styles.studentWallet}>₹{st.pocketMoney}</span>
// //                       <span style={styles.chevron(isOpen)}>▼</span>
// //                     </div>
// //                   </button>

// //                   {/* Dropdown Expandable History Content */}
// //                   {isOpen && (
// //                     <div style={styles.dropdownBody}>
// //                       <div style={styles.dropdownHeaderAction}>
// //                         <h4 style={styles.dropdownTitle}>Account History Statements</h4>
// //                         {st.rechargeHistory && st.rechargeHistory.length > 0 && (
// //                           <button
// //                             onClick={(e) => downloadExcel(e, st)}
// //                             style={styles.btnExcel}
// //                             onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#059669"}
// //                             onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#10b981"}
// //                           >
// //                             💾 Export Spreadsheet (.csv)
// //                           </button>
// //                         )}
// //                       </div>

// //                       {!st.rechargeHistory || st.rechargeHistory.length === 0 ? (
// //                         <p style={styles.emptyState}>
// //                           No transactional entries logged for this student context.
// //                         </p>
// //                       ) : (
// //                         <div style={styles.mainTableContainer}>
// //                           <table style={styles.mainTable}>
// //                             <thead>
// //                               <tr>
// //                                 <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// //                                 <th style={styles.mainTh}>Timestamp</th>
// //                                 <th style={{ ...styles.mainTh, textAlign: "right" }}>Previous Balance</th>
// //                                 <th style={{ ...styles.mainTh, textAlign: "right" }}>Credit Allocation</th>
// //                                 <th style={{ ...styles.mainTh, textAlign: "right" }}>Closing Balance</th>
// //                               </tr>
// //                             </thead>
// //                             <tbody>
// //                               {st.rechargeHistory.map((r, index) => (
// //                                 <tr
// //                                   key={index}
// //                                   style={{ transition: "background-color 0.15s" }}
// //                                   onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// //                                   onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// //                                 >
// //                                   <td style={{ ...styles.mainTd, ...styles.sNoText }}>{index + 1}</td>
// //                                   <td style={{ ...styles.mainTd, ...styles.dateText }}>
// //                                     {new Date(r.date).toLocaleString()}
// //                                   </td>
// //                                   <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// //                                     ₹{r.previousBalance}
// //                                   </td>
// //                                   <td style={{ ...styles.mainTd, textAlign: "right" }}>
// //                                     <span style={styles.rechargeBadge}>+ ₹{r.amount}</span>
// //                                   </td>
// //                                   <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
// //                                     ₹{r.newBalance}
// //                                   </td>
// //                                 </tr>
// //                               ))}
// //                             </tbody>
// //                           </table>
// //                         </div>
// //                       )}
// //                     </div>
// //                   )}
// //                 </div>
// //               );
// //             })
// //           )}
// //         </div>
// //       </div>
// //     </div>
// //   );
// // };

// // export default RechargeHistory;










// import React, { useEffect, useState } from "react";
// import api from "../utils/api";

// const RechargeHistory = () => {
//   const [students, setStudents] = useState([]);
//   const [selectedStudentId, setSelectedStudentId] = useState(null);
//   const [searchQuery, setSearchQuery] = useState("");

//   useEffect(() => {
//     api.get("/students").then((res) => {
//       setStudents(res.data || []);
//     });
//   }, []);

//   // Filter students by Name OR Hostel Number
//   const filteredStudents = students.filter((st) => {
//     const query = searchQuery.toLowerCase().trim();
//     if (!query) return true;
//     return (
//       st.name?.toLowerCase().includes(query) ||
//       st.hostelNumber?.toString().toLowerCase().includes(query)
//     );
//   });

//   // Toggle dropdown section for selected student
//   const handleToggleDropdown = (id) => {
//     setSelectedStudentId(selectedStudentId === id ? null : id);
//   };

//   // Export ALL filtered student metrics to Excel (CSV format)
//   const downloadAllStudentsExcel = () => {
//     if (filteredStudents.length === 0) {
//       alert("No student data available to export.");
//       return;
//     }

//     // CSV Headers - Updated to include Name, Hostel, Grade, and Father's Name
//     const headers = [
//       "S.No.", 
//       "Student Name", 
//       "Hostel Number", 
//       "Grade", 
//       "Father's Name", 
//       "Current Wallet Balance (INR)", 
//       "Total Transactions Logged"
//     ];

//     // Transform all student objects into CSV rows
//     const rows = filteredStudents.map((st, index) => [
//       index + 1,
//       `"${st.name ? st.name.replace(/"/g, '""') : "N/A"}"`,         // Escape quotes safely
//       `"${st.hostelNumber ? st.hostelNumber.toString().replace(/"/g, '""') : "N/A"}"`,
//       `"${st.grade ? st.grade.replace(/"/g, '""') : "N/A"}"`,       // Injected Grade data attribute
//       `"${st.fatherName ? st.fatherName.replace(/"/g, '""') : "N/A"}"`, // Injected Father's Name data attribute
//       st.pocketMoney ?? 0,
//       st.rechargeHistory ? st.rechargeHistory.length : 0
//     ]);

//     // Combine headers and rows
//     const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

//     // Trigger download
//     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.setAttribute("href", url);
//     link.setAttribute("download", `All_Students_Wallet_Report.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   // Export individual transaction ledger to Excel (CSV format)
//   const downloadExcel = (e, student) => {
//     e.stopPropagation(); // Prevent dropdown from closing when clicking download
    
//     if (!student || !student.rechargeHistory || student.rechargeHistory.length === 0) {
//       alert("No transaction history available to export.");
//       return;
//     }

//     // CSV Headers
//     const headers = ["S.No.", "Timestamp", "Previous Balance (INR)", "Credit Allocation (INR)", "Closing Balance (INR)"];
    
//     // Transform history objects into CSV rows
//     const rows = student.rechargeHistory.map((r, index) => [
//       index + 1,
//       `"${new Date(r.date).toLocaleString()}"`, // Quoted to handle native timestamp formatting commas
//       r.previousBalance,
//       r.amount,
//       r.newBalance
//     ]);

//     // Combine headers and rows
//     const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
    
//     // Create blob download trigger
//     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
//     const url = URL.createObjectURL(blob);
//     const link = document.createElement("a");
//     link.setAttribute("href", url);
//     link.setAttribute("download", `${student.name.replace(/\s+/g, "_")}_recharge_history.csv`);
//     document.body.appendChild(link);
//     link.click();
//     document.body.removeChild(link);
//   };

//   // Perfectly matched UI design paradigm styles from Products.js
//   const styles = {
//     page: {
//       minHeight: "100vh",
//       backgroundColor: "#f8fafc",
//       padding: "32px",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       boxSizing: "border-box"
//     },
//     header: {
//       marginBottom: "24px",
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       flexWrap: "wrap",
//       gap: "16px"
//     },
//     titleWrapper: {
//       display: "flex",
//       flexDirection: "column"
//     },
//     title: {
//       fontSize: "28px",
//       fontWeight: "700",
//       color: "#0f172a",
//       letterSpacing: "-0.5px",
//       margin: 0
//     },
//     subtitle: {
//       fontSize: "14px",
//       color: "#64748b",
//       marginTop: "4px",
//       marginBottom: 0
//     },
//     btnGlobalExcel: {
//       backgroundColor: "#2563eb",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "10px",
//       padding: "10px 18px",
//       fontSize: "14px",
//       fontWeight: "600",
//       cursor: "pointer",
//       display: "flex",
//       alignItems: "center",
//       gap: "8px",
//       boxShadow: "0 2px 4px rgba(37,  99,  235,  0.15)",
//       transition: "background-color 0.2s, transform 0.1s"
//     },
//     section: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "14px",
//       padding: "20px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
//     },
//     searchBarContainer: {
//       marginBottom: "16px",
//     },
//     input: {
//       width: "100%",
//       padding: "12px 14px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "10px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "border-color 0.2s",
//       boxSizing: "border-box",
//     },
//     studentList: {
//       display: "flex",
//       flexDirection: "column",
//       gap: "12px",
//     },
//     accordionItem: (isOpen) => ({
//       border: isOpen ? "1px solid #2563eb" : "1px solid #e2e8f0",
//       borderRadius: "12px",
//       backgroundColor: "#ffffff",
//       overflow: "hidden",
//       transition: "all 0.2s ease",
//       boxShadow: isOpen ? "0 4px 6px -1px rgba(0, 0, 0, 0.02)" : "none",
//     }),
//     studentHeaderBtn: (isOpen) => ({
//       width: "100%",
//       padding: "16px 20px",
//       background: isOpen ? "#f1f5f9" : "transparent",
//       border: "none",
//       textAlign: "left",
//       cursor: "pointer",
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       transition: "background-color 0.2s",
//     }),
//     identityWrapper: {
//       display: "flex",
//       flexDirection: "column",
//       gap: "4px",
//     },
//     studentName: {
//       fontWeight: "600",
//       fontSize: "15px",
//       color: "#0f172a",
//     },
//     hostelTag: {
//       fontSize: "12px",
//       color: "#64748b",
//       fontWeight: "500",
//     },
//     rightControls: {
//       display: "flex",
//       alignItems: "center",
//       gap: "16px",
//     },
//     studentWallet: {
//       fontWeight: "700",
//       fontSize: "15px",
//       color: "#0f172a",
//     },
//     chevron: (isOpen) => ({
//       fontSize: "12px",
//       color: "#64748b",
//       transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
//       transition: "transform 0.2s ease",
//       display: "inline-block",
//     }),
//     dropdownBody: {
//       padding: "20px",
//       borderTop: "1px solid #e2e8f0",
//       backgroundColor: "#ffffff",
//     },
//     dropdownHeaderAction: {
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       marginBottom: "16px",
//     },
//     dropdownTitle: {
//       fontSize: "14px",
//       fontWeight: "600",
//       color: "#475569",
//       margin: 0,
//     },
//     btnExcel: {
//       background: "none",
//       border: "none",
//       color: "#2563eb",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       padding: 0,
//       display: "flex",
//       alignItems: "center",
//       gap: "6px",
//     },
//     mainTableContainer: {
//       width: "100%",
//       overflowX: "auto",
//       borderRadius: "10px",
//       border: "1px solid #e2e8f0"
//     },
//     mainTable: {
//       width: "100%",
//       borderCollapse: "collapse",
//       textAlign: "left",
//       fontSize: "14px"
//     },
//     mainTh: {
//       backgroundColor: "#f1f5f9",
//       color: "#334155",
//       fontWeight: "600",
//       padding: "14px",
//       borderBottom: "2px solid #e2e8f0",
//       fontSize: "13px"
//     },
//     mainTd: {
//       padding: "14px",
//       color: "#0f172a",
//       borderBottom: "1px solid #e2e8f0",
//       verticalAlign: "middle"
//     },
//     sNoText: {
//       color: "#64748b",
//       fontWeight: "500"
//     },
//     dateText: {
//       color: "#334155",
//       fontWeight: "500",
//     },
//     amountText: {
//       fontWeight: "700",
//       color: "#0f172a"
//     },
//     rechargeBadgeSuccess: {
//       backgroundColor: "#fdf2f8",
//       color: "#2563eb",
//       padding: "4px 10px",
//       borderRadius: "8px",
//       fontSize: "11px",
//       fontWeight: "700",
//       display: "inline-block",
//       border: "1px solid #bfdbfe"
//     },
//     emptyState: {
//       color: "#64748b",
//       fontSize: "14px",
//       textAlign: "center",
//       padding: "40px 0",
//       margin: 0
//     }
//   };

//   return (
//     <div style={styles.page}>
//       {/* Header */}
//       <div style={styles.header}>
//         <div style={styles.titleWrapper}>
//           <h1 style={styles.title}>Wallet Recharge Registry</h1>
//           <p style={styles.subtitle}>Manage and audit administrative institutional balances</p>
//         </div>
//         {students.length > 0 && (
//           <button 
//             style={styles.btnGlobalExcel}
//             onClick={downloadAllStudentsExcel}
//             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
//             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
//           >
//             📊 Export All Students (.csv)
//           </button>
//         )}
//       </div>

//       {/* Main Content Component Container */}
//       <div style={styles.section}>
        
//         {/* Search Bar matching look and feel */}
//         <div style={styles.searchBarContainer}>
//           <input
//             type="text"
//             style={styles.input}
//             placeholder="Search roster by student name or hostel code..."
//             value={searchQuery}
//             onChange={(e) => setSearchQuery(e.target.value)}
//             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
//           />
//         </div>

//         <div style={styles.studentList}>
//           {filteredStudents.length === 0 ? (
//             <p style={styles.emptyState}>
//               {students.length === 0 
//                 ? "No active student metrics discovered in the system roster."
//                 : "No items matched your search filtering criteria."}
//             </p>
//           ) : (
//             filteredStudents.map((st) => {
//               const isOpen = selectedStudentId === st._id;
//               return (
//                 <div key={st._id} style={styles.accordionItem(isOpen)}>
//                   {/* Dropdown Header Trigger */}
//                   <button
//                     onClick={() => handleToggleDropdown(st._id)}
//                     style={styles.studentHeaderBtn(isOpen)}
//                     onMouseOver={(e) => {
//                       if (!isOpen) e.currentTarget.style.backgroundColor = "#f8fafc";
//                     }}
//                     onMouseOut={(e) => {
//                       if (!isOpen) e.currentTarget.style.backgroundColor = "transparent";
//                     }}
//                   >
//                     <div style={styles.identityWrapper}>
//                       <span style={styles.studentName}>{st.name}</span>
//                       <span style={styles.hostelTag}>Hostel ID: H—{st.hostelNumber || "N/A"}</span>
//                     </div>
                    
//                     <div style={styles.rightControls}>
//                       <span style={styles.studentWallet}>₹{st.pocketMoney}</span>
//                       <span style={styles.chevron(isOpen)}>▼</span>
//                     </div>
//                   </button>

//                   {/* Dropdown Expandable History Content */}
//                   {isOpen && (
//                     <div style={styles.dropdownBody}>
//                       <div style={styles.dropdownHeaderAction}>
//                         <h4 style={styles.dropdownTitle}>Account History Statements</h4>
//                         {st.rechargeHistory && st.rechargeHistory.length > 0 && (
//                           <button
//                             onClick={(e) => downloadExcel(e, st)}
//                             style={styles.btnExcel}
//                           >
//                             💾 Export Statement (.csv)
//                           </button>
//                         )}
//                       </div>

//                       {!st.rechargeHistory || st.rechargeHistory.length === 0 ? (
//                         <p style={styles.emptyState}>
//                           No transactional entries logged for this student context.
//                         </p>
//                       ) : (
//                         <div style={styles.mainTableContainer}>
//                           <table style={styles.mainTable}>
//                             <thead>
//                               <tr>
//                                 <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
//                                 <th style={styles.mainTh}>Timestamp</th>
//                                 <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Previous Balance</th>
//                                 <th style={{ ...styles.mainTh, textAlign: "center", width: "180px" }}>Credit Allocation</th>
//                                 <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Closing Balance</th>
//                               </tr>
//                             </thead>
//                             <tbody>
//                               {st.rechargeHistory.map((r, index) => (
//                                 <tr
//                                   key={index}
//                                   style={{ transition: "background-color 0.2s" }}
//                                   onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
//                                   onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
//                                 >
//                                   {/* Serial Number Row */}
//                                   <td style={{ ...styles.mainTd, ...styles.sNoText }}>
//                                     {index + 1}
//                                   </td>
                                  
//                                   {/* Date Profile Timestamp Column */}
//                                   <td style={{ ...styles.mainTd, ...styles.dateText }}>
//                                     {new Date(r.date).toLocaleString()}
//                                   </td>
                                  
//                                   {/* Previous Balance Column */}
//                                   <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
//                                     ₹{r.previousBalance}
//                                   </td>
                                  
//                                   {/* Allocation Tracking Badge Column */}
//                                   <td style={{ ...styles.mainTd, textAlign: "center" }}>
//                                     <span style={styles.rechargeBadgeSuccess}>
//                                       + ₹{r.amount}
//                                     </span>
//                                   </td>
                                  
//                                   {/* Closing Balance Column */}
//                                   <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
//                                     ₹{r.newBalance}
//                                   </td>
//                                 </tr>
//                               ))}
//                             </tbody>
//                           </table>
//                         </div>
//                       )}
//                     </div>
//                   )}
//                 </div>
//               );
//             })
//           )}
//         </div>
//       </div>
//     </div>
//   );
// };

// export default RechargeHistory;


import React, { useEffect, useState } from "react";
import api from "../utils/api";

const RechargeHistory = () => {
  const [students, setStudents] = useState([]);
  const [selectedStudentId, setSelectedStudentId] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    api.get("/students").then((res) => {
      setStudents(res.data || []);
    });
  }, []);

  // Filter students by Name OR Hostel Number
  const filteredStudents = students.filter((st) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      st.name?.toLowerCase().includes(query) ||
      st.hostelNumber?.toString().toLowerCase().includes(query)
    );
  });

  // Toggle dropdown section for selected student
  const handleToggleDropdown = (id) => {
    setSelectedStudentId(selectedStudentId === id ? null : id);
  };

  // Export ALL filtered student metrics to Excel (CSV format)
  const downloadAllStudentsExcel = () => {
    if (filteredStudents.length === 0) {
      alert("No student data available to export.");
      return;
    }

    // CSV Headers - Includes Name, Hostel, Grade, and Father's Name
    const headers = [
      "S.No.", 
      "Student Name", 
      "Hostel Number", 
      "Grade", 
      "Father's Name", 
      "Current Wallet Balance (INR)", 
      "Total Transactions Logged"
    ];

    // Transform all student objects into CSV rows
    const rows = filteredStudents.map((st, index) => [
      index + 1,
      `"${st.name ? st.name.replace(/"/g, '""') : "N/A"}"`,         // Escape quotes safely
      `"${st.hostelNumber ? st.hostelNumber.toString().replace(/"/g, '""') : "N/A"}"`,
      `"${st.grade ? st.grade.replace(/"/g, '""') : "N/A"}"`,       
      `"${st.fatherName ? st.fatherName.replace(/"/g, '""') : "N/A"}"`, 
      st.pocketMoney ?? 0,
      st.rechargeHistory ? st.rechargeHistory.length : 0
    ]);

    // Combine headers and rows
    const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    // Trigger download
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `All_Students_Wallet_Report.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export individual transaction ledger to Excel (CSV format) with Student Metadata Info
  const downloadExcel = (e, student) => {
    e.stopPropagation(); // Prevent dropdown from closing when clicking download
    
    if (!student || !student.rechargeHistory || student.rechargeHistory.length === 0) {
      alert("No transaction history available to export.");
      return;
    }

    // Clean data variables for CSV formatting safety
    const safeName = student.name ? student.name.replace(/"/g, '""') : "N/A";
    const safeHostel = student.hostelNumber ? student.hostelNumber.toString().replace(/"/g, '""') : "N/A";
    const safeGrade = student.grade ? student.grade.replace(/"/g, '""') : "N/A";
    const safeFatherName = student.fatherName ? student.fatherName.replace(/"/g, '""') : "N/A";

    // Build Descriptive Context Meta Headers at top of spreadsheet file
    const metaRows = [
      `"STUDENT TRANSACTION STATEMENT"`,
      `"Student Name:","${safeName}"`,
      `"Hostel Number:","${safeHostel}"`,
      `"Grade:","${safeGrade}"`,
      `"Father's Name:","${safeFatherName}"`,
      `""` // Empty string row for a clean line break separator layout inside Excel
    ];

    // Main Ledger Columns Headers
    const tableHeaders = ["S.No.", "Timestamp", "Previous Balance (INR)", "Credit Allocation (INR)", "Closing Balance (INR)"];
    
    // Transform history data objects into CSV lines rows array
    const transactionRows = student.rechargeHistory.map((r, index) => [
      index + 1,
      `"${new Date(r.date).toLocaleString()}"`, 
      r.previousBalance,
      r.amount,
      r.newBalance
    ]);

    // Combine metadata block layout, structural headers row layout and dataset rows together
    const csvContent = [
      ...metaRows,
      tableHeaders.join(","),
      ...transactionRows.map(row => row.join(","))
    ].join("\n");
    
    // Create blob container trigger setup
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${safeName.replace(/\s+/g, "_")}_recharge_history.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // UI elements styles layout configuration paradigm context dictionary object map properties definitions
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box"
    },
    header: {
      marginBottom: "24px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "16px"
    },
    titleWrapper: {
      display: "flex",
      flexDirection: "column"
    },
    title: {
      fontSize: "28px",
      fontWeight: "700",
      color: "#0f172a",
      letterSpacing: "-0.5px",
      margin: 0
    },
    subtitle: {
      fontSize: "14px",
      color: "#64748b",
      marginTop: "4px",
      marginBottom: 0
    },
    btnGlobalExcel: {
      backgroundColor: "#2563eb",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      padding: "10px 18px",
      fontSize: "14px",
      fontWeight: "600",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      boxShadow: "0 2px 4px rgba(37,  99,  235,  0.15)",
      transition: "background-color 0.2s, transform 0.1s"
    },
    section: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
    },
    searchBarContainer: {
      marginBottom: "16px",
    },
    input: {
      width: "100%",
      padding: "12px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },
    studentList: {
      display: "flex",
      flexDirection: "column",
      gap: "12px",
    },
    accordionItem: (isOpen) => ({
      border: isOpen ? "1px solid #2563eb" : "1px solid #e2e8f0",
      borderRadius: "12px",
      backgroundColor: "#ffffff",
      overflow: "hidden",
      transition: "all 0.2s ease",
      boxShadow: isOpen ? "0 4px 6px -1px rgba(0, 0, 0, 0.02)" : "none",
    }),
    studentHeaderBtn: (isOpen) => ({
      width: "100%",
      padding: "16px 20px",
      background: isOpen ? "#f1f5f9" : "transparent",
      border: "none",
      textAlign: "left",
      cursor: "pointer",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      transition: "background-color 0.2s",
    }),
    identityWrapper: {
      display: "flex",
      flexDirection: "column",
      gap: "4px",
    },
    studentName: {
      fontWeight: "600",
      fontSize: "15px",
      color: "#0f172a",
    },
    hostelTag: {
      fontSize: "12px",
      color: "#64748b",
      fontWeight: "500",
    },
    rightControls: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
    },
    studentWallet: {
      fontWeight: "700",
      fontSize: "15px",
      color: "#0f172a",
    },
    chevron: (isOpen) => ({
      fontSize: "12px",
      color: "#64748b",
      transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
      transition: "transform 0.2s ease",
      display: "inline-block",
    }),
    dropdownBody: {
      padding: "20px",
      borderTop: "1px solid #e2e8f0",
      backgroundColor: "#ffffff",
    },
    dropdownHeaderAction: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "16px",
    },
    dropdownTitle: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#475569",
      margin: 0,
    },
    btnExcel: {
      background: "none",
      border: "none",
      color: "#2563eb",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
      display: "flex",
      alignItems: "center",
      gap: "6px",
    },
    mainTableContainer: {
      width: "100%",
      overflowX: "auto",
      borderRadius: "10px",
      border: "1px solid #e2e8f0"
    },
    mainTable: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
      fontSize: "14px"
    },
    mainTh: {
      backgroundColor: "#f1f5f9",
      color: "#334155",
      fontWeight: "600",
      padding: "14px",
      borderBottom: "2px solid #e2e8f0",
      fontSize: "13px"
    },
    mainTd: {
      padding: "14px",
      color: "#0f172a",
      borderBottom: "1px solid #e2e8f0",
      verticalAlign: "middle"
    },
    sNoText: {
      color: "#64748b",
      fontWeight: "500"
    },
    dateText: {
      color: "#334155",
      fontWeight: "500",
    },
    amountText: {
      fontWeight: "700",
      color: "#0f172a"
    },
    rechargeBadgeSuccess: {
      backgroundColor: "#fdf2f8",
      color: "#2563eb",
      padding: "4px 10px",
      borderRadius: "8px",
      fontSize: "11px",
      fontWeight: "700",
      display: "inline-block",
      border: "1px solid #bfdbfe"
    },
    emptyState: {
      color: "#64748b",
      fontSize: "14px",
      textAlign: "center",
      padding: "40px 0",
      margin: 0
    }
  };

  return (
    <div style={styles.page}>
      {/* Header */}
      <div style={styles.header}>
        <div style={styles.titleWrapper}>
          <h1 style={styles.title}>Wallet Recharge Registry</h1>
          <p style={styles.subtitle}>Manage and audit administrative institutional balances</p>
        </div>
        {students.length > 0 && (
          <button 
            style={styles.btnGlobalExcel}
            onClick={downloadAllStudentsExcel}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
          >
            📊 Export All Students (.csv)
          </button>
        )}
      </div>

      {/* Main Content Component Container */}
      <div style={styles.section}>
        
        {/* Search Bar matching look and feel */}
        <div style={styles.searchBarContainer}>
          <input
            type="text"
            style={styles.input}
            placeholder="Search roster by student name or hostel code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
            onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
          />
        </div>

        <div style={styles.studentList}>
          {filteredStudents.length === 0 ? (
            <p style={styles.emptyState}>
              {students.length === 0 
                ? "No active student metrics discovered in the system roster."
                : "No items matched your search filtering criteria."}
            </p>
          ) : (
            filteredStudents.map((st) => {
              const isOpen = selectedStudentId === st._id;
              return (
                <div key={st._id} style={styles.accordionItem(isOpen)}>
                  {/* Dropdown Header Trigger */}
                  <button
                    onClick={() => handleToggleDropdown(st._id)}
                    style={styles.studentHeaderBtn(isOpen)}
                    onMouseOver={(e) => {
                      if (!isOpen) e.currentTarget.style.backgroundColor = "#f8fafc";
                    }}
                    onMouseOut={(e) => {
                      if (!isOpen) e.currentTarget.style.backgroundColor = "transparent";
                    }}
                  >
                    <div style={styles.identityWrapper}>
                      <span style={styles.studentName}>{st.name}</span>
                      <span style={styles.hostelTag}>Hostel ID: H—{st.hostelNumber || "N/A"}</span>
                    </div>
                    
                    <div style={styles.rightControls}>
                      <span style={styles.studentWallet}>₹{st.pocketMoney}</span>
                      <span style={styles.chevron(isOpen)}>▼</span>
                    </div>
                  </button>

                  {/* Dropdown Expandable History Content */}
                  {isOpen && (
                    <div style={styles.dropdownBody}>
                      <div style={styles.dropdownHeaderAction}>
                        <h4 style={styles.dropdownTitle}>Account History Statements</h4>
                        {st.rechargeHistory && st.rechargeHistory.length > 0 && (
                          <button
                            onClick={(e) => downloadExcel(e, st)}
                            style={styles.btnExcel}
                          >
                            💾 Export Statement (.csv)
                          </button>
                        )}
                      </div>

                      {!st.rechargeHistory || st.rechargeHistory.length === 0 ? (
                        <p style={styles.emptyState}>
                          No transactional entries logged for this student context.
                        </p>
                      ) : (
                        <div style={styles.mainTableContainer}>
                          <table style={styles.mainTable}>
                            <thead>
                              <tr>
                                <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
                                <th style={styles.mainTh}>Timestamp</th>
                                <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Previous Balance</th>
                                <th style={{ ...styles.mainTh, textAlign: "center", width: "180px" }}>Credit Allocation</th>
                                <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Closing Balance</th>
                              </tr>
                            </thead>
                            <tbody>
                              {st.rechargeHistory.map((r, index) => (
                                <tr
                                  key={index}
                                  style={{ transition: "background-color 0.2s" }}
                                  onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                                  onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                                >
                                  {/* Serial Number Row */}
                                  <td style={{ ...styles.mainTd, ...styles.sNoText }}>
                                    {index + 1}
                                  </td>
                                  
                                  {/* Date Profile Timestamp Column */}
                                  <td style={{ ...styles.mainTd, ...styles.dateText }}>
                                    {new Date(r.date).toLocaleString()}
                                  </td>
                                  
                                  {/* Previous Balance Column */}
                                  <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
                                    ₹{r.previousBalance}
                                  </td>
                                  
                                  {/* Allocation Tracking Badge Column */}
                                  <td style={{ ...styles.mainTd, textAlign: "center" }}>
                                    <span style={styles.rechargeBadgeSuccess}>
                                      + ₹{r.amount}
                                    </span>
                                  </td>
                                  
                                  {/* Closing Balance Column */}
                                  <td style={{ ...styles.mainTd, textAlign: "right", ...styles.amountText }}>
                                    ₹{r.newBalance}
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
            })
          )}
        </div>
      </div>
    </div>
  );
};

export default RechargeHistory;