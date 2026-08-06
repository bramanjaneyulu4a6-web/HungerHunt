import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import api from "../utils/api";

const Register = () => {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "",
    password: ""
  });

  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    try {
      const res = await api.post("/admin/register", formData);

      setSuccess(res.data.message);
      setError("");

      setTimeout(() => {
        navigate("/login");
      }, 1200);
    } catch (err) {
      setError(err.response?.data?.message || "Registration failed");
      setSuccess("");
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
      padding: "40px 32px",
      textAlign: "left"
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

    errorBox: {
      backgroundColor: "var(--danger-bg)",
      border: "1px solid var(--danger-bg-strong)",
      color: "var(--danger-light)",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "12px",
      fontSize: "14px",
      textAlign: "center"
    },

    successBox: {
      backgroundColor: "var(--success-bg)",
      border: "1px solid var(--success-border)",
      color: "var(--success)",
      padding: "12px",
      borderRadius: "6px",
      marginBottom: "12px",
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
      marginTop: "16px",
      fontSize: "13px",
      color: "var(--muted)"
    }
  };

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        {/* Header */}
        <div style={styles.header}>
          <h2 style={styles.title}>Admin Registration</h2>
          <p style={styles.subtitle}>Create a new admin account</p>
        </div>

        {/* Messages */}
        {error && <div style={styles.errorBox}>{error}</div>}
        {success && <div style={styles.successBox}>{success}</div>}

        {/* Form */}
        <form onSubmit={handleSubmit}>
          <div style={styles.formGroup}>
            <label style={styles.label}>Email Address</label>
            <input
              type="email"
              name="email"
              placeholder="admin@email.com"
              value={formData.email}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <div style={styles.formGroup}>
            <label style={styles.label}>Password</label>
            <input
              type="password"
              name="password"
              placeholder="••••••••"
              value={formData.password}
              onChange={handleChange}
              style={styles.input}
              required
            />
          </div>

          <button type="submit" style={styles.button}>
            Create Account
          </button>
        </form>

        {/* Footer */}
        <div style={styles.footer}>
          Already have an account?{" "}
          <Link to="/login" style={styles.link}>
            Sign In
          </Link>
        </div>
      </div>
    </div>
  );
};

export default Register;