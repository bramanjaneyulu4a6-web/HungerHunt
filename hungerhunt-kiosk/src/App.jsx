import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { Toaster } from "react-hot-toast";

import KioskBilling from "./pages/KioskBilling";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";

// The kiosk is a standalone till, so it owns its sign-out. The admin console
// renders the same screen inside a layout that already has one, and passes
// nothing.
function KioskScreen() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/login", { replace: true });
  };

  return <KioskBilling onLogout={handleLogout} />;
}

function App() {
  return (
    <Router>
      <Toaster position="top-center" />
      <Routes>
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <KioskScreen />
            </ProtectedRoute>
          }
        />
        <Route path="/login" element={<Login />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}

export default App;
