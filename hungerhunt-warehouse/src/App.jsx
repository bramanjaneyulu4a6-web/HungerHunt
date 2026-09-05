import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import Icon from "./components/Icon";
import { clearSession } from "./utils/session";
import api from "./utils/api";
import { startDataAutoRefresh } from "./utils/dataAutoRefresh";

/* One chunk per screen, fetched when that screen is opened. A caretaker only
   ever reaches three of these and never downloads the storeroom's; the
   storeroom never downloads the caretaker's. ProtectedRoute, Icon and the
   utils below stay eager — every route needs them, and they are small. */
const Login = lazy(() => import("./pages/Login"));
const Orders = lazy(() => import("./pages/Orders"));
const Inventory = lazy(() => import("./pages/Inventory"));
const Purchases = lazy(() => import("./pages/Purchases"));
const Receive = lazy(() => import("./pages/Receive"));
const Records = lazy(() => import("./pages/Records"));
const CaretakerOrders = lazy(() => import("./pages/CaretakerOrders"));
const CaretakerReports = lazy(() => import("./pages/CaretakerReports"));
const CollectOrder = lazy(() => import("./pages/CollectOrder"));

/* Active work stays together; completed work and reports have their own
   destination so the live queue never has to compete with record keeping. */
const TABS = [
  { to: "/", icon: "package", label: "Active" },
  { to: "/inventory", icon: "shelf", label: "Inventory" },
  { to: "/purchases", icon: "truck", label: "Purchases" },
  { to: "/records", icon: "receipt", label: "Records" },
];

const TabBar = () => (
  <nav className="wh-tabbar">
    {TABS.map((tab) => (
      <NavLink
        key={tab.to}
        to={tab.to}
        end={tab.to === "/"}
        className={({ isActive }) => `wh-tab${isActive ? " active" : ""}`}
      >
        <Icon name={tab.icon} size={26} className="wh-tab-icon" />
        {tab.label}
      </NavLink>
    ))}
  </nav>
);

const SignOutButton = ({ bare = false }) => {
  const navigate = useNavigate();

  const signOut = () => {
    clearSession(["warehouseToken", "staffRole", "staffProfile"]);
    navigate("/login", { replace: true });
  };

  const button = (
    <button type="button" className="wh-signout" onClick={signOut}>
      <Icon name="logout" size={18} />
      <span>Sign out</span>
    </button>
  );

  return bare ? button : <div className="wh-sessionbar">{button}</div>;
};

const Shell = ({ children }) => (
  <div className="wh-app">
    <SignOutButton />
    {children}
    <TabBar />
  </div>
);

const readStaffProfile = () => {
  try {
    return JSON.parse(localStorage.getItem("staffProfile")) || {};
  } catch {
    return {};
  }
};

/* The way to the office, kept in the app bar rather than behind a tab.
   It has to be reachable from wherever the caretaker is standing when
   something goes wrong, and it must not compete with the three things the
   packages screen is for. */
const ReportsButton = () => {
  const navigate = useNavigate();

  return (
    <button
      type="button"
      className="caretaker-reports-btn"
      onClick={() => navigate("/reports")}
    >
      <Icon name="receipt" size={18} />
      <span>Reports</span>
    </button>
  );
};

const CaretakerShell = ({ children, identity = true }) => {
  const profile = readStaffProfile();
  /* Devices already in the field hold the single-room profile written by the
     old login and will keep it until the caretaker signs in again, so the one
     room is read as a list of one rather than shown as missing. */
  const profileRooms = profile.rooms ?? (profile.hostel ? [profile.hostel] : []);
  const roomLabel = profileRooms.map((room) => room.code).filter(Boolean).join(" · ");

  return (
    <div className="wh-app wh-app--single caretaker-app">
      <header className="caretaker-header">
        <div className="caretaker-header__brand">
          <img src="/Logo.jpeg" alt="" className="caretaker-header__logo" />
          <span><strong>Hunger Hunt</strong><small>Caretaker</small></span>
        </div>
        <div className="caretaker-header__actions">
          <ReportsButton />
          <SignOutButton bare />
        </div>
      </header>

      {identity && (
      <section className="caretaker-identity" aria-label="Signed-in caretaker">
        <div className="caretaker-identity__avatar" aria-hidden="true">
          {(profile.name || "C").trim().charAt(0).toUpperCase()}
        </div>
        <div className="caretaker-identity__details">
          <p className="caretaker-identity__eyebrow">Signed in as</p>
          <h1>{profile.name || "Caretaker"}</h1>
          <a href={profile.phone ? `tel:${profile.phone.replace(/[^+\d]/g, "")}` : undefined}>
            {profile.phone || "Phone unavailable"}
          </a>
        </div>
        <div className="caretaker-identity__rooms">
          <Icon name="home" size={20} />
          <span>
            <small>{profileRooms.length === 1 ? "Your room" : "Your rooms"}</small>
            <strong>{roomLabel || "Rooms unavailable"}</strong>
          </span>
        </div>
      </section>
      )}

      {children}
    </div>
  );
};

const guarded = (page) => (
  <ProtectedRoute>
    <Shell>{page}</Shell>
  </ProtectedRoute>
);

// The receive screen moved under Purchases; a link or bookmark to the old
// path still has a real order id in it and should land on that order.
const ReceiveRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/purchases/receive/${id}`} replace />;
};

const roleFromToken = () => {
  const token = localStorage.getItem('warehouseToken');
  const claims = token?.split('.')[1];
  if (!claims) return null;

  try {
    const base64 = claims.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=');
    const json = atob(padded);
    return JSON.parse(json).role || 'admin';
  } catch {
    return null;
  }
};

const StaffRoutes = () => {
  // The route tree follows the role stamped into the signed token, not the
  // mutable companion value in localStorage. The backend remains the security
  // boundary; this prevents ordinary local state drift from showing one role
  // the other role's interface.
  const caretaker = roleFromToken() === 'caretaker';

  if (caretaker) {
    return (
      <Routes>
        <Route path="/" element={<ProtectedRoute><CaretakerShell><CaretakerOrders /></CaretakerShell></ProtectedRoute>} />
        {/* The handover screen is handed to the student, so the caretaker's
            own identity card stays off it — the student's name is the one
            that belongs at the top. */}
        <Route
          path="/collect/:orderId"
          element={
            <ProtectedRoute>
              <CaretakerShell identity={false}><CollectOrder /></CaretakerShell>
            </ProtectedRoute>
          }
        />
        <Route
          path="/reports"
          element={
            <ProtectedRoute>
              <CaretakerShell identity={false}><CaretakerReports /></CaretakerShell>
            </ProtectedRoute>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  return (
    <Routes>
      <Route path="/" element={guarded(<Orders />)} />
      <Route path="/inventory" element={guarded(<Inventory />)} />
      <Route path="/purchases" element={guarded(<Purchases />)} />
      <Route path="/purchases/receive/:id" element={guarded(<Receive />)} />
      <Route path="/records" element={guarded(<Records />)} />

      <Route path="/packages" element={<Navigate to="/" replace />} />
      <Route path="/stock" element={<Navigate to="/inventory" replace />} />
      <Route path="/new-order" element={<Navigate to="/inventory" replace />} />
      <Route path="/insights" element={<Navigate to="/inventory" replace />} />
      <Route path="/history" element={<Navigate to="/records" replace />} />
      <Route path="/receive/:id" element={<ReceiveRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => {
  useEffect(() => startDataAutoRefresh(api, {
    enabled: () => Boolean(localStorage.getItem("warehouseToken")),
  }), []);

  return (
    <BrowserRouter>
      <Toaster position="top-center" />
      {/* One boundary for the whole tree, including the nested routes inside
          StaffRoutes. The fallback is a bare themed shell rather than a
          spinner: these chunks come off the same LAN as the app itself, and a
          flash of spinner reads worse than a beat of background. */}
      <Suspense fallback={<div className="wh-app wh-app--single" />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<StaffRoutes />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
};

export default App;
