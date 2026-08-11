import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import { AuthField, AuthLayout, Banner, Button } from "../components/ui";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      const res = await api.post("/admin/login", { email, password });

      // A warehouse account's credentials are good — for the other app.
      if (res.data.role === "warehouse") {
        setError("This is a warehouse account. Sign in on the warehouse app instead.");
        setLoading(false);
        return;
      }

      localStorage.setItem("adminToken", res.data.token);

      // Both roles work the till. Kept so the terminal can say who is on it —
      // nothing is authorized from this, which is settled server-side.
      localStorage.setItem("staffRole", res.data.role || "admin");

      navigate("/", { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.message ||
          err.response?.data?.error ||
          "Invalid email or password."
      );
      setLoading(false);
    }
  };

  return (
    <AuthLayout logo={hungerLogo} title="Staff Login" subtitle="Sign in to open the till">
      {error && (
        <Banner variant="alert" icon="⚠️" style={{ marginBottom: 28 }}>
          {error}
        </Banner>
      )}

      <form onSubmit={handleSubmit} className="auth-form">
        <AuthField
          id="email"
          label="Email"
          type="email"
          autoComplete="username"
          required
          placeholder="admin@hungerhunt.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          required
          placeholder="••••••••"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <Button
          type="submit"
          variant="brand"
          block
          className="auth-submit"
          disabled={loading}
        >
          {loading ? "Logging in…" : "Login"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
