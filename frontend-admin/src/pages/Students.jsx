import { useState, useEffect } from 'react';
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