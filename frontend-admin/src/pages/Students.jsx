// // // import React, { useState, useEffect } from 'react';
// // // import api from '../utils/api';

// // // const Students = () => {
// // //   const [students, setStudents] = useState([]);
// // //   const [formData, setFormData] = useState({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
// // //   const [editingId, setEditingId] = useState(null);
// // //   const [excelFile, setExcelFile] = useState(null);

// // //   useEffect(() => { fetchStudents(); }, []);

// // //   const fetchStudents = async () => {
// // //     const res = await api.get('/students');
// // //     setStudents(res.data);
// // //   };

// // //   const handleSubmit = async (e) => {
// // //     e.preventDefault();
// // //     if (editingId) {
// // //       await api.put(`/students/${editingId}`, formData);
// // //     } else {
// // //       await api.post('/students', formData);
// // //     }
// // //     setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
// // //     setEditingId(null);
// // //     fetchStudents();
// // //   };

// // //   const handleBulkUpload = async (e) => {
// // //     e.preventDefault();
// // //     if (!excelFile) return alert('Please select an Excel sheet first');
// // //     const data = new FormData();
// // //     data.append('file', excelFile);
// // //     await api.post('/students/bulk-import', data);
// // //     alert('Bulk configuration successful!');
// // //     fetchStudents();
// // //   };

// // //   return (
// // //     <div className="space-y-8">
// // //       <div className="flex justify-between items-center">
// // //         <h1 className="text-3xl font-bold text-gray-800">Student Directory Management</h1>
// // //         {/* Bulk Upload Block */}
// // //         <form onSubmit={handleBulkUpload} className="flex items-center space-x-2 bg-white p-2 rounded-lg shadow-sm border">
// // //           <input type="file" accept=".xlsx, .xls" onChange={(e) => setExcelFile(e.target.files[0])} className="text-sm" />
// // //           <button type="submit" className="bg-emerald-600 text-white text-sm px-3 py-1.5 rounded hover:bg-emerald-700">Bulk Upload</button>
// // //         </form>
// // //       </div>

// // //       {/* Main Interactive Form */}
// // //       <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg shadow grid grid-cols-3 gap-4">
// // //         <input type="text" placeholder="Student Name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} className="border p-2 rounded" />
// // //         <input type="text" placeholder="Father's Name" required value={formData.fatherName} onChange={e => setFormData({...formData, fatherName: e.target.value})} className="border p-2 rounded" />
// // //         <input type="text" placeholder="Hostel Room No." required value={formData.hostelNumber} onChange={e => setFormData({...formData, hostelNumber: e.target.value})} className="border p-2 rounded" />
// // //         <input type="number" placeholder="Pocket Wallet Allocation" required value={formData.pocketMoney} onChange={e => setFormData({...formData, pocketMoney: Number(e.target.value)})} className="border p-2 rounded" />
// // //         <input type="text" placeholder="Grade/Class" required value={formData.grade} onChange={e => setFormData({...formData, grade: e.target.value})} className="border p-2 rounded" />
// // //         <input type="text" placeholder="Parent Contact Number" required value={formData.parentPhoneNumber} onChange={e => setFormData({...formData, parentPhoneNumber: e.target.value})} className="border p-2 rounded" />
// // //         <button type="submit" className="col-span-3 bg-indigo-600 text-white py-2 rounded font-semibold">{editingId ? 'Update Record' : 'Save New Student'}</button>
// // //       </form>

// // //       {/* Data Render Table */}
// // //       <div className="bg-white rounded-lg shadow overflow-hidden">
// // //         <table className="w-full text-left border-collapse">
// // //           <thead>
// // //             <tr className="bg-gray-100 border-b">
// // //               <th className="p-4 font-semibold">Student Name</th>
// // //               <th className="p-4 font-semibold">Father's Name</th>
// // //               <th className="p-4 font-semibold">Grade</th>
// // //               <th className="p-4 font-semibold">Parent Contact</th>
// // //               <th className="p-4 font-semibold">Available Wallet</th>
// // //               <th className="p-4 font-semibold text-center">Actions</th>
// // //             </tr>
// // //           </thead>
// // //           <tbody>
// // //             {students.map(st => (
// // //               <tr key={st._box} className="border-b hover:bg-gray-50">
// // //                 <td className="p-4">{st.name} (H-{st.hostelNumber})</td>
// // //                 <td className="p-4">{st.fatherName}</td>
// // //                 <td className="p-4">{st.grade}</td>
// // //                 <td className="p-4">{st.parentPhoneNumber}</td>
// // //                 <td className="p-4 font-bold text-emerald-600">₹{st.pocketMoney}</td>
// // //                 <td className="p-4 flex justify-center space-x-2">
// // //                   <button onClick={() => { setEditingId(st._id); setFormData(st); }} className="text-indigo-600 hover:underline">Edit</button>
// // //                   <button onClick={async () => { if(confirm('Delete student?')) { await api.delete(`/students/${st._id}`); fetchStudents(); } }} className="text-red-600 hover:underline">Remove</button>
// // //                 </td>
// // //               </tr>
// // //             ))}
// // //           </tbody>
// // //         </table>
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default Students;



// // import React, { useState, useEffect } from 'react';
// // import api from '../utils/api';

// // const Students = () => {
// //   const [students, setStudents] = useState([]);
// //   const [formData, setFormData] = useState({ 
// //     name: '', 
// //     fatherName: '', 
// //     hostelNumber: '', 
// //     pocketMoney: 0, 
// //     grade: '', 
// //     parentPhoneNumber: '' 
// //   });
// //   const [editingId, setEditingId] = useState(null);
// //   const [excelFile, setExcelFile] = useState(null);

// //   useEffect(() => { 
// //     fetchStudents(); 
// //   }, []);

// //   const fetchStudents = async () => {
// //     try {
// //       const res = await api.get('/students');
// //       setStudents(res.data);
// //     } catch (error) {
// //       console.error(error);
// //       alert('Failed to fetch student directory');
// //     }
// //   };

// //   const handleSubmit = async (e) => {
// //     e.preventDefault();
// //     try {
// //       if (editingId) {
// //         await api.put(`/students/${editingId}`, formData);
// //         alert('Student profile updated successfully!');
// //       } else {
// //         await api.post('/students', formData);
// //         alert('Student profile saved successfully!');
// //       }
// //       setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
// //       setEditingId(null);
// //       fetchStudents();
// //     } catch (error) {
// //       console.error(error);
// //       alert('Failed to save student record');
// //     }
// //   };

// //   const handleBulkUpload = async (e) => {
// //     e.preventDefault();
// //     if (!excelFile) return alert('Please select an Excel sheet first');
    
// //     const data = new FormData();
// //     data.append('file', excelFile);
    
// //     try {
// //       await api.post('/students/bulk-import', data);
// //       alert('Bulk configuration successful!');
// //       setExcelFile(null);
// //       // Reset file input value manually
// //       e.target.reset();
// //       fetchStudents();
// //     } catch (error) {
// //       console.error(error);
// //       alert('Bulk import failed');
// //     }
// //   };

// //   const handleDelete = async (id) => {
// //     if (confirm('Are you sure you want to remove this student permanently?')) {
// //       try {
// //         await api.delete(`/students/${id}`);
// //         fetchStudents();
// //       } catch (error) {
// //         console.error(error);
// //         alert('Failed to delete student profile');
// //       }
// //     }
// //   };

// //   const styles = {
// //     page: {
// //       minHeight: "100vh",
// //       backgroundColor: "#f8fafc",
// //       padding: "32px",
// //       fontFamily: "system-ui, -apple-system, sans-serif",
// //       boxSizing: "border-box",
// //     },
// //     headerFlex: {
// //       display: "flex",
// //       justifyContent: "space-between",
// //       alignItems: "center",
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
// //     bulkCardForm: {
// //       display: "flex",
// //       alignItems: "center",
// //       gap: "12px",
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "10px",
// //       padding: "8px 12px",
// //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// //     },
// //     fileInput: {
// //       fontSize: "13px",
// //       color: "#334155",
// //     },
// //     bulkBtn: {
// //       padding: "8px 14px",
// //       background: "#059669",
// //       color: "#ffffff",
// //       border: "none",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       transition: "background-color 0.2s",
// //       whiteSpace: "nowrap",
// //     },
// //     bottomGrid: {
// //       display: "grid",
// //       gridTemplateColumns: "1fr 2fr",
// //       gap: "24px",
// //       alignItems: "start",
// //     },
// //     card: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "14px",
// //       padding: "20px",
// //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// //       boxSizing: "border-box",
// //     },
// //     panelTitle: {
// //       fontSize: "16px",
// //       fontWeight: "600",
// //       color: "#0f172a",
// //       marginTop: 0,
// //       marginBottom: "16px",
// //     },
// //     formGroupGrid: {
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "14px",
// //     },
// //     input: {
// //       width: "100%",
// //       padding: "12px 14px",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "10px",
// //       fontSize: "14px",
// //       color: "#0f172a",
// //       backgroundColor: "#ffffff",
// //       outline: "none",
// //       transition: "border-color 0.2s",
// //       boxSizing: "border-box",
// //     },
// //     primaryBtn: {
// //       width: "100%",
// //       padding: "12px",
// //       background: "#2563eb",
// //       color: "#ffffff",
// //       border: "none",
// //       borderRadius: "10px",
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       transition: "background-color 0.2s",
// //       marginTop: "6px",
// //     },
// //     cancelBtn: {
// //       width: "100%",
// //       padding: "10px",
// //       background: "#f1f5f9",
// //       color: "#334155",
// //       border: "none",
// //       borderRadius: "10px",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       transition: "background-color 0.2s",
// //       marginTop: "2px",
// //     },
// //     tableContainer: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "14px",
// //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// //       overflow: "hidden",
// //     },
// //     table: {
// //       width: "100%",
// //       borderCollapse: "collapse",
// //       textAlign: "left",
// //     },
// //     th: {
// //       backgroundColor: "#f1f5f9",
// //       color: "#334155",
// //       fontWeight: "600",
// //       padding: "14px",
// //       fontSize: "13px",
// //       borderBottom: "2px solid #e2e8f0",
// //     },
// //     tr: {
// //       transition: "background-color 0.2s",
// //     },
// //     td: {
// //       padding: "14px",
// //       fontSize: "14px",
// //       color: "#0f172a",
// //       borderBottom: "1px solid #e2e8f0",
// //     },
// //     walletText: {
// //       color: "#059669",
// //       fontWeight: "700",
// //     },
// //     actionFlex: {
// //       display: "flex",
// //       gap: "12px",
// //     },
// //     editBtn: {
// //       background: "none",
// //       border: "none",
// //       color: "#2563eb",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       padding: 0,
// //     },
// //     removeBtn: {
// //       background: "none",
// //       border: "none",
// //       color: "#dc2626",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       padding: 0,
// //     },
// //     emptyState: {
// //       color: "#64748b",
// //       fontSize: "14px",
// //       textAlign: "center",
// //       padding: "32px 0",
// //       margin: 0,
// //     },
// //   };

// //   return (
// //     <div style={styles.page}>
// //       {/* Page Header */}
// //       <div style={styles.headerFlex}>
// //         <div>
// //           <h1 style={styles.title}>Student Directory Management</h1>
// //           <p style={styles.subtitle}>
// //             Manage institutional student profiles, room allocations, and global wallet states
// //           </p>
// //         </div>

// //         {/* Bulk Upload Block */}
// //         <form onSubmit={handleBulkUpload} style={styles.bulkCardForm}>
// //           <input 
// //             type="file" 
// //             accept=".xlsx, .xls" 
// //             onChange={(e) => setExcelFile(e.target.files[0])} 
// //             style={styles.fileInput} 
// //           />
// //           <button 
// //             type="submit" 
// //             style={styles.bulkBtn}
// //             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#047857")}
// //             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#059669")}
// //           >
// //             Bulk Upload
// //           </button>
// //         </form>
// //       </div>

// //       {/* Main Bottom Operational Grid */}
// //       <div style={styles.bottomGrid}>
        
// //         {/* LEFT SIDE: CONTROL FORM CARD */}
// //         <div style={styles.card}>
// //           <h3 style={styles.panelTitle}>
// //             {editingId ? "Modify Student Profile" : "Register New Student"}
// //           </h3>
// //           <form onSubmit={handleSubmit} style={styles.formGroupGrid}>
// //             <input 
// //               type="text" 
// //               placeholder="Student Name" 
// //               required 
// //               value={formData.name} 
// //               onChange={e => setFormData({...formData, name: e.target.value})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
// //             <input 
// //               type="text" 
// //               placeholder="Father's Name" 
// //               required 
// //               value={formData.fatherName} 
// //               onChange={e => setFormData({...formData, fatherName: e.target.value})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
// //             <input 
// //               type="text" 
// //               placeholder="Hostel Room No." 
// //               required 
// //               value={formData.hostelNumber} 
// //               onChange={e => setFormData({...formData, hostelNumber: e.target.value})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
// //             <input 
// //               type="number" 
// //               placeholder="Pocket Wallet Allocation (₹)" 
// //               required 
// //               value={formData.pocketMoney} 
// //               onChange={e => setFormData({...formData, pocketMoney: Number(e.target.value)})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
// //             <input 
// //               type="text" 
// //               placeholder="Grade / Class" 
// //               required 
// //               value={formData.grade} 
// //               onChange={e => setFormData({...formData, grade: e.target.value})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
// //             <input 
// //               type="text" 
// //               placeholder="Parent Contact Number" 
// //               required 
// //               value={formData.parentPhoneNumber} 
// //               onChange={e => setFormData({...formData, parentPhoneNumber: e.target.value})} 
// //               style={styles.input}
// //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// //             />
            
// //             <button 
// //               type="submit" 
// //               style={styles.primaryBtn}
// //               onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
// //               onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
// //             >
// //               {editingId ? 'Update Record' : 'Save Profile'}
// //             </button>

// //             {editingId && (
// //               <button
// //                 type="button"
// //                 style={styles.cancelBtn}
// //                 onClick={() => {
// //                   setEditingId(null);
// //                   setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
// //                 }}
// //                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
// //                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
// //               >
// //                 Cancel Edit
// //               </button>
// //             )}
// //           </form>
// //         </div>

// //         {/* RIGHT SIDE: DATA RENDER SYSTEM TABLE */}
// //         <div style={styles.tableContainer}>
// //           <table style={styles.table}>
// //             <thead>
// //               <tr>
// //                 <th style={styles.th}>Student Profile</th>
// //                 <th style={styles.th}>Father's Name</th>
// //                 <th style={styles.th}>Grade</th>
// //                 <th style={styles.th}>Parent Contact</th>
// //                 <th style={styles.th}>Wallet Balance</th>
// //                 <th style={styles.th}>Actions</th>
// //               </tr>
// //             </thead>
// //             <tbody>
// //               {students.length === 0 ? (
// //                 <tr>
// //                   <td colSpan="6" style={styles.td}>
// //                     <p style={styles.emptyState}>No active student profiles discovered in the system directory.</p>
// //                   </td>
// //                 </tr>
// //               ) : (
// //                 students.map((st) => (
// //                   <tr 
// //                     key={st._id} 
// //                     style={styles.tr}
// //                     onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// //                     onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// //                   >
// //                     <td style={styles.td}>
// //                       <strong>{st.name}</strong>
// //                       <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
// //                         Hostel Room: H-{st.hostelNumber || "N/A"}
// //                       </div>
// //                     </td>
// //                     <td style={styles.td}>{st.fatherName}</td>
// //                     <td style={styles.td}>{st.grade}</td>
// //                     <td style={styles.td}>{st.parentPhoneNumber}</td>
// //                     <td style={styles.td}>
// //                       <span style={styles.walletText}>₹{st.pocketMoney}</span>
// //                     </td>
// //                     <td style={styles.td}>
// //                       <div style={styles.actionFlex}>
// //                         <button 
// //                           style={styles.editBtn} 
// //                           onClick={() => { setEditingId(st._id); setFormData(st); }}
// //                         >
// //                           Edit
// //                         </button>
// //                         <button 
// //                           style={styles.removeBtn} 
// //                           onClick={() => handleDelete(st._id)}
// //                         >
// //                           Remove
// //                         </button>
// //                       </div>
// //                     </td>
// //                   </tr>
// //                 ))
// //               )}
// //             </tbody>
// //           </table>
// //         </div>

// //       </div>
// //     </div>
// //   );
// // };

// // export default Students;



// import React, { useState, useEffect } from 'react';
// import api from '../utils/api';

// const Students = () => {
//   const [students, setStudents] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [formData, setFormData] = useState({ 
//     name: '', 
//     fatherName: '', 
//     hostelNumber: '', 
//     pocketMoney: 0, 
//     grade: '', 
//     parentPhoneNumber: '' 
//   });
//   const [editingId, setEditingId] = useState(null);
//   const [excelFile, setExcelFile] = useState(null);

//   useEffect(() => { 
//     fetchStudents(); 
//   }, []);

//   const fetchStudents = async () => {
//     try {
//       const res = await api.get('/students');
//       setStudents(res.data);
//     } catch (error) {
//       console.error(error);
//       alert('Failed to fetch student directory');
//     }
//   };

//   const handleSubmit = async (e) => {
//     e.preventDefault();
//     try {
//       if (editingId) {
//         await api.put(`/students/${editingId}`, formData);
//         alert('Student profile updated successfully!');
//       } else {
//         await api.post('/students', formData);
//         alert('Student profile saved successfully!');
//       }
//       setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
//       setEditingId(null);
//       fetchStudents();
//     } catch (error) {
//       console.error(error);
//       alert('Failed to save student record');
//     }
//   };

//   const handleBulkUpload = async (e) => {
//     e.preventDefault();
//     if (!excelFile) return alert('Please select an Excel sheet first');
    
//     const data = new FormData();
//     data.append('file', excelFile);
    
//     try {
//       await api.post('/students/bulk-import', data);
//       alert('Bulk configuration successful!');
//       setExcelFile(null);
//       e.target.reset();
//       fetchStudents();
//     } catch (error) {
//       console.error(error);
//       alert('Bulk import failed');
//     }
//   };

//   const handleDelete = async (id) => {
//     if (confirm('Are you sure you want to remove this student permanently?')) {
//       try {
//         await api.delete(`/students/${id}`);
//         fetchStudents();
//       } catch (error) {
//         console.error(error);
//         alert('Failed to delete student profile');
//       }
//     }
//   };

//   // Client-side real-time filter logic
//   const filteredStudents = students.filter(st => {
//     const query = searchQuery.toLowerCase().trim();
//     if (!query) return true;
//     return (
//       st.name?.toLowerCase().includes(query) || 
//       st.hostelNumber?.toString().toLowerCase().includes(query)
//     );
//   });

//   const styles = {
//     page: {
//       minHeight: "100vh",
//       backgroundColor: "#f8fafc",
//       padding: "32px",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       boxSizing: "border-box",
//     },
//     headerFlex: {
//       display: "flex",
//       justifyContent: "space-between",
//       alignItems: "center",
//       marginBottom: "24px",
//     },
//     title: {
//       fontSize: "28px",
//       fontWeight: "700",
//       color: "#0f172a",
//       letterSpacing: "-0.5px",
//       margin: 0,
//     },
//     subtitle: {
//       fontSize: "14px",
//       color: "#64748b",
//       marginTop: "4px",
//       marginBottom: 0,
//     },
//     bulkCardForm: {
//       display: "flex",
//       alignItems: "center",
//       gap: "12px",
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "10px",
//       padding: "8px 12px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
//     },
//     fileInput: {
//       fontSize: "13px",
//       color: "#334155",
//     },
//     bulkBtn: {
//       padding: "8px 14px",
//       background: "#059669",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       transition: "background-color 0.2s",
//       whiteSpace: "nowrap",
//     },
//     bottomGrid: {
//       display: "grid",
//       gridTemplateColumns: "1fr 2fr",
//       gap: "24px",
//       alignItems: "start",
//     },
//     card: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "14px",
//       padding: "20px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
//       boxSizing: "border-box",
//     },
//     panelTitle: {
//       fontSize: "16px",
//       fontWeight: "600",
//       color: "#0f172a",
//       marginTop: 0,
//       marginBottom: "16px",
//     },
//     formGroupGrid: {
//       display: "flex",
//       flexDirection: "column",
//       gap: "14px",
//     },
//     input: {
//       width: "100%",
//       padding: "12px 14px",
//       border: "1px solid #e2e8f0",
//       borderRadius: "10px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "border-color 0.2s",
//       boxSizing: "border-box",
//     },
//     searchBarContainer: {
//       marginBottom: "16px",
//     },
//     tableContainer: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "14px",
//       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
//       overflow: "hidden",
//     },
//     table: {
//       width: "100%",
//       borderCollapse: "collapse",
//       textAlign: "left",
//     },
//     th: {
//       backgroundColor: "#f1f5f9",
//       color: "#334155",
//       fontWeight: "600",
//       padding: "14px",
//       fontSize: "13px",
//       borderBottom: "2px solid #e2e8f0",
//     },
//     tr: {
//       transition: "background-color 0.2s",
//     },
//     td: {
//       padding: "14px",
//       fontSize: "14px",
//       color: "#0f172a",
//       borderBottom: "1px solid #e2e8f0",
//     },
//     primaryBtn: {
//       width: "100%",
//       padding: "12px",
//       background: "#2563eb",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "10px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "background-color 0.2s",
//       marginTop: "6px",
//     },
//     cancelBtn: {
//       width: "100%",
//       padding: "10px",
//       background: "#f1f5f9",
//       color: "#334155",
//       border: "none",
//       borderRadius: "10px",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       transition: "background-color 0.2s",
//       marginTop: "2px",
//     },
//     walletText: {
//       color: "#059669",
//       fontWeight: "700",
//     },
//     actionFlex: {
//       display: "flex",
//       gap: "12px",
//     },
//     editBtn: {
//       background: "none",
//       border: "none",
//       color: "#2563eb",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       padding: 0,
//     },
//     removeBtn: {
//       background: "none",
//       border: "none",
//       color: "#dc2626",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       padding: 0,
//     },
//     emptyState: {
//       color: "#64748b",
//       fontSize: "14px",
//       textAlign: "center",
//       padding: "32px 0",
//       margin: 0,
//     },
//   };

//   return (
//     <div style={styles.page}>
//       {/* Page Header */}
//       <div style={styles.headerFlex}>
//         <div>
//           <h1 style={styles.title}>Student Directory Management</h1>
//           {/* <p style={styles.subtitle}>
//             Manage institutional student profiles, room allocations, and global wallet states
//           </p> */}
//         </div>

//         {/* Bulk Upload Block */}
//         <form onSubmit={handleBulkUpload} style={styles.bulkCardForm}>
//           <input 
//             type="file" 
//             accept=".xlsx, .xls" 
//             onChange={(e) => setExcelFile(e.target.files[0])} 
//             style={styles.fileInput} 
//           />
//           <button 
//             type="submit" 
//             style={styles.bulkBtn}
//             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#047857")}
//             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#059669")}
//           >
//             Bulk Upload
//           </button>
//         </form>
//       </div>

//       {/* Main Bottom Operational Grid */}
//       <div style={styles.bottomGrid}>
        
//         {/* LEFT SIDE: CONTROL FORM CARD */}
//         <div style={styles.card}>
//           <h3 style={styles.panelTitle}>
//             {editingId ? "Modify Student Profile" : "Register New Student"}
//           </h3>
//           <form onSubmit={handleSubmit} style={styles.formGroupGrid}>
//             <input 
//               type="text" 
//               placeholder="Student Name" 
//               required 
//               value={formData.name} 
//               onChange={e => setFormData({...formData, name: e.target.value})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//             <input 
//               type="text" 
//               placeholder="Father's Name" 
//               required 
//               value={formData.fatherName} 
//               onChange={e => setFormData({...formData, fatherName: e.target.value})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//             <input 
//               type="text" 
//               placeholder="Hostel Room No." 
//               required 
//               value={formData.hostelNumber} 
//               onChange={e => setFormData({...formData, hostelNumber: e.target.value})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//             <input 
//               type="number" 
//               placeholder="Pocket Wallet Allocation (₹)" 
//               required 
//               value={formData.pocketMoney} 
//               onChange={e => setFormData({...formData, pocketMoney: Number(e.target.value)})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//             <input 
//               type="text" 
//               placeholder="Grade / Class" 
//               required 
//               value={formData.grade} 
//               onChange={e => setFormData({...formData, grade: e.target.value})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//             <input 
//               type="text" 
//               placeholder="Parent Contact Number" 
//               required 
//               value={formData.parentPhoneNumber} 
//               onChange={e => setFormData({...formData, parentPhoneNumber: e.target.value})} 
//               style={styles.input}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
            
//             <button 
//               type="submit" 
//               style={styles.primaryBtn}
//               onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
//               onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
//             >
//               {editingId ? 'Update Record' : 'Save Profile'}
//             </button>

//             {editingId && (
//               <button
//                 type="button"
//                 style={styles.cancelBtn}
//                 onClick={() => {
//                   setEditingId(null);
//                   setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
//                 }}
//                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
//                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
//               >
//                 Cancel Edit
//               </button>
//             )}
//           </form>
//         </div>

//         {/* RIGHT SIDE: INTERACTIVE DIRECTORY LOOKUP & TABLE */}
//         <div>
//           {/* Live Dynamic Table Filter Bar */}
//           <div style={styles.searchBarContainer}>
//             <input 
//               type="text"
//               style={styles.input}
//               placeholder="Quick search directory by student name or hostel room..."
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
//               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
//             />
//           </div>

//           <div style={styles.tableContainer}>
//             <table style={styles.table}>
//               <thead>
//                 <tr>
//                   <th style={styles.th}>Student Profile</th>
//                   <th style={styles.th}>Father's Name</th>
//                   <th style={styles.th}>Grade</th>
//                   <th style={styles.th}>Parent Contact</th>
//                   <th style={styles.th}>Wallet Balance</th>
//                   <th style={styles.th}>Actions</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filteredStudents.length === 0 ? (
//                   <tr>
//                     <td colSpan="6" style={styles.td}>
//                       <p style={styles.emptyState}>
//                         {students.length === 0 
//                           ? "No active student profiles discovered in the system directory."
//                           : "No profiles matched your search filtering criteria."}
//                       </p>
//                     </td>
//                   </tr>
//                 ) : (
//                   filteredStudents.map((st) => (
//                     <tr 
//                       key={st._id} 
//                       style={styles.tr}
//                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
//                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
//                     >
//                       <td style={styles.td}>
//                         <strong>{st.name}</strong>
//                         <div style={{ fontSize: "12px", color: "#64748b", marginTop: "2px" }}>
//                           Hostel Room: H-{st.hostelNumber || "N/A"}
//                         </div>
//                       </td>
//                       <td style={styles.td}>{st.fatherName}</td>
//                       <td style={styles.td}>{st.grade}</td>
//                       <td style={styles.td}>{st.parentPhoneNumber}</td>
//                       <td style={styles.td}>
//                         <span style={styles.walletText}>₹{st.pocketMoney}</span>
//                       </td>
//                       <td style={styles.td}>
//                         <div style={styles.actionFlex}>
//                           <button 
//                             style={styles.editBtn} 
//                             onClick={() => { setEditingId(st._id); setFormData(st); }}
//                           >
//                             Edit
//                           </button>
//                           <button 
//                             style={styles.removeBtn} 
//                             onClick={() => handleDelete(st._id)}
//                           >
//                             Remove
//                           </button>
//                         </div>
//                       </td>
//                     </tr>
//                   ))
//                 )}
//               </tbody>
//             </table>
//           </div>
//         </div>

//       </div>
//     </div>
//   );
// };

// export default Students;



// 11-06-2026

import React, { useState, useEffect } from 'react';
import api from '../utils/api';
import * as XLSX from "xlsx";


const Students = () => {
  const [students, setStudents] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [topupAmount, setTopupAmount] = useState("");
const [topupStudent, setTopupStudent] = useState(null);
  const [formData, setFormData] = useState({ 
    name: '', 
    fatherName: '', 
    hostelNumber: '', 
    // pocketMoney: 0, 
    grade: '', 
    parentPhoneNumber: '' 
  });
  const [editingId, setEditingId] = useState(null);
  const [excelFile, setExcelFile] = useState(null);

  // Sorting State
  const [sortConfig, setSortConfig] = useState({ key: 'name', direction: 'asc' });

  useEffect(() => { 
    fetchStudents(); 
  }, []);

  const fetchStudents = async () => {
    try {
      const res = await api.get('/students');
      setStudents(res.data);
    } catch (error) {
      console.error(error);
      alert('Failed to fetch student directory');
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      if (editingId) {
        await api.put(`/students/${editingId}`, formData);
        alert('Student profile updated successfully!');
      } else {
        await api.post('/students', formData);
        alert('Student profile saved successfully!');
      }
      setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
      setEditingId(null);
      fetchStudents();
    } catch (error) {
      console.error(error);
      alert('Failed to save student record');
    }
  };



const handleBulkUpload = async (e) => {
  e.preventDefault();

  if (!excelFile) return alert("Please select an Excel sheet first");

  const reader = new FileReader();

  reader.onload = async (evt) => {
    const data = evt.target.result;
    const workbook = XLSX.read(data, { type: "binary" });

    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const jsonData = XLSX.utils.sheet_to_json(sheet);

    try {
      await api.post('/students/bulk', {
  students: jsonData
});

      alert("Bulk upload successful!");
      setExcelFile(null);
      fetchStudents();
    } catch (error) {
      console.error(error);
      alert("Bulk import failed");
    }
  };

  reader.readAsBinaryString(excelFile);
};

  const handleDelete = async (id, walletBalance) => {
  if (walletBalance > 0) {
    alert("Cannot delete student. Wallet balance is not zero.");
    return;
  }

  if (confirm('Are you sure you want to remove this student permanently?')) {
    try {
      await api.delete(`/students/${id}`);
      fetchStudents();
    } catch (error) {
      console.error(error);
      alert('Failed to delete student profile');
    }
  }
};
  // const handleDelete = async (id) => {
  //   if (confirm('Are you sure you want to remove this student permanently?')) {
  //     try {
  //       await api.delete(`/students/${id}`);
  //       fetchStudents();
  //     } catch (error) {
  //       console.error(error);
  //       alert('Failed to delete student profile');
  //     }
  //   }
  // };
const handleTopUp = async () => {
  try {
    if (!topupStudent) return;

    if (!topupAmount || Number(topupAmount) <= 0) {
      alert("Enter valid amount");
      return;
    }

    const res = await api.put(`/students/${topupStudent}/topup`, {
      amount: Number(topupAmount),
    });

    alert(`Wallet updated! New balance: ₹${res.data.newBalance}`);

    setTopupStudent(null);
    setTopupAmount("");

    fetchStudents(); // refresh table
  } catch (error) {
    console.error(error);
    alert(error?.response?.data?.message || "Topup failed");
  }
};
  // Sorting Handler Logic
  const handleSort = (key) => {
    let direction = 'asc';
    if (sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  // Processing: Filter -> Sort
  const filteredStudents = students.filter(st => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return (
      st.name?.toLowerCase().includes(query) || 
      st.hostelNumber?.toString().toLowerCase().includes(query)
    );
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => {
    if (!sortConfig.key) return 0;
    
    let aValue = a[sortConfig.key];
    let bValue = b[sortConfig.key];

    // Handle potential undefined or null values safely
    if (aValue === undefined || aValue === null) aValue = '';
    if (bValue === undefined || bValue === null) bValue = '';

    // Numeric comparison for pocketMoney, string comparison for others
    if (typeof aValue === 'number' && typeof bValue === 'number') {
      return sortConfig.direction === 'asc' ? aValue - bValue : bValue - aValue;
    } else {
      return sortConfig.direction === 'asc'
        ? aValue.toString().localeCompare(bValue.toString(), undefined, { numeric: true, sensitivity: 'base' })
        : bValue.toString().localeCompare(aValue.toString(), undefined, { numeric: true, sensitivity: 'base' });
    }
  });

  // Render sort caret indicator
  const getSortIndicator = (key) => {
    if (sortConfig.key !== key) return ' ↕';
    return sortConfig.direction === 'asc' ? ' ▲' : ' ▼';
  };

  const styles = {
    page: {
      minHeight: "100vh",
      backgroundColor: "#f8fafc",
      padding: "32px",
      fontFamily: "system-ui, -apple-system, sans-serif",
      boxSizing: "border-box",
    },
    headerFlex: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "24px",
    },
    title: {
      fontSize: "28px",
      fontWeight: "700",
      color: "#0f172a",
      letterSpacing: "-0.5px",
      margin: 0,
    },
    bulkCardForm: {
      display: "flex",
      alignItems: "center",
      gap: "12px",
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      padding: "8px 12px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    },
    fileInput: {
      fontSize: "13px",
      color: "#334155",
    },
    bulkBtn: {
      padding: "8px 14px",
      background: "#059669",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      whiteSpace: "nowrap",
    },
    bottomGrid: {
      display: "grid",
      gridTemplateColumns: "1fr 2fr",
      gap: "24px",
      alignItems: "start",
    },
    card: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      padding: "20px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      boxSizing: "border-box",
    },
    panelTitle: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#0f172a",
      marginTop: 0,
      marginBottom: "16px",
    },
    formGroupGrid: {
      display: "flex",
      flexDirection: "column",
      gap: "14px",
    },
    input: {
      width: "100%",
      padding: "12px 14px",
      border: "1px solid #e2e8f0",
      borderRadius: "10px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "border-color 0.2s",
      boxSizing: "border-box",
    },
    searchBarContainer: {
      marginBottom: "16px",
    },
    tableContainer: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "14px",
      boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
      overflow: "hidden",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
    },
    th: {
      backgroundColor: "#f1f5f9",
      color: "#334155",
      fontWeight: "600",
      padding: "14px",
      fontSize: "13px",
      borderBottom: "2px solid #e2e8f0",
      cursor: "pointer",
      userSelect: "none",
      transition: "background-color 0.2s, color 0.2s",
    },
    tr: {
      transition: "background-color 0.2s",
    },
    td: {
      padding: "14px",
      fontSize: "14px",
      color: "#0f172a",
      borderBottom: "1px solid #e2e8f0",
    },
    primaryBtn: {
      width: "100%",
      padding: "12px",
      background: "#2563eb",
      color: "#ffffff",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      marginTop: "6px",
    },
    cancelBtn: {
      width: "100%",
      padding: "10px",
      background: "#f1f5f9",
      color: "#334155",
      border: "none",
      borderRadius: "10px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      marginTop: "2px",
    },
    walletText: {
      color: "#059669",
      fontWeight: "700",
    },
    actionFlex: {
      display: "flex",
      gap: "12px",
    },
    editBtn: {
      background: "none",
      border: "none",
      color: "#2563eb",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
    },
    removeBtn: {
      background: "none",
      border: "none",
      color: "#dc2626",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
    },
    emptyState: {
      color: "#64748b",
      fontSize: "14px",
      textAlign: "center",
      padding: "32px 0",
      margin: 0,
    },
  };
  

  return (
    <div style={styles.page}>
      {topupStudent && (
  <div
    style={{
      position: "fixed",
      inset: 0,
      background: "rgba(0,0,0,0.5)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999,
    }}
  >
    <div
      style={{
        background: "#fff",
        padding: "20px",
        borderRadius: "12px",
        width: "320px",
      }}
    >
      <h3 style={{ marginBottom: "10px" }}>Recharge Wallet</h3>

      <input
        type="number"
        placeholder="Enter amount"
        value={topupAmount}
        onChange={(e) => setTopupAmount(e.target.value)}
        style={{
          width: "100%",
          padding: "10px",
          border: "1px solid #ccc",
          borderRadius: "8px",
        }}
      />

      <div style={{ display: "flex", gap: "10px", marginTop: "15px" }}>
        <button
          onClick={handleTopUp}
          style={{
            flex: 1,
            background: "#16a34a",
            color: "#fff",
            padding: "10px",
            border: "none",
            borderRadius: "8px",
          }}
        >
          Recharge
        </button>

        <button
          onClick={() => setTopupStudent(null)}
          style={{
            flex: 1,
            background: "#64748b",
            color: "#fff",
            padding: "10px",
            border: "none",
            borderRadius: "8px",
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  </div>
)}
      {/* Page Header */}
      <div style={styles.headerFlex}>
        <div>
          <h1 style={styles.title}>Student Directory Management</h1>
        </div>

        {/* Bulk Upload Block */}
        <form onSubmit={handleBulkUpload} style={styles.bulkCardForm}>
          <input 
            type="file" 
            accept=".xlsx, .xls" 
            onChange={(e) => setExcelFile(e.target.files[0])} 
            style={styles.fileInput} 
          />
          <button 
            type="submit" 
            style={styles.bulkBtn}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#047857")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#059669")}
          >
            Bulk Upload
          </button>
        </form>
      </div>

      {/* Main Bottom Operational Grid */}
      <div style={styles.bottomGrid}>
        
        {/* LEFT SIDE: CONTROL FORM CARD */}
        <div style={styles.card}>
          <h3 style={styles.panelTitle}>
            {editingId ? "Modify Student Profile" : "Register New Student"}
          </h3>
          <form onSubmit={handleSubmit} style={styles.formGroupGrid}>
            <input 
              type="text" 
              placeholder="Student Name" 
              required 
              value={formData.name} 
              onChange={e => setFormData({...formData, name: e.target.value})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            <input 
              type="text" 
              placeholder="Father's Name" 
              required 
              value={formData.fatherName} 
              onChange={e => setFormData({...formData, fatherName: e.target.value})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            <input 
              type="text" 
              placeholder="Hostel Room No." 
              required 
              value={formData.hostelNumber} 
              onChange={e => setFormData({...formData, hostelNumber: e.target.value})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            {/* <input 
              type="number" 
              placeholder="Pocket Wallet Allocation (₹)" 
              required 
              value={formData.pocketMoney} 
              onChange={e => setFormData({...formData, pocketMoney: Number(e.target.value)})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            /> */}
            <input 
              type="text" 
              placeholder="Grade / Class" 
              required 
              value={formData.grade} 
              onChange={e => setFormData({...formData, grade: e.target.value})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            <input 
              type="text" 
              placeholder="Parent Contact Number" 
              required 
              value={formData.parentPhoneNumber} 
              onChange={e => setFormData({...formData, parentPhoneNumber: e.target.value})} 
              style={styles.input}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
            
            <button 
              type="submit" 
              style={styles.primaryBtn}
              onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
              onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
            >
              {editingId ? 'Update Record' : 'Save Profile'}
            </button>

            {editingId && (
              <button
                type="button"
                style={styles.cancelBtn}
                onClick={() => {
                  setEditingId(null);
                  setFormData({ name: '', fatherName: '', hostelNumber: '', pocketMoney: 0, grade: '', parentPhoneNumber: '' });
                }}
                onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
                onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
              >
                Cancel Edit
              </button>
            )}
          </form>
        </div>

        {/* RIGHT SIDE: INTERACTIVE DIRECTORY LOOKUP & TABLE */}
        <div>
          {/* Live Dynamic Table Filter Bar */}
          <div style={styles.searchBarContainer}>
            <input 
              type="text"
              style={styles.input}
              placeholder="Quick search directory by student name or hostel room..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
            />
          </div>

          <div style={styles.tableContainer}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'name' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('name')}
                  >
                    Name{getSortIndicator('name')}
                  </th>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'fatherName' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('fatherName')}
                  >
                    Father's Name{getSortIndicator('fatherName')}
                  </th>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'hostelNumber' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('hostelNumber')}
                  >
                    Hostel No.{getSortIndicator('hostelNumber')}
                  </th>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'grade' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('grade')}
                  >
                    Grade{getSortIndicator('grade')}
                  </th>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'parentPhoneNumber' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('parentPhoneNumber')}
                  >
                    Parent Contact{getSortIndicator('parentPhoneNumber')}
                  </th>
                  <th 
                    style={{
                      ...styles.th, 
                      backgroundColor: sortConfig.key === 'pocketMoney' ? '#e2e8f0' : '#f1f5f9'
                    }} 
                    onClick={() => handleSort('pocketMoney')}
                  >
                    Wallet Balance{getSortIndicator('pocketMoney')}
                  </th>
                  <th style={{ ...styles.th, cursor: 'default' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {sortedStudents.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={styles.td}>
                      <p style={styles.emptyState}>
                        {students.length === 0 
                          ? "No active student profiles discovered in the system directory."
                          : "No profiles matched your search filtering criteria."}
                      </p>
                    </td>
                  </tr>
                ) : (
                  sortedStudents.map((st) => (
                    <tr 
                      key={st._id} 
                      style={styles.tr}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={styles.td}><strong>{st.name}</strong></td>
                      <td style={styles.td}>{st.fatherName}</td>
                      <td style={styles.td}>H-{st.hostelNumber || "N/A"}</td>
                      <td style={styles.td}>{st.grade}</td>
                      <td style={styles.td}>{st.parentPhoneNumber}</td>
                      <td style={styles.td}>
                        <span style={styles.walletText}>₹{st.pocketMoney}</span>
                      </td>
                      <td style={styles.td}>
                        <div style={styles.actionFlex}>
  
  <button 
    style={styles.editBtn} 
    onClick={() => {
      setEditingId(st._id);
     setFormData({
  name: st.name,
  fatherName: st.fatherName,
  hostelNumber: st.hostelNumber,
  grade: st.grade,
  parentPhoneNumber: st.parentPhoneNumber
});
    }}
  >
    Edit
  </button>

  <button 
    style={{ ...styles.editBtn, color: "#16a34a" }} 
    onClick={() => {
      setTopupStudent(st._id);
      setTopupAmount("");
    }}
  >
    Recharge
  </button>

  <button 
    style={styles.removeBtn} 
    onClick={() => handleDelete(st._id, st.pocketMoney)}
    // onClick={() => handleDelete(st._id)}
  >
    Remove
  </button>

</div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
};

export default Students;