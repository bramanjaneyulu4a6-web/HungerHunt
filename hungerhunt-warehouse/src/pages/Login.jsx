import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import api from "../utils/api";
import { AuthField, AuthLayout, Banner, Button } from "../components/ui";

const Login = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [searchParams] = useSearchParams();

  // Set by the 401 interceptor and by ProtectedRoute, so a day-old session says
  // so instead of dropping the storeroom on a bare login screen.
  const expired = searchParams.get("expired") === "1";

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);
      const res = await api.post("/admin/login", { email, password });

      // Warehouse staff and caretakers share this front door, then get separate
      // route trees. The caretaker tree never mounts procurement screens.
      localStorage.setItem("warehouseToken", res.data.token);
      localStorage.setItem("staffRole", res.data.role || "admin");
      localStorage.setItem("staffProfile", JSON.stringify(res.data.staff || {
        name: res.data.name,
        phone: res.data.phone,
        email: res.data.email,
        role: res.data.role,
        hostel: res.data.hostel,
      }));
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
    <AuthLayout
      logo="/Logo.jpeg"
      eyebrow="Hunger Hunt"
      title="Warehouse & dorm delivery"
      subtitle="Sign in to continue"
    >
      {expired && !error && (
        <Banner variant="warn" icon="🔒" style={{ marginBottom: 28 }}>
          Your session has expired. Please sign in again.
        </Banner>
      )}

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
