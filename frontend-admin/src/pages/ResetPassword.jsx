import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import api from "../utils/api";

const ResetPassword = () => {
  const { token } = useParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const handleReset = async (e) => {
    e.preventDefault();

    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      setMessage("");
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      setMessage("");
      return;
    }

    try {
      await api.post(`/admin/reset-password/${token}`, { password });
      setMessage("Password reset successful. Redirecting to login...");
      setError("");
      setTimeout(() => navigate("/login"), 2000);
    } catch (err) {
      setError(err.response?.data?.message || "Failed to reset password.");
      setMessage("");
    }
  };

  // SAME STYLE SYSTEM AS LOGIN
  const styles = {
    container: {
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      minHeight: "100vh",
      padding: "20px",
      width: "100%",
      backgroundColor: "var(--surface)"
    },

    card: {
      width: "100%",
      maxWidth: "400px",
      background: "var(--surface)",
      border: "1px solid var(--border)",
      borderRadius: "12px",
      boxShadow:
        "0 10px 25px -5px rgba(0, 0, 0, 0.05), 0 8px 10px -6px rgba(0, 0, 0, 0.05)",
      padding: "40px 32px"
    },

    header: {
      textAlign: "center",
      marginBottom: "28px"
    },

    title: {
      fontSize: "28px",
      margin: "0 0 6px 0",
      fontWeight: "700",
      color: "var(--ink-strong)"
    },

    subtitle: {
      fontSize: "14px",
      color: "var(--muted)",
      margin: 0
    },

    successBox: {
      backgroundColor: "var(--success-bg)",
      border: "1px solid var(--success-border)",
      color: "var(--success)",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "18px",
      fontSize: "14px",
      textAlign: "center"
    },

    errorBox: {
      backgroundColor: "var(--danger-bg)",
      border: "1px solid var(--danger-bg-strong)",
      color: "var(--danger-light)",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "18px",
      fontSize: "14px",
      textAlign: "center"
    },

    formGroup: {
      marginBottom: "20px"
    },

    label: {
      display: "block",
      fontSize: "13px",
      fontWeight: "600",
      marginBottom: "6px",
      color: "var(--ink-dim)"
    },

    input: {
      width: "100%",
      padding: "12px",
      fontSize: "15px",
      background: "var(--surface)",
      border: "1px solid var(--border-strong)",
      borderRadius: "8px",
      color: "var(--ink)",
      boxSizing: "border-box",
      outline: "none"
    },

    button: {
      width: "100%",
      padding: "13px",
      fontSize: "16px",
      fontWeight: "600",
      background: "var(--primary)",
      color: "var(--on-dark)",
      border: "none",
      borderRadius: "8px",
      cursor: "pointer",
      boxShadow: "0 4px 6px -1px rgba(37, 99, 235, 0.2)"
    },

    link: {
      color: "var(--primary)",
      textDecoration: "none",
      fontWeight: "600"
    },

    footer: {
      textAlign: "center",
      marginTop: "18px",
      fontSize: "13px",
      color: "var(--muted)"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Set New Password</h2>
          <p style={styles.subtitle}>Choose a new password for your admin account</p>
        </div>

        {/* Messages */}
        {message && <div style={styles.successBox}>{message}</div>}
        {error && <div style={styles.errorBox}>{error}</div>}

        {/* Form */}
        <form onSubmit={handleReset}>
          <div style={styles.formGroup}>
            <label style={styles.label}>New Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Confirm New Password</label>
            <input
              type="password"
              required
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              style={styles.input}
            />
          </div>

          <button type="submit" style={styles.button}>
            Reset Password
          </button>
        </form>

        {/* Footer */}
        <div style={styles.footer}>
          Remember your password?{" "}
          <Link to="/login" style={styles.link}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
