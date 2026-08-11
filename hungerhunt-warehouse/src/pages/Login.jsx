import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
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

      // A cashier's credentials are good — for the till. Admins outrank the
      // storeroom and may sign in here.
      if (res.data.role === "cashier") {
        setError("This is a till account. Sign in on the kiosk instead.");
        setLoading(false);
        return;
      }

      localStorage.setItem("warehouseToken", res.data.token);
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
    <AuthLayout title="Warehouse" subtitle="Sign in to receive stock">
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
          placeholder="store@hungerhunt.com"
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

        <Button type="submit" variant="brand" block className="auth-submit" disabled={loading}>
          {loading ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </AuthLayout>
  );
};

export default Login;
