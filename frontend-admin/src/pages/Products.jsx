// // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // import api from '../utils/api';

// // // // // // // const Products = () => {
// // // // // // //   const [products, setProducts] = useState([]);
// // // // // // //   const [form, setForm] = useState({ name: '', price: 0, stock: 0 });
// // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // //   useEffect(() => { fetchProducts(); }, []);
// // // // // // //   const fetchProducts = async () => { const res = await api.get('/products'); setProducts(res.data); };

// // // // // // //   const handleSave = async (e) => {
// // // // // // //     e.preventDefault();
// // // // // // //     if(editId) await api.put(`/products/${editId}`, form);
// // // // // // //     else await api.post('/products', form);
// // // // // // //     setForm({ name: '', price: 0, stock: 0 });
// // // // // // //     setEditId(null);
// // // // // // //     fetchProducts();
// // // // // // //   };

// // // // // // //   return (
// // // // // // //     <div className="space-y-6">
// // // // // // //       <h1 className="text-3xl font-bold">Store Catalog & Stock Inventory</h1>
// // // // // // //       <form onSubmit={handleSave} className="bg-white p-4 rounded shadow flex space-x-4">
// // // // // // //         <input type="text" placeholder="Product Item Name" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="border p-2 flex-1 rounded" required />
// // // // // // //         <input type="number" placeholder="Price" value={form.price} onChange={e=>setForm({...form, price: Number(e.target.value)})} className="border p-2 w-32 rounded" required />
// // // // // // //         <input type="number" placeholder="Initial Inventory Units" value={form.stock} onChange={e=>setForm({...form, stock: Number(e.target.value)})} className="border p-2 w-32 rounded" required />
// // // // // // //         <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded">{editId ? 'Modify' : 'Add Item'}</button>
// // // // // // //       </form>

// // // // // // //       <div className="bg-white rounded shadow p-4">
// // // // // // //         {products.map(p => (
// // // // // // //           <div key={p._id} className="flex justify-between p-3 border-b items-center">
// // // // // // //             <div>
// // // // // // //               <p className="font-semibold text-lg">{p.name}</p>
// // // // // // //               <p className="text-sm text-gray-500">Unit Price: ₹{p.price}</p>
// // // // // // //             </div>
// // // // // // //             <div className="flex items-center space-x-6">
// // // // // // //               <span className={`px-3 py-1 rounded text-sm ${p.stock < 5 ? 'bg-red-100 text-red-700 font-bold' : 'bg-gray-100'}`}>Stock: {p.stock} units</span>
// // // // // // //               <button onClick={() => { setEditId(p._id); setForm(p); }} className="text-blue-600">Update</button>
// // // // // // //             </div>
// // // // // // //           </div>
// // // // // // //         ))}
// // // // // // //       </div>
// // // // // // //     </div>
// // // // // // //   );
// // // // // // // };

// // // // // // // export default Products;





// // // // // // import React, { useState, useEffect } from 'react';
// // // // // // import api from '../utils/api';

// // // // // // const Products = () => {
// // // // // //   const [products, setProducts] = useState([]);
// // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // //   const [form, setForm] = useState({ 
// // // // // //     name: '', 
// // // // // //     price: 0, 
// // // // // //     stock: 0 
// // // // // //   });
// // // // // //   const [editId, setEditId] = useState(null);

// // // // // //   useEffect(() => { 
// // // // // //     fetchProducts(); 
// // // // // //   }, []);

// // // // // //   const fetchProducts = async () => {
// // // // // //     try {
// // // // // //       const res = await api.get('/products');
// // // // // //       setProducts(res.data);
// // // // // //     } catch (error) {
// // // // // //       console.error(error);
// // // // // //       alert('Failed to fetch product catalog');
// // // // // //     }
// // // // // //   };

// // // // // //   const handleSave = async (e) => {
// // // // // //     e.preventDefault();
// // // // // //     try {
// // // // // //       if (editId) {
// // // // // //         await api.put(`/products/${editId}`, form);
// // // // // //         alert('Product inventory updated successfully!');
// // // // // //       } else {
// // // // // //         await api.post('/products', form);
// // // // // //         alert('Product item registered successfully!');
// // // // // //       }
// // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // //       setEditId(null);
// // // // // //       fetchProducts();
// // // // // //     } catch (error) {
// // // // // //       console.error(error);
// // // // // //       alert('Failed to save product information');
// // // // // //     }
// // // // // //   };

// // // // // //   const handleDelete = async (id) => {
// // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // //       try {
// // // // // //         await api.delete(`/products/${id}`);
// // // // // //         fetchProducts();
// // // // // //       } catch (error) {
// // // // // //         console.error(error);
// // // // // //         alert('Failed to delete product item');
// // // // // //       }
// // // // // //     }
// // // // // //   };

// // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // //   const filteredProducts = products.filter(p => {
// // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // //     if (!query) return true;
// // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // //   });

// // // // // //   const styles = {
// // // // // //     page: {
// // // // // //       minHeight: "100vh",
// // // // // //       backgroundColor: "#f8fafc",
// // // // // //       padding: "32px",
// // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // //       boxSizing: "border-box",
// // // // // //     },
// // // // // //     headerFlex: {
// // // // // //       display: "flex",
// // // // // //       justifyContent: "space-between",
// // // // // //       alignItems: "center",
// // // // // //       marginBottom: "24px",
// // // // // //     },
// // // // // //     title: {
// // // // // //       fontSize: "28px",
// // // // // //       fontWeight: "700",
// // // // // //       color: "#0f172a",
// // // // // //       letterSpacing: "-0.5px",
// // // // // //       margin: 0,
// // // // // //     },
// // // // // //     subtitle: {
// // // // // //       fontSize: "14px",
// // // // // //       color: "#64748b",
// // // // // //       marginTop: "4px",
// // // // // //       marginBottom: 0,
// // // // // //     },
// // // // // //     bottomGrid: {
// // // // // //       display: "grid",
// // // // // //       gridTemplateColumns: "1fr 2fr",
// // // // // //       gap: "24px",
// // // // // //       alignItems: "start",
// // // // // //     },
// // // // // //     card: {
// // // // // //       background: "#ffffff",
// // // // // //       border: "1px solid #e2e8f0",
// // // // // //       borderRadius: "14px",
// // // // // //       padding: "20px",
// // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // //       boxSizing: "border-box",
// // // // // //     },
// // // // // //     panelTitle: {
// // // // // //       fontSize: "16px",
// // // // // //       fontWeight: "600",
// // // // // //       color: "#0f172a",
// // // // // //       marginTop: 0,
// // // // // //       marginBottom: "16px",
// // // // // //     },
// // // // // //     formGroupGrid: {
// // // // // //       display: "flex",
// // // // // //       flexDirection: "column",
// // // // // //       gap: "14px",
// // // // // //     },
// // // // // //     input: {
// // // // // //       width: "100%",
// // // // // //       padding: "12px 14px",
// // // // // //       border: "1px solid #e2e8f0",
// // // // // //       borderRadius: "10px",
// // // // // //       fontSize: "14px",
// // // // // //       color: "#0f172a",
// // // // // //       backgroundColor: "#ffffff",
// // // // // //       outline: "none",
// // // // // //       transition: "border-color 0.2s",
// // // // // //       boxSizing: "border-box",
// // // // // //     },
// // // // // //     searchBarContainer: {
// // // // // //       marginBottom: "16px",
// // // // // //     },
// // // // // //     tableContainer: {
// // // // // //       background: "#ffffff",
// // // // // //       border: "1px solid #e2e8f0",
// // // // // //       borderRadius: "14px",
// // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // //       overflow: "hidden",
// // // // // //     },
// // // // // //     table: {
// // // // // //       width: "100%",
// // // // // //       borderCollapse: "collapse",
// // // // // //       textAlign: "left",
// // // // // //     },
// // // // // //     th: {
// // // // // //       backgroundColor: "#f1f5f9",
// // // // // //       color: "#334155",
// // // // // //       fontWeight: "600",
// // // // // //       padding: "14px",
// // // // // //       fontSize: "13px",
// // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // //     },
// // // // // //     tr: {
// // // // // //       transition: "background-color 0.2s",
// // // // // //     },
// // // // // //     td: {
// // // // // //       padding: "14px",
// // // // // //       fontSize: "14px",
// // // // // //       color: "#0f172a",
// // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // //     },
// // // // // //     primaryBtn: {
// // // // // //       width: "100%",
// // // // // //       padding: "12px",
// // // // // //       background: "#2563eb",
// // // // // //       color: "#ffffff",
// // // // // //       border: "none",
// // // // // //       borderRadius: "10px",
// // // // // //       fontWeight: "600",
// // // // // //       fontSize: "14px",
// // // // // //       cursor: "pointer",
// // // // // //       transition: "background-color 0.2s",
// // // // // //       marginTop: "6px",
// // // // // //     },
// // // // // //     cancelBtn: {
// // // // // //       width: "100%",
// // // // // //       padding: "10px",
// // // // // //       background: "#f1f5f9",
// // // // // //       color: "#334155",
// // // // // //       border: "none",
// // // // // //       borderRadius: "10px",
// // // // // //       fontWeight: "600",
// // // // // //       fontSize: "13px",
// // // // // //       cursor: "pointer",
// // // // // //       transition: "background-color 0.2s",
// // // // // //       marginTop: "2px",
// // // // // //     },
// // // // // //     stockTextNormal: {
// // // // // //       backgroundColor: "#f1f5f9",
// // // // // //       color: "#334155",
// // // // // //       padding: "4px 10px",
// // // // // //       borderRadius: "8px",
// // // // // //       fontSize: "13px",
// // // // // //       fontWeight: "600",
// // // // // //     },
// // // // // //     stockTextAlert: {
// // // // // //       backgroundColor: "#fee2e2",
// // // // // //       color: "#dc2626",
// // // // // //       padding: "4px 10px",
// // // // // //       borderRadius: "8px",
// // // // // //       fontSize: "13px",
// // // // // //       fontWeight: "700",
// // // // // //     },
// // // // // //     currencyText: {
// // // // // //       color: "#0f172a",
// // // // // //       fontWeight: "600",
// // // // // //     },
// // // // // //     actionFlex: {
// // // // // //       display: "flex",
// // // // // //       gap: "12px",
// // // // // //     },
// // // // // //     editBtn: {
// // // // // //       background: "none",
// // // // // //       border: "none",
// // // // // //       color: "#2563eb",
// // // // // //       fontWeight: "600",
// // // // // //       fontSize: "13px",
// // // // // //       cursor: "pointer",
// // // // // //       padding: 0,
// // // // // //     },
// // // // // //     removeBtn: {
// // // // // //       background: "none",
// // // // // //       border: "none",
// // // // // //       color: "#dc2626",
// // // // // //       fontWeight: "600",
// // // // // //       fontSize: "13px",
// // // // // //       cursor: "pointer",
// // // // // //       padding: 0,
// // // // // //     },
// // // // // //     emptyState: {
// // // // // //       color: "#64748b",
// // // // // //       fontSize: "14px",
// // // // // //       textAlign: "center",
// // // // // //       padding: "32px 0",
// // // // // //       margin: 0,
// // // // // //     },
// // // // // //   };

// // // // // //   return (
// // // // // //     <div style={styles.page}>
// // // // // //       {/* Page Header */}
// // // // // //       <div style={styles.headerFlex}>
// // // // // //         <div>
// // // // // //           <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // //           <p style={styles.subtitle}>
// // // // // //             Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // //           </p>
// // // // // //         </div>
// // // // // //       </div>

// // // // // //       {/* Main Bottom Operational Grid */}
// // // // // //       <div style={styles.bottomGrid}>
        
// // // // // //         {/* LEFT SIDE: CONTROL FORM CARD */}
// // // // // //         <div style={styles.card}>
// // // // // //           <h3 style={styles.panelTitle}>
// // // // // //             {editId ? "Modify Product Parameters" : "Register Catalog Item"}
// // // // // //           </h3>
// // // // // //           <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // // // //             <input 
// // // // // //               type="text" 
// // // // // //               placeholder="Product Item Name" 
// // // // // //               required 
// // // // // //               value={form.name} 
// // // // // //               onChange={e => setForm({...form, name: e.target.value})} 
// // // // // //               style={styles.input}
// // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // //             />
// // // // // //             <input 
// // // // // //               type="number" 
// // // // // //               placeholder="Unit Price (₹)" 
// // // // // //               required 
// // // // // //               value={form.price || ''} 
// // // // // //               onChange={e => setForm({...form, price: Number(e.target.value)})} 
// // // // // //               style={styles.input}
// // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // //             />
// // // // // //             <input 
// // // // // //               type="number" 
// // // // // //               placeholder="Initial Inventory Units" 
// // // // // //               required 
// // // // // //               value={form.stock || ''} 
// // // // // //               onChange={e => setForm({...form, stock: Number(e.target.value)})} 
// // // // // //               style={styles.input}
// // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // //             />
            
// // // // // //             <button 
// // // // // //               type="submit" 
// // // // // //               style={styles.primaryBtn}
// // // // // //               onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
// // // // // //               onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
// // // // // //             >
// // // // // //               {editId ? 'Update Parameters' : 'Save Item'}
// // // // // //             </button>

// // // // // //             {editId && (
// // // // // //               <button
// // // // // //                 type="button"
// // // // // //                 style={styles.cancelBtn}
// // // // // //                 onClick={() => {
// // // // // //                   setEditId(null);
// // // // // //                   setForm({ name: '', price: 0, stock: 0 });
// // // // // //                 }}
// // // // // //                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
// // // // // //                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
// // // // // //               >
// // // // // //                 Cancel Edit
// // // // // //               </button>
// // // // // //             )}
// // // // // //           </form>
// // // // // //         </div>

// // // // // //         {/* RIGHT SIDE: INTERACTIVE INVENTORY LOOKUP & TABLE */}
// // // // // //         <div>
// // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // //           <div style={styles.searchBarContainer}>
// // // // // //             <input 
// // // // // //               type="text"
// // // // // //               style={styles.input}
// // // // // //               placeholder="Quick search catalog by item name..."
// // // // // //               value={searchQuery}
// // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // //             />
// // // // // //           </div>

// // // // // //           <div style={styles.tableContainer}>
// // // // // //             <table style={styles.table}>
// // // // // //               <thead>
// // // // // //                 <tr>
// // // // // //                   <th style={styles.th}>Product Item Profile</th>
// // // // // //                   <th style={styles.th}>Master Unit Price</th>
// // // // // //                   <th style={styles.th}>Stock Allocation</th>
// // // // // //                   <th style={styles.th}>Actions</th>
// // // // // //                 </tr>
// // // // // //               </thead>
// // // // // //               <tbody>
// // // // // //                 {filteredProducts.length === 0 ? (
// // // // // //                   <tr>
// // // // // //                     <td colSpan="4" style={styles.td}>
// // // // // //                       <p style={styles.emptyState}>
// // // // // //                         {products.length === 0 
// // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // //                           : "No items matched your search filtering criteria."}
// // // // // //                       </p>
// // // // // //                     </td>
// // // // // //                   </tr>
// // // // // //                 ) : (
// // // // // //                   filteredProducts.map((p) => (
// // // // // //                     <tr 
// // // // // //                       key={p._id} 
// // // // // //                       style={styles.tr}
// // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // //                     >
// // // // // //                       <td style={styles.td}>
// // // // // //                         <strong>{p.name}</strong>
// // // // // //                       </td>
// // // // // //                       <td style={styles.td}>
// // // // // //                         <span style={styles.currencyText}>₹{p.price}</span>
// // // // // //                       </td>
// // // // // //                       <td style={styles.td}>
// // // // // //                         <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // //                           {p.stock} units
// // // // // //                         </span>
// // // // // //                       </td>
// // // // // //                       <td style={styles.td}>
// // // // // //                         <div style={styles.actionFlex}>
// // // // // //                           <button 
// // // // // //                             style={styles.editBtn} 
// // // // // //                             onClick={() => { setEditId(p._id); setForm(p); }}
// // // // // //                           >
// // // // // //                             Edit
// // // // // //                           </button>
// // // // // //                           <button 
// // // // // //                             style={styles.removeBtn} 
// // // // // //                             onClick={() => handleDelete(p._id)}
// // // // // //                           >
// // // // // //                             Remove
// // // // // //                           </button>
// // // // // //                         </div>
// // // // // //                       </td>
// // // // // //                     </tr>
// // // // // //                   ))
// // // // // //                 )}
// // // // // //               </tbody>
// // // // // //             </table>
// // // // // //           </div>
// // // // // //         </div>

// // // // // //       </div>
// // // // // //     </div>
// // // // // //   );
// // // // // // };

// // // // // // export default Products;




// // // // // import React, { useState } from 'react';
// // // // // import api from '../utils/api';

// // // // // const Products = () => {
// // // // //   const [form, setForm] = useState({ 
// // // // //     name: '', 
// // // // //     price: 0, 
// // // // //     stock: 0 
// // // // //   });
// // // // //   const [loading, setLoading] = useState(false);

// // // // //   const handleSave = async (e) => {
// // // // //     e.preventDefault();
// // // // //     setLoading(true);
// // // // //     try {
// // // // //       await api.post('/products', form);
// // // // //       alert('Product item registered successfully!');
// // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to save product information');
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const styles = {
// // // // //     page: {
// // // // //       minHeight: "100vh",
// // // // //       backgroundColor: "#f8fafc",
// // // // //       padding: "32px",
// // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // //       boxSizing: "border-box",
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       alignItems: "center",
// // // // //     },
// // // // //     container: {
// // // // //       width: "100%",
// // // // //       maxWidth: "480px",
// // // // //     },
// // // // //     headerBlock: {
// // // // //       textAlign: "center",
// // // // //       marginBottom: "28px",
// // // // //     },
// // // // //     title: {
// // // // //       fontSize: "28px",
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a",
// // // // //       letterSpacing: "-0.5px",
// // // // //       margin: 0,
// // // // //     },
// // // // //     subtitle: {
// // // // //       fontSize: "14px",
// // // // //       color: "#64748b",
// // // // //       marginTop: "6px",
// // // // //       marginBottom: 0,
// // // // //       lineHeight: "1.5",
// // // // //     },
// // // // //     card: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       padding: "24px",
// // // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     panelTitle: {
// // // // //       fontSize: "16px",
// // // // //       fontWeight: "600",
// // // // //       color: "#0f172a",
// // // // //       marginTop: 0,
// // // // //       marginBottom: "18px",
// // // // //     },
// // // // //     formGroupGrid: {
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       gap: "14px",
// // // // //     },
// // // // //     input: {
// // // // //       width: "100%",
// // // // //       padding: "12px 14px",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s, box-shadow 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     primaryBtn: {
// // // // //       width: "100%",
// // // // //       padding: "12px",
// // // // //       background: "#2563eb",
// // // // //       color: "#ffffff",
// // // // //       border: "none",
// // // // //       borderRadius: "10px",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "14px",
// // // // //       cursor: "pointer",
// // // // //       transition: "background-color 0.2s",
// // // // //       marginTop: "6px",
// // // // //     },
// // // // //   };

// // // // //   return (
// // // // //     <div style={styles.page}>
// // // // //       <div style={styles.container}>
// // // // //         {/* Page Header */}
// // // // //         <div style={styles.headerBlock}>
// // // // //           <h1 style={styles.title}>Store Catalog Entry</h1>
// // // // //           <p style={styles.subtitle}>
// // // // //             Register internal master pricing schedules, global metrics, and initialize system stock thresholds
// // // // //           </p>
// // // // //         </div>
        
// // // // //         {/* CONTROL FORM CARD */}
// // // // //         <div style={styles.card}>
// // // // //           <h3 style={styles.panelTitle}>Register Catalog Item</h3>
// // // // //           <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // // //             <input 
// // // // //               type="text" 
// // // // //               placeholder="Product Item Name" 
// // // // //               required 
// // // // //               value={form.name} 
// // // // //               onChange={e => setForm({...form, name: e.target.value})} 
// // // // //               style={styles.input}
// // // // //               onFocus={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#2563eb";
// // // // //                 e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //               }}
// // // // //               onBlur={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                 e.currentTarget.style.boxShadow = "none";
// // // // //               }}
// // // // //             />
// // // // //             <input 
// // // // //               type="number" 
// // // // //               placeholder="Unit Price (₹)" 
// // // // //               required 
// // // // //               value={form.price || ''} 
// // // // //               onChange={e => setForm({...form, price: Number(e.target.value)})} 
// // // // //               style={styles.input}
// // // // //               onFocus={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#2563eb";
// // // // //                 e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //               }}
// // // // //               onBlur={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                 e.currentTarget.style.boxShadow = "none";
// // // // //               }}
// // // // //             />
// // // // //             <input 
// // // // //               type="number" 
// // // // //               placeholder="Initial Inventory Units" 
// // // // //               required 
// // // // //               value={form.stock || ''} 
// // // // //               onChange={e => setForm({...form, stock: Number(e.target.value)})} 
// // // // //               style={styles.input}
// // // // //               onFocus={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#2563eb";
// // // // //                 e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //               }}
// // // // //               onBlur={(e) => {
// // // // //                 e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                 e.currentTarget.style.boxShadow = "none";
// // // // //               }}
// // // // //             />
            
// // // // //             <button 
// // // // //               type="submit" 
// // // // //               disabled={loading}
// // // // //               style={{
// // // // //                 ...styles.primaryBtn,
// // // // //                 backgroundColor: loading ? "#93c5fd" : "#2563eb",
// // // // //                 cursor: loading ? "not-allowed" : "pointer"
// // // // //               }}
// // // // //               onMouseOver={(e) => {
// // // // //                 if (!loading) e.currentTarget.style.backgroundColor = "#1d4ed8";
// // // // //               }}
// // // // //               onMouseOut={(e) => {
// // // // //                 if (!loading) e.currentTarget.style.backgroundColor = "#2563eb";
// // // // //               }}
// // // // //             >
// // // // //               {loading ? 'Saving Profile...' : 'Save Catalog Item'}
// // // // //             </button>
// // // // //           </form>
// // // // //         </div>
// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default Products;




// // // // // import React, { useState, useEffect } from 'react';
// // // // // import api from '../utils/api';

// // // // // const Products = () => {
// // // // //   const [products, setProducts] = useState([]);
// // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // //   const [form, setForm] = useState({ 
// // // // //     name: '', 
// // // // //     price: 0, 
// // // // //     stock: 0 
// // // // //   });
// // // // //   const [loading, setLoading] = useState(false);

// // // // //   useEffect(() => { 
// // // // //     fetchProducts(); 
// // // // //   }, []);

// // // // //   const fetchProducts = async () => {
// // // // //     try {
// // // // //       const res = await api.get('/products');
// // // // //       setProducts(res.data);
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to fetch product catalog');
// // // // //     }
// // // // //   };

// // // // //   const handleSave = async (e) => {
// // // // //     e.preventDefault();
// // // // //     setLoading(true);
// // // // //     try {
// // // // //       await api.post('/products', form);
// // // // //       alert('Product item registered successfully!');
// // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // //       fetchProducts();
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to save product information');
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const handleDelete = async (id) => {
// // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // //       try {
// // // // //         await api.delete(`/products/${id}`);
// // // // //         fetchProducts();
// // // // //       } catch (error) {
// // // // //         console.error(error);
// // // // //         alert('Failed to delete product item');
// // // // //       }
// // // // //     }
// // // // //   };

// // // // //   // Check matched items matching the search paradigm
// // // // //   const filteredProducts = products.filter(p => {
// // // // //     const query = searchQuery.toLowerCase().trim();
// // // // //     if (!query) return false; // Don't filter/show table if search bar is empty
// // // // //     return p.name?.toLowerCase().includes(query);
// // // // //   });

// // // // //   // Toggle flag: show table view only if there is a query AND matches exist
// // // // //   const isProductAvailable = searchQuery.trim() !== "" && filteredProducts.length > 0;

// // // // //   const styles = {
// // // // //     page: {
// // // // //       minHeight: "100vh",
// // // // //       backgroundColor: "#f8fafc",
// // // // //       padding: "32px",
// // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // //       boxSizing: "border-box",
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       alignItems: "center",
// // // // //     },
// // // // //     container: {
// // // // //       width: "100%",
// // // // //       maxWidth: "540px",
// // // // //     },
// // // // //     headerBlock: {
// // // // //       textAlign: "center",
// // // // //       marginBottom: "24px",
// // // // //     },
// // // // //     title: {
// // // // //       fontSize: "28px",
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a",
// // // // //       letterSpacing: "-0.5px",
// // // // //       margin: 0,
// // // // //     },
// // // // //     subtitle: {
// // // // //       fontSize: "14px",
// // // // //       color: "#64748b",
// // // // //       marginTop: "6px",
// // // // //       marginBottom: 0,
// // // // //       lineHeight: "1.5",
// // // // //     },
// // // // //     searchBarContainer: {
// // // // //       width: "100%",
// // // // //       marginBottom: "24px",
// // // // //     },
// // // // //     card: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       padding: "24px",
// // // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     panelTitle: {
// // // // //       fontSize: "16px",
// // // // //       fontWeight: "600",
// // // // //       color: "#0f172a",
// // // // //       marginTop: 0,
// // // // //       marginBottom: "18px",
// // // // //     },
// // // // //     formGroupGrid: {
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       gap: "14px",
// // // // //     },
// // // // //     input: {
// // // // //       width: "100%",
// // // // //       padding: "12px 14px",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s, box-shadow 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     primaryBtn: {
// // // // //       width: "100%",
// // // // //       padding: "12px",
// // // // //       background: "#2563eb",
// // // // //       color: "#ffffff",
// // // // //       border: "none",
// // // // //       borderRadius: "10px",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "14px",
// // // // //       cursor: "pointer",
// // // // //       transition: "background-color 0.2s",
// // // // //       marginTop: "6px",
// // // // //     },
// // // // //     tableContainer: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
// // // // //       overflow: "hidden",
// // // // //       width: "100%",
// // // // //     },
// // // // //     table: {
// // // // //       width: "100%",
// // // // //       borderCollapse: "collapse",
// // // // //       textAlign: "left",
// // // // //     },
// // // // //     th: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       fontWeight: "600",
// // // // //       padding: "14px",
// // // // //       fontSize: "13px",
// // // // //       borderBottom: "2px solid #e2e8f0",
// // // // //     },
// // // // //     tr: {
// // // // //       transition: "background-color 0.2s",
// // // // //     },
// // // // //     td: {
// // // // //       padding: "14px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       borderBottom: "1px solid #e2e8f0",
// // // // //     },
// // // // //     stockTextNormal: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "13px",
// // // // //       fontWeight: "600",
// // // // //     },
// // // // //     stockTextAlert: {
// // // // //       backgroundColor: "#fee2e2",
// // // // //       color: "#dc2626",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "13px",
// // // // //       fontWeight: "700",
// // // // //     },
// // // // //     currencyText: {
// // // // //       color: "#0f172a",
// // // // //       fontWeight: "600",
// // // // //     },
// // // // //     actionFlex: {
// // // // //       display: "flex",
// // // // //       gap: "12px",
// // // // //     },
// // // // //     removeBtn: {
// // // // //       background: "none",
// // // // //       border: "none",
// // // // //       color: "#dc2626",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "13px",
// // // // //       cursor: "pointer",
// // // // //       padding: 0,
// // // // //     },
// // // // //     alertBanner: {
// // // // //       backgroundColor: "#f0fdf4",
// // // // //       border: "1px solid #bbf7d0",
// // // // //       color: "#166534",
// // // // //       padding: "12px 14px",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       fontWeight: "500",
// // // // //       marginBottom: "16px",
// // // // //       textAlign: "center"
// // // // //     }
// // // // //   };

// // // // //   return (
// // // // //     <div style={styles.page}>
// // // // //       <div style={styles.container}>
        
// // // // //         {/* Page Header */}
// // // // //         <div style={styles.headerBlock}>
// // // // //           <h1 style={styles.title}>Add Products to Catalog </h1>
// // // // //           {/* <p style={styles.subtitle}>
// // // // //             Verify inventory parameters via real-time tracking bar or initialize brand new system stock records
// // // // //           </p> */}
// // // // //         </div>

// // // // //         {/* Global Verification Search Bar */}
// // // // //         <div style={styles.searchBarContainer}>
// // // // //           <input 
// // // // //             type="text"
// // // // //             style={styles.input}
// // // // //             placeholder="Type item name to verify availability status..."
// // // // //             value={searchQuery}
// // // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // // //             onFocus={(e) => {
// // // // //               e.currentTarget.style.borderColor = "#2563eb";
// // // // //               e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //             }}
// // // // //             onBlur={(e) => {
// // // // //               e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //               e.currentTarget.style.boxShadow = "none";
// // // // //             }}
// // // // //           />
// // // // //         </div>

// // // // //         {/* CONDITIONAL INTERACTIVE VIEW */}
// // // // //         {isProductAvailable ? (
// // // // //           /* SHOW PRODUCTS TABLE (Hides Registration Form) */
// // // // //           <div>
// // // // //             <div style={styles.alertBanner}>
// // // // //               ✓ Product records matching "{searchQuery}" are available in the system.
// // // // //             </div>
// // // // //             <div style={styles.tableContainer}>
// // // // //               <table style={styles.table}>
// // // // //                 <thead>
// // // // //                   <tr>
// // // // //                     <th style={styles.th}>Product Item Name</th>
// // // // //                     <th style={styles.th}>Unit Price</th>
// // // // //                     <th style={styles.th}>Current Stock</th>
// // // // //                     <th style={styles.th}>Action</th>
// // // // //                   </tr>
// // // // //                 </thead>
// // // // //                 <tbody>
// // // // //                   {filteredProducts.map((p) => (
// // // // //                     <tr 
// // // // //                       key={p._id} 
// // // // //                       style={styles.tr}
// // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // //                     >
// // // // //                       <td style={styles.td}>
// // // // //                         <strong>{p.name}</strong>
// // // // //                       </td>
// // // // //                       <td style={styles.td}>
// // // // //                         <span style={styles.currencyText}>₹{p.price}</span>
// // // // //                       </td>
// // // // //                       <td style={styles.td}>
// // // // //                         <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // //                           {p.stock} units
// // // // //                         </span>
// // // // //                       </td>
// // // // //                       <td style={styles.td}>
// // // // //                         <div style={styles.actionFlex}>
// // // // //                           <button 
// // // // //                             style={styles.removeBtn} 
// // // // //                             onClick={() => handleDelete(p._id)}
// // // // //                           >
// // // // //                             Remove
// // // // //                           </button>
// // // // //                         </div>
// // // // //                       </td>
// // // // //                     </tr>
// // // // //                   ))}
// // // // //                 </tbody>
// // // // //               </table>
// // // // //             </div>
// // // // //           </div>
// // // // //         ) : (
// // // // //           /* REGISTER CATALOG ITEM CARD (Shows when no match or search input is empty) */
// // // // //           <div style={styles.card}>
// // // // //             <h3 style={styles.panelTitle}>
// // // // //               {searchQuery.trim() !== "" 
// // // // //                 ? `"${searchQuery}" Not Found — Register As New Item` 
// // // // //                 : "Add Product Details"
// // // // //               }
// // // // //             </h3>
// // // // //             <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // // //               <input 
// // // // //                 type="text" 
// // // // //                 placeholder="Product Item Name" 
// // // // //                 required 
// // // // //                 value={form.name} 
// // // // //                 onChange={e => setForm({...form, name: e.target.value})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               />
// // // // //               <input 
// // // // //                 type="number" 
// // // // //                 placeholder="Unit Price (₹)" 
// // // // //                 required 
// // // // //                 value={form.price || ''} 
// // // // //                 onChange={e => setForm({...form, price: Number(e.target.value)})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               />
// // // // //               <input 
// // // // //                 type="number" 
// // // // //                 placeholder="Initial Inventory Units" 
// // // // //                 required 
// // // // //                 value={form.stock || ''} 
// // // // //                 onChange={e => setForm({...form, stock: Number(e.target.value)})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               />
              
// // // // //               <button 
// // // // //                 type="submit" 
// // // // //                 disabled={loading}
// // // // //                 style={{
// // // // //                   ...styles.primaryBtn,
// // // // //                   backgroundColor: loading ? "#93c5fd" : "#2563eb",
// // // // //                   cursor: loading ? "not-allowed" : "pointer"
// // // // //                 }}
// // // // //                 onMouseOver={(e) => {
// // // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#1d4ed8";
// // // // //                 }}
// // // // //                 onMouseOut={(e) => {
// // // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#2563eb";
// // // // //                 }}
// // // // //               >
// // // // //                 {loading ? 'Saving Profile...' : 'Save Catalog Item'}
// // // // //               </button>
// // // // //             </form>
// // // // //           </div>
// // // // //         )}

// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default Products;




// // // // // 18-06-2026





// // // // // import React, { useState, useEffect } from 'react';
// // // // // import api from '../utils/api';

// // // // // const Products = () => {
// // // // //   const [products, setProducts] = useState([]);
// // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // //   const [form, setForm] = useState({ 
// // // // //     name: '' 
   
// // // // //   });
// // // // //   const [loading, setLoading] = useState(false);

// // // // //   useEffect(() => { 
// // // // //     fetchProducts(); 
// // // // //   }, []);

// // // // //   const fetchProducts = async () => {
// // // // //     try {
// // // // //       const res = await api.get('/products');
// // // // //       setProducts(res.data);
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to fetch product catalog');
// // // // //     }
// // // // //   };

// // // // //   const handleSave = async (e) => {
// // // // //     e.preventDefault();
// // // // //     setLoading(true);
// // // // //     try {
// // // // //       await api.post('/products', form);
// // // // //       alert('Product item registered successfully!');
// // // // //       setForm({ name: '' });
// // // // //       fetchProducts();
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to save product information');
// // // // //     } finally {
// // // // //       setLoading(false);
// // // // //     }
// // // // //   };

// // // // //   const handleDelete = async (id) => {
// // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // //       try {
// // // // //         await api.delete(`/products/${id}`);
// // // // //         fetchProducts();
// // // // //       } catch (error) {
// // // // //         console.error(error);
// // // // //         alert('Failed to delete product item');
// // // // //       }
// // // // //     }
// // // // //   };

// // // // //   // Check matched items matching the search paradigm
// // // // //   const filteredProducts = products.filter(p => {
// // // // //     const query = searchQuery.toLowerCase().trim();
// // // // //     if (!query) return false; // Don't filter/show table if search bar is empty
// // // // //     return p.name?.toLowerCase().includes(query);
// // // // //   });

// // // // //   // Toggle flag: show table view only if there is a query AND matches exist
// // // // //   const isProductAvailable = searchQuery.trim() !== "" && filteredProducts.length > 0;

// // // // //   const styles = {
// // // // //     page: {
// // // // //       minHeight: "100vh",
// // // // //       backgroundColor: "#f8fafc",
// // // // //       padding: "32px",
// // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // //       boxSizing: "border-box",
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       alignItems: "center",
// // // // //     },
// // // // //     container: {
// // // // //       width: "100%",
// // // // //       maxWidth: "540px",
// // // // //     },
// // // // //     headerBlock: {
// // // // //       textAlign: "center",
// // // // //       marginBottom: "24px",
// // // // //     },
// // // // //     title: {
// // // // //       fontSize: "28px",
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a",
// // // // //       letterSpacing: "-0.5px",
// // // // //       margin: 0,
// // // // //     },
// // // // //     subtitle: {
// // // // //       fontSize: "14px",
// // // // //       color: "#64748b",
// // // // //       marginTop: "6px",
// // // // //       marginBottom: 0,
// // // // //       lineHeight: "1.5",
// // // // //     },
// // // // //     searchBarContainer: {
// // // // //       width: "100%",
// // // // //       marginBottom: "24px",
// // // // //     },
// // // // //     card: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       padding: "24px",
// // // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     panelTitle: {
// // // // //       fontSize: "16px",
// // // // //       fontWeight: "600",
// // // // //       color: "#0f172a",
// // // // //       marginTop: 0,
// // // // //       marginBottom: "18px",
// // // // //     },
// // // // //     formGroupGrid: {
// // // // //       display: "flex",
// // // // //       flexDirection: "column",
// // // // //       gap: "14px",
// // // // //     },
// // // // //     input: {
// // // // //       width: "100%",
// // // // //       padding: "12px 14px",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s, box-shadow 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     primaryBtn: {
// // // // //       width: "100%",
// // // // //       padding: "12px",
// // // // //       background: "#2563eb",
// // // // //       color: "#ffffff",
// // // // //       border: "none",
// // // // //       borderRadius: "10px",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "14px",
// // // // //       cursor: "pointer",
// // // // //       transition: "background-color 0.2s",
// // // // //       marginTop: "6px",
// // // // //     },
// // // // //     tableContainer: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
// // // // //       overflow: "hidden",
// // // // //       width: "100%",
// // // // //     },
// // // // //     table: {
// // // // //       width: "100%",
// // // // //       borderCollapse: "collapse",
// // // // //       textAlign: "left",
// // // // //     },
// // // // //     th: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       fontWeight: "600",
// // // // //       padding: "14px",
// // // // //       fontSize: "13px",
// // // // //       borderBottom: "2px solid #e2e8f0",
// // // // //     },
// // // // //     tr: {
// // // // //       transition: "background-color 0.2s",
// // // // //     },
// // // // //     td: {
// // // // //       padding: "14px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       borderBottom: "1px solid #e2e8f0",
// // // // //     },
// // // // //     stockTextNormal: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "13px",
// // // // //       fontWeight: "600",
// // // // //     },
// // // // //     stockTextAlert: {
// // // // //       backgroundColor: "#fee2e2",
// // // // //       color: "#dc2626",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "13px",
// // // // //       fontWeight: "700",
// // // // //     },
// // // // //     currencyText: {
// // // // //       color: "#0f172a",
// // // // //       fontWeight: "600",
// // // // //     },
// // // // //     actionFlex: {
// // // // //       display: "flex",
// // // // //       gap: "12px",
// // // // //     },
// // // // //     removeBtn: {
// // // // //       background: "none",
// // // // //       border: "none",
// // // // //       color: "#dc2626",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "13px",
// // // // //       cursor: "pointer",
// // // // //       padding: 0,
// // // // //     },
// // // // //     alertBanner: {
// // // // //       backgroundColor: "#f0fdf4",
// // // // //       border: "1px solid #bbf7d0",
// // // // //       color: "#166534",
// // // // //       padding: "12px 14px",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       fontWeight: "500",
// // // // //       marginBottom: "16px",
// // // // //       textAlign: "center"
// // // // //     }
// // // // //   };

// // // // //   return (
// // // // //     <div style={styles.page}>
// // // // //       <div style={styles.container}>
        
// // // // //         {/* Page Header */}
// // // // //         <div style={styles.headerBlock}>
// // // // //           <h1 style={styles.title}>Add Products to Catalog </h1>
// // // // //           {/* <p style={styles.subtitle}>
// // // // //             Verify inventory parameters via real-time tracking bar or initialize brand new system stock records
// // // // //           </p> */}
// // // // //         </div>

// // // // //         {/* Global Verification Search Bar */}
// // // // //         <div style={styles.searchBarContainer}>
// // // // //           <input 
// // // // //             type="text"
// // // // //             style={styles.input}
// // // // //             placeholder="Type item name to verify availability status..."
// // // // //             value={searchQuery}
// // // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // // //             onFocus={(e) => {
// // // // //               e.currentTarget.style.borderColor = "#2563eb";
// // // // //               e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //             }}
// // // // //             onBlur={(e) => {
// // // // //               e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //               e.currentTarget.style.boxShadow = "none";
// // // // //             }}
// // // // //           />
// // // // //         </div>

// // // // //         {/* CONDITIONAL INTERACTIVE VIEW */}
// // // // //         {isProductAvailable ? (
// // // // //           /* SHOW PRODUCTS TABLE (Hides Registration Form) */
// // // // //           <div>
// // // // //             <div style={styles.alertBanner}>
// // // // //               ✓ Product records matching "{searchQuery}" are available in the system.
// // // // //             </div>
// // // // //             <div style={styles.tableContainer}>
// // // // //               <table style={styles.table}>
// // // // //                 <thead>
// // // // //   <tr>
// // // // //     <th style={styles.th}>Product Name</th>
// // // // //     <th style={styles.th}>Action</th>
// // // // //   </tr>
// // // // // </thead>
// // // // //                 <tbody>
// // // // //                   {filteredProducts.map((p) => (
// // // // //                     <tr key={p._id}>
// // // // //   <td style={styles.td}>
// // // // //     <strong>{p.name}</strong>
// // // // //   </td>

// // // // //   <td style={styles.td}>
// // // // //     <div style={styles.actionFlex}>
// // // // //       <button
// // // // //         style={styles.removeBtn}
// // // // //         onClick={() => handleDelete(p._id)}
// // // // //       >
// // // // //         Remove
// // // // //       </button>
// // // // //     </div>
// // // // //   </td>
// // // // // </tr>
// // // // //                   ))}
// // // // //                 </tbody>
// // // // //               </table>
// // // // //             </div>
// // // // //           </div>
// // // // //         ) : (
// // // // //           /* REGISTER CATALOG ITEM CARD (Shows when no match or search input is empty) */
// // // // //           <div style={styles.card}>
// // // // //             <h3 style={styles.panelTitle}>
// // // // //               {searchQuery.trim() !== "" 
// // // // //                 ? `"${searchQuery}" Not Found — Register As New Item` 
// // // // //                 : "Add Product Details"
// // // // //               }
// // // // //             </h3>
// // // // //             <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // // //               <input 
// // // // //                 type="text" 
// // // // //                 placeholder="Product Item Name" 
// // // // //                 required 
// // // // //                 value={form.name} 
// // // // //                 onChange={e => setForm({...form, name: e.target.value})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               />
// // // // //               {/* <input 
// // // // //                 type="number" 
// // // // //                 placeholder="Unit Price (₹)" 
// // // // //                 required 
// // // // //                 value={form.price || ''} 
// // // // //                 onChange={e => setForm({...form, price: Number(e.target.value)})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               /> */}
// // // // //               {/* <input 
// // // // //                 type="number" 
// // // // //                 placeholder="Initial Inventory Units" 
// // // // //                 required 
// // // // //                 value={form.stock || ''} 
// // // // //                 onChange={e => setForm({...form, stock: Number(e.target.value)})} 
// // // // //                 style={styles.input}
// // // // //                 onFocus={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // // //                 }}
// // // // //                 onBlur={(e) => {
// // // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // // //                   e.currentTarget.style.boxShadow = "none";
// // // // //                 }}
// // // // //               /> */}
              
// // // // //               <button 
// // // // //                 type="submit" 
// // // // //                 disabled={loading}
// // // // //                 style={{
// // // // //                   ...styles.primaryBtn,
// // // // //                   backgroundColor: loading ? "#93c5fd" : "#2563eb",
// // // // //                   cursor: loading ? "not-allowed" : "pointer"
// // // // //                 }}
// // // // //                 onMouseOver={(e) => {
// // // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#1d4ed8";
// // // // //                 }}
// // // // //                 onMouseOut={(e) => {
// // // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#2563eb";
// // // // //                 }}
// // // // //               >
// // // // //                 {loading ? 'Saving Profile...' : 'Save Catalog Item'}
// // // // //               </button>
// // // // //             </form>
// // // // //           </div>
// // // // //         )}

// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default Products;




// // // // // 19-06-2026






// // // // import React, { useState, useEffect } from 'react';
// // // // import api from '../utils/api';

// // // // const Products = () => {
// // // //   const [products, setProducts] = useState([]);
// // // //   const [stockGroups, setStockGroups] = useState([]);
// // // //   const [units, setUnits] = useState([]);


// // // // const [groupName, setGroupName] = useState("");

// // // // const [unitForm, setUnitForm] = useState({
// // // //   name: "",
// // // //   symbol: ""
// // // // });

// // // //   const [searchQuery, setSearchQuery] = useState("");
  
// // // //   const [form, setForm] = useState({
// // // //   name: '',
// // // //   stockGroup: '',
// // // //   unit: ''
// // // // });
// // // //   const [loading, setLoading] = useState(false);

// // // //   useEffect(() => {
// // // //   fetchProducts();
// // // //   fetchStockGroups();
// // // //   fetchUnits();
// // // // }, []);

// // // //   const fetchProducts = async () => {
// // // //     try {
// // // //       const res = await api.get('/products');
// // // //       setProducts(res.data);
// // // //     } catch (error) {
// // // //       console.error(error);
// // // //       alert('Failed to fetch product catalog');
// // // //     }
// // // //   };

// // // //   const fetchStockGroups = async () => {
// // // //   try {
// // // //     const res = await api.get("/stock-groups");
// // // //     setStockGroups(res.data);
// // // //   } catch (error) {
// // // //     console.error(error);
// // // //   }
// // // // };

// // // // const fetchUnits = async () => {
// // // //   try {
// // // //     const res = await api.get("/units");
// // // //     setUnits(res.data);
// // // //   } catch (error) {
// // // //     console.error(error);
// // // //   }
// // // // };

// // // //   const handleSave = async (e) => {
// // // //     e.preventDefault();
// // // //     setLoading(true);
// // // //     try {
// // // //       await api.post('/products', form);
// // // //       alert('Product item registered successfully!');
// // // //       setForm({
// // // //   name: '',
// // // //   stockGroup: '',
// // // //   unit: ''
// // // // });
// // // //       fetchProducts();
// // // //     } catch (error) {
// // // //       console.error(error);
// // // //       alert('Failed to save product information');
// // // //     } finally {
// // // //       setLoading(false);
// // // //     }
// // // //   };

// // // //   const handleDelete = async (id) => {
// // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // //       try {
// // // //         await api.delete(`/products/${id}`);
// // // //         fetchProducts();
// // // //       } catch (error) {
// // // //         console.error(error);
// // // //         alert('Failed to delete product item');
// // // //       }
// // // //     }
// // // //   };


// // // // const addStockGroup = async () => {
// // // //   try {

// // // //     await api.post("/stock-groups", {
// // // //       name: groupName
// // // //     });

// // // //     setGroupName("");

// // // //     fetchStockGroups();

// // // //   } catch (error) {

// // // //     console.error(error);

// // // //   }
// // // // };



// // // // const addUnit = async () => {
// // // //   try {

// // // //     await api.post("/units", unitForm);

// // // //     setUnitForm({
// // // //       name: "",
// // // //       symbol: ""
// // // //     });

// // // //     fetchUnits();

// // // //   } catch (error) {

// // // //     console.error(error);

// // // //   }
// // // // };



// // // //   // Check matched items matching the search paradigm
// // // //   const filteredProducts = products.filter(p => {
// // // //     const query = searchQuery.toLowerCase().trim();
// // // //     if (!query) return false; // Don't filter/show table if search bar is empty
// // // //     return p.name?.toLowerCase().includes(query);
// // // //   });

// // // //   // Toggle flag: show table view only if there is a query AND matches exist
// // // //   const isProductAvailable = searchQuery.trim() !== "" && filteredProducts.length > 0;

// // // //   const styles = {
// // // //     page: {
// // // //       minHeight: "100vh",
// // // //       backgroundColor: "#f8fafc",
// // // //       padding: "32px",
// // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // //       boxSizing: "border-box",
// // // //       display: "flex",
// // // //       flexDirection: "column",
// // // //       alignItems: "center",
// // // //     },
// // // //     container: {
// // // //       width: "100%",
// // // //       maxWidth: "540px",
// // // //     },
// // // //     headerBlock: {
// // // //       textAlign: "center",
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
// // // //       marginTop: "6px",
// // // //       marginBottom: 0,
// // // //       lineHeight: "1.5",
// // // //     },
// // // //     searchBarContainer: {
// // // //       width: "100%",
// // // //       marginBottom: "24px",
// // // //     },
// // // //     card: {
// // // //       background: "#ffffff",
// // // //       border: "1px solid #e2e8f0",
// // // //       borderRadius: "14px",
// // // //       padding: "24px",
// // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.03)",
// // // //       boxSizing: "border-box",
// // // //     },
// // // //     panelTitle: {
// // // //       fontSize: "16px",
// // // //       fontWeight: "600",
// // // //       color: "#0f172a",
// // // //       marginTop: 0,
// // // //       marginBottom: "18px",
// // // //     },
// // // //     formGroupGrid: {
// // // //       display: "flex",
// // // //       flexDirection: "column",
// // // //       gap: "14px",
// // // //     },
// // // //     input: {
// // // //       width: "100%",
// // // //       padding: "12px 14px",
// // // //       border: "1px solid #e2e8f0",
// // // //       borderRadius: "10px",
// // // //       fontSize: "14px",
// // // //       color: "#0f172a",
// // // //       backgroundColor: "#ffffff",
// // // //       outline: "none",
// // // //       transition: "border-color 0.2s, box-shadow 0.2s",
// // // //       boxSizing: "border-box",
// // // //     },
// // // //     primaryBtn: {
// // // //       width: "100%",
// // // //       padding: "12px",
// // // //       background: "#2563eb",
// // // //       color: "#ffffff",
// // // //       border: "none",
// // // //       borderRadius: "10px",
// // // //       fontWeight: "600",
// // // //       fontSize: "14px",
// // // //       cursor: "pointer",
// // // //       transition: "background-color 0.2s",
// // // //       marginTop: "6px",
// // // //     },
// // // //     tableContainer: {
// // // //       background: "#ffffff",
// // // //       border: "1px solid #e2e8f0",
// // // //       borderRadius: "14px",
// // // //       boxShadow: "0 1px 3px rgba(0,0,0,0.05)",
// // // //       overflow: "hidden",
// // // //       width: "100%",
// // // //     },
// // // //     table: {
// // // //       width: "100%",
// // // //       borderCollapse: "collapse",
// // // //       textAlign: "left",
// // // //     },
// // // //     th: {
// // // //       backgroundColor: "#f1f5f9",
// // // //       color: "#334155",
// // // //       fontWeight: "600",
// // // //       padding: "14px",
// // // //       fontSize: "13px",
// // // //       borderBottom: "2px solid #e2e8f0",
// // // //     },
// // // //     tr: {
// // // //       transition: "background-color 0.2s",
// // // //     },
// // // //     td: {
// // // //       padding: "14px",
// // // //       fontSize: "14px",
// // // //       color: "#0f172a",
// // // //       borderBottom: "1px solid #e2e8f0",
// // // //     },
// // // //     stockTextNormal: {
// // // //       backgroundColor: "#f1f5f9",
// // // //       color: "#334155",
// // // //       padding: "4px 10px",
// // // //       borderRadius: "8px",
// // // //       fontSize: "13px",
// // // //       fontWeight: "600",
// // // //     },
// // // //     stockTextAlert: {
// // // //       backgroundColor: "#fee2e2",
// // // //       color: "#dc2626",
// // // //       padding: "4px 10px",
// // // //       borderRadius: "8px",
// // // //       fontSize: "13px",
// // // //       fontWeight: "700",
// // // //     },
// // // //     currencyText: {
// // // //       color: "#0f172a",
// // // //       fontWeight: "600",
// // // //     },
// // // //     actionFlex: {
// // // //       display: "flex",
// // // //       gap: "12px",
// // // //     },
// // // //     removeBtn: {
// // // //       background: "none",
// // // //       border: "none",
// // // //       color: "#dc2626",
// // // //       fontWeight: "600",
// // // //       fontSize: "13px",
// // // //       cursor: "pointer",
// // // //       padding: 0,
// // // //     },
// // // //     alertBanner: {
// // // //       backgroundColor: "#f0fdf4",
// // // //       border: "1px solid #bbf7d0",
// // // //       color: "#166534",
// // // //       padding: "12px 14px",
// // // //       borderRadius: "10px",
// // // //       fontSize: "14px",
// // // //       fontWeight: "500",
// // // //       marginBottom: "16px",
// // // //       textAlign: "center"
// // // //     }
// // // //   };

// // // //   return (
// // // //     <div style={styles.page}>
// // // //       <div style={styles.container}>
        
// // // //         {/* Page Header */}
// // // //         <div style={styles.headerBlock}>
// // // //           <h1 style={styles.title}>Add Products to Catalog </h1>
// // // //           {/* <p style={styles.subtitle}>
// // // //             Verify inventory parameters via real-time tracking bar or initialize brand new system stock records
// // // //           </p> */}
// // // //         </div>

// // // //         {/* Global Verification Search Bar */}
// // // //         <div style={styles.searchBarContainer}>
// // // //           <input 
// // // //             type="text"
// // // //             style={styles.input}
// // // //             placeholder="Type item name to verify availability status..."
// // // //             value={searchQuery}
// // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // //             onFocus={(e) => {
// // // //               e.currentTarget.style.borderColor = "#2563eb";
// // // //               e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // //             }}
// // // //             onBlur={(e) => {
// // // //               e.currentTarget.style.borderColor = "#e2e8f0";
// // // //               e.currentTarget.style.boxShadow = "none";
// // // //             }}
// // // //           />
// // // //         </div>

// // // //         {/* CONDITIONAL INTERACTIVE VIEW */}
// // // //         {isProductAvailable ? (
// // // //           /* SHOW PRODUCTS TABLE (Hides Registration Form) */
// // // //           <div>
// // // //             <div style={styles.alertBanner}>
// // // //               ✓ Product records matching "{searchQuery}" are available in the system.
// // // //             </div>
// // // //             <div style={styles.tableContainer}>
// // // //               <table style={styles.table}>
// // // //                 <thead>
// // // //   <tr>
// // // //     <th>Product Name</th>
// // // // <th>Stock Group</th>
// // // // <th>Unit</th>
// // // // <th>Action</th>
// // // //   </tr>
// // // // </thead>
// // // //                 <tbody>
// // // //                   {filteredProducts.map((p) => (
// // // //                     <tr key={p._id}>
// // // //   <td>{p.name}</td>
// // // // <td>{p.stockGroup?.name}</td>
// // // // <td>{p.unit?.symbol}</td>

// // // //   <td style={styles.td}>
// // // //     <div style={styles.actionFlex}>
// // // //       <button
// // // //         style={styles.removeBtn}
// // // //         onClick={() => handleDelete(p._id)}
// // // //       >
// // // //         Remove
// // // //       </button>
// // // //     </div>
// // // //   </td>
// // // // </tr>
// // // //                   ))}
// // // //                 </tbody>
// // // //               </table>
// // // //             </div>
// // // //           </div>
// // // //         ) : (
// // // //           /* REGISTER CATALOG ITEM CARD (Shows when no match or search input is empty) */
// // // //           <div style={styles.card}>
// // // //             <h3 style={styles.panelTitle}>
// // // //               {searchQuery.trim() !== "" 
// // // //                 ? `"${searchQuery}" Not Found — Register As New Item` 
// // // //                 : "Add Product Details"
// // // //               }
// // // //             </h3>
// // // //             <div style={styles.card}>
// // // //   <h3>Add Stock Group</h3>

// // // //   <input
// // // //     type="text"
// // // //     value={groupName}
// // // //     onChange={(e) => setGroupName(e.target.value)}
// // // //     placeholder="Stock Group Name"
// // // //     style={styles.input}
// // // //   />

// // // //   <button
// // // //     type="button"
// // // //     onClick={addStockGroup}
// // // //     style={styles.primaryBtn}
// // // //   >
// // // //     Add Stock Group
// // // //   </button>
// // // // </div>
// // // // <div style={styles.card}>
// // // //   <h3>Add Unit</h3>

// // // //   <input
// // // //     type="text"
// // // //     value={unitForm.name}
// // // //     onChange={(e) =>
// // // //       setUnitForm({
// // // //         ...unitForm,
// // // //         name: e.target.value
// // // //       })
// // // //     }
// // // //     placeholder="Unit Name"
// // // //     style={styles.input}
// // // //   />

// // // //   <input
// // // //     type="text"
// // // //     value={unitForm.symbol}
// // // //     onChange={(e) =>
// // // //       setUnitForm({
// // // //         ...unitForm,
// // // //         symbol: e.target.value
// // // //       })
// // // //     }
// // // //     placeholder="Symbol"
// // // //     style={styles.input}
// // // //   />

// // // //   <button
// // // //     type="button"
// // // //     onClick={addUnit}
// // // //     style={styles.primaryBtn}
// // // //   >
// // // //     Add Unit
// // // //   </button>
// // // // </div>
// // // //             <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // //               <input 
// // // //                 type="text" 
// // // //                 placeholder="Product Item Name" 
// // // //                 required 
// // // //                 value={form.name} 
// // // //                 onChange={e => setForm({...form, name: e.target.value})} 
// // // //                 style={styles.input}
// // // //                 onFocus={(e) => {
// // // //                   e.currentTarget.style.borderColor = "#2563eb";
// // // //                   e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.1)";
// // // //                 }}
// // // //                 onBlur={(e) => {
// // // //                   e.currentTarget.style.borderColor = "#e2e8f0";
// // // //                   e.currentTarget.style.boxShadow = "none";
// // // //                 }}
// // // //               />
             
// // // //               <select
// // // //   value={form.stockGroup}
// // // //   onChange={(e) =>
// // // //     setForm({
// // // //       ...form,
// // // //       stockGroup: e.target.value
// // // //     })
// // // //   }
// // // //   style={styles.input}
// // // //   required
// // // // >
// // // //   <option value="">
// // // //     Select Stock Group
// // // //   </option>

// // // //   {stockGroups.map(group => (
// // // //     <option
// // // //       key={group._id}
// // // //       value={group._id}
// // // //     >
// // // //       {group.name}
// // // //     </option>
// // // //   ))}
// // // // </select>

// // // // <select
// // // //   value={form.unit}
// // // //   onChange={(e) =>
// // // //     setForm({
// // // //       ...form,
// // // //       unit: e.target.value
// // // //     })
// // // //   }
// // // //   style={styles.input}
// // // //   required
// // // // >
// // // //   <option value="">
// // // //     Select Unit
// // // //   </option>

// // // //   {units.map(unit => (
// // // //     <option
// // // //       key={unit._id}
// // // //       value={unit._id}
// // // //     >
// // // //       {unit.symbol}
// // // //     </option>
// // // //   ))}
// // // // </select>              <button 
// // // //                 type="submit" 
// // // //                 disabled={loading}
// // // //                 style={{
// // // //                   ...styles.primaryBtn,
// // // //                   backgroundColor: loading ? "#93c5fd" : "#2563eb",
// // // //                   cursor: loading ? "not-allowed" : "pointer"
// // // //                 }}
// // // //                 onMouseOver={(e) => {
// // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#1d4ed8";
// // // //                 }}
// // // //                 onMouseOut={(e) => {
// // // //                   if (!loading) e.currentTarget.style.backgroundColor = "#2563eb";
// // // //                 }}
// // // //               >
// // // //                 {loading ? 'Saving Profile...' : 'Save Catalog Item'}
// // // //               </button>
// // // //             </form>
// // // //           </div>
// // // //         )}

// // // //       </div>
// // // //     </div>
// // // //   );
// // // // };

// // // // export default Products;





// // // import React, { useState, useEffect } from 'react';
// // // import api from '../utils/api';

// // // const Products = () => {
// // //   const [products, setProducts] = useState([]);
// // //   const [stockGroups, setStockGroups] = useState([]);
// // //   const [units, setUnits] = useState([]);

// // //   const [groupName, setGroupName] = useState("");
// // //   const [unitForm, setUnitForm] = useState({ name: "", symbol: "" });
// // //   const [searchQuery, setSearchQuery] = useState("");
// // //   const [form, setForm] = useState({ name: '', stockGroup: '', unit: '' });
// // //   const [loading, setLoading] = useState(false);

// // //   useEffect(() => {
// // //     fetchProducts();
// // //     fetchStockGroups();
// // //     fetchUnits();
// // //   }, []);

// // //   const fetchProducts = async () => {
// // //     try {
// // //       const res = await api.get('/products');
// // //       setProducts(res.data);
// // //     } catch (error) {
// // //       console.error(error);
// // //       alert('Failed to fetch product catalog');
// // //     }
// // //   };

// // //   const fetchStockGroups = async () => {
// // //     try {
// // //       const res = await api.get("/stock-groups");
// // //       setStockGroups(res.data);
// // //     } catch (error) {
// // //       console.error(error);
// // //     }
// // //   };

// // //   const fetchUnits = async () => {
// // //     try {
// // //       const res = await api.get("/units");
// // //       setUnits(res.data);
// // //     } catch (error) {
// // //       console.error(error);
// // //     }
// // //   };

// // //   const handleSave = async (e) => {
// // //     e.preventDefault();
// // //     setLoading(true);
// // //     try {
// // //       await api.post('/products', form);
// // //       alert('Product item registered successfully!');
// // //       setForm({ name: '', stockGroup: '', unit: '' });
// // //       fetchProducts();
// // //     } catch (error) {
// // //       console.error(error);
// // //       alert('Failed to save product information');
// // //     } finally {
// // //       setLoading(false);
// // //     }
// // //   };

// // //   const handleDelete = async (id) => {
// // //     if (window.confirm('Are you sure you want to remove this product permanently?')) {
// // //       try {
// // //         await api.delete(`/products/${id}`);
// // //         fetchProducts();
// // //       } catch (error) {
// // //         console.error(error);
// // //         alert('Failed to delete product item');
// // //       }
// // //     }
// // //   };

// // //   const addStockGroup = async (e) => {
// // //     e.preventDefault();
// // //     if (!groupName.trim()) return;
// // //     try {
// // //       await api.post("/stock-groups", { name: groupName });
// // //       setGroupName("");
// // //       fetchStockGroups();
// // //       alert('Stock group added successfully!');
// // //     } catch (error) {
// // //       console.error(error);
// // //     }
// // //   };

// // //   const addUnit = async (e) => {
// // //     e.preventDefault();
// // //     if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;
// // //     try {
// // //       await api.post("/units", unitForm);
// // //       setUnitForm({ name: "", symbol: "" });
// // //       fetchUnits();
// // //       alert('Unit added successfully!');
// // //     } catch (error) {
// // //       console.error(error);
// // //     }
// // //   };

// // //   const filteredProducts = products.filter(p => {
// // //     const query = searchQuery.toLowerCase().trim();
// // //     return p.name?.toLowerCase().includes(query);
// // //   });

// // //   const styles = {
// // //     page: {
// // //       minHeight: "100vh",
// // //       backgroundColor: "#f1f5f9",
// // //       padding: "40px 24px",
// // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // //       boxSizing: "border-box",
// // //     },
// // //     container: {
// // //       width: "100%",
// // //       maxWidth: "1200px",
// // //       margin: "0 auto",
// // //     },
// // //     headerBlock: {
// // //       marginBottom: "32px",
// // //     },
// // //     title: {
// // //       fontSize: "32px",
// // //       fontWeight: "800",
// // //       color: "#0f172a",
// // //       letterSpacing: "-0.5px",
// // //       margin: 0,
// // //     },
// // //     subtitle: {
// // //       fontSize: "15px",
// // //       color: "#64748b",
// // //       marginTop: "6px",
// // //       marginBottom: 0,
// // //     },
// // //     dashboardGrid: {
// // //       display: "grid",
// // //       gridTemplateColumns: "1fr 1.5fr",
// // //       gap: "32px",
// // //       alignItems: "start",
// // //     },
// // //     sidebar: {
// // //       display: "flex",
// // //       flexDirection: "column",
// // //       gap: "24px",
// // //     },
// // //     card: {
// // //       background: "#ffffff",
// // //       border: "1px solid #e2e8f0",
// // //       borderRadius: "16px",
// // //       padding: "24px",
// // //       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
// // //     },
// // //     subCardTitle: {
// // //       fontSize: "14px",
// // //       fontWeight: "700",
// // //       color: "#475569",
// // //       textTransform: "uppercase",
// // //       letterSpacing: "0.5px",
// // //       marginTop: 0,
// // //       marginBottom: "14px",
// // //       borderBottom: "1px solid #f1f5f9",
// // //       paddingBottom: "8px"
// // //     },
// // //     inlineFormGroup: {
// // //       display: "flex",
// // //       gap: "10px",
// // //       marginBottom: "12px"
// // //     },
// // //     formGroupGrid: {
// // //       display: "flex",
// // //       flexDirection: "column",
// // //       gap: "16px",
// // //     },
// // //     input: {
// // //       width: "100%",
// // //       padding: "10px 14px",
// // //       border: "1px solid #cbd5e1",
// // //       borderRadius: "8px",
// // //       fontSize: "14px",
// // //       color: "#0f172a",
// // //       backgroundColor: "#ffffff",
// // //       outline: "none",
// // //       transition: "all 0.2s",
// // //       boxSizing: "border-box",
// // //     },
// // //     primaryBtn: {
// // //       padding: "10px 16px",
// // //       background: "#2563eb",
// // //       color: "#ffffff",
// // //       border: "none",
// // //       borderRadius: "8px",
// // //       fontWeight: "600",
// // //       fontSize: "14px",
// // //       cursor: "pointer",
// // //       transition: "background-color 0.2s",
// // //       whiteSpace: "nowrap"
// // //     },
// // //     submitBtn: {
// // //       width: "100%",
// // //       padding: "12px",
// // //       color: "#ffffff",
// // //       border: "none",
// // //       borderRadius: "8px",
// // //       fontWeight: "600",
// // //       fontSize: "15px",
// // //       marginTop: "8px",
// // //       transition: "all 0.2s",
// // //     },
// // //     tableContainer: {
// // //       background: "#ffffff",
// // //       border: "1px solid #e2e8f0",
// // //       borderRadius: "16px",
// // //       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
// // //       overflow: "hidden",
// // //     },
// // //     table: {
// // //       width: "100%",
// // //       borderCollapse: "collapse",
// // //       textAlign: "left",
// // //     },
// // //     th: {
// // //       backgroundColor: "#f8fafc",
// // //       color: "#475569",
// // //       fontWeight: "600",
// // //       padding: "16px",
// // //       fontSize: "13px",
// // //       borderBottom: "1px solid #e2e8f0",
// // //     },
// // //     td: {
// // //       padding: "16px",
// // //       fontSize: "14px",
// // //       color: "#334155",
// // //       borderBottom: "1px solid #f1f5f9",
// // //     },
// // //     removeBtn: {
// // //       background: "none",
// // //       border: "none",
// // //       color: "#ef4444",
// // //       fontWeight: "600",
// // //       fontSize: "13px",
// // //       cursor: "pointer",
// // //       padding: 0,
// // //       transition: "color 0.2s"
// // //     },
// // //     alertBanner: {
// // //       backgroundColor: "#f0fdf4",
// // //       border: "1px solid #bbf7d0",
// // //       color: "#166534",
// // //       padding: "12px 16px",
// // //       borderRadius: "8px",
// // //       fontSize: "14px",
// // //       fontWeight: "500",
// // //       marginBottom: "20px",
// // //     },
// // //     emptyState: {
// // //       padding: "40px",
// // //       textAlign: "center",
// // //       color: "#64748b",
// // //       fontSize: "15px"
// // //     }
// // //   };

// // //   const handleFocus = (e) => {
// // //     e.currentTarget.style.borderColor = "#2563eb";
// // //     e.currentTarget.style.boxShadow = "0 0 0 3px rgba(37, 99, 235, 0.15)";
// // //   };

// // //   const handleBlur = (e) => {
// // //     e.currentTarget.style.borderColor = "#cbd5e1";
// // //     e.currentTarget.style.boxShadow = "none";
// // //   };

// // //   return (
// // //     <div style={styles.page}>
// // //       <div style={styles.container}>
        
// // //         {/* Page Header */}
// // //         <div style={styles.headerBlock}>
// // //           <h1 style={styles.title}>Inventory Catalog Manager</h1>
// // //           <p style={styles.subtitle}>Register items, customize inventory configurations, and manage your real-time stocks.</p>
// // //         </div>

// // //         <div style={styles.dashboardGrid}>
          
// // //           {/* LEFT COLUMN: Management Panel */}
// // //           <div style={styles.sidebar}>
            
// // //             {/* 1. Add Stock Group */}
// // //             <div style={styles.card}>
// // //               <h3 style={styles.subCardTitle}>Quick Add: Stock Group</h3>
// // //               <form onSubmit={addStockGroup} style={styles.inlineFormGroup}>
// // //                 <input
// // //                   type="text"
// // //                   value={groupName}
// // //                   onChange={(e) => setGroupName(e.target.value)}
// // //                   placeholder="e.g., Electronics"
// // //                   style={styles.input}
// // //                   onFocus={handleFocus}
// // //                   onBlur={handleBlur}
// // //                 />
// // //                 <button type="submit" style={styles.primaryBtn}>Add</button>
// // //               </form>
// // //             </div>

// // //             {/* 2. Add Unit */}
// // //             <div style={styles.card}>
// // //               <h3 style={styles.subCardTitle}>Quick Add: Measurement Unit</h3>
// // //               <form onSubmit={addUnit} style={styles.formGroupGrid}>
// // //                 <div style={styles.inlineFormGroup}>
// // //                   <input
// // //                     type="text"
// // //                     value={unitForm.name}
// // //                     onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
// // //                     placeholder="Unit Name (Kilogram)"
// // //                     style={styles.input}
// // //                     onFocus={handleFocus}
// // //                     onBlur={handleBlur}
// // //                   />
// // //                   <input
// // //                     type="text"
// // //                     value={unitForm.symbol}
// // //                     onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
// // //                     placeholder="Symbol (kg)"
// // //                     style={styles.input}
// // //                     onFocus={handleFocus}
// // //                     onBlur={handleBlur}
// // //                   />
// // //                 </div>
// // //                 <button type="submit" style={{ ...styles.primaryBtn, width: '100%' }}>Add Unit Setup</button>
// // //               </form>
// // //             </div>

// // //             {/* 3. Register Product */}
// // //             <div style={styles.card}>
// // //               <h3 style={styles.subCardTitle}>Product Details Entry</h3>
// // //               <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // //                 <div>
// // //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Name</label>
// // //                   <input 
// // //                     type="text" 
// // //                     placeholder="Enter unique catalog item name" 
// // //                     required 
// // //                     value={form.name} 
// // //                     onChange={e => setForm({...form, name: e.target.value})} 
// // //                     style={styles.input}
// // //                     onFocus={handleFocus}
// // //                     onBlur={handleBlur}
// // //                   />
// // //                 </div>
                 
// // //                 <div>
// // //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Stock Group Assignment</label>
// // //                   <select
// // //                     value={form.stockGroup}
// // //                     onChange={(e) => setForm({ ...form, stockGroup: e.target.value })}
// // //                     style={styles.input}
// // //                     required
// // //                   >
// // //                     <option value="">Select Stock Group</option>
// // //                     {stockGroups.map(group => (
// // //                       <option key={group._id} value={group._id}>{group.name}</option>
// // //                     ))}
// // //                   </select>
// // //                 </div>

// // //                 <div>
// // //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Unit Dimension</label>
// // //                   <select
// // //                     value={form.unit}
// // //                     onChange={(e) => setForm({ ...form, unit: e.target.value })}
// // //                     style={styles.input}
// // //                     required
// // //                   >
// // //                     <option value="">Select Unit</option>
// // //                     {units.map(unit => (
// // //                       <option key={unit._id} value={unit._id}>{unit.symbol} ({unit.name})</option>
// // //                     ))}
// // //                   </select>
// // //                 </div>

// // //                 <button 
// // //                   type="submit" 
// // //                   disabled={loading}
// // //                   style={{
// // //                     ...styles.submitBtn,
// // //                     backgroundColor: loading ? "#93c5fd" : "#2563eb",
// // //                     cursor: loading ? "not-allowed" : "pointer"
// // //                   }}
// // //                 >
// // //                   {loading ? 'Saving Parameters...' : 'Save Catalog Item'}
// // //                 </button>
// // //               </form>
// // //             </div>
// // //           </div>

// // //           {/* RIGHT COLUMN: Search & Live View Table */}
// // //           <div>
// // //             <div style={{ marginBottom: "20px" }}>
// // //               <input 
// // //                 type="text"
// // //                 style={styles.input}
// // //                 placeholder="🔍 Search or verify products inside database..."
// // //                 value={searchQuery}
// // //                 onChange={(e) => setSearchQuery(e.target.value)}
// // //                 onFocus={handleFocus}
// // //                 onBlur={handleBlur}
// // //               />
// // //             </div>

// // //             {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
// // //               <div style={styles.alertBanner}>
// // //                 ✨ <strong>Matches Found:</strong> Found records aligning with "{searchQuery}".
// // //               </div>
// // //             )}

// // //             <div style={styles.tableContainer}>
// // //               {filteredProducts.length === 0 ? (
// // //                 <div style={styles.emptyState}>
// // //                   {searchQuery.trim() !== "" 
// // //                     ? `No matching records found for "${searchQuery}". Use the entry panel to create it!` 
// // //                     : "No products in system. Complete the entry setup wizard."
// // //                   }
// // //                 </div>
// // //               ) : (
// // //                 <table style={styles.table}>
// // //                   <thead>
// // //                     <tr>
// // //                       <th style={styles.th}>Product Name</th>
// // //                       <th style={styles.th}>Stock Group</th>
// // //                       <th style={styles.th}>Unit Configuration</th>
// // //                       <th style={styles.th}>Action</th>
// // //                     </tr>
// // //                   </thead>
// // //                   <tbody>
// // //                     {filteredProducts.map((p) => (
// // //                       <tr key={p._id}>
// // //                         <td style={styles.td}><strong>{p.name}</strong></td>
// // //                         <td style={styles.td}>{p.stockGroup?.name || <span style={{ color: '#94a3b8' }}>None</span>}</td>
// // //                         <td style={styles.td}>{p.unit?.symbol || <span style={{ color: '#94a3b8' }}>None</span>}</td>
// // //                         <td style={styles.td}>
// // //                           <button
// // //                             style={styles.removeBtn}
// // //                             onClick={() => handleDelete(p._id)}
// // //                             onMouseOver={(e) => e.currentTarget.style.color = "#b91c1c"}
// // //                             onMouseOut={(e) => e.currentTarget.style.color = "#ef4444"}
// // //                           >
// // //                             Remove
// // //                           </button>
// // //                         </td>
// // //                       </tr>
// // //                     ))}
// // //                   </tbody>
// // //                 </table>
// // //               )}
// // //             </div>
// // //           </div>

// // //         </div>
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default Products;







// // import React, { useState, useEffect } from 'react';
// // import api from '../utils/api';

// // const Products = () => {
// //   const [products, setProducts] = useState([]);
// //   const [stockGroups, setStockGroups] = useState([]);
// //   const [units, setUnits] = useState([]);

// //   const [groupName, setGroupName] = useState("");
// //   const [unitForm, setUnitForm] = useState({ name: "", symbol: "" });
// //   const [searchQuery, setSearchQuery] = useState("");
  
// //   // Form state manages both creating and updating
// //   const [form, setForm] = useState({ name: '', stockGroup: '', unit: '' });
// //   const [editingId, setEditingId] = useState(null); 
// //   const [loading, setLoading] = useState(false);

// //   useEffect(() => {
// //     fetchProducts();
// //     fetchStockGroups();
// //     fetchUnits();
// //   }, []);

// //   const fetchProducts = async () => {
// //     try {
// //       const res = await api.get('/products');
// //       setProducts(res.data);
// //     } catch (error) {
// //       console.error(error);
// //       alert('Failed to fetch product catalog');
// //     }
// //   };

// //   const fetchStockGroups = async () => {
// //     try {
// //       const res = await api.get("/stock-groups");
// //       setStockGroups(res.data);
// //     } catch (error) {
// //       console.error(error);
// //     }
// //   };

// //   const fetchUnits = async () => {
// //     try {
// //       const res = await api.get("/units");
// //       setUnits(res.data);
// //     } catch (error) {
// //       console.error(error);
// //     }
// //   };

// //   const handleSave = async (e) => {
// //     e.preventDefault();
// //     setLoading(true);
// //     try {
// //       if (editingId) {
// //         // Update operational flow
// //         await api.put(`/products/${editingId}`, form);
// //         alert('Product item updated successfully!');
// //       } else {
// //         // Create operational flow
// //         await api.post('/products', form);
// //         alert('Product item registered successfully!');
// //       }
// //       clearForm();
// //       fetchProducts();
// //     } catch (error) {
// //       console.error(error);
// //       alert('Failed to save product information');
// //     } finally {
// //       setLoading(false);
// //     }
// //   };

// //   const handleEditInit = (product) => {
// //     setEditingId(product._id);
// //     setForm({
// //       name: product.name || '',
// //       stockGroup: product.stockGroup?._id || product.stockGroup || '',
// //       unit: product.unit?._id || product.unit || ''
// //     });
// //     window.scrollTo({ top: 0, behavior: 'smooth' });
// //   };

// //   const clearForm = () => {
// //     setForm({ name: '', stockGroup: '', unit: '' });
// //     setEditingId(null);
// //   };

// //   const handleDelete = async (id) => {
// //     if (window.confirm('Are you sure you want to delete this product permanently?')) {
// //       try {
// //         await api.delete(`/products/${id}`);
// //         if (editingId === id) clearForm();
// //         fetchProducts();
// //       } catch (error) {
// //         console.error(error);
// //         alert('Failed to delete product item');
// //       }
// //     }
// //   };

// //   const addStockGroup = async (e) => {
// //     e.preventDefault();
// //     if (!groupName.trim()) return;
// //     try {
// //       await api.post("/stock-groups", { name: groupName });
// //       setGroupName("");
// //       fetchStockGroups();
// //       alert('Stock group added successfully!');
// //     } catch (error) {
// //       console.error(error);
// //     }
// //   };

// //   const addUnit = async (e) => {
// //     e.preventDefault();
// //     if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;
// //     try {
// //       await api.post("/units", unitForm);
// //       setUnitForm({ name: "", symbol: "" });
// //       fetchUnits();
// //       alert('Unit added successfully!');
// //     } catch (error) {
// //       console.error(error);
// //     }
// //   };

// //   const filteredProducts = products.filter(p => {
// //     const query = searchQuery.toLowerCase().trim();
// //     return p.name?.toLowerCase().includes(query);
// //   });

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
// //       maxWidth: "1200px",
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
// //     dashboardGrid: {
// //       display: "grid",
// //       gridTemplateColumns: "1fr 1.5fr",
// //       gap: "32px",
// //       alignItems: "start",
// //     },
// //     sidebar: {
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "24px",
// //     },
// //     card: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "16px",
// //       padding: "24px",
// //       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
// //     },
// //     subCardTitle: {
// //       fontSize: "14px",
// //       fontWeight: "700",
// //       color: "#475569",
// //       textTransform: "uppercase",
// //       letterSpacing: "0.5px",
// //       marginTop: 0,
// //       marginBottom: "14px",
// //       borderBottom: "1px solid #f1f5f9",
// //       paddingBottom: "8px"
// //     },
// //     inlineFormGroup: {
// //       display: "flex",
// //       gap: "10px",
// //       marginBottom: "12px"
// //     },
// //     formGroupGrid: {
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "16px",
// //     },
// //     input: {
// //       width: "100%",
// //       padding: "10px 14px",
// //       border: "1px solid #cbd5e1",
// //       borderRadius: "8px",
// //       fontSize: "14px",
// //       color: "#0f172a",
// //       backgroundColor: "#ffffff",
// //       outline: "none",
// //       transition: "all 0.2s",
// //       boxSizing: "border-box",
// //     },
// //     primaryBtn: {
// //       padding: "10px 16px",
// //       background: "#2563eb",
// //       color: "#ffffff",
// //       border: "none",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       transition: "background-color 0.2s",
// //       whiteSpace: "nowrap"
// //     },
// //     submitBtn: {
// //       width: "100%",
// //       padding: "12px",
// //       color: "#ffffff",
// //       border: "none",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "15px",
// //       marginTop: "8px",
// //       transition: "all 0.2s",
// //     },
// //     cancelBtn: {
// //       width: "100%",
// //       padding: "10px",
// //       background: "#f1f5f9",
// //       color: "#475569",
// //       border: "1px solid #cbd5e1",
// //       borderRadius: "8px",
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       marginTop: "4px",
// //       transition: "all 0.2s"
// //     },
// //     tableContainer: {
// //       background: "#ffffff",
// //       border: "1px solid #e2e8f0",
// //       borderRadius: "16px",
// //       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
// //       overflow: "hidden",
// //     },
// //     table: {
// //       width: "100%",
// //       borderCollapse: "collapse",
// //       textAlign: "left",
// //     },
// //     th: {
// //       backgroundColor: "#f8fafc",
// //       color: "#475569",
// //       fontWeight: "600",
// //       padding: "16px",
// //       fontSize: "13px",
// //       borderBottom: "1px solid #e2e8f0",
// //     },
// //     td: {
// //       padding: "16px",
// //       fontSize: "14px",
// //       color: "#334155",
// //       borderBottom: "1px solid #f1f5f9",
// //     },
// //     actionFlex: {
// //       display: "flex",
// //       gap: "14px",
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
// //     deleteBtn: {
// //       background: "none",
// //       border: "none",
// //       color: "#ef4444",
// //       fontWeight: "600",
// //       fontSize: "13px",
// //       cursor: "pointer",
// //       padding: 0,
// //     },
// //     alertBanner: {
// //       backgroundColor: "#f0fdf4",
// //       border: "1px solid #bbf7d0",
// //       color: "#166534",
// //       padding: "12px 16px",
// //       borderRadius: "8px",
// //       fontSize: "14px",
// //       fontWeight: "500",
// //       marginBottom: "20px",
// //     },
// //     emptyState: {
// //       padding: "40px",
// //       textAlign: "center",
// //       color: "#64748b",
// //       fontSize: "15px"
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
        
// //         {/* Page Header */}
// //         <div style={styles.headerBlock}>
// //           <h1 style={styles.title}>Inventory Catalog Manager</h1>
// //           <p style={styles.subtitle}>Register items, customize inventory configurations, and manage your real-time stocks.</p>
// //         </div>

// //         <div style={styles.dashboardGrid}>
          
// //           {/* LEFT COLUMN: Management Panel */}
// //           <div style={styles.sidebar}>
            
// //             {/* 1. Add Stock Group */}
// //             <div style={styles.card}>
// //               <h3 style={styles.subCardTitle}>Quick Add: Stock Group</h3>
// //               <form onSubmit={addStockGroup} style={styles.inlineFormGroup}>
// //                 <input
// //                   type="text"
// //                   value={groupName}
// //                   onChange={(e) => setGroupName(e.target.value)}
// //                   placeholder="e.g., Electronics"
// //                   style={styles.input}
// //                   onFocus={handleFocus}
// //                   onBlur={handleBlur}
// //                 />
// //                 <button type="submit" style={styles.primaryBtn}>Add</button>
// //               </form>
// //             </div>

// //             {/* 2. Add Unit */}
// //             <div style={styles.card}>
// //               <h3 style={styles.subCardTitle}>Quick Add: Measurement Unit</h3>
// //               <form onSubmit={addUnit} style={styles.formGroupGrid}>
// //                 <div style={styles.inlineFormGroup}>
// //                   <input
// //                     type="text"
// //                     value={unitForm.name}
// //                     onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
// //                     placeholder="Unit Name (Kilogram)"
// //                     style={styles.input}
// //                     onFocus={handleFocus}
// //                     onBlur={handleBlur}
// //                   />
// //                   <input
// //                     type="text"
// //                     value={unitForm.symbol}
// //                     onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
// //                     placeholder="Symbol (kg)"
// //                     style={styles.input}
// //                     onFocus={handleFocus}
// //                     onBlur={handleBlur}
// //                   />
// //                 </div>
// //                 <button type="submit" style={{ ...styles.primaryBtn, width: '100%' }}>Add Unit Setup</button>
// //               </form>
// //             </div>

// //             {/* 3. Register/Edit Product */}
// //             <div style={{ ...styles.card, border: editingId ? '1px solid #2563eb' : '1px solid #e2e8f0' }}>
// //               <h3 style={{ ...styles.subCardTitle, color: editingId ? '#2563eb' : '#475569' }}>
// //                 {editingId ? '📝 Edit Product Parameters' : 'Product Details Entry'}
// //               </h3>
// //               <form onSubmit={handleSave} style={styles.formGroupGrid}>
// //                 <div>
// //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Name</label>
// //                   <input 
// //                     type="text" 
// //                     placeholder="Enter unique catalog item name" 
// //                     required 
// //                     value={form.name} 
// //                     onChange={e => setForm({...form, name: e.target.value})} 
// //                     style={styles.input}
// //                     onFocus={handleFocus}
// //                     onBlur={handleBlur}
// //                   />
// //                 </div>
                 
// //                 <div>
// //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Stock Group Assignment</label>
// //                   <select
// //                     value={form.stockGroup}
// //                     onChange={(e) => setForm({ ...form, stockGroup: e.target.value })}
// //                     style={styles.input}
// //                     required
// //                   >
// //                     <option value="">Select Stock Group</option>
// //                     {stockGroups.map(group => (
// //                       <option key={group._id} value={group._id}>{group.name}</option>
// //                     ))}
// //                   </select>
// //                 </div>

// //                 <div>
// //                   <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Unit Dimension</label>
// //                   <select
// //                     value={form.unit}
// //                     onChange={(e) => setForm({ ...form, unit: e.target.value })}
// //                     style={styles.input}
// //                     required
// //                   >
// //                     <option value="">Select Unit</option>
// //                     {units.map(unit => (
// //                       <option key={unit._id} value={unit._id}>{unit.symbol} ({unit.name})</option>
// //                     ))}
// //                   </select>
// //                 </div>

// //                 <div>
// //                   <button 
// //                     type="submit" 
// //                     disabled={loading}
// //                     style={{
// //                       ...styles.submitBtn,
// //                       backgroundColor: loading ? "#93c5fd" : (editingId ? "#16a34a" : "#2563eb"),
// //                       cursor: loading ? "not-allowed" : "pointer"
// //                     }}
// //                   >
// //                     {loading ? 'Saving Data...' : (editingId ? 'Update Catalog Item' : 'Save Catalog Item')}
// //                   </button>

// //                   {editingId && (
// //                     <button type="button" onClick={clearForm} style={styles.cancelBtn}>
// //                       Cancel Editing
// //                     </button>
// //                   )}
// //                 </div>
// //               </form>
// //             </div>
// //           </div>

// //           {/* RIGHT COLUMN: Search & Live View Table */}
// //           <div>
// //             <div style={{ marginBottom: "20px" }}>
// //               <input 
// //                 type="text"
// //                 style={styles.input}
// //                 placeholder="🔍 Search or verify products inside database..."
// //                 value={searchQuery}
// //                 onChange={(e) => setSearchQuery(e.target.value)}
// //                 onFocus={handleFocus}
// //                 onBlur={handleBlur}
// //               />
// //             </div>

// //             {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
// //               <div style={styles.alertBanner}>
// //                 ✨ <strong>Matches Found:</strong> Found records aligning with "{searchQuery}".
// //               </div>
// //             )}

// //             <div style={styles.tableContainer}>
// //               {filteredProducts.length === 0 ? (
// //                 <div style={styles.emptyState}>
// //                   {searchQuery.trim() !== "" 
// //                     ? `No matching records found for "${searchQuery}". Use the entry panel to create it!` 
// //                     : "No products in system. Complete the entry setup wizard."
// //                   }
// //                 </div>
// //               ) : (
// //                 <table style={styles.table}>
// //                   <thead>
// //                     <tr>
// //                       <th style={styles.th}>Product Name</th>
// //                       <th style={styles.th}>Stock Group</th>
// //                       <th style={styles.th}>Unit Configuration</th>
// //                       <th style={styles.th}>Actions</th>
// //                     </tr>
// //                   </thead>
// //                   <tbody>
// //                     {filteredProducts.map((p) => (
// //                       <tr key={p._id} style={{ backgroundColor: editingId === p._id ? '#eff6ff' : 'transparent' }}>
// //                         <td style={styles.td}><strong>{p.name}</strong></td>
// //                         <td style={styles.td}>{p.stockGroup?.name || <span style={{ color: '#94a3b8' }}>None</span>}</td>
// //                         <td style={styles.td}>{p.unit?.symbol || <span style={{ color: '#94a3b8' }}>None</span>}</td>
// //                         <td style={styles.td}>
// //                           <div style={styles.actionFlex}>
// //                             <button
// //                               style={styles.editBtn}
// //                               onClick={() => handleEditInit(p)}
// //                               onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"}
// //                               onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}
// //                             >
// //                               Edit
// //                             </button>
// //                             <button
// //                               style={styles.deleteBtn}
// //                               onClick={() => handleDelete(p._id)}
// //                               onMouseOver={(e) => e.currentTarget.style.color = "#b91c1c"}
// //                               onMouseOut={(e) => e.currentTarget.style.color = "#ef4444"}
// //                             >
// //                               Delete
// //                             </button>
// //                           </div>
// //                         </td>
// //                       </tr>
// //                     ))}
// //                   </tbody>
// //                 </table>
// //               )}
// //             </div>
// //           </div>

// //         </div>
// //       </div>
// //     </div>
// //   );
// // };

// // export default Products;





// import React, { useState, useEffect } from 'react';
// import api from '../utils/api';

// const Products = () => {
//   const [products, setProducts] = useState([]);
//   const [stockGroups, setStockGroups] = useState([]);
//   const [units, setUnits] = useState([]);

//   const [groupName, setGroupName] = useState("");
//   const [unitForm, setUnitForm] = useState({ name: "", symbol: "" });
//   const [searchQuery, setSearchQuery] = useState("");
  
//   // Form state manages both creating and updating
//   const [form, setForm] = useState({ name: '', stockGroup: '', unit: '' });
//   const [editingId, setEditingId] = useState(null); 
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     fetchProducts();
//     fetchStockGroups();
//     fetchUnits();
//   }, []);

//   const fetchProducts = async () => {
//     try {
//       const res = await api.get('/products');
//       setProducts(res.data);
//     } catch (error) {
//       console.error(error);
//       alert('Failed to fetch product catalog');
//     }
//   };

//   const fetchStockGroups = async () => {
//     try {
//       const res = await api.get("/stock-groups");
//       setStockGroups(res.data);
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   const fetchUnits = async () => {
//     try {
//       const res = await api.get("/units");
//       setUnits(res.data);
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   const handleSave = async (e) => {
//     e.preventDefault();
//     setLoading(true);
//     try {
//       if (editingId) {
//         await api.put(`/products/${editingId}`, form);
//         alert('Product item updated successfully!');
//       } else {
//         await api.post('/products', form);
//         alert('Product item registered successfully!');
//       }
//       clearForm();
//       fetchProducts();
//     } catch (error) {
//       console.error(error);
//       alert('Failed to save product information');
//     } finally {
//       setLoading(false);
//     }
//   };

//   const handleEditInit = (product) => {
//     setEditingId(product._id);
//     setForm({
//       name: product.name || '',
//       stockGroup: product.stockGroup?._id || product.stockGroup || '',
//       unit: product.unit?._id || product.unit || ''
//     });
//     window.scrollTo({ top: 0, behavior: 'smooth' });
//   };

//   const clearForm = () => {
//     setForm({ name: '', stockGroup: '', unit: '' });
//     setEditingId(null);
//   };

//   const handleDelete = async (id) => {
//     if (window.confirm('Are you sure you want to delete this product permanently?')) {
//       try {
//         await api.delete(`/products/${id}`);
//         if (editingId === id) clearForm();
//         fetchProducts();
//       } catch (error) {
//         console.error(error);
//         alert('Failed to delete product item');
//       }
//     }
//   };

//   const addStockGroup = async (e) => {
//     e.preventDefault();
//     if (!groupName.trim()) return;
//     try {
//       await api.post("/stock-groups", { name: groupName });
//       setGroupName("");
//       fetchStockGroups();
//       alert('Stock group added successfully!');
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   const addUnit = async (e) => {
//     e.preventDefault();
//     if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;
//     try {
//       await api.post("/units", unitForm);
//       setUnitForm({ name: "", symbol: "" });
//       fetchUnits();
//       alert('Unit added successfully!');
//     } catch (error) {
//       console.error(error);
//     }
//   };

//   const filteredProducts = products.filter(p => {
//     const query = searchQuery.toLowerCase().trim();
//     return p.name?.toLowerCase().includes(query);
//   });

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
//     topInlineGrid: {
//       display: "grid",
//       gridTemplateColumns: "1fr 1.25fr 2fr",
//       gap: "20px",
//       alignItems: "stretch",
//       marginBottom: "32px",
//     },
//     card: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//       padding: "20px",
//       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05), 0 2px 4px -2px rgb(0 0 0 / 0.05)",
//       display: "flex",
//       flexDirection: "column",
//       justifyContent: "space-between"
//     },
//     subCardTitle: {
//       fontSize: "13px",
//       fontWeight: "700",
//       color: "#475569",
//       textTransform: "uppercase",
//       letterSpacing: "0.5px",
//       marginTop: 0,
//       marginBottom: "12px",
//       borderBottom: "1px solid #f1f5f9",
//       paddingBottom: "6px"
//     },
//     inlineFormGroup: {
//       display: "flex",
//       gap: "10px",
//     },
//     formGroupGrid: {
//       display: "flex",
//       flexDirection: "column",
//       gap: "12px",
//     },
//     productFormFields: {
//       display: "grid",
//       gridTemplateColumns: "1.2fr 1fr 1fr",
//       gap: "12px"
//     },
//     label: {
//       display: 'block', 
//       fontSize: '12px', 
//       fontWeight: '600', 
//       color: '#475569', 
//       marginBottom: '4px'
//     },
//     input: {
//       width: "100%",
//       padding: "10px 14px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "8px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "all 0.2s",
//       boxSizing: "border-box",
//     },
//     primaryBtn: {
//       padding: "10px 16px",
//       background: "#2563eb",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "background-color 0.2s",
//       whiteSpace: "nowrap"
//     },
//     submitBtn: {
//       width: "100%",
//       padding: "10px",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       transition: "all 0.2s",
//     },
//     productActionsContainer: {
//       display: "flex",
//       gap: "10px",
//       marginTop: "4px"
//     },
//     cancelBtn: {
//       flex: "1",
//       padding: "10px",
//       background: "#f1f5f9",
//       color: "#475569",
//       border: "1px solid #cbd5e1",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "all 0.2s"
//     },
//     tableContainer: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
//       overflow: "hidden",
//     },
//     table: {
//       width: "100%",
//       borderCollapse: "collapse",
//       textAlign: "left",
//     },
//     th: {
//       backgroundColor: "#f8fafc",
//       color: "#475569",
//       fontWeight: "600",
//       padding: "16px",
//       fontSize: "13px",
//       borderBottom: "1px solid #e2e8f0",
//     },
//     td: {
//       padding: "16px",
//       fontSize: "14px",
//       color: "#334155",
//       borderBottom: "1px solid #f1f5f9",
//     },
//     actionFlex: {
//       display: "flex",
//       gap: "14px",
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
//     deleteBtn: {
//       background: "none",
//       border: "none",
//       color: "#ef4444",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       padding: 0,
//     },
//     alertBanner: {
//       backgroundColor: "#f0fdf4",
//       border: "1px solid #bbf7d0",
//       color: "#166534",
//       padding: "12px 16px",
//       borderRadius: "8px",
//       fontSize: "14px",
//       fontWeight: "500",
//       marginBottom: "20px",
//     },
//     emptyState: {
//       padding: "40px",
//       textAlign: "center",
//       color: "#64748b",
//       fontSize: "15px"
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
        
//         {/* Page Header */}
//         <div style={styles.headerBlock}>
//           <h1 style={styles.title}>Inventory Catalog Manager</h1>
//           <p style={styles.subtitle}>Register items, customize inventory configurations, and manage your real-time stocks.</p>
//         </div>

//         {/* TOP ROW: INLINE MANAGEMENT PANEL */}
//         <div style={styles.topInlineGrid}>
          
//           {/* 1. Add Stock Group */}
//           <div style={styles.card}>
//             <div>
//               <h3 style={styles.subCardTitle}>Quick Add: Stock Group</h3>
//               <form onSubmit={addStockGroup} style={styles.inlineFormGroup}>
//                 <input
//                   type="text"
//                   value={groupName}
//                   onChange={(e) => setGroupName(e.target.value)}
//                   placeholder="e.g., Electronics"
//                   style={styles.input}
//                   onFocus={handleFocus}
//                   onBlur={handleBlur}
//                 />
//                 <button type="submit" style={styles.primaryBtn}>Add</button>
//               </form>
//             </div>
//           </div>

//           {/* 2. Add Unit */}
//           <div style={styles.card}>
//             <div>
//               <h3 style={styles.subCardTitle}>Quick Add: Unit</h3>
//               <form onSubmit={addUnit} style={styles.formGroupGrid}>
//                 <div style={styles.inlineFormGroup}>
//                   <input
//                     type="text"
//                     value={unitForm.name}
//                     onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
//                     placeholder="Name (Kilogram)"
//                     style={styles.input}
//                     onFocus={handleFocus}
//                     onBlur={handleBlur}
//                   />
//                   <input
//                     type="text"
//                     value={unitForm.symbol}
//                     onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
//                     placeholder="Symbol (kg)"
//                     style={{ ...styles.input, width: "100px" }}
//                     onFocus={handleFocus}
//                     onBlur={handleBlur}
//                   />
//                   <button type="submit" style={styles.primaryBtn}>Add</button>
//                 </div>
//               </form>
//             </div>
//           </div>

//           {/* 3. Register/Edit Product */}
//           <div style={{ ...styles.card, border: editingId ? '1px solid #2563eb' : '1px solid #e2e8f0' }}>
//             <div>
//               <h3 style={{ ...styles.subCardTitle, color: editingId ? '#2563eb' : '#475569' }}>
//                 {editingId ? '📝 Edit Product Parameters' : 'Product Details Entry'}
//               </h3>
//               <form onSubmit={handleSave} style={styles.formGroupGrid}>
//                 <div style={styles.productFormFields}>
//                   <div>
//                     <label style={styles.label}>Product Name</label>
//                     <input 
//                       type="text" 
//                       placeholder="Enter item name" 
//                       required 
//                       value={form.name} 
//                       onChange={e => setForm({...form, name: e.target.value})} 
//                       style={styles.input}
//                       onFocus={handleFocus}
//                       onBlur={handleBlur}
//                     />
//                   </div>
                   
//                   <div>
//                     <label style={styles.label}>Stock Group</label>
//                     <select
//                       value={form.stockGroup}
//                       onChange={(e) => setForm({ ...form, stockGroup: e.target.value })}
//                       style={styles.input}
//                       required
//                     >
//                       <option value="">Select Group</option>
//                       {stockGroups.map(group => (
//                         <option key={group._id} value={group._id}>{group.name}</option>
//                       ))}
//                     </select>
//                   </div>

//                   <div>
//                     <label style={styles.label}>Unit Dimension</label>
//                     <select
//                       value={form.unit}
//                       onChange={(e) => setForm({ ...form, unit: e.target.value })}
//                       style={styles.input}
//                       required
//                     >
//                       <option value="">Select Unit</option>
//                       {units.map(unit => (
//                         <option key={unit._id} value={unit._id}>{unit.symbol} ({unit.name})</option>
//                       ))}
//                     </select>
//                   </div>
//                 </div>

//                 <div style={styles.productActionsContainer}>
//                   <button 
//                     type="submit" 
//                     disabled={loading}
//                     style={{
//                       ...styles.submitBtn,
//                       flex: "2",
//                       backgroundColor: loading ? "#93c5fd" : (editingId ? "#16a34a" : "#2563eb"),
//                       cursor: loading ? "not-allowed" : "pointer"
//                     }}
//                   >
//                     {loading ? 'Saving...' : (editingId ? 'Update Catalog Item' : 'Save Catalog Item')}
//                   </button>

//                   {editingId && (
//                     <button type="button" onClick={clearForm} style={styles.cancelBtn}>
//                       Cancel
//                     </button>
//                   )}
//                 </div>
//               </form>
//             </div>
//           </div>
//         </div>

//         {/* BOTTOM ROW: FULL-WIDTH SEARCH & DATA LIVE VIEW */}
//         <div>
//           <div style={{ marginBottom: "20px" }}>
//             <input 
//               type="text"
//               style={styles.input}
//               placeholder="🔍 Search or verify products inside database..."
//               value={searchQuery}
//               onChange={(e) => setSearchQuery(e.target.value)}
//               onFocus={handleFocus}
//               onBlur={handleBlur}
//             />
//           </div>

//           {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
//             <div style={styles.alertBanner}>
//               ✨ <strong>Matches Found:</strong> Found records aligning with "{searchQuery}".
//             </div>
//           )}

//           <div style={styles.tableContainer}>
//             {filteredProducts.length === 0 ? (
//               <div style={styles.emptyState}>
//                 {searchQuery.trim() !== "" 
//                   ? `No matching records found for "${searchQuery}". Use the entry panel to create it!` 
//                   : "No products in system. Complete the entry setup wizard."
//                 }
//               </div>
//             ) : (
//               <table style={styles.table}>
//                 <thead>
//                   <tr>
//                     <th style={styles.th}>Product Name</th>
//                     <th style={styles.th}>Stock Group</th>
//                     <th style={styles.th}>Unit Configuration</th>
//                     <th style={styles.th}>Actions</th>
//                   </tr>
//                 </thead>
//                 <tbody>
//                   {filteredProducts.map((p) => (
//                     <tr key={p._id} style={{ backgroundColor: editingId === p._id ? '#eff6ff' : 'transparent' }}>
//                       <td style={styles.td}><strong>{p.name}</strong></td>
//                       <td style={styles.td}>{p.stockGroup?.name || <span style={{ color: '#94a3b8' }}>None</span>}</td>
//                       <td style={styles.td}>{p.unit?.symbol || <span style={{ color: '#94a3b8' }}>None</span>}</td>
//                       <td style={styles.td}>
//                         <div style={styles.actionFlex}>
//                           <button
//                             style={styles.editBtn}
//                             onClick={() => handleEditInit(p)}
//                             onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"}
//                             onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}
//                           >
//                             Edit
//                           </button>
//                           <button
//                             style={styles.deleteBtn}
//                             onClick={() => handleDelete(p._id)}
//                             onMouseOver={(e) => e.currentTarget.style.color = "#b91c1c"}
//                             onMouseOut={(e) => e.currentTarget.style.color = "#ef4444"}
//                           >
//                             Delete
//                           </button>
//                         </div>
//                       </td>
//                     </tr>
//                   ))}
//                 </tbody>
//               </table>
//             )}
//           </div>
//         </div>

//       </div>
//     </div>
//   );
// };

// export default Products;





import React, { useState, useEffect } from 'react';
import api from '../utils/api';

const Products = () => {
  const [products, setProducts] = useState([]);
  const [stockGroups, setStockGroups] = useState([]);
  const [units, setUnits] = useState([]);

  // Modal Visibility States
  const [isGroupOpen, setIsGroupOpen] = useState(false);
  const [isUnitOpen, setIsUnitOpen] = useState(false);
  const [isProductOpen, setIsProductOpen] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [unitForm, setUnitForm] = useState({ name: "", symbol: "" });
  const [searchQuery, setSearchQuery] = useState("");
  
  // Form state manages both creating and updating
  const [form, setForm] = useState({
  name: '',
  stockGroup: '',
  unit: '',
  price: '',
  image: null
});
  const [editingId, setEditingId] = useState(null); 
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchProducts();
    fetchStockGroups();
    fetchUnits();
  }, []);

  const fetchProducts = async () => {
    try {
      const res = await api.get('/products');
      setProducts(res.data);
    } catch (error) {
      console.error(error);
      alert('Failed to fetch product catalog');
    }
  };

  const fetchStockGroups = async () => {
    try {
      const res = await api.get("/stock-groups");
      setStockGroups(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const fetchUnits = async () => {
    try {
      const res = await api.get("/units");
      setUnits(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const handleSave = async (e) => {

  e.preventDefault();

  setLoading(true);

  try {

    const data = new FormData();

    data.append("name", form.name);

    data.append("stockGroup", form.stockGroup);

    data.append("unit", form.unit);

    data.append("price", form.price);

    if (form.image) {

      data.append("image", form.image);

    }console.log(form);

for (let pair of data.entries()) {
  console.log(pair[0], pair[1]);
}

    if (editingId) {

      await api.put(`/products/${editingId}`, data);

      alert("Product updated");

    } else {

      await api.post("/products", data);

      alert("Product added");

    }

    clearForm();

    setIsProductOpen(false);

    fetchProducts();

  } catch (err) {

    console.log(err);

  }

  setLoading(false);

};

  const handleEditInit = (product) => {
    setEditingId(product._id);
    setForm({
  name: product.name || "",
  stockGroup: product.stockGroup?._id || "",
  unit: product.unit?._id || "",
  price: product.price || "",
  image: null,
});
    setIsProductOpen(true);
  };

  const clearForm = () => {
  setForm({
    name: "",
    stockGroup: "",
    unit: "",
    price: "",
    image: null,
  });

  setEditingId(null);
};
  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product permanently?')) {
      try {
        await api.delete(`/products/${id}`);
        if (editingId === id) clearForm();
        fetchProducts();
      } catch (error) {
        console.error(error);
        alert('Failed to delete product item');
      }
    }
  };

  const addStockGroup = async (e) => {
    e.preventDefault();
    if (!groupName.trim()) return;
    try {
      await api.post("/stock-groups", { name: groupName });
      setGroupName("");
      fetchStockGroups();
      setIsGroupOpen(false);
      alert('Stock group added successfully!');
    } catch (error) {
      console.error(error);
    }
  };

  const addUnit = async (e) => {
    e.preventDefault();
    if (!unitForm.name.trim() || !unitForm.symbol.trim()) return;
    try {
      await api.post("/units", unitForm);
      setUnitForm({ name: "", symbol: "" });
      fetchUnits();
      setIsUnitOpen(false);
      alert('Unit added successfully!');
    } catch (error) {
      console.error(error);
    }
  };

  const filteredProducts = products.filter(p => {
    const query = searchQuery.toLowerCase().trim();
    return p.name?.toLowerCase().includes(query);
  });

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
    headerWrapper: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      flexWrap: "wrap",
      gap: "20px",
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
    actionButtonGroup: {
      display: "flex",
      gap: "12px",
    },
    actionBtn: {
      padding: "10px 18px",
      backgroundColor: "#ffffff",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      color: "#334155",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      boxShadow: "0 1px 2px 0 rgba(0, 0, 0, 0.05)",
      transition: "all 0.2s",
    },
    activeBtn: {
      backgroundColor: "#2563eb",
      color: "#ffffff",
      border: "1px solid #2563eb",
    },
    tableContainer: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      overflow: "hidden",
    },
    table: {
      width: "100%",
      borderCollapse: "collapse",
      textAlign: "left",
    },
    th: {
      backgroundColor: "#f8fafc",
      color: "#475569",
      fontWeight: "600",
      padding: "16px",
      fontSize: "13px",
      borderBottom: "1px solid #e2e8f0",
    },
    td: {
      padding: "16px",
      fontSize: "14px",
      color: "#334155",
      borderBottom: "1px solid #f1f5f9",
    },
    actionFlex: {
      display: "flex",
      gap: "14px",
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
    deleteBtn: {
      background: "none",
      border: "none",
      color: "#ef4444",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      padding: 0,
    },
    alertBanner: {
      backgroundColor: "#f0fdf4",
      border: "1px solid #bbf7d0",
      color: "#166534",
      padding: "12px 16px",
      borderRadius: "8px",
      fontSize: "14px",
      fontWeight: "500",
      marginBottom: "20px",
    },
    emptyState: {
      padding: "40px",
      textAlign: "center",
      color: "#64748b",
      fontSize: "15px"
    },
    // Modal Overlay Styling Component Styles
    modalOverlay: {
      position: "fixed",
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: "rgba(15, 23, 42, 0.4)",
      backdropFilter: "blur(4px)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: 1000,
    },
    modalCard: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      padding: "28px",
      width: "100%",
      maxWidth: "520px",
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      boxSizing: "border-box",
    },
    modalCardLarge: {
      maxWidth: "680px",
    },
    modalHeader: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      marginBottom: "20px",
      borderBottom: "1px solid #f1f5f9",
      paddingBottom: "12px",
    },
    modalTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      margin: 0,
    },
    closeXBtn: {
      background: "none",
      border: "none",
      fontSize: "20px",
      color: "#94a3b8",
      cursor: "pointer",
    },
    formGrid: {
      display: "flex",
      flexDirection: "column",
      gap: "16px",
    },
    input: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
    },
    label: {
      display: 'block', 
      fontSize: '13px', 
      fontWeight: '600', 
      color: '#475569', 
      marginBottom: '6px'
    },
    modalFooter: {
      display: "flex",
      justifyContent: "flex-end",
      gap: "12px",
      marginTop: "24px",
      borderTop: "1px solid #f1f5f9",
      paddingTop: "16px",
    },
    saveBtn: {
      padding: "10px 20px",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
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
        
        {/* Main Application Page Control Header */}
        <div style={styles.headerWrapper}>
          <div>
            <h1 style={styles.title}>Inventory Catalog Manager</h1>
            <p style={styles.subtitle}>Configure inventory structural parameters and manage products cleanly inside models.</p>
          </div>
          
          <div style={styles.actionButtonGroup}>
            <button style={styles.actionBtn} onClick={() => setIsGroupOpen(true)}>+ Stock Group</button>
            <button style={styles.actionBtn} onClick={() => setIsUnitOpen(true)}>+ Measurement Unit</button>
            <button style={{ ...styles.actionBtn, ...styles.activeBtn }} onClick={() => { clearForm(); setIsProductOpen(true); }}>
              + Add Product Entry
            </button>
          </div>
        </div>

        {/* DATA SEARCH VIEW ENTRY CONTAINER */}
        <div>
          <div style={{ marginBottom: "20px" }}>
            <input 
              type="text"
              style={styles.input}
              placeholder="🔍 Search or verify products inside database..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onFocus={handleFocus}
              onBlur={handleBlur}
            />
          </div>

          {searchQuery.trim() !== "" && filteredProducts.length > 0 && (
            <div style={styles.alertBanner}>
              ✨ <strong>Matches Found:</strong> Found records aligning with "{searchQuery}".
            </div>
          )}

          <div style={styles.tableContainer}>
            {filteredProducts.length === 0 ? (
              <div style={styles.emptyState}>
                {searchQuery.trim() !== "" 
                  ? `No matching records found for "${searchQuery}". Use the entry forms to register it!` 
                  : "No products in system. Add parameters to begin catalog management."
                }
              </div>
            ) : (
              <table style={styles.table}>
                <thead>
<tr>
  <th style={styles.th}>Image</th>
  <th style={styles.th}>Product Name</th>
  <th style={styles.th}>Stock Group</th>
  <th style={styles.th}>Unit Configuration</th>
  <th style={styles.th}>Actions</th>
</tr>
</thead>
                <tbody>
  {filteredProducts.map((p) => (
    <tr key={p._id}>

      <td style={styles.td}>
        {p.image ? (
          <img
            src={p.image}
            alt={p.name}
            style={{
              width: 60,
              height: 60,
              objectFit: "cover",
              borderRadius: 8,
            }}
          />
        ) : (
          "No Image"
        )}
      </td>

      <td style={styles.td}>
        <strong>{p.name}</strong>
      </td>

      <td style={styles.td}>
        {p.stockGroup?.name}
      </td>

      <td style={styles.td}>
        {p.unit?.symbol}
      </td>
                      <td style={styles.td}>
                        <div style={styles.actionFlex}>
                          <button
                            style={styles.editBtn}
                            onClick={() => handleEditInit(p)}
                            onMouseOver={(e) => e.currentTarget.style.textDecoration = "underline"}
                            onMouseOut={(e) => e.currentTarget.style.textDecoration = "none"}
                          >
                            Edit
                          </button>
                          <button
                            style={styles.deleteBtn}
                            onClick={() => handleDelete(p._id)}
                            onMouseOver={(e) => e.currentTarget.style.color = "#b91c1c"}
                            onMouseOut={(e) => e.currentTarget.style.color = "#ef4444"}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* ========================================= MODAL OVERLAYS ========================================= */}

        {/* 1. STOCK GROUP MODAL */}
        {isGroupOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Quick Add: Stock Group</h3>
                <button style={styles.closeXBtn} onClick={() => setIsGroupOpen(false)}>&times;</button>
              </div>
              <form onSubmit={addStockGroup} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Stock Group Name</label>
                  <input
                    type="text"
                    required
                    value={groupName}
                    onChange={(e) => setGroupName(e.target.value)}
                    placeholder="e.g., Electronics, Raw Materials"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div style={styles.modalFooter}>
                  <button type="button" style={styles.actionBtn} onClick={() => setIsGroupOpen(false)}>Cancel</button>
                  <button type="submit" style={{ ...styles.saveBtn, backgroundColor: "#2563eb" }}>Add Group</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 2. MEASUREMENT UNIT MODAL */}
        {isUnitOpen && (
          <div style={styles.modalOverlay}>
            <div style={styles.modalCard}>
              <div style={styles.modalHeader}>
                <h3 style={styles.modalTitle}>Quick Add: Measurement Unit</h3>
                <button style={styles.closeXBtn} onClick={() => setIsUnitOpen(false)}>&times;</button>
              </div>
              <form onSubmit={addUnit} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Unit Configuration Name</label>
                  <input
                    type="text"
                    required
                    value={unitForm.name}
                    onChange={(e) => setUnitForm({ ...unitForm, name: e.target.value })}
                    placeholder="e.g., Kilogram, Litre"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div>
                  <label style={styles.label}>Standard Unit Symbol</label>
                  <input
                    type="text"
                    required
                    value={unitForm.symbol}
                    onChange={(e) => setUnitForm({ ...unitForm, symbol: e.target.value })}
                    placeholder="e.g., kg, L, pcs"
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                <div style={styles.modalFooter}>
                  <button type="button" style={styles.actionBtn} onClick={() => setIsUnitOpen(false)}>Cancel</button>
                  <button type="submit" style={{ ...styles.saveBtn, backgroundColor: "#2563eb" }}>Add Unit Setup</button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* 3. REGISTER/EDIT PRODUCT MODAL */}
        {isProductOpen && (
          <div style={styles.modalOverlay}>
            <div style={{ ...styles.modalCard, ...styles.modalCardLarge }}>
              <div style={styles.modalHeader}>
                <h3 style={{ ...styles.modalTitle, color: editingId ? '#2563eb' : '#0f172a' }}>
                  {editingId ? '📝 Edit Product Parameters' : 'Product Details Entry'}
                </h3>
                <button style={styles.closeXBtn} onClick={() => { setIsProductOpen(false); clearForm(); }}>&times;</button>
              </div>
              <form onSubmit={handleSave} style={styles.formGrid}>
                <div>
                  <label style={styles.label}>Product Name</label>
                  <input 
                    type="text" 
                    placeholder="Enter unique catalog item name" 
                    required 
                    value={form.name} 
                    onChange={e => setForm({...form, name: e.target.value})} 
                    style={styles.input}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                  />
                </div>
                 
                <div>
                  <label style={styles.label}>Stock Group Assignment</label>
                  <select
                    value={form.stockGroup}
                    onChange={(e) => setForm({ ...form, stockGroup: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">Select Stock Group</option>
                    {stockGroups.map(group => (
                      <option key={group._id} value={group._id}>{group.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={styles.label}>Unit Dimension</label>
                  <select
                    value={form.unit}
                    onChange={(e) => setForm({ ...form, unit: e.target.value })}
                    style={styles.input}
                    required
                  >
                    <option value="">Select Unit Option</option>
                    {units.map(unit => (
                      <option key={unit._id} value={unit._id}>{unit.symbol} ({unit.name})</option>
                    ))}
                  </select>
                </div>
<div>
  <label style={styles.label}>Product Image</label>

  <input
    type="file"
    accept="image/*"
    onChange={(e) =>
      setForm({
        ...form,
        image: e.target.files[0],
      })
    }
    style={styles.input}
  />
</div>
                <div style={styles.modalFooter}>
                  <button 
                    type="button" 
                    style={styles.actionBtn} 
                    onClick={() => { setIsProductOpen(false); clearForm(); }}
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit" 
                    disabled={loading}
                    style={{
                      ...styles.saveBtn,
                      backgroundColor: loading ? "#93c5fd" : (editingId ? "#16a34a" : "#2563eb"),
                      cursor: loading ? "not-allowed" : "pointer"
                    }}
                  >
                    {loading ? 'Saving Parameters...' : (editingId ? 'Update Item' : 'Save Catalog Product')}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      </div>
    </div>
  );
};

export default Products;