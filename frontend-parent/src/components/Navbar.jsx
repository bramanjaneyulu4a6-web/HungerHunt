// import { useAuth } from '../context/AuthContext';
// import { useNavigate, Link } from 'react-router-dom';

// export default function Navbar() {
//   const { parent, logout } = useAuth();
//   const navigate = useNavigate();

//   const handleLogout = () => {
//     logout();
//     navigate('/login');
//   };

//   return (
//     <nav className="bg-blue-600 text-white shadow-md px-6 py-4 flex justify-between items-center">
//       <Link to="/" className="text-xl font-bold tracking-wide">👨‍👩‍👦 Parent Portal</Link>
//       {parent && (
//         <div className="flex items-center gap-4">
//           <span className="text-sm bg-blue-700 px-3 py-1 rounded-full">Welcome, {parent.fatherName}</span>
//           <button onClick={handleLogout} className="bg-red-500 hover:bg-red-600 px-4 py-1.5 text-sm font-semibold rounded transitions duration-200">
//             Logout
//           </button>
//         </div>
//       )}
//     </nav>
//   );
// }




import React from 'react';
import { useAuth } from '../context/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

export default function Navbar() {
  const { parent, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  // Shared Styles Blueprint matching the administrative system layout
  const styles = {
    navbar: {
      backgroundColor: "#ffffff",
      borderBottom: "1px solid #e2e8f0",
      padding: "16px 32px",
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      fontFamily: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      boxSizing: "border-box",
      boxShadow: "0 1px 2px rgba(0,0,0,0.02)",
    },
    brandLink: {
      fontSize: "18px",
      fontWeight: "700",
      color: "#0f172a",
      textDecoration: "none",
      display: "flex",
      alignItems: "center",
      gap: "8px",
      letterSpacing: "-0.25px",
    },
    rightContainer: {
      display: "flex",
      alignItems: "center",
      gap: "16px",
    },
    userBadge: {
      fontSize: "13px",
      fontWeight: "600",
      color: "#334155",
      backgroundColor: "#f1f5f9",
      padding: "6px 14px",
      borderRadius: "20px",
      border: "1px solid #e2e8f0",
    },
    logoutBtn: {
      backgroundColor: "#be123c",
      color: "#ffffff",
      border: "none",
      padding: "8px 16px",
      borderRadius: "10px",
      fontSize: "13px",
      fontWeight: "600",
      cursor: "pointer",
      transition: "background-color 0.15s ease",
    }
  };

  return (
    <nav style={styles.navbar}>
      {/* Brand Navigation Header */}
      <Link to="/" style={styles.brandLink}>
        <span>👨‍👩‍👦 Portal Portal</span>
      </Link>

      {/* Conditional Right-Side Actions Block */}
      {parent && (
        <div style={styles.rightContainer}>
          {/* Dynamically reads user metrics fallback string safely */}
          <span style={styles.userBadge}>
            Welcome, {parent.fatherName || parent.motherName || "Parent"}
          </span>
          
          <button 
            onClick={handleLogout} 
            style={styles.logoutBtn}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#9f1239")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#be123c")}
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}