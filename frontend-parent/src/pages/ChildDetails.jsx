// // import { useEffect, useState } from 'react';
// // import { useParams, Link } from 'react-router-dom';
// // import API from '../services/api';

// // export default function ChildDetails() {
// //   const { id } = useParams();
// //   const [data, setData] = useState(null);
// //   const [loading, setLoading] = useState(true);

// //   useEffect(() => {
// //     API.get(`/parents/child/${id}`)
// //       .then(res => setData(res.data))
// //       .catch(err => console.error("Error fetching purchase records:", err))
// //       .finally(() => setLoading(false));
// //   }, [id]);

// //   if (loading) return <div className="text-center p-10 font-medium text-gray-600">Loading ledger items...</div>;
// //   if (!data) return <div className="text-center p-10 text-red-500">Student not found.</div>;

// //   return (
// //     <div className="max-w-4xl mx-auto px-4 py-8">
// //       <Link to="/" className="text-blue-600 text-sm font-semibold hover:underline">← Back to Accounts</Link>
      
// //       <div className="bg-white border rounded-xl p-6 shadow-sm my-6 flex justify-between items-center">
// //         <div>
// //           <h1 className="text-2xl font-bold text-gray-900">{data.student.name}</h1>
// //           <p className="text-gray-500 text-sm">Hostel Ref: {data.student.hostelNumber} | Standard: {data.student.grade}</p>
// //         </div>
// //         <div className="text-right">
// //           <p className="text-sm text-gray-500 font-medium">Available Balance</p>
// //           <p className="text-3xl font-black text-gray-900">₹{data.student.pocketMoney}</p>
// //         </div>
// //       </div>

// //       <h3 className="text-lg font-bold text-gray-800 mb-4">Transaction & Purchase History</h3>
// //       {data.bills.length === 0 ? (
// //         <p className="text-gray-500 italic bg-gray-50 p-4 rounded text-center">No purchases recorded yet.</p>
// //       ) : (
// //         <div className="space-y-4">
// //           {data.bills.map(bill => (
// //             <div key={bill._id} className="bg-white border rounded-xl p-5 shadow-xs">
// //               <div className="flex justify-between border-b pb-2 mb-3 text-sm text-gray-500">
// //                 <span>Invoice ID: #{bill._id.slice(-6).toUpperCase()}</span>
// //                 <span>{new Date(bill.createdAt).toLocaleDateString()}</span>
// //               </div>
// //               <ul className="space-y-1.5 mb-3">
// //                 {bill.products.map((item, idx) => (
// //                   <li key={idx} className="flex justify-between text-sm text-gray-700">
// //                     <span>{item.productName} <span className="text-xs text-gray-400">x{item.quantity}</span></span>
// //                     <span>₹{item.price * item.quantity}</span>
// //                   </li>
// //                 ))}
// //               </ul>
// //               <div className="flex justify-between items-center pt-2 border-t font-bold text-gray-900">
// //                 <span>Total Deducted</span>
// //                 <span className="text-red-600">-₹{bill.totalAmount}</span>
// //               </div>
// //             </div>
// //           ))}
// //         </div>
// //       )}
// //     </div>
// //   );
// // }






// import React, { useEffect, useState } from 'react';
// import { useParams, Link } from 'react-router-dom';
// import API from '../services/api';

// export default function ChildDetails() {
//   const { id } = useParams();
//   const [data, setData] = useState(null);
//   const [loading, setLoading] = useState(true);

//   useEffect(() => {
//     // FIX: Standardized routing block base (Switched /parents/ to /parent/ to match your dashboard route group)
//     API.get(`/parent/child/${id}`)
//       .then(res => {
//         setData(res.data);
//       })
//       .catch(err => {
//         console.error("Error fetching purchase records:", err);
//       })
//       .finally(() => setLoading(false));
//   }, [id]);

//   // Dashboard Unified Styles Object
//   const styles = {
//     page: {
//       minHeight: "100vh",
//       backgroundColor: "#f8fafc",
//       padding: "32px",
//       fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
//       boxSizing: "border-box",
//     },
//     backLink: {
//       fontSize: "14px",
//       fontWeight: "600",
//       color: "#2563eb",
//       textDecoration: "none",
//       display: "inline-flex",
//       alignItems: "center",
//       marginBottom: "24px",
//     },
//     profileCard: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "14px",
//       padding: "24px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       marginBottom: "32px",
//       flexWrap: "wrap",
//       gap: "16px",
//     },
//     studentName: {
//       fontSize: "24px",
//       fontWeight: "800",
//       color: "#0f172a",
//       margin: 0,
//     },
//     studentMeta: {
//       fontSize: "14px",
//       color: "#64748b",
//       marginTop: "4px",
//       marginBottom: 0,
//     },
//     balanceContainer: {
//       textAlign: "right",
//     },
//     balanceLabel: {
//       fontSize: "12px",
//       fontWeight: "600",
//       color: "#64748b",
//       textTransform: "uppercase",
//       letterSpacing: "0.5px",
//       margin: 0,
//     },
//     balanceValue: {
//       fontSize: "32px",
//       fontWeight: "800",
//       color: "#0f172a",
//       margin: "2px 0 0 0",
//     },
//     sectionTitle: {
//       fontSize: "18px",
//       fontWeight: "700",
//       color: "#0f172a",
//       marginBottom: "16px",
//     },
//     invoiceCard: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "12px",
//       padding: "20px",
//       marginBottom: "16px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
//     },
//     invoiceHeader: {
//       display: "flex",
//       justifyContent: "space-between",
//       borderBottom: "1px dashed #e2e8f0",
//       paddingBottom: "12px",
//       marginBottom: "12px",
//       fontSize: "13px",
//       color: "#64748b",
//       fontWeight: "500",
//     },
//     invoiceId: {
//       color: "#0f172a",
//       fontWeight: "600",
//     },
//     itemList: {
//       listStyle: "none",
//       padding: 0,
//       margin: "0 0 16px 0",
//     },
//     itemRow: {
//       display: "flex",
//       justifyContent: "space-between",
//       fontSize: "14px",
//       color: "#334155",
//       padding: "4px 0",
//     },
//     itemQty: {
//       fontSize: "12px",
//       color: "#94a3b8",
//       marginLeft: "6px",
//       fontWeight: "600",
//     },
//     itemPrice: {
//       fontWeight: "500",
//       color: "#0f172a",
//     },
//     invoiceTotalRow: {
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       paddingTop: "12px",
//       borderTop: "1px solid #e2e8f0",
//       fontWeight: "700",
//       fontSize: "15px",
//       color: "#0f172a",
//     },
//     totalDeductedAmount: {
//       color: "#be123c",
//     },
//     emptyState: {
//       color: "#64748b",
//       fontSize: "14px",
//       textAlign: "center",
//       padding: "40px 0",
//       background: "#ffffff",
//       border: "1px dashed #cbd5e1",
//       borderRadius: "12px",
//       margin: 0,
//     },
//     statusMessageContainer: {
//       minHeight: "100vh",
//       backgroundColor: "#f8fafc",
//       display: "flex",
//       justifyContent: "center",
//       alignItems: "center",
//       padding: "32px",
//       boxSizing: "border-box",
//     },
//     loadingText: {
//       fontSize: "16px",
//       fontWeight: "500",
//       color: "#64748b",
//     },
//     errorText: {
//       fontSize: "16px",
//       fontWeight: "600",
//       color: "#be123c",
//       backgroundColor: "#fff1f2",
//       padding: "16px 24px",
//       borderRadius: "12px",
//       border: "1px solid #ffe4e6",
//     }
//   };

//   if (loading) {
//     return (
//       <div style={styles.statusMessageContainer}>
//         <div style={styles.loadingText}>Loading ledger statements...</div>
//       </div>
//     );
//   }

//   // Fallback Error Component rendering if API failed or missing fields parsed
//   if (!data || !data.student) {
//     return (
//       <div style={styles.statusMessageContainer}>
//         <div style={styles.errorText}>
//           ⚠️ Student records not found. Double check registration mappings or endpoint plurals.
//         </div>
//       </div>
//     );
//   }

//   return (
//     <div style={styles.page}>
//       {/* Navigation Return Hook */}
//       <Link to="/" style={styles.backLink}>
//         ← Back to Accounts
//       </Link>
      
//       {/* Dynamic Profile Summary Banner */}
//       <div style={styles.profileCard}>
//         <div>
//           <h1 style={styles.studentName}>{data.student.name}</h1>
//           <p style={styles.studentMeta}>
//             Hostel Room Ref: {data.student.hostelNumber || "N/A"} | Standard Grade: {data.student.grade || "N/A"}
//           </p>
//         </div>
//         <div style={styles.balanceContainer}>
//           <p style={styles.balanceLabel}>Available Smart-Wallet Balance</p>
//           <p style={styles.balanceValue}>₹{data.student.pocketMoney || 0}</p>
//         </div>
//       </div>
// <h3 style={styles.sectionTitle}>Recharge History</h3>

// {!data.recharges || data.recharges.length === 0 ? (
//   <p style={styles.emptyState}>
//     No recharge history available.
//   </p>
// ) : (
//   <div>
//     {data.recharges
//       .slice()
//       .reverse()
//       .map((r, index) => (
//         <div key={index} style={styles.invoiceCard}>
//           <div style={styles.invoiceHeader}>
//             <span>Wallet Recharge</span>
//             <span>
//               {new Date(r.date).toLocaleDateString(undefined, {
//                 year: 'numeric',
//                 month: 'short',
//                 day: 'numeric'
//               })}
//             </span>
//           </div>

//           <div style={styles.invoiceTotalRow}>
//             <span>Recharge Amount</span>
//             <span style={{ color: '#16a34a' }}>
//               +₹{r.amount}
//             </span>
//           </div>

//           <div style={styles.itemRow}>
//             <span>Previous Balance</span>
//             <span>₹{r.previousBalance}</span>
//           </div>

//           <div style={styles.itemRow}>
//             <span>New Balance</span>
//             <span>₹{r.newBalance}</span>
//           </div>
//         </div>
//       ))}
//   </div>
// )}
//       <h3 style={styles.sectionTitle}>Transaction & Purchase History</h3>
      
//       {!data.bills || data.bills.length === 0 ? (
//         <p style={styles.emptyState}>No transaction bills recorded yet for this child account.</p>
//       ) : (
//         <div>
//           {data.bills.map((bill) => (
//             <div key={bill._id} style={styles.invoiceCard}>
//               {/* Subheader Metadata Row */}
//               <div style={styles.invoiceHeader}>
//                 <span>
//                   Invoice: <span style={styles.invoiceId}>#{bill._id.slice(-6).toUpperCase()}</span>
//                 </span>
//                 <span>
//                   {new Date(bill.createdAt).toLocaleDateString(undefined, {
//                     year: 'numeric',
//                     month: 'short',
//                     day: 'numeric'
//                   })}
//                 </span>
//               </div>

//               {/* Dynamic Subtable Breakdown Block */}
//               <ul style={styles.itemList}>
//                 {/* FIX: Supports fallback logic for both structure varieties (.items or old boilerplate .products) */}
//                 {(bill.items || bill.products || []).map((item, idx) => (
//                   <li key={idx} style={styles.itemRow}>
//                     <span>
//                       {item.name || item.productName}{' '}
//                       <span style={styles.itemQty}>x{item.quantity}</span>
//                     </span>
//                     <span style={styles.itemPrice}>
//                       ₹{(item.price || 0) * (item.quantity || 0)}
//                     </span>
//                   </li>
//                 ))}
//               </ul>

//               {/* Deducted Absolute Summary Header */}
//               <div style={styles.invoiceTotalRow}>
//                 <span>Total Deducted</span>
//                 <span style={styles.totalDeductedAmount}>-₹{bill.totalAmount || 0}</span>
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }



// good


import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import API from '../services/api';
import SetPurchasePassword from "./SetPurchasePassword";

export default function ChildDetails() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  
  // Interactive View Toggle State: 'purchases' or 'recharges'
  const [activeTab, setActiveTab] = useState('purchases');

  useEffect(() => {
    // Standardized routing block base matching your parent application route group
    API.get(`/parent/child/${id}`)
      .then(res => {
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
      backgroundColor: "#f8fafc",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
    },
    backLink: {
      fontSize: "14px",
      fontWeight: "600",
      color: "#2563eb",
      textDecoration: "none",
      display: "inline-flex",
      alignItems: "center",
      marginBottom: "24px",
    },
    profileCard: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
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
      color: "#0f172a",
      margin: 0,
    },
    studentMeta: {
      fontSize: "14px",
      color: "#64748b",
      marginTop: "4px",
      marginBottom: 0,
    },
    balanceContainer: {
      textAlign: "right",
    },
    balanceLabel: {
      fontSize: "12px",
      fontWeight: "600",
      color: "#64748b",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      margin: 0,
    },
    balanceValue: {
      fontSize: "32px",
      fontWeight: "800",
      color: "#0f172a",
      margin: "2px 0 0 0",
    },
    toggleBar: {
      display: "flex",
      backgroundColor: "#e2e8f0",
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
      backgroundColor: isActive ? "#ffffff" : "transparent",
      color: isActive ? "#0f172a" : "#64748b",
      boxShadow: isActive ? "0 1px 3px rgba(0,0,0,0.08)" : "none",
      transition: "all 0.15s ease",
    }),
    sectionTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      marginBottom: "16px",
    },
    invoiceCard: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "12px",
      padding: "20px",
      marginBottom: "16px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    },
    invoiceHeader: {
      display: "flex",
      justifyContent: "space-between",
      borderBottom: "1px dashed #e2e8f0",
      paddingBottom: "12px",
      marginBottom: "12px",
      fontSize: "13px",
      color: "#64748b",
      fontWeight: "500",
    },
    invoiceId: {
      color: "#0f172a",
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
      color: "#334155",
      padding: "6px 0",
    },
    itemQty: {
      fontSize: "12px",
      color: "#94a3b8",
      marginLeft: "6px",
      fontWeight: "600",
    },
    itemPrice: {
      fontWeight: "500",
      color: "#0f172a",
    },
    invoiceTotalRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      paddingTop: "12px",
      borderTop: "1px solid #e2e8f0",
      fontWeight: "700",
      fontSize: "15px",
      color: "#0f172a",
      marginBottom: "8px",
    },
    totalDeductedAmount: {
      color: "#be123c",
    },
    totalCreditedAmount: {
      color: "#16a34a",
    },
    emptyState: {
      color: "#64748b",
      fontSize: "14px",
      textAlign: "center",
      padding: "40px 0",
      background: "#ffffff",
      border: "1px dashed #cbd5e1",
      borderRadius: "12px",
      margin: 0,
    },
    statusMessageContainer: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      padding: "32px",
      boxSizing: "border-box",
    },
    loadingText: {
      fontSize: "16px",
      fontWeight: "500",
      color: "#64748b",
    },
    errorText: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#be123c",
      backgroundColor: "#fff1f2",
      padding: "16px 24px",
      borderRadius: "12px",
      border: "1px solid #ffe4e6",
    }
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
      </div>

      {/* Conditionally Render Content Blocks Based on State */}
      {activeTab === 'purchases' ? (
        <div>
          <h3 style={styles.sectionTitle}>Transaction & Purchase History</h3>
          {!data.bills || data.bills.length === 0 ? (
            <p style={styles.emptyState}>No transaction bills recorded yet for this child account.</p>
          ) : (
            <div>
              {data.bills.map((bill) => (
                <div key={bill._id} style={styles.invoiceCard}>
                  <div style={styles.invoiceHeader}>
                    <span>
                      Invoice: <span style={styles.invoiceId}>#{bill._id.slice(-6).toUpperCase()}</span>
                    </span>
                    <span>
                      {new Date(bill.createdAt).toLocaleDateString(undefined, {
                        year: 'numeric',
                        month: 'short',
                        day: 'numeric'
                      })}
                    </span>
                  </div>

                  <ul style={styles.itemList}>
                    {(bill.items || bill.products || []).map((item, idx) => (
                      <li key={idx} style={styles.itemRow}>
                        <span>
                          {item.name || item.productName}{' '}
                          <span style={styles.itemQty}>x{item.quantity}</span>
                        </span>
                        <span style={styles.itemPrice}>
                          ₹{(item.price || 0) * (item.quantity || 0)}
                        </span>
                      </li>
                    ))}
                  </ul>

                  <div style={styles.invoiceTotalRow}>
                    <span>Total Deducted</span>
                    <span style={styles.totalDeductedAmount}>-₹{bill.totalAmount || 0}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div>
          <h3 style={styles.sectionTitle}>Recharge History</h3>
          {!data.recharges || data.recharges.length === 0 ? (
            <p style={styles.emptyState}>No recharge history available for this child account.</p>
          ) : (
            <div>
              {data.recharges
                .slice()
                .reverse()
                .map((r, index) => (
                  <div key={index} style={styles.invoiceCard}>
                    <div style={styles.invoiceHeader}>
                      <span style={{ fontWeight: "700", color: "#0f172a" }}>Wallet Deposit</span>
                      <span>
                        {new Date(r.date).toLocaleDateString(undefined, {
                          year: 'numeric',
                          month: 'short',
                          day: 'numeric'
                        })}
                      </span>
                    </div>

                    <div style={styles.invoiceTotalRow}>
                      <span>Recharge Amount</span>
                      <span style={styles.totalCreditedAmount}>+₹{r.amount}</span>
                    </div>

                    <div style={styles.itemRow}>
                      <span>Previous Wallet Balance</span>
                      <span>₹{r.previousBalance}</span>
                    </div>

                    <div style={styles.itemRow}>
                      <span>Closing Updated Balance</span>
                      <span style={{ fontWeight: "600" }}>₹{r.newBalance}</span>
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}