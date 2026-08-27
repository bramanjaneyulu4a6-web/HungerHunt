import { useEffect } from "react";
import {
  BrowserRouter as Router,
  Routes,
  Route,
  Navigate,
  useNavigate,
  useLocation,
} from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { useAuth } from "./context/auth";

import Login from "./pages/Login";
import Activate from "./pages/Activate";
import Dashboard from "./pages/Dashboard";
import Accounts from "./pages/Accounts";
import ChildDetails from "./pages/ChildDetails";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SetPurchasePassword from "./pages/SetPurchasePassword";
import PaymentReturn from "./pages/PaymentReturn";

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

const pageTitle = (pathname) => {
  if (pathname.startsWith('/child/')) return 'Child account';
  if (pathname === '/pending-orders') return 'Approval requests';
  if (pathname === '/accounts') return 'Student accounts';
  if (pathname.startsWith('/purchase-password/')) return 'Purchase code';
  if (pathname === '/login') return 'Sign in';
  if (pathname === '/activate') return 'Activate account';
  if (pathname === '/forgot-password') return 'Forgot password';
  if (pathname.startsWith('/reset-password/')) return 'Reset password';
  if (pathname === '/payment-return') return 'Payment';
  return 'Dashboard';
};

function RouteEffects() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    document.title = `${pageTitle(pathname)} — Hunger Hunt Parent`;
  }, [pathname]);

  return null;
}

function AppContent() {
  const { parent } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Starting push before login would ask for notification permission on a
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
        navigate("/");
      } else if (data.studentId) {
        navigate(`/child/${data.studentId}`);
      }
    });
  }, [parent, navigate]);

  return (
    <>
      <RouteEffects />
      {parent && <Navbar />}

      <main id="main-content" className="parent-main">
        <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<PublicOnlyRoute><Login /></PublicOnlyRoute>} />
        <Route path="/activate" element={<PublicOnlyRoute><Activate /></PublicOnlyRoute>} />
        <Route path="/register" element={<Navigate to="/activate" replace />} />
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
          path="/accounts"
          element={
            <ProtectedRoute>
              <Accounts />
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
          element={<Navigate to="/" replace />}
        />

        <Route
          path="/purchase-password/:id"
          element={
            <ProtectedRoute>
              <SetPurchasePassword />
            </ProtectedRoute>
          }
        />

        {/* Where PhonePe's checkout redirects back to — and deliberately NOT
            protected. That redirect lands in whichever browser the parent's
            UPI app was holding, which on a phone is a Custom Tab carrying
            none of this app's session; behind ProtectedRoute every native
            payment would end on a login screen. The page reads one payment's
            verdict using the token the backend put in the redirect URL, and
            says so plainly when it has neither that nor a session. */}
        <Route path="/payment-return" element={<PaymentReturn />} />

        {/* Catch All */}
        <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
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
