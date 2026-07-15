// // // import React, { useEffect, useState } from "react";
// // // import api from "../utils/api";



// // // const Purchased = () => {
// // // const [activeTab, setActiveTab] = useState("new");
// // // const [newPurchases, setNewPurchases] = useState([]);
// // // const [completedPurchases, setCompletedPurchases] = useState([]);
// // // const [loading, setLoading] = useState(false);

// // // useEffect(() => {
// // // fetchNewPurchases();
// // // fetchCompletedPurchases();
// // // }, []);

// // // const fetchNewPurchases = async () => {
// // // try {
// // // const res = await api.get("/purchases/new");
// // // setNewPurchases(res.data);
// // // } catch (err) {
// // // console.error(err);
// // // }
// // // };

// // // const fetchCompletedPurchases = async () => {
// // // try {
// // // const res = await api.get("/purchases/completed");
// // // setCompletedPurchases(res.data);
// // // } catch (err) {
// // // console.error(err);
// // // }
// // // };

// // // const handlePriceChange = (
// // // purchaseId,
// // // productId,
// // // value
// // // ) => {
// // // setNewPurchases((prev) =>
// // // prev.map((purchase) => {
// // // if (purchase._id !== purchaseId) return purchase;

// // //     return {
// // //       ...purchase,
// // //       items: purchase.items.map((item) =>
// // //            item.productId?._id === productId
// // //           ? {
// // //               ...item,
// // //               purchasePrice: Number(value)
// // //             }
// // //           : item
// // //       )
// // //     };
// // //   })
// // // );


// // // };

// // // const completePurchase = async (purchase) => {
// // // try {
// // // setLoading(true);


// // //   await api.put(
// // //     `/purchases/complete/${purchase._id}`,
// // //     {
// // //       items: purchase.items.map((item) => ({
// // //         productId: item.productId?._id,
// // //         quantity: item.quantity,
// // //         purchasePrice: item.purchasePrice
// // //       }))
// // //     }
// // //   );

// // //   await fetchNewPurchases();
// // //   await fetchCompletedPurchases();

// // //   alert("Purchase completed successfully");
// // // } catch (err) {
// // //   console.error(err);
// // //   alert("Failed to complete purchase");
// // // } finally {
// // //   setLoading(false);
// // // }


// // // };

// // // return (
// // // <div
// // // style={{
// // // padding: "24px",
// // // minHeight: "100vh",
// // // background: "#f8fafc"
// // // }}
// // // >
// // // <h1
// // // style={{
// // // marginBottom: "20px"
// // // }}
// // // >
// // // Purchased </h1>


// // //   <div
// // //     style={{
// // //       display: "flex",
// // //       gap: "10px",
// // //       marginBottom: "20px"
// // //     }}
// // //   >
// // //     <button
// // //       onClick={() => setActiveTab("new")}
// // //       style={{
// // //         padding: "10px 20px",
// // //         border: "none",
// // //         borderRadius: "8px",
// // //         cursor: "pointer",
// // //         background:
// // //           activeTab === "new"
// // //             ? "#2563eb"
// // //             : "#e2e8f0",
// // //         color:
// // //           activeTab === "new"
// // //             ? "#fff"
// // //             : "#000"
// // //       }}
// // //     >
// // //       New
// // //     </button>

// // //     <button
// // //       onClick={() =>
// // //         setActiveTab("completed")
// // //       }
// // //       style={{
// // //         padding: "10px 20px",
// // //         border: "none",
// // //         borderRadius: "8px",
// // //         cursor: "pointer",
// // //         background:
// // //           activeTab === "completed"
// // //             ? "#16a34a"
// // //             : "#e2e8f0",
// // //         color:
// // //           activeTab === "completed"
// // //             ? "#fff"
// // //             : "#000"
// // //       }}
// // //     >
// // //       Completed
// // //     </button>
// // //   </div>

// // //   {activeTab === "new" && (
// // //     <>
// // //       {newPurchases.length === 0 ? (
// // //         <div>No pending purchases</div>
// // //       ) : (
// // //         newPurchases.map((purchase) => (
// // //           <div
// // //             key={purchase._id}
// // //             style={{
// // //               background: "#fff",
// // //               padding: "20px",
// // //               borderRadius: "12px",
// // //               marginBottom: "20px",
// // //               boxShadow:
// // //                 "0 1px 3px rgba(0,0,0,0.1)"
// // //             }}
// // //           >
// // //             <h3>
// // //               Purchase #
// // //               {purchase._id.slice(-6)}
// // //             </h3>

// // //             <table
// // //               style={{
// // //                 width: "100%",
// // //                 borderCollapse:
// // //                   "collapse",
// // //                 marginTop: "15px"
// // //               }}
// // //             >
// // //               <thead>
// // //                 <tr>
// // //                   <th>Product</th>
// // //                   <th>Qty</th>
// // //                   <th>Price</th>
// // //                 </tr>
// // //               </thead>

// // //               <tbody>
// // //                 {purchase.items.map((item, index) => (
// // //   <tr
// // //     key={item.productId?._id || index}
// // //   >
// // //     <td>
// // //       {item.productId?.name || "Deleted Product"}
// // //     </td>

// // //                       <td>
// // //                         {item.quantity}
// // //                       </td>

// // //                       <td>
// // //                         <input
// // //                           type="number"
// // //                           value={
// // //                             item.purchasePrice ||
// // //                             ""
// // //                           }
// // //                           onChange={(e) => {
// // //   if (!item.productId) return;

// // //   handlePriceChange(
// // //     purchase._id,
// // //     item.productId._id,
// // //     e.target.value
// // //   );
// // // }
// // //                           }
// // //                           style={{
// // //                             padding:
// // //                               "8px",
// // //                             width:
// // //                               "120px"
// // //                           }}
// // //                         />
// // //                       </td>
// // //                     </tr>
// // //                   )
// // //                 )}
// // //               </tbody>
// // //             </table>

// // //             <button
// // //               onClick={() =>
// // //                 completePurchase(
// // //                   purchase
// // //                 )
// // //               }
// // //               disabled={loading}
// // //               style={{
// // //                 marginTop: "15px",
// // //                 background:
// // //                   "#16a34a",
// // //                 color: "#fff",
// // //                 border: "none",
// // //                 padding:
// // //                   "10px 18px",
// // //                 borderRadius:
// // //                   "8px",
// // //                 cursor:
// // //                   "pointer"
// // //               }}
// // //             >
// // //               Complete Purchase
// // //             </button>
// // //           </div>
// // //         ))
// // //       )}
// // //     </>
// // //   )}

// // //   {activeTab === "completed" && (
// // //     <>
// // //       {completedPurchases.length ===
// // //       0 ? (
// // //         <div>
// // //           No completed purchases
// // //         </div>
// // //       ) : (
// // //         completedPurchases.map(
// // //           (purchase) => (
// // //             <div
// // //               key={purchase._id}
// // //               style={{
// // //                 background:
// // //                   "#fff",
// // //                 padding: "20px",
// // //                 borderRadius:
// // //                   "12px",
// // //                 marginBottom:
// // //                   "20px",
// // //                 boxShadow:
// // //                   "0 1px 3px rgba(0,0,0,0.1)"
// // //               }}
// // //             >
// // //               <h3>
// // //                 Purchase #
// // //                 {purchase._id.slice(
// // //                   -6
// // //                 )}
// // //               </h3>

// // //               <p>
// // //                 Completed:
// // //                 {" "}
// // //                 {new Date(
// // //                   purchase.completedAt
// // //                 ).toLocaleString()}
// // //               </p>

// // //               <table
// // //                 style={{
// // //                   width: "100%",
// // //                   borderCollapse:
// // //                     "collapse"
// // //                 }}
// // //               >
// // //                 <thead>
// // //                   <tr>
// // //                     <th>Product</th>
// // //                     <th>Qty</th>
// // //                     <th>Price</th>
// // //                   </tr>
// // //                 </thead>

// // //                 <tbody>
// // //                   {purchase.items.map(
// // //                     (item) => (
// // //                       <tr
// // //   key={
// // //     item.productId?._id ||
// // //     `${purchase._id}-${item.quantity}`
// // //   }
// // // >
  
// // //                         <td>
// // //   {item.productId?.name || "Deleted Product"}
// // // </td>

// // //                         <td>
// // //                           {
// // //                             item.quantity
// // //                           }
// // //                         </td>

// // //                         <td>
// // //                           ₹
// // //                           {
// // //                             item.purchasePrice
// // //                           }
// // //                         </td>
// // //                       </tr>
// // //                     )
// // //                   )}
// // //                 </tbody>
// // //               </table>
// // //             </div>
// // //           )
// // //         )
// // //       )}
// // //     </>
// // //   )}
// // // </div>


// // // );
// // // };

// // // export default Purchased;





// // import React, { useEffect, useState } from "react";
// // import api from "../utils/api";

// // const Purchased = () => {
// //   const [activeTab, setActiveTab] = useState("new");
// //   const [newPurchases, setNewPurchases] = useState([]);
// //   const [completedPurchases, setCompletedPurchases] = useState([]);
// //   const [loading, setLoading] = useState(false);

// //   useEffect(() => {
// //     fetchNewPurchases();
// //     fetchCompletedPurchases();
// //   }, []);

// //   const fetchNewPurchases = async () => {
// //     try {
// //       const res = await api.get("/purchases/new");
// //       setNewPurchases(res.data);
// //     } catch (err) {
// //       console.error(err);
// //     }
// //   };

// //   const fetchCompletedPurchases = async () => {
// //     try {
// //       const res = await api.get("/purchases/completed");
// //       setCompletedPurchases(res.data);
// //     } catch (err) {
// //       console.error(err);
// //     }
// //   };

// //   const handlePriceChange = (purchaseId, productId, value) => {
// //     setNewPurchases((prev) =>
// //       prev.map((purchase) => {
// //         if (purchase._id !== purchaseId) return purchase;

// //         return {
// //           ...purchase,
// //           items: purchase.items.map((item) =>
// //             item.productId?._id === productId
// //               ? {
// //                   ...item,
// //                   purchasePrice: Number(value),
// //                 }
// //               : item
// //           ),
// //         };
// //       })
// //     );
// //   };

// //   const completePurchase = async (purchase) => {
// //     try {
// //       setLoading(true);

// //       await api.put(`/purchases/complete/${purchase._id}`, {
// //         items: purchase.items.map((item) => ({
// //           productId: item.productId?._id,
// //           quantity: item.quantity,
// //           purchasePrice: item.purchasePrice,
// //         })),
// //       });

// //       await fetchNewPurchases();
// //       await fetchCompletedPurchases();

// //       alert("Purchase order finalized successfully!");
// //     } catch (err) {
// //       console.error(err);
// //       alert("Failed to complete purchase layout parameters");
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   const styles = {
// //     page: {
// //       minHeight: "100vh",
// //       backgroundColor: "#f1f5f9",
// //       padding: "40px 24px",
// //       fontFamily: "system-ui, -apple-system, sans-serif",
// //       boxSizing: "border-box",
// //     },
// //     container: {
// //       width: "100%",
// //       maxWidth: "1400px",
// //       margin: "0 auto",
// //     },
// //     headerBlock: {
// //       marginBottom: "32px",
// //     },
// //     title: {
// //       fontSize: "32px",
// //       fontWeight: "800",
// //       color: "#0f172a",
// //       letterSpacing: "-0.5px",
// //       margin: 0,
// //     },
// //     subtitle: {
// //       fontSize: "15px",
// //       color: "#64748b",
// //       marginTop: "6px",
// //       marginBottom: 0,
// //     },
// //     tabGroup: {
// //       display: "flex",
// //       gap: "12px",
// //       marginBottom: "28px",
// //       borderBottom: "2px solid #e2e8f0",
// //       paddingBottom: "12px"
// //     },
// //     tabBtn: {
// //       padding: "10px 20px",
// //       border: "1px solid transparent",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       transition: "all 0.2s",
// //       backgroundColor: "transparent",
// //       color: "#64748b"
// //     },
// //     activeNewTab: {
// //       backgroundColor: "#2563eb",
// //       color: "#ffffff",
// //     },
// //     activeDoneTab: {
// //       backgroundColor: "#16a34a",
// //       color: "#ffffff",
// //     },
// //     cardWrapper: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "16px",
// //       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
// //       padding: "24px",
// //       marginBottom: "24px",
// //     },
// //     cardHeader: {
// //       display: "flex",
// //       justifyContent: "space-between",
// //       alignItems: "center",
// //       flexWrap: "wrap",
// //       gap: "12px",
// //       marginBottom: "16px",
// //       paddingBottom: "12px",
// //       borderBottom: "1px solid #f1f5f9"
// //     },
// //     cardTitle: {
// //       fontSize: "18px",
// //       fontWeight: "700",
// //       color: "#0f172a",
// //       margin: 0,
// //     },
// //     timestamp: {
// //       fontSize: "13px",
// //       color: "#64748b",
// //       margin: 0,
// //     },
// //     table: {
// //       width: "100%",
// //       borderCollapse: "collapse",
// //       textAlign: "left",
// //       marginBottom: "20px"
// //     },
// //     th: {
// //       backgroundColor: "#f8fafc",
// //       color: "#475569",
// //       fontWeight: "600",
// //       padding: "12px 16px",
// //       fontSize: "13px",
// //       borderBottom: "1px solid #e2e8f0",
// //     },
// //     td: {
// //       padding: "12px 16px",
// //       fontSize: "14px",
// //       color: "#334155",
// //       borderBottom: "1px solid #f1f5f9",
// //     },
// //     priceInput: {
// //       width: "140px",
// //       padding: "8px 12px",
// //       border: "1px solid #cbd5e1",
// //       borderRadius: "8px",
// //       fontSize: "14px",
// //       color: "#0f172a",
// //       backgroundColor: "#ffffff",
// //       outline: "none",
// //       transition: "all 0.2s",
// //       boxSizing: "border-box",
// //     },
// //     emptyState: {
// //       padding: "48px",
// //       textAlign: "center",
// //       color: "#64748b",
// //       fontSize: "15px",
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "16px",
// //     },
// //     actionBtn: {
// //       padding: "10px 20px",
// //       color: "#ffffff",
// //       backgroundColor: "#16a34a",
// //       border: "none",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       transition: "all 0.2s",
// //       boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)"
// //     }
// //   };

// //   const handleFocus = (e) => {
// //     e.currentTarget.style.borderColor = "#2563eb";
// //     e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
// //   };

// //   const handleBlur = (e) => {
// //     e.currentTarget.style.borderColor = "#cbd5e1";
// //     e.currentTarget.style.boxShadow = "none";
// //   };

// //   return (
// //     <div style={styles.page}>
// //       <div style={styles.container}>
        
// //         {/* Main Section Navigation Header */}
// //         <div style={styles.headerBlock}>
// //           <h1 style={styles.title}>Purchased Invoices</h1>
// //           <p style={styles.subtitle}>Track incoming supply requisitions, execute unit cost evaluations, and log processed items.</p>
// //         </div>

// //         {/* Tab Selection Filter System */}
// //         <div style={styles.tabGroup}>
// //           <button
// //             onClick={() => setActiveTab("new")}
// //             style={{
// //               ...styles.tabBtn,
// //               ...(activeTab === "new" ? styles.activeNewTab : {}),
// //             }}
// //           >
// //             Pending Receipts
// //           </button>
// //           <button
// //             onClick={() => setActiveTab("completed")}
// //             style={{
// //               ...styles.tabBtn,
// //               ...(activeTab === "completed" ? styles.activeDoneTab : {}),
// //             }}
// //           >
// //             Archived History
// //           </button>
// //         </div>

// //         {/* =============== PENDING ORDERS REGISTRY TAB =============== */}
// //         {activeTab === "new" && (
// //           <div>
// //             {newPurchases.length === 0 ? (
// //               <div style={styles.emptyState}>
// //                 ✨ All purchase logs cleared. No open order sheets await processing.
// //               </div>
// //             ) : (
// //               newPurchases.map((purchase) => (
// //                 <div key={purchase._id} style={styles.cardWrapper}>
// //                   <div style={styles.cardHeader}>
// //                     <h3 style={styles.cardTitle}>Purchase Sheet #{purchase._id.slice(-6).toUpperCase()}</h3>
// //                     <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '13px', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
// //                       Awaiting Pricing Evaluation
// //                     </span>
// //                   </div>

// //                   <table style={styles.table}>
// //                     <thead>
// //                       <tr>
// //                         <th style={styles.th}>Product Details</th>
// //                         <th style={{ ...styles.th, width: "120px" }}>Ordered Qty</th>
// //                         <th style={{ ...styles.th, width: "180px" }}>Log Purchase Price (₹)</th>
// //                       </tr>
// //                     </thead>
// //                     <tbody>
// //                       {purchase.items.map((item, index) => (
// //                         <tr key={item.productId?._id || index}>
// //                           <td style={styles.td}>
// //                             <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
// //                           </td>
// //                           <td style={styles.td}>{item.quantity}</td>
// //                           <td style={styles.td}>
// //                             <input
// //                               type="number"
// //                               min="0"
// //                               placeholder="0.00"
// //                               value={item.purchasePrice || ""}
// //                               onChange={(e) => {
// //                                 if (!item.productId) return;
// //                                 handlePriceChange(purchase._id, item.productId._id, e.target.value);
// //                               }}
// //                               onFocus={handleFocus}
// //                               onBlur={handleBlur}
// //                               style={styles.priceInput}
// //                             />
// //                           </td>
// //                         </tr>
// //                       ))}
// //                     </tbody>
// //                   </table>

// //                   <button
// //                     onClick={() => completePurchase(purchase)}
// //                     disabled={loading}
// //                     style={{
// //                       ...styles.actionBtn,
// //                       backgroundColor: loading ? "#a3e635" : "#16a34a",
// //                       cursor: loading ? "not-allowed" : "pointer",
// //                     }}
// //                   >
// //                     {loading ? "Completing Ledger Entry..." : "Complete Ledger & Apply Stock"}
// //                   </button>
// //                 </div>
// //               ))
// //             )}
// //           </div>
// //         )}

// //         {/* =============== ARCHIVED HISTORICAL TRANSACTIONS TAB =============== */}
// //         {activeTab === "completed" && (
// //           <div>
// //             {completedPurchases.length === 0 ? (
// //               <div style={styles.emptyState}>
// //                 No completed records found inside historical archives.
// //               </div>
// //             ) : (
// //               completedPurchases.map((purchase) => (
// //                 <div key={purchase._id} style={styles.cardWrapper}>
// //                   <div style={styles.cardHeader}>
// //                     <h3 style={styles.cardTitle}>Invoice Summary #{purchase._id.slice(-6).toUpperCase()}</h3>
// //                     <p style={styles.timestamp}>
// //                       🟢 Closed on: {new Date(purchase.completedAt).toLocaleString()}
// //                     </p>
// //                   </div>

// //                   <table style={styles.table}>
// //                     <thead>
// //                       <tr>
// //                         <th style={styles.th}>Product Details</th>
// //                         <th style={{ ...styles.th, width: "120px" }}>Received Qty</th>
// //                         <th style={{ ...styles.th, width: "180px" }}>Unit Book Value</th>
// //                       </tr>
// //                     </thead>
// //                     <tbody>
// //                       {purchase.items.map((item) => (
// //                         <tr key={item.productId?._id || `${purchase._id}-${item.quantity}`}>
// //                           <td style={styles.td}>
// //                             <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
// //                           </td>
// //                           <td style={styles.td}>{item.quantity}</td>
// //                           <td style={{ ...styles.td, color: '#16a34a', fontWeight: '600' }}>
// //                             ₹ {item.purchasePrice?.toFixed(2) || "0.00"}
// //                           </td>
// //                         </tr>
// //                       ))}
// //                     </tbody>
// //                   </table>
// //                 </div>
// //               ))
// //             )}
// //           </div>
// //         )}

// //       </div>
// //     </div>
// //   );
// // };

// // export default Purchased;




// // good




// import React, { useEffect, useState } from "react";
// import api from "../utils/api";

// const Purchased = () => {
//   const [activeTab, setActiveTab] = useState("new");
//   const [newPurchases, setNewPurchases] = useState([]);
//   const [completedPurchases, setCompletedPurchases] = useState([]);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     fetchNewPurchases();
//     fetchCompletedPurchases();
//   }, []);

//   const fetchNewPurchases = async () => {
//     try {
//       const res = await api.get("/purchases/new");
//       // Map incoming data to ensure a fallback for receivedQuantity matching ordered quantity
//       const normalized = res.data.map(purchase => ({
//         ...purchase,
//         items: purchase.items.map(item => ({
//           ...item,
//           receivedQuantity: item.receivedQuantity !== undefined ? item.receivedQuantity : item.quantity,
//           purchasePrice: item.purchasePrice || 0
//         }))
//       }));
//       setNewPurchases(normalized);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const fetchCompletedPurchases = async () => {
//     try {
//       const res = await api.get("/purchases/completed");
//       setCompletedPurchases(res.data);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const handleItemChange = (purchaseId, productId, key, value) => {
//     setNewPurchases((prev) =>
//       prev.map((purchase) => {
//         if (purchase._id !== purchaseId) return purchase;

//         return {
//           ...purchase,
//           items: purchase.items.map((item) =>
//             item.productId?._id === productId
//               ? {
//                   ...item,
//                   [key]: Number(value),
//                 }
//               : item
//           ),
//         };
//       })
//     );
//   };

//   const completePurchase = async (purchase) => {
//     try {
//       setLoading(true);

//       await api.put(`/purchases/complete/${purchase._id}`, {
//         items: purchase.items.map((item) => ({
//           productId: item.productId?._id,
//           quantity: item.receivedQuantity, // Sending final verified received stock quantity to ledger
//           purchasePrice: item.purchasePrice,
//         })),
//       });

//       await fetchNewPurchases();
//       await fetchCompletedPurchases();

//       alert("Purchase order finalized successfully!");
//     } catch (err) {
//       console.error(err);
//       alert("Failed to complete purchase tracking records.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const styles = {
//     page: {
//       minHeight: "100vh",
//       backgroundColor: "#f1f5f9",
//       padding: "40px 24px",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       boxSizing: "border-box",
//     },
//     container: {
//       width: "100%",
//       maxWidth: "1400px",
//       margin: "0 auto",
//     },
//     headerBlock: {
//       marginBottom: "32px",
//     },
//     title: {
//       fontSize: "32px",
//       fontWeight: "800",
//       color: "#0f172a",
//       letterSpacing: "-0.5px",
//       margin: 0,
//     },
//     subtitle: {
//       fontSize: "15px",
//       color: "#64748b",
//       marginTop: "6px",
//       marginBottom: 0,
//     },
//     tabGroup: {
//       display: "flex",
//       gap: "12px",
//       marginBottom: "28px",
//       borderBottom: "2px solid #e2e8f0",
//       paddingBottom: "12px"
//     },
//     tabBtn: {
//       padding: "10px 20px",
//       border: "1px solid transparent",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       backgroundColor: "transparent",
//       color: "#64748b"
//     },
//     activeNewTab: {
//       backgroundColor: "#2563eb",
//       color: "#ffffff",
//     },
//     activeDoneTab: {
//       backgroundColor: "#16a34a",
//       color: "#ffffff",
//     },
//     cardWrapper: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
//       padding: "24px",
//       marginBottom: "24px",
//     },
//     cardHeader: {
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       flexWrap: "wrap",
//       gap: "12px",
//       marginBottom: "16px",
//       paddingBottom: "12px",
//       borderBottom: "1px solid #f1f5f9"
//     },
//     cardTitle: {
//       fontSize: "18px",
//       fontWeight: "700",
//       color: "#0f172a",
//       margin: 0,
//     },
//     timestamp: {
//       fontSize: "13px",
//       color: "#64748b",
//       margin: 0,
//     },
//     table: {
//       width: "100%",
//       borderCollapse: "collapse",
//       textAlign: "left",
//       marginBottom: "20px"
//     },
//     th: {
//       backgroundColor: "#f8fafc",
//       color: "#475569",
//       fontWeight: "600",
//       padding: "12px 16px",
//       fontSize: "13px",
//       borderBottom: "1px solid #e2e8f0",
//     },
//     td: {
//       padding: "12px 16px",
//       fontSize: "14px",
//       color: "#334155",
//       borderBottom: "1px solid #f1f5f9",
//     },
//     numInput: {
//       width: "110px",
//       padding: "8px 12px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "8px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "all 0.2s",
//       boxSizing: "border-box",
//     },
//     emptyState: {
//       padding: "48px",
//       textAlign: "center",
//       color: "#64748b",
//       fontSize: "15px",
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//     },
//     actionBtn: {
//       padding: "10px 20px",
//       color: "#ffffff",
//       backgroundColor: "#16a34a",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)"
//     }
//   };

//   const handleFocus = (e) => {
//     e.currentTarget.style.borderColor = "#2563eb";
//     e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
//   };

//   const handleBlur = (e) => {
//     e.currentTarget.style.borderColor = "#cbd5e1";
//     e.currentTarget.style.boxShadow = "none";
//   };

//   return (
//     <div style={styles.page}>
//       <div style={styles.container}>
        
//         {/* Main Section Navigation Header */}
//         <div style={styles.headerBlock}>
//           <h1 style={styles.title}>Purchased Invoices</h1>
//           <p style={styles.subtitle}>Track incoming supply requisitions, execute unit cost evaluations, and log processed items.</p>
//         </div>

//         {/* Tab Selection Filter System */}
//         <div style={styles.tabGroup}>
//           <button
//             onClick={() => setActiveTab("new")}
//             style={{
//               ...styles.tabBtn,
//               ...(activeTab === "new" ? styles.activeNewTab : {}),
//             }}
//           >
//             Pending Receipts
//           </button>
//           <button
//             onClick={() => setActiveTab("completed")}
//             style={{
//               ...styles.tabBtn,
//               ...(activeTab === "completed" ? styles.activeDoneTab : {}),
//             }}
//           >
//             Archived History
//           </button>
//         </div>

//         {/* =============== PENDING ORDERS REGISTRY TAB =============== */}
//         {activeTab === "new" && (
//           <div>
//             {newPurchases.length === 0 ? (
//               <div style={styles.emptyState}>
//                 ✨ All purchase logs cleared. No open order sheets await processing.
//               </div>
//             ) : (
//               newPurchases.map((purchase) => {
//                 // Calculate aggregated total for entire purchase order sheet
//                 const grandTotal = purchase.items.reduce((acc, item) => {
//                   return acc + ((item.receivedQuantity || 0) * (item.purchasePrice || 0));
//                 }, 0);

//                 return (
//                   <div key={purchase._id} style={styles.cardWrapper}>
//                     <div style={styles.cardHeader}>
//                       <h3 style={styles.cardTitle}>Purchase Sheet #{purchase._id.slice(-6).toUpperCase()}</h3>
//                       <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '13px', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
//                         Order Grand Total: ₹ {grandTotal.toFixed(2)}
//                       </span>
//                     </div>

//                     <table style={styles.table}>
//                       <thead>
//                         <tr>
//                           <th style={styles.th}>Product Details</th>
//                           <th style={{ ...styles.th, width: "100px" }}>Ordered Qty</th>
//                           <th style={{ ...styles.th, width: "140px" }}>Received Qty</th>
//                           <th style={{ ...styles.th, width: "160px" }}>Unit Buy Price (₹)</th>
//                           <th style={{ ...styles.th, width: "150px" }}>Total Cost (₹)</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {purchase.items.map((item, index) => {
//                           const productTotal = (item.receivedQuantity || 0) * (item.purchasePrice || 0);

//                           return (
//                             <tr key={item.productId?._id || index}>
//                               <td style={styles.td}>
//                                 <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
//                               </td>
//                               <td style={styles.td}>{item.quantity}</td>
//                               <td style={styles.td}>
//                                 <input
//                                   type="number"
//                                   min="0"
//                                   placeholder="0"
//                                   value={item.receivedQuantity ?? ""}
//                                   onChange={(e) => {
//                                     if (!item.productId) return;
//                                     handleItemChange(purchase._id, item.productId._id, "receivedQuantity", e.target.value);
//                                   }}
//                                   onFocus={handleFocus}
//                                   onBlur={handleBlur}
//                                   style={styles.numInput}
//                                 />
//                               </td>
//                               <td style={styles.td}>
//                                 <input
//                                   type="number"
//                                   min="0"
//                                   placeholder="0.00"
//                                   value={item.purchasePrice || ""}
//                                   onChange={(e) => {
//                                     if (!item.productId) return;
//                                     handleItemChange(purchase._id, item.productId._id, "purchasePrice", e.target.value);
//                                   }}
//                                   onFocus={handleFocus}
//                                   onBlur={handleBlur}
//                                   style={styles.numInput}
//                                 />
//                               </td>
//                               <td style={{ ...styles.td, fontWeight: "600", color: productTotal > 0 ? "#0f172a" : "#94a3b8" }}>
//                                 ₹ {productTotal.toFixed(2)}
//                               </td>
//                             </tr>
//                           );
//                         })}
//                       </tbody>
//                     </table>

//                     <button
//                       onClick={() => completePurchase(purchase)}
//                       disabled={loading}
//                       style={{
//                         ...styles.actionBtn,
//                         backgroundColor: loading ? "#a3e635" : "#16a34a",
//                         cursor: loading ? "not-allowed" : "pointer",
//                       }}
//                     >
//                       {loading ? "Completing Ledger Entry..." : "Complete Ledger & Apply Stock"}
//                     </button>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         )}

//         {/* =============== ARCHIVED HISTORICAL TRANSACTIONS TAB =============== */}
//         {activeTab === "completed" && (
//           <div>
//             {completedPurchases.length === 0 ? (
//               <div style={styles.emptyState}>
//                 No completed records found inside historical archives.
//               </div>
//             ) : (
//               completedPurchases.map((purchase) => {
//                 const completedGrandTotal = purchase.items.reduce((acc, item) => {
//                   return acc + ((item.quantity || 0) * (item.purchasePrice || 0));
//                 }, 0);

//                 return (
//                   <div key={purchase._id} style={styles.cardWrapper}>
//                     <div style={styles.cardHeader}>
//                       <div>
//                         <h3 style={styles.cardTitle}>Invoice Summary #{purchase._id.slice(-6).toUpperCase()}</h3>
//                         <p style={styles.timestamp}>
//                           🟢 Closed on: {new Date(purchase.completedAt).toLocaleString()}
//                         </p>
//                       </div>
//                       <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '14px', backgroundColor: '#f0fdf4', padding: '6px 14px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
//                         Total Spent: ₹ {completedGrandTotal.toFixed(2)}
//                       </span>
//                     </div>

//                     <table style={styles.table}>
//                       <thead>
//                         <tr>
//                           <th style={styles.th}>Product Details</th>
//                           <th style={{ ...styles.th, width: "120px" }}>Received Qty</th>
//                           <th style={{ ...styles.th, width: "180px" }}>Unit Book Value</th>
//                           <th style={{ ...styles.th, width: "180px" }}>Total Settlement</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {purchase.items.map((item, index) => {
//                           const historicalProductTotal = (item.quantity || 0) * (item.purchasePrice || 0);

//                           return (
//                             <tr key={item.productId?._id || index}>
//                               <td style={styles.td}>
//                                 <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
//                               </td>
//                               <td style={styles.td}>{item.quantity}</td>
//                               <td style={{ ...styles.td, color: '#475569' }}>
//                                 ₹ {item.purchasePrice?.toFixed(2) || "0.00"}
//                               </td>
//                               <td style={{ ...styles.td, color: '#16a34a', fontWeight: '600' }}>
//                                 ₹ {historicalProductTotal.toFixed(2)}
//                               </td>
//                             </tr>
//                           );
//                         })}
//                       </tbody>
//                     </table>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         )}

//       </div>
//     </div>
//   );
// };

// export default Purchased;





// import React, { useEffect, useState } from "react";
// import api from "../utils/api";

// const Purchased = () => {
//   const [activeTab, setActiveTab] = useState("new");
//   const [newPurchases, setNewPurchases] = useState([]);
//   const [completedPurchases, setCompletedPurchases] = useState([]);
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     fetchNewPurchases();
//     fetchCompletedPurchases();
//   }, []);

//   const fetchNewPurchases = async () => {
//     try {
//       const res = await api.get("/purchases/new");
//       // Map incoming data to ensure a fallback for receivedQuantity matching ordered quantity
//       const normalized = res.data.map(purchase => ({
//         ...purchase,
//         items: purchase.items.map(item => ({
//           ...item,
//           receivedQuantity: item.receivedQuantity !== undefined ? item.receivedQuantity : item.quantity,
//           purchasePrice: item.purchasePrice || 0
//         }))
//       }));
//       setNewPurchases(normalized);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const fetchCompletedPurchases = async () => {
//     try {
//       const res = await api.get("/purchases/completed");
//       // Sort items dynamically from most recent date to past history
//       const sortedHistory = res.data.sort((a, b) => {
//         return new Date(b.completedAt) - new Date(a.completedAt);
//       });
//       setCompletedPurchases(sortedHistory);
//     } catch (err) {
//       console.error(err);
//     }
//   };

//   const handleItemChange = (purchaseId, productId, key, value) => {
//     setNewPurchases((prev) =>
//       prev.map((purchase) => {
//         if (purchase._id !== purchaseId) return purchase;

//         return {
//           ...purchase,
//           items: purchase.items.map((item) =>
//             item.productId?._id === productId
//               ? {
//                   ...item,
//                   [key]: Number(value),
//                 }
//               : item
//           ),
//         };
//       })
//     );
//   };

//   const completePurchase = async (purchase) => {
//     try {
//       setLoading(true);

//       await api.put(`/purchases/complete/${purchase._id}`, {
//         items: purchase.items.map((item) => ({
//           productId: item.productId?._id,
//           quantity: item.receivedQuantity, // Sending final verified received stock quantity to ledger
//           purchasePrice: item.purchasePrice,
//         })),
//       });

//       await fetchNewPurchases();
//       await fetchCompletedPurchases();

//       alert("Purchase order finalized successfully!");
//     } catch (err) {
//       console.error(err);
//       alert("Failed to complete purchase tracking records.");
//     } finally {
//       setLoading(false);
//     }
//   };

//   const styles = {
//     page: {
//       minHeight: "100vh",
//       backgroundColor: "#f1f5f9",
//       padding: "40px 24px",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       boxSizing: "border-box",
//     },
//     container: {
//       width: "100%",
//       maxWidth: "1400px",
//       margin: "0 auto",
//     },
//     headerBlock: {
//       marginBottom: "32px",
//     },
//     title: {
//       fontSize: "32px",
//       fontWeight: "800",
//       color: "#0f172a",
//       letterSpacing: "-0.5px",
//       margin: 0,
//     },
//     subtitle: {
//       fontSize: "15px",
//       color: "#64748b",
//       marginTop: "6px",
//       marginBottom: 0,
//     },
//     tabGroup: {
//       display: "flex",
//       gap: "12px",
//       marginBottom: "28px",
//       borderBottom: "2px solid #e2e8f0",
//       paddingBottom: "12px"
//     },
//     tabBtn: {
//       padding: "10px 20px",
//       border: "1px solid transparent",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       backgroundColor: "transparent",
//       color: "#64748b"
//     },
//     activeNewTab: {
//       backgroundColor: "#2563eb",
//       color: "#ffffff",
//     },
//     activeDoneTab: {
//       backgroundColor: "#16a34a",
//       color: "#ffffff",
//     },
//     cardWrapper: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
//       padding: "24px",
//       marginBottom: "24px",
//     },
//     cardHeader: {
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       flexWrap: "wrap",
//       gap: "12px",
//       marginBottom: "16px",
//       paddingBottom: "12px",
//       borderBottom: "1px solid #f1f5f9"
//     },
//     cardTitle: {
//       fontSize: "18px",
//       fontWeight: "700",
//       color: "#0f172a",
//       margin: 0,
//     },
//     timestamp: {
//       fontSize: "13px",
//       color: "#64748b",
//       margin: 0,
//     },
//     table: {
//       width: "100%",
//       borderCollapse: "collapse",
//       textAlign: "left",
//       marginBottom: "20px"
//     },
//     th: {
//       backgroundColor: "#f8fafc",
//       color: "#475569",
//       fontWeight: "600",
//       padding: "12px 16px",
//       fontSize: "13px",
//       borderBottom: "1px solid #e2e8f0",
//     },
//     td: {
//       padding: "12px 16px",
//       fontSize: "14px",
//       color: "#334155",
//       borderBottom: "1px solid #f1f5f9",
//     },
//     numInput: {
//       width: "110px",
//       padding: "8px 12px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "8px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "all 0.2s",
//       boxSizing: "border-box",
//     },
//     emptyState: {
//       padding: "48px",
//       textAlign: "center",
//       color: "#64748b",
//       fontSize: "15px",
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//     },
//     actionBtn: {
//       padding: "10px 20px",
//       color: "#ffffff",
//       backgroundColor: "#16a34a",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)"
//     }
//   };

//   const handleFocus = (e) => {
//     e.currentTarget.style.borderColor = "#2563eb";
//     e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
//   };

//   const handleBlur = (e) => {
//     e.currentTarget.style.borderColor = "#cbd5e1";
//     e.currentTarget.style.boxShadow = "none";
//   };

//   return (
//     <div style={styles.page}>
//       <div style={styles.container}>
        
//         {/* Main Section Navigation Header */}
//         <div style={styles.headerBlock}>
//           <h1 style={styles.title}>Purchased Invoices</h1>
//           <p style={styles.subtitle}>Track incoming supply requisitions, execute unit cost evaluations, and log processed items.</p>
//         </div>

//         {/* Tab Selection Filter System */}
//         <div style={styles.tabGroup}>
//           <button
//             onClick={() => setActiveTab("new")}
//             style={{
//               ...styles.tabBtn,
//               ...(activeTab === "new" ? styles.activeNewTab : {}),
//             }}
//           >
//             Pending Receipts
//           </button>
//           <button
//             onClick={() => setActiveTab("completed")}
//             style={{
//               ...styles.tabBtn,
//               ...(activeTab === "completed" ? styles.activeDoneTab : {}),
//             }}
//           >
//             Archived History
//           </button>
//         </div>

//         {/* =============== PENDING ORDERS REGISTRY TAB =============== */}
//         {activeTab === "new" && (
//           <div>
//             {newPurchases.length === 0 ? (
//               <div style={styles.emptyState}>
//                 ✨ All purchase logs cleared. No open order sheets await processing.
//               </div>
//             ) : (
//               newPurchases.map((purchase) => {
//                 // Calculate aggregated total for entire purchase order sheet
//                 const grandTotal = purchase.items.reduce((acc, item) => {
//                   return acc + ((item.receivedQuantity || 0) * (item.purchasePrice || 0));
//                 }, 0);

//                 return (
//                   <div key={purchase._id} style={styles.cardWrapper}>
//                     <div style={styles.cardHeader}>
//                       <h3 style={styles.cardTitle}>Purchase Sheet #{purchase._id.slice(-6).toUpperCase()}</h3>
//                       <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '13px', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
//                         Order Grand Total: ₹ {grandTotal.toFixed(2)}
//                       </span>
//                     </div>

//                     <table style={styles.table}>
//                       <thead>
//                         <tr>
//                           <th style={styles.th}>Product Details</th>
//                           <th style={{ ...styles.th, width: "100px" }}>Ordered Qty</th>
//                           <th style={{ ...styles.th, width: "140px" }}>Received Qty</th>
//                           <th style={{ ...styles.th, width: "160px" }}>Unit Buy Price (₹)</th>
//                           <th style={{ ...styles.th, width: "150px" }}>Total Cost (₹)</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {purchase.items.map((item, index) => {
//                           const productTotal = (item.receivedQuantity || 0) * (item.purchasePrice || 0);

//                           return (
//                             <tr key={item.productId?._id || index}>
//                               <td style={styles.td}>
//                                 <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
//                               </td>
//                               <td style={styles.td}>{item.quantity}</td>
//                               <td style={styles.td}>
//                                 <input
//                                   type="number"
//                                   min="0"
//                                   placeholder="0"
//                                   value={item.receivedQuantity ?? ""}
//                                   onChange={(e) => {
//                                     if (!item.productId) return;
//                                     handleItemChange(purchase._id, item.productId._id, "receivedQuantity", e.target.value);
//                                   }}
//                                   onFocus={handleFocus}
//                                   onBlur={handleBlur}
//                                   style={styles.numInput}
//                                 />
//                               </td>
//                               <td style={styles.td}>
//                                 <input
//                                   type="number"
//                                   min="0"
//                                   placeholder="0.00"
//                                   value={item.purchasePrice || ""}
//                                   onChange={(e) => {
//                                     if (!item.productId) return;
//                                     handleItemChange(purchase._id, item.productId._id, "purchasePrice", e.target.value);
//                                   }}
//                                   onFocus={handleFocus}
//                                   onBlur={handleBlur}
//                                   style={styles.numInput}
//                                 />
//                               </td>
//                               <td style={{ ...styles.td, fontWeight: "600", color: productTotal > 0 ? "#0f172a" : "#94a3b8" }}>
//                                 ₹ {productTotal.toFixed(2)}
//                               </td>
//                             </tr>
//                           );
//                         })}
//                       </tbody>
//                     </table>

//                     <button
//                       onClick={() => completePurchase(purchase)}
//                       disabled={loading}
//                       style={{
//                         ...styles.actionBtn,
//                         backgroundColor: loading ? "#a3e635" : "#16a34a",
//                         cursor: loading ? "not-allowed" : "pointer",
//                       }}
//                     >
//                       {loading ? "Completing Ledger Entry..." : "Complete Ledger & Apply Stock"}
//                     </button>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         )}

//         {/* =============== ARCHIVED HISTORICAL TRANSACTIONS TAB =============== */}
//         {activeTab === "completed" && (
//           <div>
//             {completedPurchases.length === 0 ? (
//               <div style={styles.emptyState}>
//                 No completed records found inside historical archives.
//               </div>
//             ) : (
//               completedPurchases.map((purchase) => {
//                 const completedGrandTotal = purchase.items.reduce((acc, item) => {
//                   return acc + ((item.quantity || 0) * (item.purchasePrice || 0));
//                 }, 0);

//                 return (
//                   <div key={purchase._id} style={styles.cardWrapper}>
//                     <div style={styles.cardHeader}>
//                       <div>
//                         <h3 style={styles.cardTitle}>Invoice Summary #{purchase._id.slice(-6).toUpperCase()}</h3>
//                         <p style={styles.timestamp}>
//                           🟢 Closed on: {new Date(purchase.completedAt).toLocaleString()}
//                         </p>
//                       </div>
//                       <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '14px', backgroundColor: '#f0fdf4', padding: '6px 14px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
//                         Total Spent: ₹ {completedGrandTotal.toFixed(2)}
//                       </span>
//                     </div>

//                     <table style={styles.table}>
//                       <thead>
//                         <tr>
//                           <th style={styles.th}>Product Details</th>
//                           <th style={{ ...styles.th, width: "120px" }}>Received Qty</th>
//                           <th style={{ ...styles.th, width: "180px" }}>Unit Book Value</th>
//                           <th style={{ ...styles.th, width: "180px" }}>Total Settlement</th>
//                         </tr>
//                       </thead>
//                       <tbody>
//                         {purchase.items.map((item, index) => {
//                           const historicalProductTotal = (item.quantity || 0) * (item.purchasePrice || 0);

//                           return (
//                             <tr key={item.productId?._id || index}>
//                               <td style={styles.td}>
//                                 <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
//                               </td>
//                               <td style={styles.td}>{item.quantity}</td>
//                               <td style={{ ...styles.td, color: '#475569' }}>
//                                 ₹ {item.purchasePrice?.toFixed(2) || "0.00"}
//                               </td>
//                               <td style={{ ...styles.td, color: '#16a34a', fontWeight: '600' }}>
//                                 ₹ {historicalProductTotal.toFixed(2)}
//                               </td>
//                             </tr>
//                           );
//                         })}
//                       </tbody>
//                     </table>
//                   </div>
//                 );
//               })
//             )}
//           </div>
//         )}

//       </div>
//     </div>
//   );
// };

// export default Purchased;



// 20-06-2026






import React, { useEffect, useState } from "react";
import api from "../utils/api";
import RefreshButton from "../components/RefreshButton";

const Purchased = () => {
  const [activeTab, setActiveTab] = useState("new");
  const [newPurchases, setNewPurchases] = useState([]);
  const [completedPurchases, setCompletedPurchases] = useState([]);
  const [loading, setLoading] = useState(false);
const refreshPage = async () => {
  setLoading(true);

  try {
    await Promise.all([
      fetchNewPurchases(),
      fetchCompletedPurchases(),
    ]);
  } catch (err) {
    console.error(err);
  } finally {
    setLoading(false);
  }
};
  useEffect(() => {
  loadData();
}, []);

const loadData = async () => {
  await Promise.all([
    fetchNewPurchases(),
    fetchCompletedPurchases(),
  ]);
};

  const fetchNewPurchases = async () => {
    try {
      const res = await api.get("/purchases/new");
      // Map incoming data to ensure a fallback for receivedQuantity matching ordered quantity
      const normalized = res.data.map(purchase => ({
        ...purchase,
        items: purchase.items.map(item => ({
          ...item,
          receivedQuantity: item.receivedQuantity !== undefined ? item.receivedQuantity : item.quantity,
          purchasePrice: item.purchasePrice || 0
        }))
      }));
      setNewPurchases(normalized);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCompletedPurchases = async () => {
    try {
      const res = await api.get("/purchases/completed");
      // Sort items dynamically from most recent date to past history
      const sortedHistory = res.data.sort((a, b) => {
        return new Date(b.completedAt) - new Date(a.completedAt);
      });
      setCompletedPurchases(sortedHistory);
    } catch (err) {
      console.error(err);
    }
  };

  const handleItemChange = (purchaseId, productId, key, value) => {
    setNewPurchases((prev) =>
      prev.map((purchase) => {
        if (purchase._id !== purchaseId) return purchase;

        return {
          ...purchase,
          items: purchase.items.map((item) =>
            item.productId?._id === productId
              ? {
                  ...item,
                  [key]: Number(value),
                }
              : item
          ),
        };
      })
    );
  };

  const completePurchase = async (purchase) => {
    try {
      setLoading(true);

      await api.put(`/purchases/complete/${purchase._id}`, {
        items: purchase.items.map((item) => ({
          productId: item.productId?._id,
          quantity: item.receivedQuantity, // Sending final verified received stock quantity to ledger
          purchasePrice: item.purchasePrice,
        })),
      });

      await fetchNewPurchases();
      await fetchCompletedPurchases();
      await loadData();

      alert("Purchase order finalized successfully!");
    } catch (err) {
      console.error(err);
      alert("Failed to complete purchase tracking records.");
    } finally {
      setLoading(false);
    }
  };

  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f1f5f9",
      padding: "40px 24px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    container: {
      width: "100%",
      maxWidth: "1400px",
      margin: "0 auto",
    },
    headerBlock: {
      marginBottom: "32px",
    },
    title: {
      fontSize: "32px",
      fontWeight: "800",
      color: "#0f172a",
      letterSpacing: "-0.5px",
      margin: 0,
    },
    subtitle: {
      fontSize: "15px",
      color: "#64748b",
      marginTop: "6px",
      marginBottom: 0,
    },
    tabGroup: {
      display: "flex",
      gap: "12px",
      marginBottom: "28px",
      borderBottom: "2px solid #e2e8f0",
      paddingBottom: "12px"
    },
    tabBtn: {
      padding: "10px 20px",
      border: "1px solid transparent",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "all 0.2s",
      backgroundColor: "transparent",
      color: "#64748b"
    },
    activeNewTab: {
      backgroundColor: "#2563eb",
      color: "#ffffff",
    },
    activeDoneTab: {
      backgroundColor: "#16a34a",
      color: "#ffffff",
    },
    cardWrapper: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      padding: "24px",
      marginBottom: "24px",
    },
    cardHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "12px",
      marginBottom: "16px",
      paddingBottom: "12px",
      borderBottom: "1px solid #f1f5f9"
    },
    cardTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      margin: 0,
    },
    timestamp: {
      fontSize: "13px",
      color: "#64748b",
      margin: 0,
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
      marginBottom: "20px"
    },
    th: {
      backgroundColor: "#f8fafc",
      color: "#475569",
      fontWeight: "600",
      padding: "12px 16px",
      fontSize: "13px",
      borderBottom: "1px solid #e2e8f0",
    },
    td: {
      padding: "12px 16px",
      fontSize: "14px",
      color: "#334155",
      borderBottom: "1px solid #f1f5f9",
    },
    numInput: {
      width: "110px",
      padding: "8px 12px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
    },
    emptyState: {
      padding: "48px",
      textAlign: "center",
      color: "#64748b",
      fontSize: "15px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
    },
    actionBtn: {
      padding: "10px 20px",
      color: "#ffffff",
      backgroundColor: "#16a34a",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: "0 2px 4px rgba(22, 163, 74, 0.2)"
    }
  };

  const handleFocus = (e) => {
    e.currentTarget.style.borderColor = "#2563eb";
    e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
  };

  const handleBlur = (e) => {
    e.currentTarget.style.borderColor = "#cbd5e1";
    e.currentTarget.style.boxShadow = "none";
  };

  return (
    <div style={styles.page}>
      <div style={styles.container}>
        
        {/* Main Section Navigation Header */}
        <div style={styles.headerBlock}>
          <h1 style={styles.title}>Purchased Invoices</h1>
          <p style={styles.subtitle}>Track incoming supply requisitions, execute unit cost evaluations, and log processed items.</p>
        </div>

        {/* Tab Selection Filter System */}
        <div style={styles.tabGroup}>
          <button
            onClick={() => setActiveTab("new")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "new" ? styles.activeNewTab : {}),
            }}
          >
            Pending Receipts
          </button>
          <button
            onClick={() => setActiveTab("completed")}
            style={{
              ...styles.tabBtn,
              ...(activeTab === "completed" ? styles.activeDoneTab : {}),
            }}
          >
            Archived History
          </button>
        </div>

        {/* =============== PENDING ORDERS REGISTRY TAB =============== */}
        {activeTab === "new" && (
          <div>
            {newPurchases.length === 0 ? (
              <div style={styles.emptyState}>
                ✨ All purchase logs cleared. No open order sheets await processing.
              </div>
            ) : (
              newPurchases.map((purchase) => {
                // Calculate aggregated total for entire purchase order sheet
                const grandTotal = purchase.items.reduce((acc, item) => {
                  return acc + ((item.receivedQuantity || 0) * (item.purchasePrice || 0));
                }, 0);

                return (
                  <div key={purchase._id} style={styles.cardWrapper}>
                    <div style={styles.cardHeader}>
                      <h3 style={styles.cardTitle}>Purchase Sheet #{purchase._id.slice(-6).toUpperCase()}</h3>
                      <span style={{ color: '#2563eb', fontWeight: '600', fontSize: '13px', backgroundColor: '#eff6ff', padding: '4px 10px', borderRadius: '20px' }}>
                        Order Grand Total: ₹ {grandTotal.toFixed(2)}
                      </span>
                    </div>

                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Product Details</th>
                          <th style={{ ...styles.th, width: "100px" }}>Ordered Qty</th>
                          <th style={{ ...styles.th, width: "140px" }}>Received Qty</th>
                          <th style={{ ...styles.th, width: "160px" }}>Unit Buy Price (₹)</th>
                          <th style={{ ...styles.th, width: "150px" }}>Total Cost (₹)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchase.items.map((item, index) => {
                          const productTotal = (item.receivedQuantity || 0) * (item.purchasePrice || 0);

                          return (
                            <tr key={item.productId?._id || index}>
                              <td style={styles.td}>
                                <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
                              </td>
                              <td style={styles.td}>{item.quantity}</td>
                              <td style={styles.td}>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0"
                                  value={item.receivedQuantity ?? ""}
                                  onChange={(e) => {
                                    if (!item.productId) return;
                                    handleItemChange(purchase._id, item.productId._id, "receivedQuantity", e.target.value);
                                  }}
                                  onFocus={handleFocus}
                                  onBlur={handleBlur}
                                  style={styles.numInput}
                                />
                              </td>
                              <td style={styles.td}>
                                <input
                                  type="number"
                                  min="0"
                                  placeholder="0.00"
                                  value={item.purchasePrice || ""}
                                  onChange={(e) => {
                                    if (!item.productId) return;
                                    handleItemChange(purchase._id, item.productId._id, "purchasePrice", e.target.value);
                                  }}
                                  onFocus={handleFocus}
                                  onBlur={handleBlur}
                                  style={styles.numInput}
                                />
                              </td>
                              <td style={{ ...styles.td, fontWeight: "600", color: productTotal > 0 ? "#0f172a" : "#94a3b8" }}>
                                ₹ {productTotal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>

                    <button
                      onClick={() => completePurchase(purchase)}
                      disabled={loading}
                      style={{
                        ...styles.actionBtn,
                        backgroundColor: loading ? "#a3e635" : "#16a34a",
                        cursor: loading ? "not-allowed" : "pointer",
                      }}
                    >
                      {loading ? "Completing Ledger Entry..." : "Complete Ledger & Apply Stock"}
                    </button>
                  </div>
                );
              })
            )}
          </div>
        )}

        {/* =============== ARCHIVED HISTORICAL TRANSACTIONS TAB =============== */}
        {activeTab === "completed" && (
          <div>
            {completedPurchases.length === 0 ? (
              <div style={styles.emptyState}>
                No completed records found inside historical archives.
              </div>
            ) : (
              completedPurchases.map((purchase) => {
                const completedGrandTotal = purchase.items.reduce((acc, item) => {
                  return acc + ((item.quantity || 0) * (item.purchasePrice || 0));
                }, 0);

                return (
                  <div key={purchase._id} style={styles.cardWrapper}>
                    <div style={styles.cardHeader}>
                      <div>
                        <h3 style={styles.cardTitle}>Invoice Summary #{purchase._id.slice(-6).toUpperCase()}</h3>
                        <p style={styles.timestamp}>
                          🟢 Closed on: {new Date(purchase.completedAt).toLocaleString()}
                        </p>
                      </div>
                      <span style={{ color: '#16a34a', fontWeight: '700', fontSize: '14px', backgroundColor: '#f0fdf4', padding: '6px 14px', borderRadius: '20px', border: '1px solid #bbf7d0' }}>
                        Total Spent: ₹ {completedGrandTotal.toFixed(2)}
                      </span>
                    </div>

                    <table style={styles.table}>
                      <thead>
                        <tr>
                          <th style={styles.th}>Product Details</th>
                          <th style={{ ...styles.th, width: "120px" }}>Received Qty</th>
                          <th style={{ ...styles.th, width: "180px" }}>Unit Book Value</th>
                          <th style={{ ...styles.th, width: "180px" }}>Total Settlement</th>
                        </tr>
                      </thead>
                      <tbody>
                        {purchase.items.map((item, index) => {
                          const historicalProductTotal = (item.quantity || 0) * (item.purchasePrice || 0);

                          return (
                            <tr key={item.productId?._id || index}>
                              <td style={styles.td}>
                                <strong>{item.productId?.name || "Unlinked Catalog Product"}</strong>
                              </td>
                              <td style={styles.td}>{item.quantity}</td>
                              <td style={{ ...styles.td, color: '#475569' }}>
                                ₹ {item.purchasePrice?.toFixed(2) || "0.00"}
                              </td>
                              <td style={{ ...styles.td, color: '#16a34a', fontWeight: '600' }}>
                                ₹ {historicalProductTotal.toFixed(2)}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                );
              })
            )}
          </div>
        )}
 <RefreshButton
          onRefresh={refreshPage}
          loading={loading}
        />
      </div>
    </div>
  );
};

export default Purchased;