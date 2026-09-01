import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { useEffect } from "react";
import { Toaster } from "react-hot-toast";

import KioskBilling from "./pages/KioskBilling";
import Login from "./pages/Login";
import ProtectedRoute from "./components/ProtectedRoute";
import api from "./utils/api";
import { startDataAutoRefresh } from "./utils/dataAutoRefresh";

/* The kiosk owns the end of a session, and there are four ways to reach it:
   the student taps Done, the idle prompt runs out, the hard cap arrives, or
   the sale finishes. All of them come through here, so there is one place
   where the token and the student are let go together. */
function KioskScreen() {
  const navigate = useNavigate();

  // Read once per mount rather than held in state: nothing in a session
  // changes who it belongs to, and the next student gets a fresh mount.
  const student = (() => {
    try {
      return JSON.parse(localStorage.getItem("kioskStudent")) ?? null;
    } catch {
      return null;
    }
  })();

  const handleLogout = () => {
    localStorage.removeItem("kioskToken");
    localStorage.removeItem("kioskStudent");
    navigate("/login", { replace: true });
  };

  // A token with no student beside it is a half-cleared session — send it back
  // to the gate rather than render a till with nobody at it.
  if (!student) {
    return <Navigate to="/login" replace />;
  }

  return <KioskBilling student={student} onLogout={handleLogout} />;
}

function App() {
  useEffect(() => startDataAutoRefresh(api, {
    // Never interrupt a student's basket. Inventory is read again at checkout,
    // and the pending revision reloads as soon as that short session ends.
    pauseWhen: () => Boolean(localStorage.getItem("kioskToken")),
  }), []);

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
