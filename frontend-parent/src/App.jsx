import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ChildDetails from "./pages/ChildDetails";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SetPurchasePassword from "./pages/SetPurchasePassword";
import PendingOrders from "./pages/PendingOrders";

import Navbar from "./components/Navbar";
import ErrorBoundary from "./components/ErrorBoundary";
import { startPush } from "./utils/push";
import { PUSH_EVENT } from "./utils/events";

const ProtectedRoute = ({ children }) => {
  const { parent } = useAuth();
  return parent ? children : <Navigate to="/login" replace />;
};

const PublicOnlyRoute = ({ children }) => {
  const { parent } = useAuth();
  return parent ? <Navigate to="/" replace /> : children;
};

function AppContent() {
  const { parent } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Registering before login would ask for the notification permission on a
    // screen that cannot explain why, and would have no account to attach the
    // device to. This runs once a parent is signed in — on login, and on every
    // later start that restores their session.
    if (!parent) return;

    startPush(({ data, tapped }) => {
      // Screens listen for this to refresh balances that changed elsewhere.
      window.dispatchEvent(new CustomEvent(PUSH_EVENT, { detail: data }));

      // Tapping a notification should open what it was about, the way any
      // other app behaves. An approval request is the one that is asking for
      // something, so it opens the list it has to be answered from rather than
      // the child's page, which cannot answer it.
      if (!tapped) return;

      if (data.type === "PENDING_ORDER") {
        navigate("/pending-orders");
      } else if (data.studentId) {
        navigate(`/child/${data.studentId}`);
      }
    });
  }, [parent, navigate]);

  return (
    <>
      {parent && <Navbar />}

      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/register" element={<PublicOnlyRoute><Register /></PublicOnlyRoute>} />
        <Route path="/forgot-password" element={<PublicOnlyRoute><ForgotPassword /></PublicOnlyRoute>} />
        {/* A reset link may be opened while another session is still present;
            it must remain usable so the token can close those old sessions. */}
        <Route path="/reset-password/:token" element={<ResetPassword />} />

        {/* Protected Routes */}
        <Route
          path="/"
          element={
            <ProtectedRoute>
              <Dashboard />
            </ProtectedRoute>
          }
        />

        <Route
          path="/child/:id"
          element={
            <ProtectedRoute>
              <ChildDetails />
            </ProtectedRoute>
          }
        />

        <Route
          path="/pending-orders"
          element={
            <ProtectedRoute>
              <PendingOrders />
            </ProtectedRoute>
          }
        />

        <Route
          path="/purchase-password/:id"
          element={
            <ProtectedRoute>
              <SetPurchasePassword />
            </ProtectedRoute>
          }
        />

        {/* Catch All */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    /* Outermost, so it also covers a failure in the provider or the router
       itself — anything it does not wrap has nothing left to catch it. */
    <ErrorBoundary>
      <AuthProvider>
        <Router>
          <AppContent />
        </Router>
      </AuthProvider>
    </ErrorBoundary>
  );
}
