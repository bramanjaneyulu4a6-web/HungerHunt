import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";

const styles = {
  page: {
    minHeight: "100vh",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "var(--bg)",
    fontFamily: "system-ui, -apple-system, sans-serif",
    padding: "32px",
    boxSizing: "border-box",
  },
  card: {
    width: "100%",
    maxWidth: "420px",
    background: "var(--surface)",
    border: "1px solid var(--border)",
    borderRadius: "14px",
    padding: "32px",
    boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
    boxSizing: "border-box",
  },
  logo: {
    display: "block",
    width: "160px",
    maxWidth: "70%",
    height: "auto",
    margin: "0 auto 20px",
  },
  panelTitle: {
    fontSize: "28px",
    fontWeight: "900",
    fontFamily: "'Poppins', sans-serif",
    color: "#033d6c",
    letterSpacing: "1px",
    textShadow: "2px 2px 6px rgba(66, 55, 10, 0.25)",
    marginTop: 0,
    marginBottom: "24px",
    textAlign: "center",
  },
  field: {
    marginBottom: "16px",
  },
  label: {
    display: "block",
    marginBottom: "6px",
    fontSize: "13px",
    fontWeight: "600",
    color: "var(--ink-soft)",
  },
  input: {
    width: "100%",
    padding: "12px 14px",
    border: "1px solid var(--border)",
    borderRadius: "10px",
    fontSize: "14px",
    color: "var(--ink)",
    backgroundColor: "var(--surface)",
    outline: "none",
    transition: "border-color 0.2s",
    boxSizing: "border-box",
  },
  primaryBtn: {
    width: "100%",
    padding: "12px 24px",
    background: "orange",
    color: "var(--on-dark)",
    border: "none",
    borderRadius: "10px",
    fontWeight: "600",
    fontSize: "14px",
    cursor: "pointer",
    transition: "background-color 0.2s",
    marginTop: "8px",
  },
  primaryBtnDisabled: {
    opacity: 0.6,
    cursor: "not-allowed",
  },
  error: {
    background: "var(--danger-bg-strong)",
    color: "var(--danger)",
    padding: "10px 14px",
    borderRadius: "8px",
    fontSize: "13px",
    fontWeight: "500",
    marginBottom: "16px",
  },
};

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (!email.trim() || !password) {
      setError("Please enter both email and password.");
      return;
    }

    try {
      setLoading(true);
      const res = await api.post("/admin/login", { email, password });
      localStorage.setItem("adminToken", res.data.token);
      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Invalid email or password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <img src={hungerLogo} alt="Hunger Hunt" style={styles.logo} />
        <h1 style={styles.panelTitle}>Staff Login</h1>

        {error && <div style={styles.error}>{error}</div>}

        <form onSubmit={handleSubmit}>
          <div style={styles.field}>
            <label style={styles.label} htmlFor="email">
              Email
            </label>
            <input
              id="email"
              type="email"
              style={styles.input}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@hungerhunt.com"
              autoComplete="username"
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          <div style={styles.field}>
            <label style={styles.label} htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              style={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--primary)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              ...styles.primaryBtn,
              ...(loading ? styles.primaryBtnDisabled : {}),
            }}
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
