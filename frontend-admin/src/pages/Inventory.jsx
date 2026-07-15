// // // // // // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // // // // // import api from '../utils/api';

// // // // // // // // // // // const Products = () => {
// // // // // // // // // // //   const [products, setProducts] = useState([]);
// // // // // // // // // // //   const [form, setForm] = useState({ name: '', price: 0, stock: 0 });
// // // // // // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // // // // // //   useEffect(() => { fetchProducts(); }, []);
// // // // // // // // // // //   const fetchProducts = async () => { const res = await api.get('/products'); setProducts(res.data); };

// // // // // // // // // // //   const handleSave = async (e) => {
// // // // // // // // // // //     e.preventDefault();
// // // // // // // // // // //     if(editId) await api.put(`/products/${editId}`, form);
// // // // // // // // // // //     else await api.post('/products', form);
// // // // // // // // // // //     setForm({ name: '', price: 0, stock: 0 });
// // // // // // // // // // //     setEditId(null);
// // // // // // // // // // //     fetchProducts();
// // // // // // // // // // //   };

// // // // // // // // // // //   return (
// // // // // // // // // // //     <div className="space-y-6">
// // // // // // // // // // //       <h1 className="text-3xl font-bold">Store Catalog & Stock Inventory</h1>
// // // // // // // // // // //       <form onSubmit={handleSave} className="bg-white p-4 rounded shadow flex space-x-4">
// // // // // // // // // // //         <input type="text" placeholder="Product Item Name" value={form.name} onChange={e=>setForm({...form, name: e.target.value})} className="border p-2 flex-1 rounded" required />
// // // // // // // // // // //         <input type="number" placeholder="Price" value={form.price} onChange={e=>setForm({...form, price: Number(e.target.value)})} className="border p-2 w-32 rounded" required />
// // // // // // // // // // //         <input type="number" placeholder="Initial Inventory Units" value={form.stock} onChange={e=>setForm({...form, stock: Number(e.target.value)})} className="border p-2 w-32 rounded" required />
// // // // // // // // // // //         <button type="submit" className="bg-indigo-600 text-white px-6 py-2 rounded">{editId ? 'Modify' : 'Add Item'}</button>
// // // // // // // // // // //       </form>

// // // // // // // // // // //       <div className="bg-white rounded shadow p-4">
// // // // // // // // // // //         {products.map(p => (
// // // // // // // // // // //           <div key={p._id} className="flex justify-between p-3 border-b items-center">
// // // // // // // // // // //             <div>
// // // // // // // // // // //               <p className="font-semibold text-lg">{p.name}</p>
// // // // // // // // // // //               <p className="text-sm text-gray-500">Unit Price: ₹{p.price}</p>
// // // // // // // // // // //             </div>
// // // // // // // // // // //             <div className="flex items-center space-x-6">
// // // // // // // // // // //               <span className={`px-3 py-1 rounded text-sm ${p.stock < 5 ? 'bg-red-100 text-red-700 font-bold' : 'bg-gray-100'}`}>Stock: {p.stock} units</span>
// // // // // // // // // // //               <button onClick={() => { setEditId(p._id); setForm(p); }} className="text-blue-600">Update</button>
// // // // // // // // // // //             </div>
// // // // // // // // // // //           </div>
// // // // // // // // // // //         ))}
// // // // // // // // // // //       </div>
// // // // // // // // // // //     </div>
// // // // // // // // // // //   );
// // // // // // // // // // // };

// // // // // // // // // // // export default Products;






// // // // // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // // // // import api from '../utils/api';

// // // // // // // // // // const Products = () => {
// // // // // // // // // //   const [products, setProducts] = useState([]);
// // // // // // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // // // // // //   const [form, setForm] = useState({ 
// // // // // // // // // //     name: '', 
// // // // // // // // // //     price: 0, 
// // // // // // // // // //     stock: 0 
// // // // // // // // // //   });
// // // // // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // // // // //   useEffect(() => { 
// // // // // // // // // //     fetchProducts(); 
// // // // // // // // // //   }, []);

// // // // // // // // // //   const fetchProducts = async () => {
// // // // // // // // // //     try {
// // // // // // // // // //       const res = await api.get('/products');
// // // // // // // // // //       setProducts(res.data);
// // // // // // // // // //     } catch (error) {
// // // // // // // // // //       console.error(error);
// // // // // // // // // //       alert('Failed to fetch product catalog');
// // // // // // // // // //     }
// // // // // // // // // //   };

// // // // // // // // // //   const handleSave = async (e) => {
// // // // // // // // // //     e.preventDefault();
// // // // // // // // // //     try {
// // // // // // // // // //       if (editId) {
// // // // // // // // // //         await api.put(`/products/${editId}`, form);
// // // // // // // // // //         alert('Product inventory updated successfully!');
// // // // // // // // // //       } else {
// // // // // // // // // //         await api.post('/products', form);
// // // // // // // // // //         alert('Product item registered successfully!');
// // // // // // // // // //       }
// // // // // // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // // // // // //       setEditId(null);
// // // // // // // // // //       fetchProducts();
// // // // // // // // // //     } catch (error) {
// // // // // // // // // //       console.error(error);
// // // // // // // // // //       alert('Failed to save product information');
// // // // // // // // // //     }
// // // // // // // // // //   };

// // // // // // // // // //   const handleDelete = async (id) => {
// // // // // // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // // // // // //       try {
// // // // // // // // // //         await api.delete(`/products/${id}`);
// // // // // // // // // //         fetchProducts();
// // // // // // // // // //       } catch (error) {
// // // // // // // // // //         console.error(error);
// // // // // // // // // //         alert('Failed to delete product item');
// // // // // // // // // //       }
// // // // // // // // // //     }
// // // // // // // // // //   };

// // // // // // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // // // // // //   const filteredProducts = products.filter(p => {
// // // // // // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // // // // // //     if (!query) return true;
// // // // // // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // // // // // //   });

// // // // // // // // // //   const styles = {
// // // // // // // // // //     page: {
// // // // // // // // // //       minHeight: "100vh",
// // // // // // // // // //       backgroundColor: "#f8fafc",
// // // // // // // // // //       padding: "32px",
// // // // // // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // // // // // //       boxSizing: "border-box",
// // // // // // // // // //     },
// // // // // // // // // //     headerFlex: {
// // // // // // // // // //       display: "flex",
// // // // // // // // // //       justifyContent: "space-between",
// // // // // // // // // //       alignItems: "center",
// // // // // // // // // //       marginBottom: "24px",
// // // // // // // // // //     },
// // // // // // // // // //     title: {
// // // // // // // // // //       fontSize: "28px",
// // // // // // // // // //       fontWeight: "700",
// // // // // // // // // //       color: "#0f172a",
// // // // // // // // // //       letterSpacing: "-0.5px",
// // // // // // // // // //       margin: 0,
// // // // // // // // // //     },
// // // // // // // // // //     subtitle: {
// // // // // // // // // //       fontSize: "14px",
// // // // // // // // // //       color: "#64748b",
// // // // // // // // // //       marginTop: "4px",
// // // // // // // // // //       marginBottom: 0,
// // // // // // // // // //     },
// // // // // // // // // //     bottomGrid: {
// // // // // // // // // //       display: "grid",
// // // // // // // // // //       gridTemplateColumns: "1fr 2fr",
// // // // // // // // // //       gap: "24px",
// // // // // // // // // //       alignItems: "start",
// // // // // // // // // //     },
// // // // // // // // // //     card: {
// // // // // // // // // //       background: "#ffffff",
// // // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // // //       borderRadius: "14px",
// // // // // // // // // //       padding: "20px",
// // // // // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // // // // //       boxSizing: "border-box",
// // // // // // // // // //     },
// // // // // // // // // //     panelTitle: {
// // // // // // // // // //       fontSize: "16px",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       color: "#0f172a",
// // // // // // // // // //       marginTop: 0,
// // // // // // // // // //       marginBottom: "16px",
// // // // // // // // // //     },
// // // // // // // // // //     formGroupGrid: {
// // // // // // // // // //       display: "flex",
// // // // // // // // // //       flexDirection: "column",
// // // // // // // // // //       gap: "14px",
// // // // // // // // // //     },
// // // // // // // // // //     input: {
// // // // // // // // // //       width: "100%",
// // // // // // // // // //       padding: "12px 14px",
// // // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // // //       borderRadius: "10px",
// // // // // // // // // //       fontSize: "14px",
// // // // // // // // // //       color: "#0f172a",
// // // // // // // // // //       backgroundColor: "#ffffff",
// // // // // // // // // //       outline: "none",
// // // // // // // // // //       transition: "border-color 0.2s",
// // // // // // // // // //       boxSizing: "border-box",
// // // // // // // // // //     },
// // // // // // // // // //     searchBarContainer: {
// // // // // // // // // //       marginBottom: "16px",
// // // // // // // // // //     },
// // // // // // // // // //     tableContainer: {
// // // // // // // // // //       background: "#ffffff",
// // // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // // //       borderRadius: "14px",
// // // // // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // // // // //       overflow: "hidden",
// // // // // // // // // //     },
// // // // // // // // // //     table: {
// // // // // // // // // //       width: "100%",
// // // // // // // // // //       borderCollapse: "collapse",
// // // // // // // // // //       textAlign: "left",
// // // // // // // // // //     },
// // // // // // // // // //     th: {
// // // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // // //       color: "#334155",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       padding: "14px",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // // // // // //     },
// // // // // // // // // //     tr: {
// // // // // // // // // //       transition: "background-color 0.2s",
// // // // // // // // // //     },
// // // // // // // // // //     td: {
// // // // // // // // // //       padding: "14px",
// // // // // // // // // //       fontSize: "14px",
// // // // // // // // // //       color: "#0f172a",
// // // // // // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // // // // // //     },
// // // // // // // // // //     primaryBtn: {
// // // // // // // // // //       width: "100%",
// // // // // // // // // //       padding: "12px",
// // // // // // // // // //       background: "#2563eb",
// // // // // // // // // //       color: "#ffffff",
// // // // // // // // // //       border: "none",
// // // // // // // // // //       borderRadius: "10px",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       fontSize: "14px",
// // // // // // // // // //       cursor: "pointer",
// // // // // // // // // //       transition: "background-color 0.2s",
// // // // // // // // // //       marginTop: "6px",
// // // // // // // // // //     },
// // // // // // // // // //     cancelBtn: {
// // // // // // // // // //       width: "100%",
// // // // // // // // // //       padding: "10px",
// // // // // // // // // //       background: "#f1f5f9",
// // // // // // // // // //       color: "#334155",
// // // // // // // // // //       border: "none",
// // // // // // // // // //       borderRadius: "10px",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       cursor: "pointer",
// // // // // // // // // //       transition: "background-color 0.2s",
// // // // // // // // // //       marginTop: "2px",
// // // // // // // // // //     },
// // // // // // // // // //     stockTextNormal: {
// // // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // // //       color: "#334155",
// // // // // // // // // //       padding: "4px 10px",
// // // // // // // // // //       borderRadius: "8px",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //     },
// // // // // // // // // //     stockTextAlert: {
// // // // // // // // // //       backgroundColor: "#fee2e2",
// // // // // // // // // //       color: "#dc2626",
// // // // // // // // // //       padding: "4px 10px",
// // // // // // // // // //       borderRadius: "8px",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       fontWeight: "700",
// // // // // // // // // //     },
// // // // // // // // // //     currencyText: {
// // // // // // // // // //       color: "#0f172a",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //     },
// // // // // // // // // //     actionFlex: {
// // // // // // // // // //       display: "flex",
// // // // // // // // // //       gap: "12px",
// // // // // // // // // //     },
// // // // // // // // // //     editBtn: {
// // // // // // // // // //       background: "none",
// // // // // // // // // //       border: "none",
// // // // // // // // // //       color: "#2563eb",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       cursor: "pointer",
// // // // // // // // // //       padding: 0,
// // // // // // // // // //     },
// // // // // // // // // //     removeBtn: {
// // // // // // // // // //       background: "none",
// // // // // // // // // //       border: "none",
// // // // // // // // // //       color: "#dc2626",
// // // // // // // // // //       fontWeight: "600",
// // // // // // // // // //       fontSize: "13px",
// // // // // // // // // //       cursor: "pointer",
// // // // // // // // // //       padding: 0,
// // // // // // // // // //     },
// // // // // // // // // //     emptyState: {
// // // // // // // // // //       color: "#64748b",
// // // // // // // // // //       fontSize: "14px",
// // // // // // // // // //       textAlign: "center",
// // // // // // // // // //       padding: "32px 0",
// // // // // // // // // //       margin: 0,
// // // // // // // // // //     },
// // // // // // // // // //   };

// // // // // // // // // //   return (
// // // // // // // // // //     <div style={styles.page}>
// // // // // // // // // //       {/* Page Header */}
// // // // // // // // // //       <div style={styles.headerFlex}>
// // // // // // // // // //         <div>
// // // // // // // // // //           <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // // // // // //           <p style={styles.subtitle}>
// // // // // // // // // //             Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // // // // // //           </p>
// // // // // // // // // //         </div>
// // // // // // // // // //       </div>

// // // // // // // // // //       {/* Main Bottom Operational Grid */}
// // // // // // // // // //       <div style={styles.bottomGrid}>
        
// // // // // // // // // //         {/* LEFT SIDE: CONTROL FORM CARD */}
// // // // // // // // // //         <div style={styles.card}>
// // // // // // // // // //           <h3 style={styles.panelTitle}>
// // // // // // // // // //             {editId ? "Modify Product Parameters" : "Register Catalog Item"}
// // // // // // // // // //           </h3>
// // // // // // // // // //           <form onSubmit={handleSave} style={styles.formGroupGrid}>
// // // // // // // // // //             <input 
// // // // // // // // // //               type="text" 
// // // // // // // // // //               placeholder="Product Item Name" 
// // // // // // // // // //               required 
// // // // // // // // // //               value={form.name} 
// // // // // // // // // //               onChange={e => setForm({...form, name: e.target.value})} 
// // // // // // // // // //               style={styles.input}
// // // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // // //             />
// // // // // // // // // //             <input 
// // // // // // // // // //               type="number" 
// // // // // // // // // //               placeholder="Unit Price (₹)" 
// // // // // // // // // //               required 
// // // // // // // // // //               value={form.price || ''} 
// // // // // // // // // //               onChange={e => setForm({...form, price: Number(e.target.value)})} 
// // // // // // // // // //               style={styles.input}
// // // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // // //             />
// // // // // // // // // //             <input 
// // // // // // // // // //               type="number" 
// // // // // // // // // //               placeholder="Initial Inventory Units" 
// // // // // // // // // //               required 
// // // // // // // // // //               value={form.stock || ''} 
// // // // // // // // // //               onChange={e => setForm({...form, stock: Number(e.target.value)})} 
// // // // // // // // // //               style={styles.input}
// // // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // // //             />
            
// // // // // // // // // //             <button 
// // // // // // // // // //               type="submit" 
// // // // // // // // // //               style={styles.primaryBtn}
// // // // // // // // // //               onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
// // // // // // // // // //               onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
// // // // // // // // // //             >
// // // // // // // // // //               {editId ? 'Update Parameters' : 'Save Item'}
// // // // // // // // // //             </button>

// // // // // // // // // //             {editId && (
// // // // // // // // // //               <button
// // // // // // // // // //                 type="button"
// // // // // // // // // //                 style={styles.cancelBtn}
// // // // // // // // // //                 onClick={() => {
// // // // // // // // // //                   setEditId(null);
// // // // // // // // // //                   setForm({ name: '', price: 0, stock: 0 });
// // // // // // // // // //                 }}
// // // // // // // // // //                 onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#e2e8f0")}
// // // // // // // // // //                 onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#f1f5f9")}
// // // // // // // // // //               >
// // // // // // // // // //                 Cancel Edit
// // // // // // // // // //               </button>
// // // // // // // // // //             )}
// // // // // // // // // //           </form>
// // // // // // // // // //         </div>

// // // // // // // // // //         {/* RIGHT SIDE: INTERACTIVE INVENTORY LOOKUP & TABLE */}
// // // // // // // // // //         <div>
// // // // // // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // // // // // //           <div style={styles.searchBarContainer}>
// // // // // // // // // //             <input 
// // // // // // // // // //               type="text"
// // // // // // // // // //               style={styles.input}
// // // // // // // // // //               placeholder="Quick search catalog by item name..."
// // // // // // // // // //               value={searchQuery}
// // // // // // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // // //             />
// // // // // // // // // //           </div>

// // // // // // // // // //           <div style={styles.tableContainer}>
// // // // // // // // // //             <table style={styles.table}>
// // // // // // // // // //               <thead>
// // // // // // // // // //                 <tr>
// // // // // // // // // //                   <th style={styles.th}>Product Item Profile</th>
// // // // // // // // // //                   <th style={styles.th}>Master Unit Price</th>
// // // // // // // // // //                   <th style={styles.th}>Stock Allocation</th>
// // // // // // // // // //                   <th style={styles.th}>Actions</th>
// // // // // // // // // //                 </tr>
// // // // // // // // // //               </thead>
// // // // // // // // // //               <tbody>
// // // // // // // // // //                 {filteredProducts.length === 0 ? (
// // // // // // // // // //                   <tr>
// // // // // // // // // //                     <td colSpan="4" style={styles.td}>
// // // // // // // // // //                       <p style={styles.emptyState}>
// // // // // // // // // //                         {products.length === 0 
// // // // // // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // // // // // //                           : "No items matched your search filtering criteria."}
// // // // // // // // // //                       </p>
// // // // // // // // // //                     </td>
// // // // // // // // // //                   </tr>
// // // // // // // // // //                 ) : (
// // // // // // // // // //                   filteredProducts.map((p) => (
// // // // // // // // // //                     <tr 
// // // // // // // // // //                       key={p._id} 
// // // // // // // // // //                       style={styles.tr}
// // // // // // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // // // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // // // // // //                     >
// // // // // // // // // //                       <td style={styles.td}>
// // // // // // // // // //                         <strong>{p.name}</strong>
// // // // // // // // // //                       </td>
// // // // // // // // // //                       <td style={styles.td}>
// // // // // // // // // //                         <span style={styles.currencyText}>₹{p.price}</span>
// // // // // // // // // //                       </td>
// // // // // // // // // //                       <td style={styles.td}>
// // // // // // // // // //                         <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // // // // // //                           {p.stock} units
// // // // // // // // // //                         </span>
// // // // // // // // // //                       </td>
// // // // // // // // // //                       <td style={styles.td}>
// // // // // // // // // //                         <div style={styles.actionFlex}>
// // // // // // // // // //                           <button 
// // // // // // // // // //                             style={styles.editBtn} 
// // // // // // // // // //                             onClick={() => { setEditId(p._id); setForm(p); }}
// // // // // // // // // //                           >
// // // // // // // // // //                             Edit
// // // // // // // // // //                           </button>
// // // // // // // // // //                           <button 
// // // // // // // // // //                             style={styles.removeBtn} 
// // // // // // // // // //                             onClick={() => handleDelete(p._id)}
// // // // // // // // // //                           >
// // // // // // // // // //                             Remove
// // // // // // // // // //                           </button>
// // // // // // // // // //                         </div>
// // // // // // // // // //                       </td>
// // // // // // // // // //                     </tr>
// // // // // // // // // //                   ))
// // // // // // // // // //                 )}
// // // // // // // // // //               </tbody>
// // // // // // // // // //             </table>
// // // // // // // // // //           </div>
// // // // // // // // // //         </div>

// // // // // // // // // //       </div>
// // // // // // // // // //     </div>
// // // // // // // // // //   );
// // // // // // // // // // };

// // // // // // // // // // export default Products;



// // // // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // // // import api from '../utils/api';

// // // // // // // // // const Products = () => {
// // // // // // // // //   const [products, setProducts] = useState([]);
// // // // // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // // // // //   const [form, setForm] = useState({ 
// // // // // // // // //     name: '', 
// // // // // // // // //     price: 0, 
// // // // // // // // //     stock: 0 
// // // // // // // // //   });
// // // // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // // // //   useEffect(() => { 
// // // // // // // // //     fetchProducts(); 
// // // // // // // // //   }, []);

// // // // // // // // //   const fetchProducts = async () => {
// // // // // // // // //     try {
// // // // // // // // //       const res = await api.get('/products');
// // // // // // // // //       setProducts(res.data);
// // // // // // // // //     } catch (error) {
// // // // // // // // //       console.error(error);
// // // // // // // // //       alert('Failed to fetch product catalog');
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const handleSave = async (e) => {
// // // // // // // // //     e.preventDefault();
// // // // // // // // //     try {
// // // // // // // // //       if (editId) {
// // // // // // // // //         await api.put(`/products/${editId}`, form);
// // // // // // // // //         alert('Product inventory updated successfully!');
// // // // // // // // //       } else {
// // // // // // // // //         await api.post('/products', form);
// // // // // // // // //         alert('Product item registered successfully!');
// // // // // // // // //       }
// // // // // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // // // // //       setEditId(null);
// // // // // // // // //       fetchProducts();
// // // // // // // // //     } catch (error) {
// // // // // // // // //       console.error(error);
// // // // // // // // //       alert('Failed to save product information');
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const handleDelete = async (id) => {
// // // // // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // // // // //       try {
// // // // // // // // //         await api.delete(`/products/${id}`);
// // // // // // // // //         fetchProducts();
// // // // // // // // //       } catch (error) {
// // // // // // // // //         console.error(error);
// // // // // // // // //         alert('Failed to delete product item');
// // // // // // // // //       }
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // // // // //   const filteredProducts = products.filter(p => {
// // // // // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // // // // //     if (!query) return true;
// // // // // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // // // // //   });

// // // // // // // // //   const styles = {
// // // // // // // // //     page: {
// // // // // // // // //       minHeight: "100vh",
// // // // // // // // //       backgroundColor: "#f8fafc",
// // // // // // // // //       padding: "32px",
// // // // // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // // // // //       boxSizing: "border-box",
// // // // // // // // //       display: "flex",
// // // // // // // // //       flexDirection: "column",
// // // // // // // // //       alignItems: "center",
// // // // // // // // //     },
// // // // // // // // //     mainContainer: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       maxWidth: "900px",
// // // // // // // // //     },
// // // // // // // // //     headerFlex: {
// // // // // // // // //       display: "flex",
// // // // // // // // //       justifyContent: "space-between",
// // // // // // // // //       alignItems: "center",
// // // // // // // // //       marginBottom: "24px",
// // // // // // // // //     },
// // // // // // // // //     title: {
// // // // // // // // //       fontSize: "28px",
// // // // // // // // //       fontWeight: "700",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       letterSpacing: "-0.5px",
// // // // // // // // //       margin: 0,
// // // // // // // // //     },
// // // // // // // // //     subtitle: {
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#64748b",
// // // // // // // // //       marginTop: "4px",
// // // // // // // // //       marginBottom: 0,
// // // // // // // // //     },
// // // // // // // // //     input: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       padding: "12px 14px",
// // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // //       borderRadius: "10px",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       backgroundColor: "#ffffff",
// // // // // // // // //       outline: "none",
// // // // // // // // //       transition: "border-color 0.2s",
// // // // // // // // //       boxSizing: "border-box",
// // // // // // // // //     },
// // // // // // // // //     searchBarContainer: {
// // // // // // // // //       marginBottom: "16px",
// // // // // // // // //     },
// // // // // // // // //     tableContainer: {
// // // // // // // // //       background: "#ffffff",
// // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // //       borderRadius: "14px",
// // // // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // // // //       overflow: "hidden",
// // // // // // // // //     },
// // // // // // // // //     table: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       borderCollapse: "collapse",
// // // // // // // // //       textAlign: "left",
// // // // // // // // //     },
// // // // // // // // //     th: {
// // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // //       color: "#334155",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       padding: "14px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // // // // //     },
// // // // // // // // //     tr: {
// // // // // // // // //       transition: "background-color 0.2s",
// // // // // // // // //     },
// // // // // // // // //     td: {
// // // // // // // // //       padding: "14px",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // // // // //     },
// // // // // // // // //     stockTextNormal: {
// // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // //       color: "#334155",
// // // // // // // // //       padding: "4px 10px",
// // // // // // // // //       borderRadius: "8px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //     },
// // // // // // // // //     stockTextAlert: {
// // // // // // // // //       backgroundColor: "#fee2e2",
// // // // // // // // //       color: "#dc2626",
// // // // // // // // //       padding: "4px 10px",
// // // // // // // // //       borderRadius: "8px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       fontWeight: "700",
// // // // // // // // //     },
// // // // // // // // //     currencyText: {
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //     },
// // // // // // // // //     actionFlex: {
// // // // // // // // //       display: "flex",
// // // // // // // // //       gap: "12px",
// // // // // // // // //     },
// // // // // // // // //     editBtn: {
// // // // // // // // //       background: "none",
// // // // // // // // //       border: "none",
// // // // // // // // //       color: "#2563eb",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       cursor: "pointer",
// // // // // // // // //       padding: 0,
// // // // // // // // //     },
// // // // // // // // //     removeBtn: {
// // // // // // // // //       background: "none",
// // // // // // // // //       border: "none",
// // // // // // // // //       color: "#dc2626",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       cursor: "pointer",
// // // // // // // // //       padding: 0,
// // // // // // // // //     },
// // // // // // // // //     emptyState: {
// // // // // // // // //       color: "#64748b",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       textAlign: "center",
// // // // // // // // //       padding: "32px 0",
// // // // // // // // //       margin: 0,
// // // // // // // // //     },
// // // // // // // // //   };

// // // // // // // // //   return (
// // // // // // // // //     <div style={styles.page}>
// // // // // // // // //       <div style={styles.mainContainer}>
// // // // // // // // //         {/* Page Header */}
// // // // // // // // //         <div style={styles.headerFlex}>
// // // // // // // // //           <div>
// // // // // // // // //             <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // // // // //             <p style={styles.subtitle}>
// // // // // // // // //               Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // // // // //             </p>
// // // // // // // // //           </div>
// // // // // // // // //         </div>

// // // // // // // // //         {/* RIGHT SIDE ONLY Components: INTERACTIVE INVENTORY LOOKUP & TABLE */}
// // // // // // // // //         <div>
// // // // // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // // // // //           <div style={styles.searchBarContainer}>
// // // // // // // // //             <input 
// // // // // // // // //               type="text"
// // // // // // // // //               style={styles.input}
// // // // // // // // //               placeholder="Quick search catalog by item name..."
// // // // // // // // //               value={searchQuery}
// // // // // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // //             />
// // // // // // // // //           </div>

// // // // // // // // //           <div style={styles.tableContainer}>
// // // // // // // // //             <table style={styles.table}>
// // // // // // // // //               <thead>
// // // // // // // // //                 <tr>
// // // // // // // // //                   <th style={styles.th}>Product Item Profile</th>
// // // // // // // // //                   <th style={styles.th}>Master Unit Price</th>
// // // // // // // // //                   <th style={styles.th}>Stock Allocation</th>
// // // // // // // // //                   <th style={styles.th}>Actions</th>
// // // // // // // // //                 </tr>
// // // // // // // // //               </thead>
// // // // // // // // //               <tbody>
// // // // // // // // //                 {filteredProducts.length === 0 ? (
// // // // // // // // //                   <tr>
// // // // // // // // //                     <td colSpan="4" style={styles.td}>
// // // // // // // // //                       <p style={styles.emptyState}>
// // // // // // // // //                         {products.length === 0 
// // // // // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // // // // //                           : "No items matched your search filtering criteria."}
// // // // // // // // //                       </p>
// // // // // // // // //                     </td>
// // // // // // // // //                   </tr>
// // // // // // // // //                 ) : (
// // // // // // // // //                   filteredProducts.map((p) => (
// // // // // // // // //                     <tr 
// // // // // // // // //                       key={p._id} 
// // // // // // // // //                       style={styles.tr}
// // // // // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // // // // //                     >
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <strong>{p.name}</strong>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <span style={styles.currencyText}>₹{p.price}</span>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // // // // //                           {p.stock} units
// // // // // // // // //                         </span>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <div style={styles.actionFlex}>
// // // // // // // // //                           <button 
// // // // // // // // //                             style={styles.editBtn} 
// // // // // // // // //                             onClick={() => { setEditId(p._id); setForm(p); }}
// // // // // // // // //                           >
// // // // // // // // //                             Edit
// // // // // // // // //                           </button>
// // // // // // // // //                           <button 
// // // // // // // // //                             style={styles.removeBtn} 
// // // // // // // // //                             onClick={() => handleDelete(p._id)}
// // // // // // // // //                           >
// // // // // // // // //                             Remove
// // // // // // // // //                           </button>
// // // // // // // // //                         </div>
// // // // // // // // //                       </td>
// // // // // // // // //                     </tr>
// // // // // // // // //                   ))
// // // // // // // // //                 )}
// // // // // // // // //               </tbody>
// // // // // // // // //             </table>
// // // // // // // // //           </div>
// // // // // // // // //         </div>
// // // // // // // // //       </div>
// // // // // // // // //     </div>
// // // // // // // // //   );
// // // // // // // // // };

// // // // // // // // // export default Products;




// // // // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // // // import api from '../utils/api';

// // // // // // // // // const Products = () => {
// // // // // // // // //   const [products, setProducts] = useState([]);
// // // // // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // // // // //   const [form, setForm] = useState({ 
// // // // // // // // //     name: '', 
// // // // // // // // //     price: 0, 
// // // // // // // // //     stock: 0 
// // // // // // // // //   });
// // // // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // // // //   useEffect(() => { 
// // // // // // // // //     fetchProducts(); 
// // // // // // // // //   }, []);

// // // // // // // // //   const fetchProducts = async () => {
// // // // // // // // //     try {
// // // // // // // // //       const res = await api.get('/products');
// // // // // // // // //       setProducts(res.data);
// // // // // // // // //     } catch (error) {
// // // // // // // // //       console.error(error);
// // // // // // // // //       alert('Failed to fetch product catalog');
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const handleSave = async (e) => {
// // // // // // // // //     e.preventDefault();
// // // // // // // // //     try {
// // // // // // // // //       if (editId) {
// // // // // // // // //         await api.put(`/products/${editId}`, form);
// // // // // // // // //         alert('Product inventory updated successfully!');
// // // // // // // // //       } else {
// // // // // // // // //         await api.post('/products', form);
// // // // // // // // //         alert('Product item registered successfully!');
// // // // // // // // //       }
// // // // // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // // // // //       setEditId(null);
// // // // // // // // //       fetchProducts();
// // // // // // // // //     } catch (error) {
// // // // // // // // //       console.error(error);
// // // // // // // // //       alert('Failed to save product information');
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   const handleDelete = async (id) => {
// // // // // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // // // // //       try {
// // // // // // // // //         await api.delete(`/products/${id}`);
// // // // // // // // //         fetchProducts();
// // // // // // // // //       } catch (error) {
// // // // // // // // //         console.error(error);
// // // // // // // // //         alert('Failed to delete product item');
// // // // // // // // //       }
// // // // // // // // //     }
// // // // // // // // //   };

// // // // // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // // // // //   const filteredProducts = products.filter(p => {
// // // // // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // // // // //     if (!query) return true;
// // // // // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // // // // //   });

// // // // // // // // //   const styles = {
// // // // // // // // //     page: {
// // // // // // // // //       minHeight: "100vh",
// // // // // // // // //       backgroundColor: "#f8fafc",
// // // // // // // // //       padding: "32px",
// // // // // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // // // // //       boxSizing: "border-box",
// // // // // // // // //       display: "flex",
// // // // // // // // //       flexDirection: "column",
// // // // // // // // //       alignItems: "center",
// // // // // // // // //     },
// // // // // // // // //     mainContainer: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       maxWidth: "900px",
// // // // // // // // //     },
// // // // // // // // //     headerFlex: {
// // // // // // // // //       display: "flex",
// // // // // // // // //       justifyContent: "space-between",
// // // // // // // // //       alignItems: "center",
// // // // // // // // //       marginBottom: "24px",
// // // // // // // // //     },
// // // // // // // // //     title: {
// // // // // // // // //       fontSize: "28px",
// // // // // // // // //       fontWeight: "700",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       letterSpacing: "-0.5px",
// // // // // // // // //       margin: 0,
// // // // // // // // //     },
// // // // // // // // //     subtitle: {
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#64748b",
// // // // // // // // //       marginTop: "4px",
// // // // // // // // //       marginBottom: 0,
// // // // // // // // //     },
// // // // // // // // //     input: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       padding: "12px 14px",
// // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // //       borderRadius: "10px",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       backgroundColor: "#ffffff",
// // // // // // // // //       outline: "none",
// // // // // // // // //       transition: "border-color 0.2s",
// // // // // // // // //       boxSizing: "border-box",
// // // // // // // // //     },
// // // // // // // // //     searchBarContainer: {
// // // // // // // // //       marginBottom: "16px",
// // // // // // // // //     },
// // // // // // // // //     tableContainer: {
// // // // // // // // //       background: "#ffffff",
// // // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // // //       borderRadius: "14px",
// // // // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // // // //       overflow: "hidden",
// // // // // // // // //     },
// // // // // // // // //     table: {
// // // // // // // // //       width: "100%",
// // // // // // // // //       borderCollapse: "collapse",
// // // // // // // // //       textAlign: "left",
// // // // // // // // //     },
// // // // // // // // //     th: {
// // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // //       color: "#334155",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       padding: "14px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // // // // //     },
// // // // // // // // //     tr: {
// // // // // // // // //       transition: "background-color 0.2s",
// // // // // // // // //     },
// // // // // // // // //     td: {
// // // // // // // // //       padding: "14px",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // // // // //     },
// // // // // // // // //     stockTextNormal: {
// // // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // // //       color: "#334155",
// // // // // // // // //       padding: "4px 10px",
// // // // // // // // //       borderRadius: "8px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //     },
// // // // // // // // //     stockTextAlert: {
// // // // // // // // //       backgroundColor: "#fee2e2",
// // // // // // // // //       color: "#dc2626",
// // // // // // // // //       padding: "4px 10px",
// // // // // // // // //       borderRadius: "8px",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       fontWeight: "700",
// // // // // // // // //     },
// // // // // // // // //     currencyText: {
// // // // // // // // //       color: "#0f172a",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //     },
// // // // // // // // //     actionFlex: {
// // // // // // // // //       display: "flex",
// // // // // // // // //       gap: "12px",
// // // // // // // // //     },
// // // // // // // // //     editBtn: {
// // // // // // // // //       background: "none",
// // // // // // // // //       border: "none",
// // // // // // // // //       color: "#2563eb",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       cursor: "pointer",
// // // // // // // // //       padding: 0,
// // // // // // // // //     },
// // // // // // // // //     removeBtn: {
// // // // // // // // //       background: "none",
// // // // // // // // //       border: "none",
// // // // // // // // //       color: "#dc2626",
// // // // // // // // //       fontWeight: "600",
// // // // // // // // //       fontSize: "13px",
// // // // // // // // //       cursor: "pointer",
// // // // // // // // //       padding: 0,
// // // // // // // // //     },
// // // // // // // // //     emptyState: {
// // // // // // // // //       color: "#64748b",
// // // // // // // // //       fontSize: "14px",
// // // // // // // // //       textAlign: "center",
// // // // // // // // //       padding: "32px 0",
// // // // // // // // //       margin: 0,
// // // // // // // // //     },
// // // // // // // // //   };

// // // // // // // // //   return (
// // // // // // // // //     <div style={styles.page}>
// // // // // // // // //       <div style={styles.mainContainer}>
// // // // // // // // //         {/* Page Header */}
// // // // // // // // //         <div style={styles.headerFlex}>
// // // // // // // // //           <div>
// // // // // // // // //             <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // // // // //             <p style={styles.subtitle}>
// // // // // // // // //               Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // // // // //             </p>
// // // // // // // // //           </div>
// // // // // // // // //         </div>

// // // // // // // // //         {/* RIGHT SIDE ONLY Components: INTERACTIVE INVENTORY LOOK& LOOKUP & TABLE */}
// // // // // // // // //         <div>
// // // // // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // // // // //           <div style={styles.searchBarContainer}>
// // // // // // // // //             <input 
// // // // // // // // //               type="text"
// // // // // // // // //               style={styles.input}
// // // // // // // // //               placeholder="Quick search catalog by item name..."
// // // // // // // // //               value={searchQuery}
// // // // // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // // //             />
// // // // // // // // //           </div>

// // // // // // // // //           <div style={styles.tableContainer}>
// // // // // // // // //             <table style={styles.table}>
// // // // // // // // //               <thead>
// // // // // // // // //                 <tr>
// // // // // // // // //                   <th style={{ ...styles.th, width: "60px" }}>S.No.</th>
// // // // // // // // //                   <th style={styles.th}>Product Item Profile</th>
// // // // // // // // //                   <th style={styles.th}>Master Unit Price</th>
// // // // // // // // //                   <th style={styles.th}>Stock Allocation</th>
// // // // // // // // //                   <th style={styles.th}>Actions</th>
// // // // // // // // //                 </tr>
// // // // // // // // //               </thead>
// // // // // // // // //               <tbody>
// // // // // // // // //                 {filteredProducts.length === 0 ? (
// // // // // // // // //                   <tr>
// // // // // // // // //                     <td colSpan="5" style={styles.td}>
// // // // // // // // //                       <p style={styles.emptyState}>
// // // // // // // // //                         {products.length === 0 
// // // // // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // // // // //                           : "No items matched your search filtering criteria."}
// // // // // // // // //                       </p>
// // // // // // // // //                     </td>
// // // // // // // // //                   </tr>
// // // // // // // // //                 ) : (
// // // // // // // // //                   filteredProducts.map((p, index) => (
// // // // // // // // //                     <tr 
// // // // // // // // //                       key={p._id} 
// // // // // // // // //                       style={styles.tr}
// // // // // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // // // // //                     >
// // // // // // // // //                       <td style={{ ...styles.td, color: "#64748b", fontWeight: "500" }}>
// // // // // // // // //                         {index + 1}
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <strong>{p.name}</strong>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <span style={styles.currencyText}>₹{p.price}</span>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // // // // //                           {p.stock} units
// // // // // // // // //                         </span>
// // // // // // // // //                       </td>
// // // // // // // // //                       <td style={styles.td}>
// // // // // // // // //                         <div style={styles.actionFlex}>
// // // // // // // // //                           <button 
// // // // // // // // //                             style={styles.editBtn} 
// // // // // // // // //                             onClick={() => { setEditId(p._id); setForm(p); }}
// // // // // // // // //                           >
// // // // // // // // //                             Edit
// // // // // // // // //                           </button>
// // // // // // // // //                           <button 
// // // // // // // // //                             style={styles.removeBtn} 
// // // // // // // // //                             onClick={() => handleDelete(p._id)}
// // // // // // // // //                           >
// // // // // // // // //                             Remove
// // // // // // // // //                           </button>
// // // // // // // // //                         </div>
// // // // // // // // //                       </td>
// // // // // // // // //                     </tr>
// // // // // // // // //                   ))
// // // // // // // // //                 )}
// // // // // // // // //               </tbody>
// // // // // // // // //             </table>
// // // // // // // // //           </div>
// // // // // // // // //         </div>
// // // // // // // // //       </div>
// // // // // // // // //     </div>
// // // // // // // // //   );
// // // // // // // // // };

// // // // // // // // // export default Products;




// // // // // // // // // this is good 






// // // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // // import api from '../utils/api';

// // // // // // // // const Products = () => {
// // // // // // // //   const [products, setProducts] = useState([]);
// // // // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // // // //   const [form, setForm] = useState({ 
// // // // // // // //     name: '', 
// // // // // // // //     price: 0, 
// // // // // // // //     stock: 0 
// // // // // // // //   });
// // // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // // //   useEffect(() => { 
// // // // // // // //     fetchProducts(); 
// // // // // // // //   }, []);

// // // // // // // //   const fetchProducts = async () => {
// // // // // // // //     try {
// // // // // // // //       const res = await api.get('/products');
// // // // // // // //       setProducts(res.data);
// // // // // // // //     } catch (error) {
// // // // // // // //       console.error(error);
// // // // // // // //       alert('Failed to fetch product catalog');
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const handleSave = async (e) => {
// // // // // // // //     e.preventDefault();
// // // // // // // //     try {
// // // // // // // //       if (editId) {
// // // // // // // //         await api.put(`/products/${editId}`, form);
// // // // // // // //         alert('Product inventory updated successfully!');
// // // // // // // //       } else {
// // // // // // // //         await api.post('/products', form);
// // // // // // // //         alert('Product item registered successfully!');
// // // // // // // //       }
// // // // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // // // //       setEditId(null);
// // // // // // // //       fetchProducts();
// // // // // // // //     } catch (error) {
// // // // // // // //       console.error(error);
// // // // // // // //       alert('Failed to save product information');
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   const handleDelete = async (id) => {
// // // // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // // // //       try {
// // // // // // // //         await api.delete(`/products/${id}`);
// // // // // // // //         fetchProducts();
// // // // // // // //       } catch (error) {
// // // // // // // //         console.error(error);
// // // // // // // //         alert('Failed to delete product item');
// // // // // // // //       }
// // // // // // // //     }
// // // // // // // //   };

// // // // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // // // //   const filteredProducts = products.filter(p => {
// // // // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // // // //     if (!query) return true;
// // // // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // // // //   });

// // // // // // // //   const styles = {
// // // // // // // //     page: {
// // // // // // // //       minHeight: "100vh",
// // // // // // // //       backgroundColor: "#f8fafc",
// // // // // // // //       padding: "32px",
// // // // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // // // //       boxSizing: "border-box",
// // // // // // // //       display: "flex",
// // // // // // // //       flexDirection: "column",
// // // // // // // //       alignItems: "center",
// // // // // // // //     },
// // // // // // // //     mainContainer: {
// // // // // // // //       width: "100%",
// // // // // // // //       maxWidth: "900px",
// // // // // // // //     },
// // // // // // // //     headerFlex: {
// // // // // // // //       display: "flex",
// // // // // // // //       justifyContent: "space-between",
// // // // // // // //       alignItems: "center",
// // // // // // // //       marginBottom: "24px",
// // // // // // // //     },
// // // // // // // //     title: {
// // // // // // // //       fontSize: "28px",
// // // // // // // //       fontWeight: "700",
// // // // // // // //       color: "#0f172a",
// // // // // // // //       letterSpacing: "-0.5px",
// // // // // // // //       margin: 0,
// // // // // // // //     },
// // // // // // // //     subtitle: {
// // // // // // // //       fontSize: "14px",
// // // // // // // //       color: "#64748b",
// // // // // // // //       marginTop: "4px",
// // // // // // // //       marginBottom: 0,
// // // // // // // //     },
// // // // // // // //     input: {
// // // // // // // //       width: "100%",
// // // // // // // //       padding: "12px 14px",
// // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // //       borderRadius: "10px",
// // // // // // // //       fontSize: "14px",
// // // // // // // //       color: "#0f172a",
// // // // // // // //       backgroundColor: "#ffffff",
// // // // // // // //       outline: "none",
// // // // // // // //       transition: "border-color 0.2s",
// // // // // // // //       boxSizing: "border-box",
// // // // // // // //     },
// // // // // // // //     searchBarContainer: {
// // // // // // // //       marginBottom: "16px",
// // // // // // // //     },
// // // // // // // //     tableContainer: {
// // // // // // // //       background: "#ffffff",
// // // // // // // //       border: "1px solid #e2e8f0",
// // // // // // // //       borderRadius: "14px",
// // // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // // //       overflow: "hidden",
// // // // // // // //     },
// // // // // // // //     table: {
// // // // // // // //       width: "100%",
// // // // // // // //       borderCollapse: "collapse",
// // // // // // // //       textAlign: "left",
// // // // // // // //     },
// // // // // // // //     th: {
// // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // //       color: "#334155",
// // // // // // // //       fontWeight: "600",
// // // // // // // //       padding: "14px",
// // // // // // // //       fontSize: "13px",
// // // // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // // // //     },
// // // // // // // //     tr: {
// // // // // // // //       transition: "background-color 0.2s",
// // // // // // // //     },
// // // // // // // //     td: {
// // // // // // // //       padding: "14px",
// // // // // // // //       fontSize: "14px",
// // // // // // // //       color: "#0f172a",
// // // // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // // // //     },
// // // // // // // //     stockTextNormal: {
// // // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // // //       color: "#334155",
// // // // // // // //       padding: "4px 10px",
// // // // // // // //       borderRadius: "8px",
// // // // // // // //       fontSize: "13px",
// // // // // // // //       fontWeight: "600",
// // // // // // // //     },
// // // // // // // //     stockTextAlert: {
// // // // // // // //       backgroundColor: "#fee2e2",
// // // // // // // //       color: "#dc2626",
// // // // // // // //       padding: "4px 10px",
// // // // // // // //       borderRadius: "8px",
// // // // // // // //       fontSize: "13px",
// // // // // // // //       fontWeight: "700",
// // // // // // // //     },
// // // // // // // //     currencyText: {
// // // // // // // //       color: "#0f172a",
// // // // // // // //       fontWeight: "600",
// // // // // // // //     },
// // // // // // // //     actionFlex: {
// // // // // // // //       display: "flex",
// // // // // // // //       gap: "12px",
// // // // // // // //     },
// // // // // // // //     editBtn: {
// // // // // // // //       background: "none",
// // // // // // // //       border: "none",
// // // // // // // //       color: "#2563eb",
// // // // // // // //       fontWeight: "600",
// // // // // // // //       fontSize: "13px",
// // // // // // // //       cursor: "pointer",
// // // // // // // //       padding: 0,
// // // // // // // //     },
// // // // // // // //     removeBtn: {
// // // // // // // //       background: "none",
// // // // // // // //       border: "none",
// // // // // // // //       color: "#dc2626",
// // // // // // // //       fontWeight: "600",
// // // // // // // //       fontSize: "13px",
// // // // // // // //       cursor: "pointer",
// // // // // // // //       padding: 0,
// // // // // // // //     },
// // // // // // // //     emptyState: {
// // // // // // // //       color: "#64748b",
// // // // // // // //       fontSize: "14px",
// // // // // // // //       textAlign: "center",
// // // // // // // //       padding: "32px 0",
// // // // // // // //       margin: 0,
// // // // // // // //     },
// // // // // // // //   };

// // // // // // // //   return (
// // // // // // // //     <div style={styles.page}>
// // // // // // // //       <div style={styles.mainContainer}>
// // // // // // // //         {/* Page Header */}
// // // // // // // //         <div style={styles.headerFlex}>
// // // // // // // //           <div>
// // // // // // // //             <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // // // //             <p style={styles.subtitle}>
// // // // // // // //               Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // // // //             </p>
// // // // // // // //           </div>
// // // // // // // //         </div>

// // // // // // // //         {/* RIGHT SIDE ONLY Components: INTERACTIVE INVENTORY LOOK& LOOKUP & TABLE */}
// // // // // // // //         <div>
// // // // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // // // //           <div style={styles.searchBarContainer}>
// // // // // // // //             <input 
// // // // // // // //               type="text"
// // // // // // // //               style={styles.input}
// // // // // // // //               placeholder="Quick search catalog by item name..."
// // // // // // // //               value={searchQuery}
// // // // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // // //             />
// // // // // // // //           </div>

// // // // // // // //           <div style={styles.tableContainer}>
// // // // // // // //             <table style={styles.table}>
// // // // // // // //               <thead>
// // // // // // // //                 <tr>
// // // // // // // //                   <th style={{ ...styles.th, width: "60px" }}>S.No.</th>
// // // // // // // //                   <th style={styles.th}>Product Item Profile</th>
// // // // // // // //                   <th style={styles.th}>Master Unit Price</th>
// // // // // // // //                   <th style={styles.th}>Stock Allocation</th>
// // // // // // // //                   <th style={styles.th}>Actions</th>
// // // // // // // //                 </tr>
// // // // // // // //               </thead>
// // // // // // // //               <tbody>
// // // // // // // //                 {filteredProducts.length === 0 ? (
// // // // // // // //                   <tr>
// // // // // // // //                     <td colSpan="5" style={styles.td}>
// // // // // // // //                       <p style={styles.emptyState}>
// // // // // // // //                         {products.length === 0 
// // // // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // // // //                           : "No items matched your search filtering criteria."}
// // // // // // // //                       </p>
// // // // // // // //                     </td>
// // // // // // // //                   </tr>
// // // // // // // //                 ) : (
// // // // // // // //                   filteredProducts.map((p, index) => (
// // // // // // // //                     <tr 
// // // // // // // //                       key={p._id} 
// // // // // // // //                       style={styles.tr}
// // // // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
// // // // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // // // //                     >
// // // // // // // //                       <td style={{ ...styles.td, color: "#64748b", fontWeight: "500" }}>
// // // // // // // //                         {index + 1}
// // // // // // // //                       </td>
// // // // // // // // <td style={styles.td}>
// // // // // // // //   {editId === p._id ? (
// // // // // // // //     <input
// // // // // // // //       value={form.name}
// // // // // // // //       onChange={(e) =>
// // // // // // // //         setForm({ ...form, name: e.target.value })
// // // // // // // //       }
// // // // // // // //     />
// // // // // // // //   ) : (
// // // // // // // //     <strong>{p.name}</strong>
// // // // // // // //   )}
// // // // // // // // </td>
// // // // // // // //                       <td style={styles.td}>
// // // // // // // //   {editId === p._id ? (
// // // // // // // //     <input
// // // // // // // //       type="number"
// // // // // // // //       value={form.price}
// // // // // // // //       onChange={(e) =>
// // // // // // // //         setForm({
// // // // // // // //           ...form,
// // // // // // // //           price: Number(e.target.value)
// // // // // // // //         })
// // // // // // // //       }
// // // // // // // //     />
// // // // // // // //   ) : (
// // // // // // // //     <span style={styles.currencyText}>₹{p.price}</span>
// // // // // // // //   )}
// // // // // // // // </td>
// // // // // // // //                       <td style={styles.td}>
// // // // // // // //   {editId === p._id ? (
// // // // // // // //     <input
// // // // // // // //       type="number"
// // // // // // // //       value={form.stock}
// // // // // // // //       onChange={(e) =>
// // // // // // // //         setForm({
// // // // // // // //           ...form,
// // // // // // // //           stock: Number(e.target.value)
// // // // // // // //         })
// // // // // // // //       }
// // // // // // // //     />
// // // // // // // //   ) : (
// // // // // // // //     <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // // // //       {p.stock} units
// // // // // // // //     </span>
// // // // // // // //   )}
// // // // // // // // </td>
// // // // // // // //                       <td style={styles.td}>
// // // // // // // //                         <div style={styles.actionFlex}>
// // // // // // // //                           {editId === p._id ? (
// // // // // // // //   <>
// // // // // // // //     <button
// // // // // // // //       style={styles.editBtn}
// // // // // // // //       onClick={async () => {
// // // // // // // //         try {
// // // // // // // //           await api.put(`/products/${p._id}`, form);

// // // // // // // //           alert("Product updated successfully");

// // // // // // // //           setEditId(null);

// // // // // // // //           fetchProducts();
// // // // // // // //         } catch (error) {
// // // // // // // //           console.error(error);
// // // // // // // //           alert("Update failed");
// // // // // // // //         }
// // // // // // // //       }}
// // // // // // // //     >
// // // // // // // //       Save
// // // // // // // //     </button>

// // // // // // // //     <button
// // // // // // // //       style={styles.removeBtn}
// // // // // // // //       onClick={() => setEditId(null)}
// // // // // // // //     >
// // // // // // // //       Cancel
// // // // // // // //     </button>
// // // // // // // //   </>
// // // // // // // // ) : (
// // // // // // // //   <button
// // // // // // // //     style={styles.editBtn}
// // // // // // // //     onClick={() => {
// // // // // // // //       setEditId(p._id);

// // // // // // // //       setForm({
// // // // // // // //         name: p.name,
// // // // // // // //         price: p.price,
// // // // // // // //         stock: p.stock
// // // // // // // //       });
// // // // // // // //     }}
// // // // // // // //   >
// // // // // // // //     Edit
// // // // // // // //   </button>
// // // // // // // // )}
// // // // // // // //                           <button 
// // // // // // // //                             style={styles.removeBtn} 
// // // // // // // //                             onClick={() => handleDelete(p._id)}
// // // // // // // //                           >
// // // // // // // //                             Remove
// // // // // // // //                           </button>
// // // // // // // //                         </div>
// // // // // // // //                       </td>
// // // // // // // //                     </tr>
// // // // // // // //                   ))
// // // // // // // //                 )}
// // // // // // // //               </tbody>
// // // // // // // //             </table>
// // // // // // // //           </div>
// // // // // // // //         </div>
// // // // // // // //       </div>
// // // // // // // //     </div>
// // // // // // // //   );
// // // // // // // // };

// // // // // // // // export default Products;




// // // // // // // import React, { useState, useEffect } from 'react';
// // // // // // // import api from '../utils/api';

// // // // // // // const Products = () => {
// // // // // // //   const [products, setProducts] = useState([]);
// // // // // // //   const [searchQuery, setSearchQuery] = useState("");
// // // // // // //   const [form, setForm] = useState({ 
// // // // // // //     name: '', 
// // // // // // //     price: 0, 
// // // // // // //     stock: 0 
// // // // // // //   });
// // // // // // //   const [editId, setEditId] = useState(null);

// // // // // // //   useEffect(() => { 
// // // // // // //     fetchProducts(); 
// // // // // // //   }, []);

// // // // // // //   const fetchProducts = async () => {
// // // // // // //     try {
// // // // // // //       const res = await api.get('/products');
// // // // // // //       setProducts(res.data);
// // // // // // //     } catch (error) {
// // // // // // //       console.error(error);
// // // // // // //       alert('Failed to fetch product catalog');
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const handleSave = async (e) => {
// // // // // // //     if (e) e.preventDefault();
// // // // // // //     try {
// // // // // // //       if (editId) {
// // // // // // //         await api.put(`/products/${editId}`, form);
// // // // // // //         alert('Product inventory updated successfully!');
// // // // // // //       } else {
// // // // // // //         await api.post('/products', form);
// // // // // // //         alert('Product item registered successfully!');
// // // // // // //       }
// // // // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // // // //       setEditId(null);
// // // // // // //       fetchProducts();
// // // // // // //     } catch (error) {
// // // // // // //       console.error(error);
// // // // // // //       alert('Failed to save product information');
// // // // // // //     }
// // // // // // //   };

// // // // // // //   const handleDelete = async (id) => {
// // // // // // //     if (confirm('Are you sure you want to remove this product permanently?')) {
// // // // // // //       try {
// // // // // // //         await api.delete(`/products/${id}`);
// // // // // // //         fetchProducts();
// // // // // // //       } catch (error) {
// // // // // // //         console.error(error);
// // // // // // //         alert('Failed to delete product item');
// // // // // // //       }
// // // // // // //     }
// // // // // // //   };

// // // // // // //   // Client-side real-time filter logic matching the Student Directory paradigm
// // // // // // //   const filteredProducts = products.filter(p => {
// // // // // // //     const query = searchQuery.toLowerCase().trim();
// // // // // // //     if (!query) return true;
// // // // // // //     return p.name?.toLowerCase().includes(query);
// // // // // // //   });

// // // // // // //   const styles = {
// // // // // // //     page: {
// // // // // // //       minHeight: "100vh",
// // // // // // //       backgroundColor: "#f8fafc",
// // // // // // //       padding: "32px",
// // // // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // // // //       boxSizing: "border-box",
// // // // // // //       display: "flex",
// // // // // // //       flexDirection: "column",
// // // // // // //       alignItems: "center",
// // // // // // //     },
// // // // // // //     mainContainer: {
// // // // // // //       width: "100%",
// // // // // // //       maxWidth: "900px",
// // // // // // //     },
// // // // // // //     headerFlex: {
// // // // // // //       display: "flex",
// // // // // // //       justifyContent: "space-between",
// // // // // // //       alignItems: "center",
// // // // // // //       marginBottom: "24px",
// // // // // // //     },
// // // // // // //     title: {
// // // // // // //       fontSize: "28px",
// // // // // // //       fontWeight: "700",
// // // // // // //       color: "#0f172a",
// // // // // // //       letterSpacing: "-0.5px",
// // // // // // //       margin: 0,
// // // // // // //     },
// // // // // // //     subtitle: {
// // // // // // //       fontSize: "14px",
// // // // // // //       color: "#64748b",
// // // // // // //       marginTop: "4px",
// // // // // // //       marginBottom: 0,
// // // // // // //     },
// // // // // // //     input: {
// // // // // // //       width: "100%",
// // // // // // //       padding: "12px 14px",
// // // // // // //       border: "1px solid #e2e8f0",
// // // // // // //       borderRadius: "10px",
// // // // // // //       fontSize: "14px",
// // // // // // //       color: "#0f172a",
// // // // // // //       backgroundColor: "#ffffff",
// // // // // // //       outline: "none",
// // // // // // //       transition: "border-color 0.2s",
// // // // // // //       boxSizing: "border-box",
// // // // // // //     },
// // // // // // //     tableInput: {
// // // // // // //       width: "100%",
// // // // // // //       padding: "8px 12px",
// // // // // // //       border: "1px solid #2563eb",
// // // // // // //       borderRadius: "8px",
// // // // // // //       fontSize: "14px",
// // // // // // //       color: "#0f172a",
// // // // // // //       backgroundColor: "#ffffff",
// // // // // // //       outline: "none",
// // // // // // //       boxSizing: "border-box",
// // // // // // //     },
// // // // // // //     searchBarContainer: {
// // // // // // //       marginBottom: "16px",
// // // // // // //     },
// // // // // // //     tableContainer: {
// // // // // // //       background: "#ffffff",
// // // // // // //       border: "1px solid #e2e8f0",
// // // // // // //       borderRadius: "14px",
// // // // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
// // // // // // //       overflow: "hidden",
// // // // // // //     },
// // // // // // //     table: {
// // // // // // //       width: "100%",
// // // // // // //       borderCollapse: "collapse",
// // // // // // //       textAlign: "left",
// // // // // // //     },
// // // // // // //     th: {
// // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // //       color: "#334155",
// // // // // // //       fontWeight: "600",
// // // // // // //       padding: "14px",
// // // // // // //       fontSize: "13px",
// // // // // // //       borderBottom: "2px solid #e2e8f0",
// // // // // // //     },
// // // // // // //     tr: {
// // // // // // //       transition: "background-color 0.2s",
// // // // // // //     },
// // // // // // //     td: {
// // // // // // //       padding: "14px",
// // // // // // //       fontSize: "14px",
// // // // // // //       color: "#0f172a",
// // // // // // //       borderBottom: "1px solid #e2e8f0",
// // // // // // //       verticalAlign: "middle",
// // // // // // //     },
// // // // // // //     stockTextNormal: {
// // // // // // //       backgroundColor: "#f1f5f9",
// // // // // // //       color: "#334155",
// // // // // // //       padding: "4px 10px",
// // // // // // //       borderRadius: "8px",
// // // // // // //       fontSize: "13px",
// // // // // // //       fontWeight: "600",
// // // // // // //     },
// // // // // // //     stockTextAlert: {
// // // // // // //       backgroundColor: "#fee2e2",
// // // // // // //       color: "#dc2626",
// // // // // // //       padding: "4px 10px",
// // // // // // //       borderRadius: "8px",
// // // // // // //       fontSize: "13px",
// // // // // // //       fontWeight: "700",
// // // // // // //     },
// // // // // // //     currencyText: {
// // // // // // //       color: "#0f172a",
// // // // // // //       fontWeight: "600",
// // // // // // //     },
// // // // // // //     actionFlex: {
// // // // // // //       display: "flex",
// // // // // // //       gap: "12px",
// // // // // // //       alignItems: "center",
// // // // // // //     },
// // // // // // //     editBtn: {
// // // // // // //       background: "none",
// // // // // // //       border: "none",
// // // // // // //       color: "#2563eb",
// // // // // // //       fontWeight: "600",
// // // // // // //       fontSize: "13px",
// // // // // // //       cursor: "pointer",
// // // // // // //       padding: 0,
// // // // // // //     },
// // // // // // //     removeBtn: {
// // // // // // //       background: "none",
// // // // // // //       border: "none",
// // // // // // //       color: "#dc2626",
// // // // // // //       fontWeight: "600",
// // // // // // //       fontSize: "13px",
// // // // // // //       cursor: "pointer",
// // // // // // //       padding: 0,
// // // // // // //     },
// // // // // // //     emptyState: {
// // // // // // //       color: "#64748b",
// // // // // // //       fontSize: "14px",
// // // // // // //       textAlign: "center",
// // // // // // //       padding: "32px 0",
// // // // // // //       margin: 0,
// // // // // // //     },
// // // // // // //   };

// // // // // // //   return (
// // // // // // //     <div style={styles.page}>
// // // // // // //       <div style={styles.mainContainer}>
// // // // // // //         {/* Page Header */}
// // // // // // //         <div style={styles.headerFlex}>
// // // // // // //           <div>
// // // // // // //             <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // // //             <p style={styles.subtitle}>
// // // // // // //               Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // // //             </p>
// // // // // // //           </div>
// // // // // // //         </div>

// // // // // // //         {/* Components View: INTERACTIVE INVENTORY LOOKUP & TABLE */}
// // // // // // //         <div>
// // // // // // //           {/* Live Dynamic Table Filter Bar */}
// // // // // // //           <div style={styles.searchBarContainer}>
// // // // // // //             <input 
// // // // // // //               type="text"
// // // // // // //               style={styles.input}
// // // // // // //               placeholder="Quick search catalog by item name..."
// // // // // // //               value={searchQuery}
// // // // // // //               onChange={(e) => setSearchQuery(e.target.value)}
// // // // // // //               onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // // //               onBlur={(e) => (e.currentTarget.style.borderColor = "#e2e8f0")}
// // // // // // //             />
// // // // // // //           </div>

// // // // // // //           <div style={styles.tableContainer}>
// // // // // // //             <table style={styles.table}>
// // // // // // //               <thead>
// // // // // // //                 <tr>
// // // // // // //                   <th style={{ ...styles.th, width: "60px" }}>S.No.</th>
// // // // // // //                   <th style={{ ...styles.th, width: "35%" }}>Product Item Profile</th>
// // // // // // //                   <th style={{ ...styles.th, width: "20%" }}>Master Unit Price</th>
// // // // // // //                   <th style={{ ...styles.th, width: "20%" }}>Stock Allocation</th>
// // // // // // //                   <th style={styles.th}>Actions</th>
// // // // // // //                 </tr>
// // // // // // //               </thead>
// // // // // // //               <tbody>
// // // // // // //                 {filteredProducts.length === 0 ? (
// // // // // // //                   <tr>
// // // // // // //                     <td colSpan="5" style={styles.td}>
// // // // // // //                       <p style={styles.emptyState}>
// // // // // // //                         {products.length === 0 
// // // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // // //                           : "No items matched your search filtering criteria."}
// // // // // // //                       </p>
// // // // // // //                     </td>
// // // // // // //                   </tr>
// // // // // // //                 ) : (
// // // // // // //                   filteredProducts.map((p, index) => (
// // // // // // //                     <tr 
// // // // // // //                       key={p._id} 
// // // // // // //                       style={styles.tr}
// // // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = editId === p._id ? "transparent" : "#f8fafc")}
// // // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // // //                     >
// // // // // // //                       <td style={{ ...styles.td, color: "#64748b", fontWeight: "500" }}>
// // // // // // //                         {index + 1}
// // // // // // //                       </td>

// // // // // // //                       {/* Product Name Column */}
// // // // // // //                       <td style={styles.td}>
// // // // // // //                         {editId === p._id ? (
// // // // // // //                           <input
// // // // // // //                             type="text"
// // // // // // //                             style={styles.tableInput}
// // // // // // //                             value={form.name}
// // // // // // //                             onChange={(e) => setForm({ ...form, name: e.target.value })}
// // // // // // //                           />
// // // // // // //                         ) : (
// // // // // // //                           <strong>{p.name}</strong>
// // // // // // //                         )}
// // // // // // //                       </td>

// // // // // // //                       {/* Unit Price Column */}
// // // // // // //                       <td style={styles.td}>
// // // // // // //                         {editId === p._id ? (
// // // // // // //                           <input
// // // // // // //                             type="number"
// // // // // // //                             style={styles.tableInput}
// // // // // // //                             value={form.price || ''}
// // // // // // //                             onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
// // // // // // //                           />
// // // // // // //                         ) : (
// // // // // // //                           <span style={styles.currencyText}>₹{p.price}</span>
// // // // // // //                         )}
// // // // // // //                       </td>

// // // // // // //                       {/* Stock Allocation Column */}
// // // // // // //                       <td style={styles.td}>
// // // // // // //                         {editId === p._id ? (
// // // // // // //                           <input
// // // // // // //                             type="number"
// // // // // // //                             style={styles.tableInput}
// // // // // // //                             value={form.stock || ''}
// // // // // // //                             onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
// // // // // // //                           />
// // // // // // //                         ) : (
// // // // // // //                           <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // // //                             {p.stock} units
// // // // // // //                           </span>
// // // // // // //                         )}
// // // // // // //                       </td>

// // // // // // //                       {/* Context Actions Column */}
// // // // // // //                       <td style={styles.td}>
// // // // // // //                         <div style={styles.actionFlex}>
// // // // // // //                           {editId === p._id ? (
// // // // // // //                             <>
// // // // // // //                               <button
// // // // // // //                                 style={styles.editBtn}
// // // // // // //                                 onClick={handleSave}
// // // // // // //                               >
// // // // // // //                                 Save
// // // // // // //                               </button>
// // // // // // //                               <button
// // // // // // //                                 style={styles.removeBtn}
// // // // // // //                                 onClick={() => setEditId(null)}
// // // // // // //                               >
// // // // // // //                                 Cancel
// // // // // // //                               </button>
// // // // // // //                             </>
// // // // // // //                           ) : (
// // // // // // //                             <>
// // // // // // //                               <button
// // // // // // //                                 style={styles.editBtn}
// // // // // // //                                 onClick={() => {
// // // // // // //                                   setEditId(p._id);
// // // // // // //                                   setForm({
// // // // // // //                                     name: p.name,
// // // // // // //                                     price: p.price,
// // // // // // //                                     stock: p.stock
// // // // // // //                                   });
// // // // // // //                                 }}
// // // // // // //                               >
// // // // // // //                                 Edit
// // // // // // //                               </button>
// // // // // // //                               <button 
// // // // // // //                                 style={styles.removeBtn} 
// // // // // // //                                 onClick={() => handleDelete(p._id)}
// // // // // // //                               >
// // // // // // //                                 Remove
// // // // // // //                               </button>
// // // // // // //                             </>
// // // // // // //                           )}
// // // // // // //                         </div>
// // // // // // //                       </td>
// // // // // // //                     </tr>
// // // // // // //                   ))
// // // // // // //                 )}
// // // // // // //               </tbody>
// // // // // // //             </table>
// // // // // // //           </div>
// // // // // // //         </div>
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
// // // // // //     if (e) e.preventDefault();
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
// // // // // //       display: "flex",
// // // // // //       flexDirection: "column",
// // // // // //       alignItems: "center",
// // // // // //     },
// // // // // //     mainContainer: {
// // // // // //       width: "100%",
// // // // // //       maxWidth: "900px",
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
// // // // // //     tableInput: {
// // // // // //       width: "100%",
// // // // // //       padding: "8px 12px",
// // // // // //       border: "1px solid #cbd5e1",
// // // // // //       borderRadius: "8px",
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
// // // // // //       verticalAlign: "middle",
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
// // // // // //       alignItems: "center",
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
// // // // // //       <div style={styles.mainContainer}>
// // // // // //         {/* Page Header */}
// // // // // //         <div style={styles.headerFlex}>
// // // // // //           <div>
// // // // // //             <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // // //             <p style={styles.subtitle}>
// // // // // //               Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // // //             </p>
// // // // // //           </div>
// // // // // //         </div>

// // // // // //         {/* Components View: INTERACTIVE INVENTORY LOOKUP & TABLE */}
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
// // // // // //                   <th style={{ ...styles.th, width: "60px" }}>S.No.</th>
// // // // // //                   <th style={{ ...styles.th, width: "35%" }}>Product Item Profile</th>
// // // // // //                   <th style={{ ...styles.th, width: "20%" }}>Master Unit Price</th>
// // // // // //                   <th style={{ ...styles.th, width: "20%" }}>Stock Allocation</th>
// // // // // //                   <th style={styles.th}>Actions</th>
// // // // // //                 </tr>
// // // // // //               </thead>
// // // // // //               <tbody>
// // // // // //                 {filteredProducts.length === 0 ? (
// // // // // //                   <tr>
// // // // // //                     <td colSpan="5" style={styles.td}>
// // // // // //                       <p style={styles.emptyState}>
// // // // // //                         {products.length === 0 
// // // // // //                           ? "No active product metrics discovered in the system catalog."
// // // // // //                           : "No items matched your search filtering criteria."}
// // // // // //                       </p>
// // // // // //                     </td>
// // // // // //                   </tr>
// // // // // //                 ) : (
// // // // // //                   filteredProducts.map((p, index) => (
// // // // // //                     <tr 
// // // // // //                       key={p._id} 
// // // // // //                       style={styles.tr}
// // // // // //                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = editId === p._id ? "transparent" : "#f8fafc")}
// // // // // //                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
// // // // // //                     >
// // // // // //                       <td style={{ ...styles.td, color: "#64748b", fontWeight: "500" }}>
// // // // // //                         {index + 1}
// // // // // //                       </td>

// // // // // //                       {/* Product Name Column */}
// // // // // //                       <td style={styles.td}>
// // // // // //                         {editId === p._id ? (
// // // // // //                           <input
// // // // // //                             type="text"
// // // // // //                             style={styles.tableInput}
// // // // // //                             value={form.name}
// // // // // //                             onChange={(e) => setForm({ ...form, name: e.target.value })}
// // // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // // //                           />
// // // // // //                         ) : (
// // // // // //                           <strong>{p.name}</strong>
// // // // // //                         )}
// // // // // //                       </td>

// // // // // //                       {/* Unit Price Column */}
// // // // // //                       <td style={styles.td}>
// // // // // //                         {editId === p._id ? (
// // // // // //                           <input
// // // // // //                             type="number"
// // // // // //                             style={styles.tableInput}
// // // // // //                             value={form.price || ''}
// // // // // //                             onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
// // // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // // //                           />
// // // // // //                         ) : (
// // // // // //                           <span style={styles.currencyText}>₹{p.price}</span>
// // // // // //                         )}
// // // // // //                       </td>

// // // // // //                       {/* Stock Allocation Column */}
// // // // // //                       <td style={styles.td}>
// // // // // //                         {editId === p._id ? (
// // // // // //                           <input
// // // // // //                             type="number"
// // // // // //                             style={styles.tableInput}
// // // // // //                             value={form.stock || ''}
// // // // // //                             onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
// // // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // // //                           />
// // // // // //                         ) : (
// // // // // //                           <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // // //                             {p.stock} units
// // // // // //                           </span>
// // // // // //                         )}
// // // // // //                       </td>

// // // // // //                       {/* Context Actions Column */}
// // // // // //                       <td style={styles.td}>
// // // // // //                         <div style={styles.actionFlex}>
// // // // // //                           {editId === p._id ? (
// // // // // //                             <>
// // // // // //                               <button
// // // // // //                                 style={styles.editBtn}
// // // // // //                                 onClick={handleSave}
// // // // // //                               >
// // // // // //                                 Save
// // // // // //                               </button>
// // // // // //                               <button
// // // // // //                                 style={styles.removeBtn}
// // // // // //                                 onClick={() => setEditId(null)}
// // // // // //                               >
// // // // // //                                 Cancel
// // // // // //                               </button>
// // // // // //                             </>
// // // // // //                           ) : (
// // // // // //                             <>
// // // // // //                               <button
// // // // // //                                 style={styles.editBtn}
// // // // // //                                 onClick={() => {
// // // // // //                                   setEditId(p._id);
// // // // // //                                   setForm({
// // // // // //                                     name: p.name,
// // // // // //                                     price: p.price,
// // // // // //                                     stock: p.stock
// // // // // //                                   });
// // // // // //                                 }}
// // // // // //                               >
// // // // // //                                 Edit
// // // // // //                               </button>
// // // // // //                               <button 
// // // // // //                                 style={styles.removeBtn} 
// // // // // //                                 onClick={() => handleDelete(p._id)}
// // // // // //                               >
// // // // // //                                 Remove
// // // // // //                               </button>
// // // // // //                             </>
// // // // // //                           )}
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
// // // // //   const [editId, setEditId] = useState(null);

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
// // // // //     if (e) e.preventDefault();
// // // // //     try {
// // // // //       if (editId) {
// // // // //         await api.put(`/products/${editId}`, form);
// // // // //         alert('Product inventory updated successfully!');
// // // // //       } else {
// // // // //         await api.post('/products', form);
// // // // //         alert('Product item registered successfully!');
// // // // //       }
// // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // //       setEditId(null);
// // // // //       fetchProducts();
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to save product information');
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

// // // // //   const filteredProducts = products.filter(p => {
// // // // //     const query = searchQuery.toLowerCase().trim();
// // // // //     if (!query) return true;
// // // // //     return p.name?.toLowerCase().includes(query);
// // // // //   });

// // // // //   // Perfectly matched UI design paradigm styles
// // // // //   const styles = {
// // // // //     page: {
// // // // //       minHeight: "100vh",
// // // // //       backgroundColor: "#f8fafc",
// // // // //       padding: "32px",
// // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // //       boxSizing: "border-box"
// // // // //     },
// // // // //     header: {
// // // // //       marginBottom: "24px"
// // // // //     },
// // // // //     title: {
// // // // //       fontSize: "28px",
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a",
// // // // //       letterSpacing: "-0.5px",
// // // // //       margin: 0
// // // // //     },
// // // // //     subtitle: {
// // // // //       fontSize: "14px",
// // // // //       color: "#64748b",
// // // // //       marginTop: "4px",
// // // // //       marginBottom: 0
// // // // //     },
// // // // //     section: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       padding: "20px",
// // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
// // // // //     },
// // // // //     searchBarContainer: {
// // // // //       marginBottom: "16px",
// // // // //     },
// // // // //     input: {
// // // // //       width: "100%",
// // // // //       padding: "12px 14px",
// // // // //       border: "1px solid #cbd5e1",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     tableInput: {
// // // // //       width: "100%",
// // // // //       padding: "8px 12px",
// // // // //       border: "1px solid #cbd5e1",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     mainTableContainer: {
// // // // //       width: "100%",
// // // // //       overflowX: "auto",
// // // // //       borderRadius: "10px",
// // // // //       border: "1px solid #e2e8f0"
// // // // //     },
// // // // //     mainTable: {
// // // // //       width: "100%",
// // // // //       borderCollapse: "collapse",
// // // // //       textAlign: "left",
// // // // //       fontSize: "14px"
// // // // //     },
// // // // //     mainTh: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       fontWeight: "600",
// // // // //       padding: "14px",
// // // // //       borderBottom: "2px solid #e2e8f0",
// // // // //       fontSize: "13px"
// // // // //     },
// // // // //     mainTd: {
// // // // //       padding: "14px",
// // // // //       color: "#0f172a",
// // // // //       borderBottom: "1px solid #e2e8f0",
// // // // //       verticalAlign: "middle"
// // // // //     },
// // // // //     sNoText: {
// // // // //       color: "#64748b",
// // // // //       fontWeight: "500"
// // // // //     },
// // // // //     productNameText: {
// // // // //       fontWeight: "600",
// // // // //       color: "#0f172a"
// // // // //     },
// // // // //     amountText: {
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a"
// // // // //     },
// // // // //     stockTextNormal: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "11px",
// // // // //       fontWeight: "600",
// // // // //       display: "inline-block",
// // // // //       border: "1px solid #e2e8f0"
// // // // //     },
// // // // //     stockTextAlert: {
// // // // //       backgroundColor: "#fee2e2",
// // // // //       color: "#dc2626",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "11px",
// // // // //       fontWeight: "700",
// // // // //       display: "inline-block",
// // // // //       border: "1px solid #fca5a5"
// // // // //     },
// // // // //     actionFlex: {
// // // // //       display: "flex",
// // // // //       gap: "12px",
// // // // //       alignItems: "center"
// // // // //     },
// // // // //     editBtn: {
// // // // //       background: "none",
// // // // //       border: "none",
// // // // //       color: "#2563eb",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "13px",
// // // // //       cursor: "pointer",
// // // // //       padding: 0,
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
// // // // //     emptyState: {
// // // // //       color: "#64748b",
// // // // //       fontSize: "14px",
// // // // //       textAlign: "center",
// // // // //       padding: "40px 0",
// // // // //       margin: 0
// // // // //     }
// // // // //   };

// // // // //   return (
// // // // //     <div style={styles.page}>
// // // // //       {/* Header */}
// // // // //       <div style={styles.header}>
// // // // //         <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // //         {/* <p style={styles.subtitle}>
// // // // //           Manage institutional inventory metrics, master pricing schedules, and real-time stock parameters
// // // // //         </p> */}
// // // // //       </div>

// // // // //       {/* Main Content Component Container */}
// // // // //       <div style={styles.section}>
        
// // // // //         {/* Search Bar matching look and feel */}
// // // // //         <div style={styles.searchBarContainer}>
// // // // //           <input 
// // // // //             type="text"
// // // // //             style={styles.input}
// // // // //             placeholder="Quick search catalog by item name..."
// // // // //             value={searchQuery}
// // // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // // //             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //           />
// // // // //         </div>

// // // // //         {filteredProducts.length === 0 ? (
// // // // //           <p style={styles.emptyState}>
// // // // //             {products.length === 0 
// // // // //               ? "No active product metrics discovered in the system catalog."
// // // // //               : "No items matched your search filtering criteria."}
// // // // //           </p>
// // // // //         ) : (
// // // // //           <div style={styles.mainTableContainer}>
// // // // //             <table style={styles.mainTable}>
// // // // //               <thead>
// // // // //                 <tr>
// // // // //                   <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// // // // //                   <th style={styles.mainTh}>Product Item Profile</th>
// // // // //                   <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Master Unit Price</th>
// // // // //                   <th style={{ ...styles.mainTh, textAlign: "center", width: "180px" }}>Stock Allocation</th>
// // // // //                   <th style={{ ...styles.mainTh, width: "140px" }}>Actions</th>
// // // // //                 </tr>
// // // // //               </thead>
// // // // //               <tbody>
// // // // //                 {filteredProducts.map((p, index) => {
// // // // //                   const isEditing = editId === p._id;
// // // // //                   return (
// // // // //                     <tr 
// // // // //                       key={p._id} 
// // // // //                       style={{ 
// // // // //                         backgroundColor: isEditing ? "#f1f5f9" : "transparent",
// // // // //                         transition: "background-color 0.2s"
// // // // //                       }}
// // // // //                       onMouseOver={(e) => {
// // // // //                         if (!isEditing) e.currentTarget.style.backgroundColor = "#f8fafc";
// // // // //                       }}
// // // // //                       onMouseOut={(e) => {
// // // // //                         e.currentTarget.style.backgroundColor = isEditing ? "#f1f5f9" : "transparent";
// // // // //                       }}
// // // // //                     >
// // // // //                       {/* Serial Number Row */}
// // // // //                       <td style={{ ...styles.mainTd, ...styles.sNoText }}>
// // // // //                         {index + 1}
// // // // //                       </td>

// // // // //                       {/* Product Profile Column */}
// // // // //                       <td style={styles.mainTd}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="text"
// // // // //                             style={styles.tableInput}
// // // // //                             value={form.name}
// // // // //                             onChange={(e) => setForm({ ...form, name: e.target.value })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={styles.productNameText}>{p.name}</span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Unit Price Column */}
// // // // //                       <td style={{ ...styles.mainTd, textAlign: "right" }}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="number"
// // // // //                             style={{ ...styles.tableInput, textAlign: "right" }}
// // // // //                             value={form.price || ''}
// // // // //                             onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={styles.amountText}>₹{p.price}</span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Stock Tracking Badge Column */}
// // // // //                       <td style={{ ...styles.mainTd, textAlign: "center" }}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="number"
// // // // //                             style={{ ...styles.tableInput, textAlign: "center" }}
// // // // //                             value={form.stock || ''}
// // // // //                             onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // //                             {p.stock} units
// // // // //                           </span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Context Dashboard Level Actions */}
// // // // //                       <td style={styles.mainTd}>
// // // // //                         <div style={styles.actionFlex}>
// // // // //                           {isEditing ? (
// // // // //                             <>
// // // // //                               <button
// // // // //                                 style={styles.editBtn}
// // // // //                                 onClick={handleSave}
// // // // //                               >
// // // // //                                 Save
// // // // //                               </button>
// // // // //                               <button
// // // // //                                 style={styles.removeBtn}
// // // // //                                 onClick={() => setEditId(null)}
// // // // //                               >
// // // // //                                 Cancel
// // // // //                               </button>
// // // // //                             </>
// // // // //                           ) : (
// // // // //                             <>
// // // // //                               <button
// // // // //                                 style={styles.editBtn}
// // // // //                                 onClick={() => {
// // // // //                                   setEditId(p._id);
// // // // //                                   setForm({
// // // // //                                     name: p.name,
// // // // //                                     price: p.price,
// // // // //                                     stock: p.stock
// // // // //                                   });
// // // // //                                 }}
// // // // //                               >
// // // // //                                 Edit
// // // // //                               </button>
// // // // //                               <button 
// // // // //                                 style={styles.removeBtn} 
// // // // //                                 onClick={() => handleDelete(p._id)}
// // // // //                               >
// // // // //                                 Remove
// // // // //                               </button>
// // // // //                             </>
// // // // //                           )}
// // // // //                         </div>
// // // // //                       </td>
// // // // //                     </tr>
// // // // //                   );
// // // // //                 })}
// // // // //               </tbody>
// // // // //             </table>
// // // // //           </div>
// // // // //         )}
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
// // // // //   const [editId, setEditId] = useState(null);

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
// // // // //     if (e) e.preventDefault();
// // // // //     try {
// // // // //       if (editId) {
// // // // //         await api.put(`/products/${editId}`, form);
// // // // //         alert('Product inventory updated successfully!');
// // // // //       } else {
// // // // //         await api.post('/products', form);
// // // // //         alert('Product item registered successfully!');
// // // // //       }
// // // // //       setForm({ name: '', price: 0, stock: 0 });
// // // // //       setEditId(null);
// // // // //       fetchProducts();
// // // // //     } catch (error) {
// // // // //       console.error(error);
// // // // //       alert('Failed to save product information');
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

// // // // //   // Export ALL filtered catalog products to Excel (CSV format)
// // // // //   const downloadCatalogExcel = () => {
// // // // //     if (filteredProducts.length === 0) {
// // // // //       alert("No product data available to export.");
// // // // //       return;
// // // // //     }

// // // // //     // CSV Document Headers
// // // // //     const headers = [
// // // // //       "S.No.",
// // // // //       "Product Item Profile",
// // // // //       "Master Unit Price (INR)",
// // // // //       "Stock Allocation (Units)"
// // // // //     ];

// // // // //     // Map through the filtered products to transform them into rows
// // // // //     const rows = filteredProducts.map((p, index) => [
// // // // //       index + 1,
// // // // //       `"${p.name ? p.name.replace(/"/g, '""') : "N/A"}"`, // Escape internal quotes safely
// // // // //       p.price ?? 0,
// // // // //       p.stock ?? 0
// // // // //     ]);

// // // // //     // Construct CSV format block content
// // // // //     const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

// // // // //     // Trigger explicit browser attachment download
// // // // //     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
// // // // //     const url = URL.createObjectURL(blob);
// // // // //     const link = document.createElement("a");
// // // // //     link.setAttribute("href", url);
// // // // //     link.setAttribute("download", `Product_Catalog_Stock_Report.csv`);
// // // // //     document.body.appendChild(link);
// // // // //     link.click();
// // // // //     document.body.removeChild(link);
// // // // //   };

// // // // //   const filteredProducts = products.filter(p => {
// // // // //     const query = searchQuery.toLowerCase().trim();
// // // // //     if (!query) return true;
// // // // //     return p.name?.toLowerCase().includes(query);
// // // // //   });

// // // // //   // Perfectly matched UI design paradigm styles
// // // // //   const styles = {
// // // // //     page: {
// // // // //       minHeight: "100vh",
// // // // //       backgroundColor: "#f8fafc",
// // // // //       padding: "32px",
// // // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // // //       boxSizing: "border-box"
// // // // //     },
// // // // //     header: {
// // // // //       marginBottom: "24px",
// // // // //       display: "flex",
// // // // //       justifyContent: "space-between",
// // // // //       alignItems: "center",
// // // // //       flexWrap: "wrap",
// // // // //       gap: "16px"
// // // // //     },
// // // // //     title: {
// // // // //       fontSize: "28px",
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a",
// // // // //       letterSpacing: "-0.5px",
// // // // //       margin: 0
// // // // //     },
// // // // //     btnGlobalExcel: {
// // // // //       backgroundColor: "#2563eb",
// // // // //       color: "#ffffff",
// // // // //       border: "none",
// // // // //       borderRadius: "10px",
// // // // //       padding: "10px 18px",
// // // // //       fontSize: "14px",
// // // // //       fontWeight: "600",
// // // // //       cursor: "pointer",
// // // // //       display: "flex",
// // // // //       alignItems: "center",
// // // // //       gap: "8px",
// // // // //       boxShadow: "0 2px 4px rgba(37,  99,  235,  0.15)",
// // // // //       transition: "background-color 0.2s, transform 0.1s"
// // // // //     },
// // // // //     section: {
// // // // //       background: "#ffffff",
// // // // //       border: "1px solid #e2e8f0",
// // // // //       borderRadius: "14px",
// // // // //       padding: "20px",
// // // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
// // // // //     },
// // // // //     searchBarContainer: {
// // // // //       marginBottom: "16px",
// // // // //     },
// // // // //     input: {
// // // // //       width: "100%",
// // // // //       padding: "12px 14px",
// // // // //       border: "1px solid #cbd5e1",
// // // // //       borderRadius: "10px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     tableInput: {
// // // // //       width: "100%",
// // // // //       padding: "8px 12px",
// // // // //       border: "1px solid #cbd5e1",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "14px",
// // // // //       color: "#0f172a",
// // // // //       backgroundColor: "#ffffff",
// // // // //       outline: "none",
// // // // //       transition: "border-color 0.2s",
// // // // //       boxSizing: "border-box",
// // // // //     },
// // // // //     mainTableContainer: {
// // // // //       width: "100%",
// // // // //       overflowX: "auto",
// // // // //       borderRadius: "10px",
// // // // //       border: "1px solid #e2e8f0"
// // // // //     },
// // // // //     mainTable: {
// // // // //       width: "100%",
// // // // //       borderCollapse: "collapse",
// // // // //       textAlign: "left",
// // // // //       fontSize: "14px"
// // // // //     },
// // // // //     mainTh: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       fontWeight: "600",
// // // // //       padding: "14px",
// // // // //       borderBottom: "2px solid #e2e8f0",
// // // // //       fontSize: "13px"
// // // // //     },
// // // // //     mainTd: {
// // // // //       padding: "14px",
// // // // //       color: "#0f172a",
// // // // //       borderBottom: "1px solid #e2e8f0",
// // // // //       verticalAlign: "middle"
// // // // //     },
// // // // //     sNoText: {
// // // // //       color: "#64748b",
// // // // //       fontWeight: "500"
// // // // //     },
// // // // //     productNameText: {
// // // // //       fontWeight: "600",
// // // // //       color: "#0f172a"
// // // // //     },
// // // // //     amountText: {
// // // // //       fontWeight: "700",
// // // // //       color: "#0f172a"
// // // // //     },
// // // // //     stockTextNormal: {
// // // // //       backgroundColor: "#f1f5f9",
// // // // //       color: "#334155",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "11px",
// // // // //       fontWeight: "600",
// // // // //       display: "inline-block",
// // // // //       border: "1px solid #e2e8f0"
// // // // //     },
// // // // //     stockTextAlert: {
// // // // //       backgroundColor: "#fee2e2",
// // // // //       color: "#dc2626",
// // // // //       padding: "4px 10px",
// // // // //       borderRadius: "8px",
// // // // //       fontSize: "11px",
// // // // //       fontWeight: "700",
// // // // //       display: "inline-block",
// // // // //       border: "1px solid #fca5a5"
// // // // //     },
// // // // //     actionFlex: {
// // // // //       display: "flex",
// // // // //       gap: "12px",
// // // // //       alignItems: "center"
// // // // //     },
// // // // //     editBtn: {
// // // // //       background: "none",
// // // // //       border: "none",
// // // // //       color: "#2563eb",
// // // // //       fontWeight: "600",
// // // // //       fontSize: "13px",
// // // // //       cursor: "pointer",
// // // // //       padding: 0,
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
// // // // //     emptyState: {
// // // // //       color: "#64748b",
// // // // //       fontSize: "14px",
// // // // //       textAlign: "center",
// // // // //       padding: "40px 0",
// // // // //       margin: 0
// // // // //     }
// // // // //   };

// // // // //   return (
// // // // //     <div style={styles.page}>
// // // // //       {/* Header */}
// // // // //       <div style={styles.header}>
// // // // //         <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // // //         {products.length > 0 && (
// // // // //           <button
// // // // //             style={styles.btnGlobalExcel}
// // // // //             onClick={downloadCatalogExcel}
// // // // //             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
// // // // //             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
// // // // //           >
// // // // //             📊 Export Catalog (.csv)
// // // // //           </button>
// // // // //         )}
// // // // //       </div>

// // // // //       {/* Main Content Component Container */}
// // // // //       <div style={styles.section}>
        
// // // // //         {/* Search Bar matching look and feel */}
// // // // //         <div style={styles.searchBarContainer}>
// // // // //           <input 
// // // // //             type="text"
// // // // //             style={styles.input}
// // // // //             placeholder="Quick search catalog by item name..."
// // // // //             value={searchQuery}
// // // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // // //             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //           />
// // // // //         </div>

// // // // //         {filteredProducts.length === 0 ? (
// // // // //           <p style={styles.emptyState}>
// // // // //             {products.length === 0 
// // // // //               ? "No active product metrics discovered in the system catalog."
// // // // //               : "No items matched your search filtering criteria."}
// // // // //           </p>
// // // // //         ) : (
// // // // //           <div style={styles.mainTableContainer}>
// // // // //             <table style={styles.mainTable}>
// // // // //               <thead>
// // // // //                 <tr>
// // // // //                   <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// // // // //                   <th style={styles.mainTh}>Product Item Profile</th>
// // // // //                   <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Master Unit Price</th>
// // // // //                   <th style={{ ...styles.mainTh, textAlign: "center", width: "180px" }}>Stock Allocation</th>
// // // // //                   <th style={{ ...styles.mainTh, width: "140px" }}>Actions</th>
// // // // //                 </tr>
// // // // //               </thead>
// // // // //               <tbody>
// // // // //                 {filteredProducts.map((p, index) => {
// // // // //                   const isEditing = editId === p._id;
// // // // //                   return (
// // // // //                     <tr 
// // // // //                       key={p._id} 
// // // // //                       style={{ 
// // // // //                         backgroundColor: isEditing ? "#f1f5f9" : "transparent",
// // // // //                         transition: "background-color 0.2s"
// // // // //                       }}
// // // // //                       onMouseOver={(e) => {
// // // // //                         if (!isEditing) e.currentTarget.style.backgroundColor = "#f8fafc";
// // // // //                       }}
// // // // //                       onMouseOut={(e) => {
// // // // //                         e.currentTarget.style.backgroundColor = isEditing ? "#f1f5f9" : "transparent";
// // // // //                       }}
// // // // //                     >
// // // // //                       {/* Serial Number Row */}
// // // // //                       <td style={{ ...styles.mainTd, ...styles.sNoText }}>
// // // // //                         {index + 1}
// // // // //                       </td>

// // // // //                       {/* Product Profile Column */}
// // // // //                       <td style={styles.mainTd}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="text"
// // // // //                             style={styles.tableInput}
// // // // //                             value={form.name}
// // // // //                             onChange={(e) => setForm({ ...form, name: e.target.value })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={styles.productNameText}>{p.name}</span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Unit Price Column */}
// // // // //                       <td style={{ ...styles.mainTd, textAlign: "right" }}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="number"
// // // // //                             style={{ ...styles.tableInput, textAlign: "right" }}
// // // // //                             value={form.price || ''}
// // // // //                             onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={styles.amountText}>₹{p.price}</span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Stock Tracking Badge Column */}
// // // // //                       <td style={{ ...styles.mainTd, textAlign: "center" }}>
// // // // //                         {isEditing ? (
// // // // //                           <input
// // // // //                             type="number"
// // // // //                             style={{ ...styles.tableInput, textAlign: "center" }}
// // // // //                             value={form.stock || ''}
// // // // //                             onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
// // // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // // //                           />
// // // // //                         ) : (
// // // // //                           <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // // //                             {p.stock} units
// // // // //                           </span>
// // // // //                         )}
// // // // //                       </td>

// // // // //                       {/* Context Dashboard Level Actions */}
// // // // //                       <td style={styles.mainTd}>
// // // // //                         <div style={styles.actionFlex}>
// // // // //                           {isEditing ? (
// // // // //                             <>
// // // // //                               <button
// // // // //                                 style={styles.editBtn}
// // // // //                                 onClick={handleSave}
// // // // //                               >
// // // // //                                 Save
// // // // //                               </button>
// // // // //                               <button
// // // // //                                 style={styles.removeBtn}
// // // // //                                 onClick={() => setEditId(null)}
// // // // //                               >
// // // // //                                 Cancel
// // // // //                               </button>
// // // // //                             </>
// // // // //                           ) : (
// // // // //                             <>
// // // // //                               <button
// // // // //                                 style={styles.editBtn}
// // // // //                                 onClick={() => {
// // // // //                                   setEditId(p._id);
// // // // //                                   setForm({
// // // // //                                     name: p.name,
// // // // //                                     price: p.price,
// // // // //                                     stock: p.stock
// // // // //                                   });
// // // // //                                 }}
// // // // //                               >
// // // // //                                 Edit
// // // // //                               </button>
// // // // //                               <button 
// // // // //                                 style={styles.removeBtn} 
// // // // //                                 onClick={() => handleDelete(p._id)}
// // // // //                               >
// // // // //                                 Remove
// // // // //                               </button>
// // // // //                             </>
// // // // //                           )}
// // // // //                         </div>
// // // // //                       </td>
// // // // //                     </tr>
// // // // //                   );
// // // // //                 })}
// // // // //               </tbody>
// // // // //             </table>
// // // // //           </div>
// // // // //         )}
// // // // //       </div>
// // // // //     </div>
// // // // //   );
// // // // // };

// // // // // export default Products;




// // // // // 18-06-2026




// // // // import React, { useState, useEffect } from 'react';
// // // // import api from '../utils/api';

// // // // const Products = () => {
// // // //   const [products, setProducts] = useState([]);
// // // //   const [searchQuery, setSearchQuery] = useState("");
// // // //   const [form, setForm] = useState({ 
// // // //     name: '', 
// // // //     price: 0, 
// // // //     stock: 0 
// // // //   });
// // // //   const [editId, setEditId] = useState(null);

// // // //   useEffect(() => { 
// // // //     fetchProducts(); 
// // // //   }, []);

// // // //   const fetchProducts = async () => {
// // // //     try {
// // // //       const res = await api.get('/products');
// // // //       setProducts(res.data);
// // // //     } catch (error) {
// // // //       console.error(error);
// // // //       alert('Failed to fetch product catalog');
// // // //     }
// // // //   };

// // // //   const handleSave = async (e) => {
// // // //     if (e) e.preventDefault();
// // // //     try {
// // // //       if (editId) {
// // // //         await api.put(`/products/${editId}`, form);
// // // //         alert('Product inventory updated successfully!');
// // // //       } else {
// // // //         await api.post('/products', form);
// // // //         alert('Product item registered successfully!');
// // // //       }
// // // //       setForm({ name: '', price: 0, stock: 0 });
// // // //       setEditId(null);
// // // //       fetchProducts();
// // // //     } catch (error) {
// // // //       console.error(error);
// // // //       alert('Failed to save product information');
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

// // // //   // Export ALL filtered catalog products to Excel (CSV format)
// // // //   const downloadCatalogExcel = () => {
// // // //     if (filteredProducts.length === 0) {
// // // //       alert("No product data available to export.");
// // // //       return;
// // // //     }

// // // //     // CSV Document Headers
// // // //     const headers = [
// // // //       "S.No.",
// // // //       "Product Item Profile",
// // // //       "Master Unit Price (INR)",
// // // //       "Stock Allocation (Units)"
// // // //     ];

// // // //     // Map through the filtered products to transform them into rows
// // // //     const rows = filteredProducts.map((p, index) => [
// // // //       index + 1,
// // // //       `"${p.name ? p.name.replace(/"/g, '""') : "N/A"}"`, // Escape internal quotes safely
// // // //       p.price ?? 0,
// // // //       p.stock ?? 0
// // // //     ]);

// // // //     // Construct CSV format block content
// // // //     const csvContent = [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

// // // //     // Trigger explicit browser attachment download
// // // //     const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
// // // //     const url = URL.createObjectURL(blob);
// // // //     const link = document.createElement("a");
// // // //     link.setAttribute("href", url);
// // // //     link.setAttribute("download", `Product_Catalog_Stock_Report.csv`);
// // // //     document.body.appendChild(link);
// // // //     link.click();
// // // //     document.body.removeChild(link);
// // // //   };

// // // //   const filteredProducts = products.filter(p => {
// // // //     const query = searchQuery.toLowerCase().trim();
// // // //     if (!query) return true;
// // // //     return p.name?.toLowerCase().includes(query);
// // // //   });

// // // //   // Perfectly matched UI design paradigm styles
// // // //   const styles = {
// // // //     page: {
// // // //       minHeight: "100vh",
// // // //       backgroundColor: "#f8fafc",
// // // //       padding: "32px",
// // // //       fontFamily: "system-ui, -apple-system, sans-serif",
// // // //       boxSizing: "border-box"
// // // //     },
// // // //     header: {
// // // //       marginBottom: "24px",
// // // //       display: "flex",
// // // //       justifyContent: "space-between",
// // // //       alignItems: "center",
// // // //       flexWrap: "wrap",
// // // //       gap: "16px"
// // // //     },
// // // //     title: {
// // // //       fontSize: "28px",
// // // //       fontWeight: "700",
// // // //       color: "#0f172a",
// // // //       letterSpacing: "-0.5px",
// // // //       margin: 0
// // // //     },
// // // //     btnGlobalExcel: {
// // // //       backgroundColor: "#2563eb",
// // // //       color: "#ffffff",
// // // //       border: "none",
// // // //       borderRadius: "10px",
// // // //       padding: "10px 18px",
// // // //       fontSize: "14px",
// // // //       fontWeight: "600",
// // // //       cursor: "pointer",
// // // //       display: "flex",
// // // //       alignItems: "center",
// // // //       gap: "8px",
// // // //       boxShadow: "0 2px 4px rgba(37,  99,  235,  0.15)",
// // // //       transition: "background-color 0.2s, transform 0.1s"
// // // //     },
// // // //     section: {
// // // //       background: "#ffffff",
// // // //       border: "1px solid #e2e8f0",
// // // //       borderRadius: "14px",
// // // //       padding: "20px",
// // // //       boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
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
// // // //     tableInput: {
// // // //       width: "100%",
// // // //       padding: "8px 12px",
// // // //       border: "1px solid #cbd5e1",
// // // //       borderRadius: "8px",
// // // //       fontSize: "14px",
// // // //       color: "#0f172a",
// // // //       backgroundColor: "#ffffff",
// // // //       outline: "none",
// // // //       transition: "border-color 0.2s",
// // // //       boxSizing: "border-box",
// // // //     },
// // // //     mainTableContainer: {
// // // //       width: "100%",
// // // //       overflowX: "auto",
// // // //       borderRadius: "10px",
// // // //       border: "1px solid #e2e8f0"
// // // //     },
// // // //     mainTable: {
// // // //       width: "100%",
// // // //       borderCollapse: "collapse",
// // // //       textAlign: "left",
// // // //       fontSize: "14px"
// // // //     },
// // // //     mainTh: {
// // // //       backgroundColor: "#f1f5f9",
// // // //       color: "#334155",
// // // //       fontWeight: "600",
// // // //       padding: "14px",
// // // //       borderBottom: "2px solid #e2e8f0",
// // // //       fontSize: "13px"
// // // //     },
// // // //     mainTd: {
// // // //       padding: "14px",
// // // //       color: "#0f172a",
// // // //       borderBottom: "1px solid #e2e8f0",
// // // //       verticalAlign: "middle"
// // // //     },
// // // //     sNoText: {
// // // //       color: "#64748b",
// // // //       fontWeight: "500"
// // // //     },
// // // //     productNameText: {
// // // //       fontWeight: "600",
// // // //       color: "#0f172a"
// // // //     },
// // // //     amountText: {
// // // //       fontWeight: "700",
// // // //       color: "#0f172a"
// // // //     },
// // // //     stockTextNormal: {
// // // //       backgroundColor: "#f1f5f9",
// // // //       color: "#334155",
// // // //       padding: "4px 10px",
// // // //       borderRadius: "8px",
// // // //       fontSize: "11px",
// // // //       fontWeight: "600",
// // // //       display: "inline-block",
// // // //       border: "1px solid #e2e8f0"
// // // //     },
// // // //     stockTextAlert: {
// // // //       backgroundColor: "#fee2e2",
// // // //       color: "#dc2626",
// // // //       padding: "4px 10px",
// // // //       borderRadius: "8px",
// // // //       fontSize: "11px",
// // // //       fontWeight: "700",
// // // //       display: "inline-block",
// // // //       border: "1px solid #fca5a5"
// // // //     },
// // // //     actionFlex: {
// // // //       display: "flex",
// // // //       gap: "12px",
// // // //       alignItems: "center"
// // // //     },
// // // //     editBtn: {
// // // //       background: "none",
// // // //       border: "none",
// // // //       color: "#2563eb",
// // // //       fontWeight: "600",
// // // //       fontSize: "13px",
// // // //       cursor: "pointer",
// // // //       padding: 0,
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
// // // //     emptyState: {
// // // //       color: "#64748b",
// // // //       fontSize: "14px",
// // // //       textAlign: "center",
// // // //       padding: "40px 0",
// // // //       margin: 0
// // // //     }
// // // //   };

// // // //   return (
// // // //     <div style={styles.page}>
// // // //       {/* Header */}
// // // //       <div style={styles.header}>
// // // //         <h1 style={styles.title}>Store Catalog & Stock Inventory</h1>
// // // //         {products.length > 0 && (
// // // //           <button
// // // //             style={styles.btnGlobalExcel}
// // // //             onClick={downloadCatalogExcel}
// // // //             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#1d4ed8")}
// // // //             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#2563eb")}
// // // //           >
// // // //             📊 Export Catalog (.csv)
// // // //           </button>
// // // //         )}
// // // //       </div>

// // // //       {/* Main Content Component Container */}
// // // //       <div style={styles.section}>
        
// // // //         {/* Search Bar matching look and feel */}
// // // //         <div style={styles.searchBarContainer}>
// // // //           <input 
// // // //             type="text"
// // // //             style={styles.input}
// // // //             placeholder="Quick search catalog by item name..."
// // // //             value={searchQuery}
// // // //             onChange={(e) => setSearchQuery(e.target.value)}
// // // //             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // //             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // //           />
// // // //         </div>

// // // //         {filteredProducts.length === 0 ? (
// // // //           <p style={styles.emptyState}>
// // // //             {products.length === 0 
// // // //               ? "No active product metrics discovered in the system catalog."
// // // //               : "No items matched your search filtering criteria."}
// // // //           </p>
// // // //         ) : (
// // // //           <div style={styles.mainTableContainer}>
// // // //             <table style={styles.mainTable}>
// // // //               <thead>
// // // //                 <tr>
// // // //                   <th style={{ ...styles.mainTh, width: "60px" }}>S.No.</th>
// // // //                   <th style={styles.mainTh}>Product Item Profile</th>
// // // //                   <th style={{ ...styles.mainTh, textAlign: "right", width: "180px" }}>Master Unit Price</th>
// // // //                   <th style={{ ...styles.mainTh, textAlign: "center", width: "180px" }}>Stock Allocation</th>
// // // //                   <th style={{ ...styles.mainTh, width: "140px" }}>Actions</th>
// // // //                 </tr>
// // // //               </thead>
// // // //               <tbody>
// // // //                 {filteredProducts.map((p, index) => {
// // // //                   const isEditing = editId === p._id;
// // // //                   return (
// // // //                     <tr 
// // // //                       key={p._id} 
// // // //                       style={{ 
// // // //                         backgroundColor: isEditing ? "#f1f5f9" : "transparent",
// // // //                         transition: "background-color 0.2s"
// // // //                       }}
// // // //                       onMouseOver={(e) => {
// // // //                         if (!isEditing) e.currentTarget.style.backgroundColor = "#f8fafc";
// // // //                       }}
// // // //                       onMouseOut={(e) => {
// // // //                         e.currentTarget.style.backgroundColor = isEditing ? "#f1f5f9" : "transparent";
// // // //                       }}
// // // //                     >
// // // //                       {/* Serial Number Row */}
// // // //                       <td style={{ ...styles.mainTd, ...styles.sNoText }}>
// // // //                         {index + 1}
// // // //                       </td>

// // // //                       {/* Product Profile Column */}
// // // //                       <td style={styles.mainTd}>
// // // //                         {isEditing ? (
// // // //                           <input
// // // //                             type="text"
// // // //                             style={styles.tableInput}
// // // //                             value={form.name}
// // // //                             onChange={(e) => setForm({ ...form, name: e.target.value })}
// // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // //                           />
// // // //                         ) : (
// // // //                           <span style={styles.productNameText}>{p.name}</span>
// // // //                         )}
// // // //                       </td>

// // // //                       {/* Unit Price Column */}
// // // //                       <td style={{ ...styles.mainTd, textAlign: "right" }}>
// // // //                         {isEditing ? (
// // // //                           <input
// // // //                             type="number"
// // // //                             style={{ ...styles.tableInput, textAlign: "right" }}
// // // //                             value={form.price || ''}
// // // //                             onChange={(e) => setForm({ ...form, price: Number(e.target.value) })}
// // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // //                           />
// // // //                         ) : (
// // // //                           <span style={styles.amountText}>₹{p.price}</span>
// // // //                         )}
// // // //                       </td>

// // // //                       {/* Stock Tracking Badge Column */}
// // // //                       <td style={{ ...styles.mainTd, textAlign: "center" }}>
// // // //                         {isEditing ? (
// // // //                           <input
// // // //                             type="number"
// // // //                             style={{ ...styles.tableInput, textAlign: "center" }}
// // // //                             value={form.stock || ''}
// // // //                             onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
// // // //                             onFocus={(e) => (e.currentTarget.style.borderColor = "#2563eb")}
// // // //                             onBlur={(e) => (e.currentTarget.style.borderColor = "#cbd5e1")}
// // // //                           />
// // // //                         ) : (
// // // //                           <span style={p.stock < 5 ? styles.stockTextAlert : styles.stockTextNormal}>
// // // //                             {p.stock} units
// // // //                           </span>
// // // //                         )}
// // // //                       </td>

// // // //                       {/* Context Dashboard Level Actions */}
// // // //                       <td style={styles.mainTd}>
// // // //                         <div style={styles.actionFlex}>
// // // //                           {isEditing ? (
// // // //                             <>
// // // //                               <button
// // // //                                 style={styles.editBtn}
// // // //                                 onClick={handleSave}
// // // //                               >
// // // //                                 Save
// // // //                               </button>
// // // //                               <button
// // // //                                 style={styles.removeBtn}
// // // //                                 onClick={() => setEditId(null)}
// // // //                               >
// // // //                                 Cancel
// // // //                               </button>
// // // //                             </>
// // // //                           ) : (
// // // //                             <>
// // // //                               <button
// // // //                                 style={styles.editBtn}
// // // //                                 onClick={() => {
// // // //                                   setEditId(p._id);
// // // //                                   setForm({
// // // //                                     name: p.name,
// // // //                                     price: p.price,
// // // //                                     stock: p.stock
// // // //                                   });
// // // //                                 }}
// // // //                               >
// // // //                                 Edit
// // // //                               </button>
// // // //                               <button 
// // // //                                 style={styles.removeBtn} 
// // // //                                 onClick={() => handleDelete(p._id)}
// // // //                               >
// // // //                                 Remove
// // // //                               </button>
// // // //                             </>
// // // //                           )}
// // // //                         </div>
// // // //                       </td>
// // // //                     </tr>
// // // //                   );
// // // //                 })}
// // // //               </tbody>
// // // //             </table>
// // // //           </div>
// // // //         )}
// // // //       </div>
// // // //     </div>
// // // //   );
// // // // };

// // // // export default Products;




// // // import React, { useEffect, useState } from "react";
// // // import api from "../utils/api";

// // // const Inventory = () => {
// // //   const [inventory, setInventory] = useState([]);

// // //   useEffect(() => {
// // //     fetchInventory();
// // //   }, []);

// // //   const fetchInventory = async () => {
// // //     try {
// // //       const res = await api.get("/inventory");
// // //       setInventory(res.data);
// // //     } catch (err) {
// // //       console.error(err);
// // //       alert("Failed to load inventory");
// // //     }
// // //   };

// // //   return (
// // //     <div
// // //       style={{
// // //         padding: "24px",
// // //         minHeight: "100vh",
// // //         background: "#f8fafc"
// // //       }}
// // //     >
// // //       <h1>Inventory</h1>

// // //       <div
// // //         style={{
// // //           background: "#fff",
// // //           padding: "20px",
// // //           borderRadius: "12px",
// // //           marginTop: "20px"
// // //         }}
// // //       >
// // //         <table
// // //           style={{
// // //             width: "100%",
// // //             borderCollapse: "collapse"
// // //           }}
// // //         >
// // //           <thead>
// // //             <tr>
// // //               <th
// // //                 style={{
// // //                   textAlign: "left",
// // //                   padding: "12px"
// // //                 }}
// // //               >
// // //                 Product
// // //               </th>

// // //               <th
// // //                 style={{
// // //                   textAlign: "left",
// // //                   padding: "12px"
// // //                 }}
// // //               >
// // //                 Stock
// // //               </th>
// // //             </tr>
// // //           </thead>

// // //           <tbody>
// // //             {inventory.map((item) => (
// // //               <tr key={item._id}>
// // //                 <td
// // //                   style={{
// // //                     padding: "12px",
// // //                     borderTop:
// // //                       "1px solid #e5e7eb"
// // //                   }}
// // //                 >
// // //                   {item.productId?.name}
// // //                 </td>

// // //                 <td
// // //                   style={{
// // //                     padding: "12px",
// // //                     borderTop:
// // //                       "1px solid #e5e7eb"
// // //                   }}
// // //                 >
// // //                   {item.stock}
// // //                 </td>
// // //               </tr>
// // //             ))}
// // //           </tbody>
// // //         </table>

// // //         {inventory.length === 0 && (
// // //           <p>No inventory available</p>
// // //         )}
// // //       </div>
// // //     </div>
// // //   );
// // // };

// // // export default Inventory;




// // import React, { useEffect, useState } from "react";
// // import api from "../utils/api";

// // const Inventory = () => {
// //   const [inventory, setInventory] = useState([]);
// //   const [searchQuery, setSearchQuery] = useState("");
// //   const [editingProduct, setEditingProduct] =
// //   useState(null);

// // const [editName, setEditName] =
// //   useState("");

// // const [editPrice, setEditPrice] =
// //   useState("");


// //   useEffect(() => {
// //     fetchInventory();
// //   }, []);

// //   const fetchInventory = async () => {
// //     try {
// //       const res = await api.get("/inventory");
// //       setInventory(res.data);
// //     } catch (err) {
// //       console.error(err);
// //       alert("Failed to load inventory");
// //     }
// //   };

// //   const filteredInventory = inventory.filter((item) => {
// //     const query = searchQuery.toLowerCase().trim();

// //     if (!query) return true;

// //     return item.productId?.name
// //       ?.toLowerCase()
// //       .includes(query);
// //   });
// //   const startEdit = (product) => {
// //   setEditingProduct(product._id);
// //   setEditName(product.name);
// //   setEditPrice(product.price);
// // };

// // const saveEdit = async (id) => {
// //   try {
// //     await api.put(`/products/${id}`, {
// //       name: editName,
// //       price: editPrice
// //     });

// //     fetchInventory();
// //     setEditingProduct(null);

// //     alert("Updated successfully");
// //   } catch (err) {
// //     console.error(err);
// //     alert("Update failed");
// //   }
// // };

// // const deleteProduct = async (id) => {
// //   if (!window.confirm("Delete product?"))
// //     return;

// //   try {
// //     await api.delete(`/products/${id}`);

// //     fetchInventory();

// //     alert("Deleted successfully");
// //   } catch (err) {
// //     console.error(err);
// //     alert("Delete failed");
// //   }
// // };

// //   return (
// //     <div
// //       style={{
// //         minHeight: "100vh",
// //         backgroundColor: "#f8fafc",
// //         padding: "32px",
// //         fontFamily: "system-ui, -apple-system, sans-serif",
// //         boxSizing: "border-box"
// //       }}
// //     >
// //       {/* Header */}
// //       <div
// //         style={{
// //           marginBottom: "24px",
// //           display: "flex",
// //           justifyContent: "space-between",
// //           alignItems: "center"
// //         }}
// //       >
// //         <h1
// //           style={{
// //             fontSize: "28px",
// //             fontWeight: "700",
// //             color: "#0f172a",
// //             margin: 0
// //           }}
// //         >
// //           Store Inventory
// //         </h1>
// //       </div>

// //       {/* Main Section */}
// //       <div
// //         style={{
// //           background: "#ffffff",
// //           border: "1px solid #e2e8f0",
// //           borderRadius: "14px",
// //           padding: "20px",
// //           boxShadow: "0 1px 2px rgba(0,0,0,0.04)"
// //         }}
// //       >
// //         {/* Search Bar */}
// //         <div
// //           style={{
// //             marginBottom: "16px"
// //           }}
// //         >
// //           <input
// //             type="text"
// //             placeholder="Quick search inventory..."
// //             value={searchQuery}
// //             onChange={(e) =>
// //               setSearchQuery(e.target.value)
// //             }
// //             style={{
// //               width: "100%",
// //               padding: "12px 14px",
// //               border: "1px solid #cbd5e1",
// //               borderRadius: "10px",
// //               fontSize: "14px",
// //               outline: "none",
// //               boxSizing: "border-box"
// //             }}
// //           />
// //         </div>
// //         {editingProduct && (
// //   <div
// //     style={{
// //       position: "fixed",
// //       top: "50%",
// //       left: "50%",
// //       transform: "translate(-50%, -50%)",
// //       background: "#fff",
// //       padding: "20px",
// //       borderRadius: "12px",
// //       boxShadow: "0 10px 30px rgba(0,0,0,0.2)",
// //       zIndex: 999
// //     }}
// //   >
// //     <h3>Edit Product</h3>

// //     <input
// //       type="text"
// //       value={editName}
// //       onChange={(e) =>
// //         setEditName(e.target.value)
// //       }
// //       placeholder="Product Name"
// //       style={{
// //         width: "100%",
// //         padding: "10px",
// //         marginBottom: "10px"
// //       }}
// //     />

// //     <input
// //       type="number"
// //       value={editPrice}
// //       onChange={(e) =>
// //         setEditPrice(e.target.value)
// //       }
// //       placeholder="Price"
// //       style={{
// //         width: "100%",
// //         padding: "10px",
// //         marginBottom: "10px"
// //       }}
// //     />

// //     <button
// //       onClick={() =>
// //         saveEdit(editingProduct)
// //       }
// //       style={{
// //         background: "#16a34a",
// //         color: "#fff",
// //         border: "none",
// //         padding: "10px 16px",
// //         borderRadius: "6px",
// //         marginRight: "10px"
// //       }}
// //     >
// //       Save
// //     </button>

// //     <button
// //       onClick={() =>
// //         setEditingProduct(null)
// //       }
// //       style={{
// //         background: "#64748b",
// //         color: "#fff",
// //         border: "none",
// //         padding: "10px 16px",
// //         borderRadius: "6px"
// //       }}
// //     >
// //       Cancel
// //     </button>
// //   </div>
// // )}

// //         {filteredInventory.length === 0 ? (
// //           <p
// //             style={{
// //               textAlign: "center",
// //               color: "#64748b",
// //               padding: "40px"
// //             }}
// //           >
// //             No inventory found
// //           </p>
// //         ) : (
// //           <div
// //             style={{
// //               width: "100%",
// //               overflowX: "auto",
// //               borderRadius: "10px",
// //               border: "1px solid #e2e8f0"
// //             }}
// //           >
// //             <table
// //               style={{
// //                 width: "100%",
// //                 borderCollapse: "collapse",
// //                 textAlign: "left"
// //               }}
// //             >
// //               <thead>
// //                 <tr>
// //                   <th
// //                     style={{
// //                       backgroundColor: "#f1f5f9",
// //                       color: "#334155",
// //                       fontWeight: "600",
// //                       padding: "14px",
// //                       borderBottom: "2px solid #e2e8f0",
// //                       width: "80px"
// //                     }}
// //                   >
// //                     S.No
// //                   </th>

// //                   <th
// //                     style={{
// //                       backgroundColor: "#f1f5f9",
// //                       color: "#334155",
// //                       fontWeight: "600",
// //                       padding: "14px",
// //                       borderBottom: "2px solid #e2e8f0"
// //                     }}
// //                   >
// //                     Product Item
// //                   </th>
// // <th
// //   style={{
// //     backgroundColor: "#f1f5f9",
// //     color: "#334155",
// //     fontWeight: "600",
// //     padding: "14px",
// //     borderBottom: "2px solid #e2e8f0",
// //     textAlign: "center"
// //   }}
// // >
// //   Unit Price
// // </th>
// //                   <th
// //                     style={{
// //                       backgroundColor: "#f1f5f9",
// //                       color: "#334155",
// //                       fontWeight: "600",
// //                       padding: "14px",
// //                       borderBottom: "2px solid #e2e8f0",
// //                       textAlign: "center",
// //                       width: "200px"
// //                     }}
// //                   >
// //                     Available Stock
// //                   </th>
// //                   <th style={{
// //                       backgroundColor: "#f1f5f9",
// //                       color: "#334155",
// //                       fontWeight: "600",
// //                       padding: "14px",
// //                       borderBottom: "2px solid #e2e8f0",
// //                       textAlign: "center",
// //                       width: "200px"
// //                     }}>Actions</th>
// //                 </tr>
// //               </thead>

// //               <tbody>
// //   {filteredInventory.map((item, index) => (
// //     <tr
// //       key={item._id}
// //       onMouseOver={(e) =>
// //         (e.currentTarget.style.backgroundColor =
// //           "#f8fafc")
// //       }
// //       onMouseOut={(e) =>
// //         (e.currentTarget.style.backgroundColor =
// //           "transparent")
// //       }
// //     >
// //       <td
// //         style={{
// //           padding: "14px",
// //           borderBottom: "1px solid #e2e8f0"
// //         }}
// //       >
// //         {index + 1}
// //       </td>

// //       <td
// //         style={{
// //           padding: "14px",
// //           borderBottom: "1px solid #e2e8f0",
// //           fontWeight: "600"
// //         }}
// //       >
// //         {item.productId?.name}
// //       </td>

// //       <td
// //         style={{
// //           padding: "14px",
// //           borderBottom: "1px solid #e2e8f0",
// //           textAlign: "center",
// //           fontWeight: "600",
// //           color: "#2563eb"
// //         }}
// //       >
// //         ₹{item.productId?.price || 0}
// //       </td>

// //       <td
// //         style={{
// //           padding: "14px",
// //           borderBottom: "1px solid #e2e8f0",
// //           textAlign: "center"
// //         }}
// //       >
// //         <span
// //           style={{
// //             backgroundColor:
// //               item.stock < 5
// //                 ? "#fee2e2"
// //                 : "#f1f5f9",
// //             color:
// //               item.stock < 5
// //                 ? "#dc2626"
// //                 : "#334155",
// //             padding: "4px 10px",
// //             borderRadius: "8px",
// //             fontSize: "12px",
// //             fontWeight: "600",
// //             display: "inline-block"
// //           }}
// //         >
// //           {item.stock} units
// //         </span>
// //       </td>

// //       <td
// //         style={{
// //           padding: "14px",
// //           borderBottom: "1px solid #e2e8f0",
// //           textAlign: "center"
// //         }}
// //       >
// //         <button
// //           onClick={() =>
// //             startEdit(item.productId)
// //           }
// //           style={{
// //             background: "#2563eb",
// //             color: "#fff",
// //             border: "none",
// //             padding: "8px 12px",
// //             borderRadius: "6px",
// //             cursor: "pointer",
// //             marginRight: "8px"
// //           }}
// //         >
// //           Edit
// //         </button>

// //         <button
// //           onClick={() =>
// //             deleteProduct(item.productId._id)
// //           }
// //           style={{
// //             background: "#dc2626",
// //             color: "#fff",
// //             border: "none",
// //             padding: "8px 12px",
// //             borderRadius: "6px",
// //             cursor: "pointer"
// //           }}
// //         >
// //           Delete
// //         </button>
// //       </td>
// //     </tr>
// //   ))}
// // </tbody>
// //             </table>
// //           </div>
// //         )}
// //       </div>
// //     </div>
// //   );
// // };

// // export default Inventory;




// // 19-06-2026



// import React, { useEffect, useState } from "react";
// import api from "../utils/api";

// const Inventory = () => {
//   const [inventory, setInventory] = useState([]);
//   const [searchQuery, setSearchQuery] = useState("");
//   const [editingProduct, setEditingProduct] = useState(null);
//   const [editName, setEditName] = useState("");
//   const [editPrice, setEditPrice] = useState("");

//   useEffect(() => {
//     fetchInventory();
//   }, []);

//   const fetchInventory = async () => {
//     try {
//       const res = await api.get("/inventory");
//       setInventory(res.data);
//     } catch (err) {
//       console.error(err);
//       alert("Failed to load inventory assets.");
//     }
//   };

//   const filteredInventory = inventory.filter((item) => {
//     const query = searchQuery.toLowerCase().trim();
//     if (!query) return true;
//     return item.productId?.name?.toLowerCase().includes(query);
//   });

//   const startEdit = (product) => {
//     if (!product) return;
//     setEditingProduct(product._id);
//     setEditName(product.name || "");
//     setEditPrice(product.price || 0);
//   };

//   const saveEdit = async (id) => {
//     try {
//       await api.put(`/products/${id}`, {
//         name: editName,
//         price: Number(editPrice)
//       });
//       await fetchInventory();
//       setEditingProduct(null);
//       alert("Product updated successfully!");
//     } catch (err) {
//       console.error(err);
//       alert("Update operation failed.");
//     }
//   };

//   const deleteProduct = async (id) => {
//     if (!id) return;
//     if (!window.confirm("Are you sure you want to permanently delete this product from stock registers?"))
//       return;

//     try {
//       await api.delete(`/products/${id}`);
//       await fetchInventory();
//       alert("Product deleted successfully.");
//     } catch (err) {
//       console.error(err);
//       alert("Delete transaction failed.");
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
//     searchBar: {
//       width: "100%",
//       padding: "12px 16px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "10px",
//       fontSize: "14px",
//       color: "#0f172a",
//       backgroundColor: "#ffffff",
//       outline: "none",
//       transition: "all 0.2s",
//       boxSizing: "border-box",
//       marginBottom: "28px"
//     },
//     cardWrapper: {
//       background: "#ffffff",
//       border: "1px solid #e2e8f0",
//       borderRadius: "16px",
//       boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
//       padding: "24px",
//       marginBottom: "24px",
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
//       padding: "14px 16px",
//       fontSize: "13px",
//       borderBottom: "2px solid #e2e8f0",
//     },
//     td: {
//       padding: "14px 16px",
//       fontSize: "14px",
//       color: "#334155",
//       borderBottom: "1px solid #f1f5f9",
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
//     blueBtn: {
//       padding: "8px 14px",
//       color: "#ffffff",
//       backgroundColor: "#2563eb",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       marginRight: "8px",
//       boxShadow: "0 2px 4px rgba(37, 99, 235, 0.15)"
//     },
//     dangerBtn: {
//       padding: "8px 14px",
//       color: "#ffffff",
//       backgroundColor: "#dc2626",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "13px",
//       cursor: "pointer",
//       transition: "all 0.2s",
//       boxShadow: "0 2px 4px rgba(220, 38, 38, 0.15)"
//     },
//     modalBackdrop: {
//       position: "fixed",
//       top: 0,
//       left: 0,
//       width: "100%",
//       height: "100%",
//       backgroundColor: "rgba(15, 23, 42, 0.4)",
//       backdropFilter: "blur(4px)",
//       display: "flex",
//       justifyContent: "center",
//       alignItems: "center",
//       zIndex: 9999
//     },
//     modalContent: {
//       background: "#ffffff",
//       padding: "28px",
//       borderRadius: "16px",
//       boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
//       width: "100%",
//       maxWidth: "440px",
//       border: "1px solid #e2e8f0"
//     },
//     modalTitle: {
//       fontSize: "18px",
//       fontWeight: "700",
//       color: "#0f172a",
//       margin: "0 0 16px 0"
//     },
//     modalInput: {
//       width: "100%",
//       padding: "10px 14px",
//       border: "1px solid #cbd5e1",
//       borderRadius: "8px",
//       fontSize: "14px",
//       color: "#0f172a",
//       outline: "none",
//       boxSizing: "border-box",
//       marginBottom: "14px",
//       transition: "all 0.2s"
//     },
//     saveBtn: {
//       padding: "10px 18px",
//       backgroundColor: "#16a34a",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer",
//       marginRight: "10px"
//     },
//     cancelBtn: {
//       padding: "10px 18px",
//       backgroundColor: "#64748b",
//       color: "#ffffff",
//       border: "none",
//       borderRadius: "8px",
//       fontWeight: "600",
//       fontSize: "14px",
//       cursor: "pointer"
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
        
//         {/* Main Section Header */}
//         <div style={styles.headerBlock}>
//           <h1 style={styles.title}>Store Inventory</h1>
//           <p style={styles.subtitle}>Audit current live stock levels, modify master retail pricing, and regulate active unlinked items.</p>
//         </div>

//         {/* Filter Input System */}
//         <input
//           type="text"
//           placeholder="Quick search inventory logs by item description..."
//           value={searchQuery}
//           onChange={(e) => setSearchQuery(e.target.value)}
//           onFocus={handleFocus}
//           onBlur={handleBlur}
//           style={styles.searchBar}
//         />

//         {/* =============== PRODUCT EDIT MODAL REGISTRY =============== */}
//         {editingProduct && (
//           <div style={styles.modalBackdrop}>
//             <div style={styles.modalContent}>
//               <h3 style={styles.modalTitle}>Modify Catalog Specifications</h3>

//               <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Identifier Label</label>
//               <input
//                 type="text"
//                 value={editName}
//                 onChange={(e) => setEditName(e.target.value)}
//                 placeholder="Item designation title"
//                 onFocus={handleFocus}
//                 onBlur={handleBlur}
//                 style={styles.modalInput}
//               />

//               <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Standard Base Selling Price (₹)</label>
//               <input
//                 type="number"
//                 value={editPrice}
//                 onChange={(e) => setEditPrice(e.target.value)}
//                 placeholder="0.00"
//                 onFocus={handleFocus}
//                 onBlur={handleBlur}
//                 style={styles.modalInput}
//               />

//               <div style={{ display: 'flex', marginTop: '20px' }}>
//                 <button onClick={() => saveEdit(editingProduct)} style={styles.saveBtn}>
//                   Apply Modifications
//                 </button>
//                 <button onClick={() => setEditingProduct(null)} style={styles.cancelBtn}>
//                   Dismiss
//                 </button>
//               </div>
//             </div>
//           </div>
//         )}

//         {/* =============== STOCK REGISTRY INTERFACE =============== */}
//         {filteredInventory.length === 0 ? (
//           <div style={styles.emptyState}>
//             🔍 No live item profiles match your target structural criteria.
//           </div>
//         ) : (
//           <div style={styles.cardWrapper}>
//             <table style={styles.table}>
//               <thead>
//                 <tr>
//                   <th style={{ ...styles.th, width: "70px" }}>Index</th>
//                   <th style={styles.th}>Product Catalog Details</th>
//                   <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Current Valuation Price</th>
//                   <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Requisition Balance</th>
//                   <th style={{ ...styles.th, width: "220px", textAlign: "center" }}>Administrative Controls</th>
//                 </tr>
//               </thead>
//               <tbody>
//                 {filteredInventory.map((item, index) => {
//                   const isLowStock = (item.stock || 0) < 5;
                  
//                   return (
//                     <tr
//                       key={item._id}
//                       onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
//                       onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
//                     >
//                       <td style={styles.td}>{index + 1}</td>
//                       <td style={{ ...styles.td, fontWeight: "700", color: "#0f172a" }}>
//                         {item.productId?.name || "Unlinked Catalog Profile"}
//                       </td>
//                       <td style={{ ...styles.td, textAlign: "center", fontWeight: "600", color: "#2563eb" }}>
//                         ₹ {(item.productId?.price || 0).toFixed(2)}
//                       </td>
//                       <td style={{ ...styles.td, textAlign: "center" }}>
//                         <span
//                           style={{
//                             backgroundColor: isLowStock ? "#fee2e2" : "#eff6ff",
//                             color: isLowStock ? "#dc2626" : "#2563eb",
//                             padding: "6px 12px",
//                             borderRadius: "20px",
//                             fontSize: "12px",
//                             fontWeight: "700",
//                             display: "inline-block",
//                             border: isLowStock ? "1px solid #fecaca" : "1px solid #bfdbfe"
//                           }}
//                         >
//                           {item.stock || 0} units
//                         </span>
//                       </td>
//                       <td style={{ ...styles.td, textAlign: "center" }}>
//                         <button
//                           onClick={() => startEdit(item.productId)}
//                           style={styles.blueBtn}
//                           disabled={!item.productId}
//                         >
//                           Edit
//                         </button>
//                         <button
//                           onClick={() => deleteProduct(item.productId?._id)}
//                           style={styles.dangerBtn}
//                           disabled={!item.productId?._id}
//                         >
//                           Delete
//                         </button>
//                       </td>
//                     </tr>
//                   );
//                 })}
//               </tbody>
//             </table>
//           </div>
//         )}

//       </div>
//     </div>
//   );
// };

// export default Inventory;






import React, { useEffect, useState } from "react";
import api from "../utils/api";

const Inventory = () => {
  const [inventory, setInventory] = useState([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [editingProduct, setEditingProduct] = useState(null);
  const [editName, setEditName] = useState("");
  const [editPrice, setEditPrice] = useState("");

  useEffect(() => {
    fetchInventory();
  }, []);

  const fetchInventory = async () => {
    try {
      const res = await api.get("/inventory");
      setInventory(res.data);
    } catch (err) {
      console.error(err);
      alert("Failed to load inventory assets.");
    }
  };

  const filteredInventory = inventory.filter((item) => {
    const query = searchQuery.toLowerCase().trim();
    if (!query) return true;
    return item.productId?.name?.toLowerCase().includes(query);
  });

  const startEdit = (product) => {
    if (!product) return;
    setEditingProduct(product._id);
    setEditName(product.name || "");
    setEditPrice(product?.price ?? 0);
    // setEditPrice(product.price !== undefined ? product.price.toString() : "0");
  };

  const saveEdit = async (id) => {
    try {
      // Parses to a safe float to ensure the backend receives a valid number field
      const updatedPrice = parseFloat(editPrice);
      
      await api.put(`/products/${id}`, {
        name: editName,
        price: isNaN(updatedPrice) ? 0 : updatedPrice
      });

      await fetchInventory();
      setEditingProduct(null);
      alert("Product parameters updated successfully!");
    } catch (err) {
      console.error(err);
      alert("Update operation failed.");
    }
  };

  const deleteProduct = async (id) => {
    if (!id) return;
    if (!window.confirm("Are you sure you want to permanently delete this product from stock registers?"))
      return;

    try {
      await api.delete(`/products/${id}`);
      await fetchInventory();
      alert("Product deleted successfully.");
    } catch (err) {
      console.error(err);
      alert("Delete transaction failed.");
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
    searchBar: {
      width: "100%",
      padding: "12px 16px",
      border: "1px solid #cbd5e1",
      borderRadius: "10px",
      fontSize: "14px",
      color: "#0f172a",
      backgroundColor: "#ffffff",
      outline: "none",
      transition: "all 0.2s",
      boxSizing: "border-box",
      marginBottom: "28px"
    },
    cardWrapper: {
      background: "#ffffff",
      border: "1px solid #e2e8f0",
      borderRadius: "16px",
      boxShadow: "0 4px 6px -1px rgb(0 0 0 / 0.05)",
      padding: "24px",
      marginBottom: "24px",
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
      padding: "14px 16px",
      fontSize: "13px",
      borderBottom: "2px solid #e2e8f0",
    },
    td: {
      padding: "14px 16px",
      fontSize: "14px",
      color: "#334155",
      borderBottom: "1px solid #f1f5f9",
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
    blueBtn: {
      padding: "8px 14px",
      color: "#ffffff",
      backgroundColor: "#2563eb",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "all 0.2s",
      marginRight: "8px",
      boxShadow: "0 2px 4px rgba(37, 99, 235, 0.15)"
    },
    dangerBtn: {
      padding: "8px 14px",
      color: "#ffffff",
      backgroundColor: "#dc2626",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "13px",
      cursor: "pointer",
      transition: "all 0.2s",
      boxShadow: "0 2px 4px rgba(220, 38, 38, 0.15)"
    },
    modalBackdrop: {
      position: "fixed",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      backgroundColor: "rgba(15, 23, 42, 0.4)",
      backdropFilter: "blur(4px)",
      display: "flex",
      justifyContent: "center",
      alignItems: "center",
      zIndex: 9999
    },
    modalContent: {
      background: "#ffffff",
      padding: "28px",
      borderRadius: "16px",
      boxShadow: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
      width: "100%",
      maxWidth: "440px",
      border: "1px solid #e2e8f0"
    },
    modalTitle: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      margin: "0 0 16px 0"
    },
    modalInput: {
      width: "100%",
      padding: "10px 14px",
      border: "1px solid #cbd5e1",
      borderRadius: "8px",
      fontSize: "14px",
      color: "#0f172a",
      outline: "none",
      boxSizing: "border-box",
      marginBottom: "14px",
      transition: "all 0.2s"
    },
    saveBtn: {
      padding: "10px 18px",
      backgroundColor: "#16a34a",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer",
      marginRight: "10px"
    },
    cancelBtn: {
      padding: "10px 18px",
      backgroundColor: "#64748b",
      color: "#ffffff",
      border: "none",
      borderRadius: "8px",
      fontWeight: "600",
      fontSize: "14px",
      cursor: "pointer"
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
        
        {/* Main Section Header */}
        <div style={styles.headerBlock}>
          <h1 style={styles.title}>Store Inventory</h1>
          <p style={styles.subtitle}>Audit current live stock levels, modify master retail pricing, and regulate active unlinked items.</p>
        </div>

        {/* Filter Input System */}
        <input
          type="text"
          placeholder="Quick search inventory logs by item description..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          onFocus={handleFocus}
          onBlur={handleBlur}
          style={styles.searchBar}
        />

        {/* =============== PRODUCT EDIT MODAL REGISTRY =============== */}
        {editingProduct && (
          <div style={styles.modalBackdrop}>
            <div style={styles.modalContent}>
              <h3 style={styles.modalTitle}>Modify Catalog Specifications</h3>

              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Product Identifier Label</label>
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                placeholder="Item designation title"
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.modalInput}
              />

              <label style={{ display: 'block', fontSize: '13px', fontWeight: '600', color: '#475569', marginBottom: '6px' }}>Standard Base Selling Price (₹)</label>
              <input
                type="number"
                step="0.01"
                value={editPrice}
                onChange={(e) => setEditPrice(e.target.value)}
                placeholder="0.00"
                onFocus={handleFocus}
                onBlur={handleBlur}
                style={styles.modalInput}
              />

              <div style={{ display: 'flex', marginTop: '20px' }}>
                <button onClick={() => saveEdit(editingProduct)} style={styles.saveBtn}>
                  Apply Modifications
                </button>
                <button onClick={() => setEditingProduct(null)} style={styles.cancelBtn}>
                  Dismiss
                </button>
              </div>
            </div>
          </div>
        )}

        {/* =============== STOCK REGISTRY INTERFACE =============== */}
        {filteredInventory.length === 0 ? (
          <div style={styles.emptyState}>
            🔍 No live item profiles match your target structural criteria.
          </div>
        ) : (
          <div style={styles.cardWrapper}>
            <table style={styles.table}>
              <thead>
                <tr>
                  <th style={{ ...styles.th, width: "70px" }}>Index</th>
                  <th style={styles.th}>Product Catalog Details</th>
                  <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Current Valuation Price</th>
                  <th style={{ ...styles.th, width: "180px", textAlign: "center" }}>Requisition Balance</th>
                  <th style={{ ...styles.th, width: "220px", textAlign: "center" }}>Administrative Controls</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item, index) => {
                  const isLowStock = (item.stock || 0) < 5;
                  
                  return (
                    <tr
                      key={item._id}
                      onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#f8fafc")}
                      onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                    >
                      <td style={styles.td}>{index + 1}</td>
                      <td style={{ ...styles.td, fontWeight: "700", color: "#0f172a" }}>
                        {item.productId?.name || "Unlinked Catalog Profile"}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center", fontWeight: "600", color: "#2563eb" }}>
                        ₹ {(item.productId?.price || 0).toFixed(2)}
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <span
                          style={{
                            backgroundColor: isLowStock ? "#fee2e2" : "#eff6ff",
                            color: isLowStock ? "#dc2626" : "#2563eb",
                            padding: "6px 12px",
                            borderRadius: "20px",
                            fontSize: "12px",
                            fontWeight: "700",
                            display: "inline-block",
                            border: isLowStock ? "1px solid #fecaca" : "1px solid #bfdbfe"
                          }}
                        >
                          {item.stock || 0} units
                        </span>
                      </td>
                      <td style={{ ...styles.td, textAlign: "center" }}>
                        <button
                          onClick={() => startEdit(item.productId)}
                          style={styles.blueBtn}
                          disabled={!item.productId}
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => deleteProduct(item.productId?._id)}
                          style={styles.dangerBtn}
                          disabled={!item.productId?._id}
                        >
                          Delete
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
};

export default Inventory;