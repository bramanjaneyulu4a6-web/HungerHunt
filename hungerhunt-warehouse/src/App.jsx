import { BrowserRouter, Routes, Route, NavLink } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Home from "./pages/Home";
import Receive from "./pages/Receive";

// Replaced by real pages in the next two tasks.
const Placeholder = ({ name }) => <div className="wh-page"><h1 className="wh-title">{name}</h1></div>;

const TABS = [
  { to: "/", icon: "📥", label: "Orders" },
  { to: "/new-order", icon: "➕", label: "New order" },
  { to: "/stock", icon: "📦", label: "Stock" },
  { to: "/history", icon: "🧾", label: "History" },
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
        <span className="wh-tab-icon" aria-hidden="true">{tab.icon}</span>
        {tab.label}
      </NavLink>
    ))}
  </nav>
);

const Shell = ({ children }) => (
  <div className="wh-app">
    {children}
    <TabBar />
  </div>
);

const App = () => (
  <BrowserRouter>
    <Toaster position="top-center" />
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<ProtectedRoute><Shell><Home /></Shell></ProtectedRoute>} />
      <Route path="/receive/:id" element={<ProtectedRoute><Shell><Receive /></Shell></ProtectedRoute>} />
      <Route path="/new-order" element={<ProtectedRoute><Shell><Placeholder name="New order" /></Shell></ProtectedRoute>} />
      <Route path="/stock" element={<ProtectedRoute><Shell><Placeholder name="Stock" /></Shell></ProtectedRoute>} />
      <Route path="/history" element={<ProtectedRoute><Shell><Placeholder name="History" /></Shell></ProtectedRoute>} />
    </Routes>
  </BrowserRouter>
);

export default App;
