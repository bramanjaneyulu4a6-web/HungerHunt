import { useEffect } from "react";

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
import DemoKiosk from "./pages/DemoKiosk";
import ProtectedRoute from "./components/ProtectedRoute";
import { LOGIN_DISABLED } from "./constants/kioskMode";
import { startDeployWatch } from "./utils/deployWatch";
import { isOrderSessionActive } from "./utils/kioskSession";

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
  // The kiosk does not poll the change counter at all: nothing on the till
  // would act on the answer (inventory is read fresh at checkout, and a
  // student's basket is never interrupted), so every poll was a free GET
  // from every till against the backend. The shared dataAutoRefresh utility
  // stays in src/utils, byte-identical to the other apps, unused here.

  /* New deploys, though, do reach the web kiosk — between students only. The
     periodic check may reload the login screen or the demo's "Opening the
     store" screen; a session in progress holds it, and the end of that
     session lets it in (src/utils/kioskSession.js). The sideloaded APK serves
     its own version.json, so the watcher does not start there. */
  useEffect(() => startDeployWatch({
    bakedStamp: import.meta.env.VITE_BUILD_STAMP,
    canReload: () => !isOrderSessionActive(),
  }), []);

  return (
    <Router>
      <Toaster position="top-center" />
      {/* Two kiosks, and only ever one of them built: the terminal that asks
          who is standing at it, and the one that does not. The gate is not
          hidden behind a redirect when it is off — Login is not mounted at
          all, so there is no field to type a real admission number into and
          nothing is sent on anybody's behalf. See src/constants/kioskMode.js. */}
      {LOGIN_DISABLED ? (
        <Routes>
          <Route path="/" element={<DemoKiosk />} />
          {/* Including /login, which the APK's deep link and any bookmark
              still ask for. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      ) : (
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
      )}
    </Router>
  );
}

export default App;
