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
      backgroundColor: "var(--surface)",
      borderBottom: "1px solid var(--border)",
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
      color: "var(--ink)",
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
      color: "var(--ink-soft)",
      backgroundColor: "var(--bg-subtle)",
      padding: "6px 14px",
      borderRadius: "20px",
      border: "1px solid var(--border)",
    },
    logoutBtn: {
      backgroundColor: "var(--alert)",
      color: "var(--on-dark)",
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
        <span>👨‍👩‍👦 Parent Portal</span>
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
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "var(--alert)")}
          >
            Logout
          </button>
        </div>
      )}
    </nav>
  );
}