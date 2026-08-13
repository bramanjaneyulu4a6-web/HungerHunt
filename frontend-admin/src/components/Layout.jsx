import { useState } from "react";
import { Outlet, Link, NavLink, useLocation, useNavigate } from "react-router-dom";

const PRIMARY_NAV = [
  { path: "/dashboard", label: "Dashboard", icon: "▦" },
  { path: "/billing", label: "Point of Sale", icon: "◫" },
  { path: "/students", label: "Students", icon: "♙" },
  { path: "/recharge-history", label: "Wallet Ledger", icon: "₹" },
  { path: "/accounting-export", label: "TallyPrime Export", icon: "⇩" },
];

const WAREHOUSE_NAV = [
  { path: "/warehouse", label: "Overview", icon: "⌂", end: true },
  { path: "/warehouse/review", label: "Review requests", icon: "✓" },
  { path: "/warehouse/orders", label: "Order ledger", icon: "≡" },
  { path: "/warehouse/inventory", label: "Inventory", icon: "▤" },
  { path: "/warehouse/products", label: "Product catalogue", icon: "◇" },
  { path: "/warehouse/suppliers", label: "Suppliers", icon: "⇄" },
];

const WarehouseContextBar = () => (
  <div className="warehouse-context" aria-label="Warehouse workspace navigation">
    <div className="warehouse-context__identity">
      <span className="warehouse-context__mark" aria-hidden="true">W</span>
      <span><small>Workspace</small><strong>Warehouse</strong></span>
    </div>
    <nav className="warehouse-context__nav">
      {WAREHOUSE_NAV.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          end={item.end}
          className={({ isActive }) =>
            `warehouse-context__link${isActive ? " warehouse-context__link--active" : ""}`
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  </div>
);

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const inWarehouse = location.pathname.startsWith("/warehouse");
  const [isExpanded, setIsExpanded] = useState(() => window.innerWidth > 768);
  const [warehouseOpen, setWarehouseOpen] = useState(inWarehouse);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/login");
  };

  const toggleWarehouse = () => {
    if (!isExpanded) setIsExpanded(true);
    setWarehouseOpen((open) => !open);
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

          <Link to="/dashboard" className="sidenav-brand" aria-label="Hunger Hunt dashboard">
            <img src="/Logo.jpeg" alt="" className="sidenav-logo" />
            <span><strong>Hunger Hunt</strong><small>Admin console</small></span>
          </Link>
        </div>

        <nav className="sidenav-nav" aria-label="Main navigation">
          <p className="sidenav-section-label">Operations</p>
          {PRIMARY_NAV.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `sidenav-link${isActive ? " sidenav-link--active" : ""}`
              }
              title={isExpanded ? undefined : item.label}
            >
              <span className="sidenav-icon" aria-hidden="true">{item.icon}</span>
              {isExpanded && <span className="sidenav-label">{item.label}</span>}
            </NavLink>
          ))}

          <div className={`sidenav-group${inWarehouse ? " sidenav-group--active" : ""}`}>
            <button
              type="button"
              className="sidenav-link sidenav-group-toggle"
              onClick={toggleWarehouse}
              aria-expanded={warehouseOpen}
              title={isExpanded ? undefined : "Warehouse"}
            >
              <span className="sidenav-icon" aria-hidden="true">▣</span>
              {isExpanded && (
                <>
                  <span className="sidenav-label">Warehouse</span>
                  <span className="sidenav-chevron" aria-hidden="true">{warehouseOpen ? "⌃" : "⌄"}</span>
                </>
              )}
            </button>

            {isExpanded && warehouseOpen && (
              <div className="sidenav-subnav">
                {WAREHOUSE_NAV.map((item) => (
                  <NavLink
                    key={item.path}
                    to={item.path}
                    end={item.end}
                    className={({ isActive }) =>
                      `sidenav-sublink${isActive ? " sidenav-sublink--active" : ""}`
                    }
                  >
                    <span aria-hidden="true">{item.icon}</span>
                    <span>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            )}
          </div>
        </nav>

        <div className="sidenav-footer">
          <button
            type="button"
            className="sidenav-logout"
            onClick={handleLogout}
            title={isExpanded ? undefined : "Sign out"}
          >
            <span className="sidenav-icon" aria-hidden="true">↪</span>
            {isExpanded && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      <main className="layout-main">
        {inWarehouse && <WarehouseContextBar />}
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;
