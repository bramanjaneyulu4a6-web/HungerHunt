import { BrowserRouter, Routes, Route, NavLink, Navigate, useNavigate, useParams } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import Icon from "./components/Icon";
import Login from "./pages/Login";
import Orders from "./pages/Orders";
import Inventory from "./pages/Inventory";
import Purchases from "./pages/Purchases";
import Receive from "./pages/Receive";
import CaretakerOrders from "./pages/CaretakerOrders";
import { clearSession } from "./utils/session";

/* Three tabs, in the order the shift runs: what students are waiting for,
   what is on the shelf to serve them with, and what has been ordered to keep
   the shelf full. Six tabs used to split that into six 62-pixel targets;
   three leaves room for a thumb and for the label to be read at a glance. */
const TABS = [
  { to: "/", icon: "package", label: "Orders" },
  { to: "/inventory", icon: "shelf", label: "Inventory" },
  { to: "/purchases", icon: "truck", label: "Purchases" },
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

const CaretakerShell = ({ children }) => {
  const profile = readStaffProfile();
  const hostel = profile.hostel || {};
  const hostelLabel = [hostel.code, hostel.name].filter(Boolean).join(" — ");

  return (
    <div className="wh-app wh-app--single caretaker-app">
      <header className="caretaker-header">
        <div className="caretaker-header__brand">
          <img src="/Logo.jpeg" alt="" className="caretaker-header__logo" />
          <span><strong>Hunger Hunt</strong><small>Caretaker</small></span>
        </div>
        <SignOutButton bare />
      </header>

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
        <div className="caretaker-identity__hostel">
          <Icon name="home" size={20} />
          <span><small>Your hostel</small><strong>{hostelLabel || "Hostel unavailable"}</strong></span>
        </div>
      </section>

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

      <Route path="/packages" element={<Navigate to="/" replace />} />
      <Route path="/stock" element={<Navigate to="/inventory" replace />} />
      <Route path="/new-order" element={<Navigate to="/inventory" replace />} />
      <Route path="/insights" element={<Navigate to="/inventory" replace />} />
      <Route path="/history" element={<Navigate to="/purchases" replace />} />
      <Route path="/receive/:id" element={<ReceiveRedirect />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

const App = () => (
  <BrowserRouter>
    <Toaster position="top-center" />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="*" element={<StaffRoutes />} />
    </Routes>
  </BrowserRouter>
);

export default App;
