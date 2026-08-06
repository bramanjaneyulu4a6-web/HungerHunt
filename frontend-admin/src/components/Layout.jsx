import { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";

const NAV_ITEMS = [
  { path: "/dashboard", label: "Dashboard", icon: "📊" },
  { path: "/billing", label: "Billing", icon: "🛒" },
  { path: "/students", label: "Students", icon: "👨‍🎓" },
  { path: "/products", label: "Add Product", icon: "📦" },
  { path: "/purchase", label: "Purchase", icon: "🧾" },
  { path: "/purchased", label: "Purchased", icon: "✅" },
  { path: "/inventory", label: "Inventory", icon: "📈" },
  { path: "/recharge-history", label: "Recharge History", icon: "💰" },
  { path: "/kiosk", label: "Kiosk", icon: "🖥️" },
];

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  // A 256px rail leaves nothing for content on a phone, so start collapsed
  // when the window is narrow.
  const [isExpanded, setIsExpanded] = useState(() => window.innerWidth > 768);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/login");
  };

  return (
    <div className="layout">
      <aside className={`sidenav${isExpanded ? "" : " sidenav--collapsed"}`}>
        <div className="sidenav-top">
          <button
            type="button"
            className="sidenav-toggle"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
            aria-label={isExpanded ? "Collapse menu" : "Expand menu"}
          >
            ☰
          </button>

          <div className="sidenav-brand">
            <img src="/Logo.jpeg" alt="" className="sidenav-logo" />
            <span>Hunger Hunt</span>
          </div>
        </div>

        <nav className="sidenav-nav">
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                className={`sidenav-link${isActive ? " sidenav-link--active" : ""}`}
                aria-current={isActive ? "page" : undefined}
                title={isExpanded ? undefined : item.label}
              >
                <span className="sidenav-icon" aria-hidden="true">
                  {item.icon}
                </span>
                {isExpanded && <span className="sidenav-label">{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        <div className="sidenav-footer">
          <button
            type="button"
            className="sidenav-logout"
            onClick={handleLogout}
            title={isExpanded ? undefined : "Logout"}
          >
            <span className="sidenav-icon" aria-hidden="true">
              🚪
            </span>
            {isExpanded && <span>Logout</span>}
          </button>
        </div>
      </aside>

      <main className="layout-main">
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
