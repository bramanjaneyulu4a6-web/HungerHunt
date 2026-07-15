// import { useEffect, useState } from 'react';
// import API from '../services/api';
// import { Link } from 'react-router-dom';

// export default function Dashboard() {
//   const [children, setChildren] = useState([]);
//   const [loading, setLoading] = useState(true);

// useEffect(() => {
//   API.get('/parent/dashboard')
//     .then(res => setChildren(res.data.children))
//     .catch(err => console.error("Error loading linked students:", err))
//     .finally(() => setLoading(false));
// }, []);

//   if (loading) return <div className="text-center p-10 font-medium text-gray-600">Loading child details...</div>;

//   return (
//     <div className="max-w-6xl mx-auto px-4 py-8">
//       <h1 className="text-2xl font-bold text-gray-800 mb-6">Linked Children Accounts</h1>
//       {children.length === 0 ? (
//         <div className="bg-yellow-50 border border-yellow-200 text-yellow-700 p-4 rounded-lg">
//           No students found matching your registered details. Contact the school office administration.
//         </div>
//       ) : (
//         <div className="grid gap-6 md:grid-cols-2">
//           {children.map(child => (
//             <div key={child._id} className="bg-white border rounded-xl p-6 shadow-sm flex flex-col justify-between">
//               <div>
//                 <div className="flex justify-between items-start mb-4">
//                   <div>
//                     <h2 className="text-xl font-bold text-gray-900">{child.name}</h2>
//                     <p className="text-sm text-gray-500">Grade: {child.grade} | Room: {child.hostelNumber}</p>
//                   </div>
//                   <span className={`px-3 py-1 rounded-full font-bold text-sm ${child.pocketMoney > 500 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
//                     Bal: ₹{child.pocketMoney}
//                   </span>
//                 </div>
//                 {child.pocketMoney <= 0 && (
//                   <p className="text-xs text-red-600 font-medium mb-3">⚠️ Balance exhausted. Please top up at the school desk.</p>
//                 )}
//               </div>
//               <Link to={`/child/${child._id}`} className="mt-4 block text-center bg-blue-50 text-blue-600 font-semibold py-2.5 rounded-lg hover:bg-blue-100 transition text-sm">
//                 View Statements & Purchase History →
//               </Link>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }




import React, { useState, useEffect } from 'react';
import API from '../services/api';
import { Link } from 'react-router-dom';
import { listenForMessages } from "../utils/notification";



const Dashboard = () => {
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);

  // Fetch linked student accounts on component mount
  // useEffect(() => {
  //   API.get('/parent/dashboard')
  //     .then(res => setChildren(res.data.children || []))
  //     .catch(err => console.error("Error loading linked students:", err))
  //     .finally(() => setLoading(false));
  // }, []);

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

  listenForMessages((payload) => {
    console.log("📩 Notification received:", payload);

    if (payload.data?.type === "RECHARGE") {
      console.log("🔄 Refreshing dashboard...");
      fetchDashboard();
    }
  });

}, []);


  // Dashboard Unified Styles Object matching system look and feel
  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
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
      color: "#0f172a",
      letterSpacing: "-0.75px",
      margin: 0,
    },
    subtitle: {
      fontSize: "14px",
      color: "#64748b",
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
      background: "#ffffff",
      border: "1px solid #e2e8f0",
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
      color: "#0f172a",
      margin: 0,
    },
    childMeta: {
      fontSize: "13px",
      color: "#64748b",
      marginTop: "4px",
      marginBottom: 0,
    },
    balanceBadge: (amt) => ({
      fontSize: "13px",
      fontWeight: "700",
      backgroundColor: amt > 500 ? "#f0fdf4" : "#fff1f2",
      color: amt > 500 ? "#16a34a" : "#be123c",
      padding: "6px 12px",
      borderRadius: "20px",
      whiteSpace: "nowrap",
      border: amt > 500 ? "1px solid #bbf7d0" : "1px solid #ffe4e6",
    }),
    warningBanner: {
      display: "flex",
      alignItems: "center",
      gap: "6px",
      color: "#be123c",
      backgroundColor: "#fff1f2",
      padding: "10px 12px",
      borderRadius: "8px",
      fontSize: "12px",
      fontWeight: "500",
      marginTop: "12px",
      border: "1px solid #ffe4e6",
    },
    actionBtn: {
      display: "block",
      textAlign: "center",
      backgroundColor: "#0f172a",
      color: "#ffffff",
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
      color: "#64748b",
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
      background: "#2563EB",
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