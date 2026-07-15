// // // import React from "react";
// // // import { Outlet, Link, useNavigate } from "react-router-dom";

// // // const Layout = () => {
// // //   const navigate = useNavigate();

// // //   const handleLogout = () => {
// // //     localStorage.removeItem("adminToken");
// // //     navigate("/login");
// // //   };

// // //   return (
// // //     <div className="flex h-screen bg-[#0b1220] text-white">

// // //       {/* SIDEBAR */}
// // //       <aside className="w-60 bg-[#111827] border-r border-gray-800 flex flex-col">

// // //         {/* LOGO */}
// // //         <div className="px-4 py-4 text-lg font-semibold border-b border-gray-800">
// // //           School Admin
// // //         </div>

// // //         {/* MENU */}
// // //         <nav className="flex-1 p-2 space-y-1">

// // //           <Link
// // //             to="/dashboard"
// // //             className="block px-3 py-2 rounded-md hover:bg-gray-800 transition"
// // //           >
// // //             📊 Dashboard
// // //           </Link>

// // //           <Link
// // //             to="/billing"
// // //             className="block px-3 py-2 rounded-md hover:bg-gray-800 transition"
// // //           >
// // //             🛒 POS Billing
// // //           </Link>

// // //           <Link
// // //             to="/students"
// // //             className="block px-3 py-2 rounded-md hover:bg-gray-800 transition"
// // //           >
// // //             👨‍🎓 Students
// // //           </Link>

// // //           <Link
// // //             to="/products"
// // //             className="block px-3 py-2 rounded-md hover:bg-gray-800 transition"
// // //           >
// // //             📦 Products
// // //           </Link>

// // //           <Link
// // //             to="/inventory"
// // //             className="block px-3 py-2 rounded-md hover:bg-gray-800 transition"
// // //           >
// // //             📈 Inventory
// // //           </Link>

// // //         </nav>

// // //         {/* LOGOUT */}
// // //         <div className="p-3 border-t border-gray-800">
// // //           <button
// // //             onClick={handleLogout}
// // //             className="w-full py-2 rounded-md bg-red-600 hover:bg-red-700 transition"
// // //           >
// // //             Logout
// // //           </button>
// // //         </div>

// // //       </aside>

// // //       {/* MAIN CONTENT */}
// // //       <main className="flex-1 overflow-y-auto p-6">
// // //         <Outlet />
// // //       </main>

// // //     </div>
// // //   );
// // // };

// // // export default Layout;




// // import React, { useState } from "react";
// // import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";

// // const Layout = () => {
// //   const navigate = useNavigate();
// //   const location = useLocation();
// //   const [isExpanded, setIsExpanded] = useState(true);

// //   const handleLogout = () => {
// //     localStorage.removeItem("adminToken");
// //     navigate("/login");
// //   };

// //   const navItems = [
// //     { path: "/dashboard", label: "Dashboard", icon: "📊" },
// //     { path: "/billing", label: "POS Billing", icon: "🛒" },
// //     { path: "/students", label: "Students", icon: "👨‍Grad" },
// //     { path: "/products", label: "Products", icon: "📦" },
// //     { path: "/inventory", label: "Inventory", icon: "📈" },
// //   ];

// //   // Colors match Gemini dark-mode interface palette
// //   const styles = {
// //     layoutContainer: {
// //       display: "flex",
// //       height: "100vh",
// //       backgroundColor: "#131314",
// //       color: "#e3e3e3",
// //       fontFamily: "system-ui, -apple-system, sans-serif",
// //       overflow: "hidden",
// //     },
// //     sidebar: {
// //       width: isExpanded ? "256px" : "68px",
// //       backgroundColor: "#1e1f20",
// //       display: "flex",
// //       flexDirection: "col",
// //       transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
// //       overflow: "hidden",
// //       position: "relative",
// //     },
// //     topBar: {
// //       display: "flex",
// //       alignItems: "center",
// //       justifyContent: isExpanded ? "space-between" : "center",
// //       padding: "16px",
// //       height: "64px",
// //     },
// //     toggleBtn: {
// //       background: "none",
// //       border: "none",
// //       color: "#c4c7c5",
// //       fontSize: "20px",
// //       cursor: "pointer",
// //       padding: "8px",
// //       borderRadius: "50%",
// //       display: "flex",
// //       alignItems: "center",
// //       justifyContent: "center",
// //       transition: "background-color 0.2s",
// //     },
// //     logoText: {
// //       fontSize: "16px",
// //       fontWeight: "500",
// //       color: "#e3e3e3",
// //       whiteSpace: "nowrap",
// //       opacity: isExpanded ? 1 : 0,
// //       transition: "opacity 0.2s",
// //     },
// //     navContainer: {
// //       flex: 1,
// //       padding: "0 12px",
// //       display: "flex",
// //       flexDirection: "column",
// //       gap: "4px",
// //       marginTop: "8px",
// //     },
// //     navLink: (isActive) => ({
// //       display: "flex",
// //       alignItems: "center",
// //       padding: "12px 16px",
// //       borderRadius: "24px", // Pill shape like Gemini
// //       color: isActive ? "#e3e3e3" : "#c4c7c5",
// //       backgroundColor: isActive ? "#004a77" : "transparent", // Subtle highlight blue
// //       textDecoration: "none",
// //       transition: "all 0.2s ease",
// //       whiteSpace: "nowrap",
// //       gap: "16px",
// //     }),
// //     iconSpan: {
// //       fontSize: "18px",
// //       display: "inline-flex",
// //       alignItems: "center",
// //       justifyContent: "center",
// //       minWidth: "24px",
// //     },
// //     labelSpan: {
// //       fontSize: "14px",
// //       fontWeight: "500",
// //       opacity: isExpanded ? 1 : 0,
// //       transition: "opacity 0.15s ease",
// //     },
// //     footerSection: {
// //       padding: "12px",
// //       display: "flex",
// //       justifyContent: "center",
// //     },
// //     logoutBtn: {
// //       width: "100%",
// //       display: "flex",
// //       alignItems: "center",
// //       justifyContent: isExpanded ? "flex-start" : "center",
// //       gap: "16px",
// //       padding: "12px 16px",
// //       borderRadius: "24px",
// //       border: "none",
// //       backgroundColor: "#282a2c",
// //       color: "#b3261e", // Gemini error/logout accent color
// //       fontWeight: "600",
// //       fontSize: "14px",
// //       cursor: "pointer",
// //       transition: "background-color 0.2s",
// //     },
// //     mainContent: {
// //       flex: 1,
// //       overflowY: "auto",
// //       backgroundColor: "#131314",
// //       padding: "24px",
// //     }
// //   };

// //   return (
// //     <div style={styles.layoutContainer}>
      
// //       {/* SIDEBAR */}
// //       <aside style={styles.sidebar}>
        
// //         {/* TOP BLOCK & TOGGLE BUTTON */}
// //         <div style={styles.topBar}>
// //           <button 
// //             style={styles.toggleBtn} 
// //             onClick={() => setIsExpanded(!isExpanded)}
// //             title={isExpanded ? "Collapse menu" : "Expand menu"}
// //             onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#2f3032"}
// //             onMouseOut={(e) => e.currentTarget.style.backgroundColor = "transparent"}
// //           >
// //             ☰
// //           </button>
// //           {isExpanded && <span style={styles.logoText}>School Admin</span>}
// //         </div>

// //         {/* NAVIGATION MENUS */}
// //         <nav style={styles.navContainer}>
// //           {navItems.map((item) => {
// //             const isActive = location.pathname === item.path;
// //             return (
// //               <Link
// //                 key={item.path}
// //                 to={item.path}
// //                 style={styles.navLink(isActive)}
// //                 onMouseOver={(e) => {
// //                   if(!isActive) e.currentTarget.style.backgroundColor = "#2f3032";
// //                 }}
// //                 onMouseOut={(e) => {
// //                   if(!isActive) e.currentTarget.style.backgroundColor = "transparent";
// //                 }}
// //               >
// //                 <span style={styles.iconSpan}>{item.icon}</span>
// //                 {isExpanded && <span style={styles.labelSpan}>{item.label}</span>}
// //               </Link>
// //             );
// //           })}
// //         </nav>

// //         {/* LOGOUT BUTTON CONTAINER */}
// //         <div style={styles.footerSection}>
// //           <button
// //             onClick={handleLogout}
// //             style={styles.logoutBtn}
// //             onMouseOver={(e) => e.currentTarget.style.backgroundColor = "#353739"}
// //             onMouseOut={(e) => e.currentTarget.style.backgroundColor = "#282a2c"}
// //             title="Logout"
// //           >
// //             <span style={styles.iconSpan}>🚪</span>
// //             {isExpanded && <span style={{ whiteSpace: "nowrap" }}>Logout</span>}
// //           </button>
// //         </div>

// //       </aside>

// //       {/* MAIN CONTAINER STREAM */}
// //       <main style={styles.mainContent}>
// //         <Outlet />
// //       </main>

// //     </div>
// //   );
// // };

// // export default Layout;




// import React, { useState } from "react";
// import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";

// const Layout = () => {
//   const navigate = useNavigate();
//   const location = useLocation();
//   const [isExpanded, setIsExpanded] = useState(true);

//   const handleLogout = () => {
//     localStorage.removeItem("adminToken");
//     navigate("/login");
//   };

//   const navItems = [
//     { path: "/dashboard", label: "Dashboard", icon: "📊" },
//     { path: "/billing", label: " Billing", icon: "🛒" },
//     { path: "/students", label: "Students", icon: "👨‍🎓" },
//     { path: "/products", label: "Products", icon: "📦" },
//     { path: "/inventory", label: "Inventory", icon: "📈" },
//   ];

//   const styles = {
//     layoutContainer: {
//       display: "flex",
//       height: "100vh",
//       width: "100vw",
//       backgroundColor: "#131314", // Base Gemini dark content area
//       color: "#e3e3e3",
//       fontFamily: "system-ui, -apple-system, sans-serif",
//       overflow: "hidden",
//       boxSizing: "border-box",
//     },
//     sidebar: {
//       width: isExpanded ? "256px" : "68px",
//       backgroundColor: "#1e1f20", // Deep dark sidebar background
//       display: "flex",
//       flexDirection: "column",
//       transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
//       overflow: "hidden",
//       height: "100%",
//       flexShrink: 0,
//       boxSizing: "border-box",
//     },
//     topBar: {
//       display: "flex",
//       alignItems: "center",
//       justifyContent: isExpanded ? "space-between" : "center",
//       padding: "0 16px",
//       height: "64px",
//       flexShrink: 0,
//     },
//     toggleBtn: {
//       background: "none",
//       border: "none",
//       color: "#c4c7c5",
//       fontSize: "20px",
//       cursor: "pointer",
//       width: "40px",
//       height: "40px",
//       borderRadius: "50%",
//       display: "flex",
//       alignItems: "center",
//       justifyContent: "center",
//       transition: "background-color 0.2s",
//     },
//     logoText: {
//       fontSize: "16px",
//       fontWeight: "500",
//       color: "#e3e3e3",
//       whiteSpace: "nowrap",
//       opacity: isExpanded ? 1 : 0,
//       transition: "opacity 0.2s",
//       flex: 1,
//       marginLeft: "12px",
//     },
//     navContainer: {
//       flex: 1,
//       padding: "0 12px",
//       display: "flex",
//       flexDirection: "column",
//       gap: "4px",
//       marginTop: "8px",
//       overflowY: "auto",
//     },
//     navLink: (isActive) => ({
//       display: "flex",
//       alignItems: "center",
//       padding: "12px 16px",
//       borderRadius: "24px",
//       color: isActive ? "#e3e3e3" : "#c4c7c5",
//       backgroundColor: isActive ? "#004a77" : "transparent", // Active item blue accent
//       textDecoration: "none",
//       transition: "all 0.2s ease",
//       whiteSpace: "nowrap",
//       gap: "16px",
//       boxSizing: "border-box",
//     }),
//     iconSpan: {
//       fontSize: "18px",
//       display: "inline-flex",
//       alignItems: "center",
//       justifyContent: "center",
//       minWidth: "24px",
//     },
//     labelSpan: {
//       fontSize: "14px",
//       fontWeight: "500",
//       opacity: isExpanded ? 1 : 0,
//       transition: "opacity 0.15s ease",
//     },
//     footerSection: {
//       padding: "16px 12px",
//       boxSizing: "border-box",
//       flexShrink: 0,
//     },
//     logoutBtn: {
//       width: "100%",
//       display: "flex",
//       alignItems: "center",
//       justifyContent: isExpanded ? "flex-start" : "center",
//       gap: "16px",
//       padding: "12px 16px",
//       borderRadius: "24px",
//       border: "none",
//       backgroundColor: "#282a2c",
//       color: "#f2b8b5", // Clear soft-red tone for dark mode readability
//       fontWeight: "500",
//       fontSize: "14px",
//       cursor: "pointer",
//       transition: "background-color 0.2s",
//       boxSizing: "border-box",
//     },
//     mainContent: {
//       flex: 1,
//       overflowY: "auto",
//       backgroundColor: "#131314", // Matches root container
//       height: "100%",
//       boxSizing: "border-box",
//     },
//   };

//   return (
//     <div style={styles.layoutContainer}>
//       {/* SIDEBAR */}
//       <aside style={styles.sidebar}>
//         {/* TOP BAR */}
//         <div style={styles.topBar}>
//           <button
//             style={styles.toggleBtn}
//             onClick={() => setIsExpanded(!isExpanded)}
//             title={isExpanded ? "Collapse menu" : "Expand menu"}
//             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#2f3032")}
//             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
//           >
//             ☰
//           </button>
//           {isExpanded && <span style={styles.logoText}>Hunger Hunt</span>}
//         </div>

//         {/* NAVIGATION LINKS */}
//         <nav style={styles.navContainer}>
//           {navItems.map((item) => {
//             const isActive = location.pathname === item.path;
//             return (
//               <Link
//                 key={item.path}
//                 to={item.path}
//                 style={styles.navLink(isActive)}
//                 onMouseOver={(e) => {
//                   if (!isActive) e.currentTarget.style.backgroundColor = "#2f3032";
//                 }}
//                 onMouseOut={(e) => {
//                   if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
//                 }}
//               >
//                 <span style={styles.iconSpan}>{item.icon}</span>
//                 {isExpanded && <span style={styles.labelSpan}>{item.label}</span>}
//               </Link>
//             );
//           })}
//         </nav>

//         {/* FOOTER SECTION */}
//         <div style={styles.footerSection}>
//           <button
//             onClick={handleLogout}
//             style={styles.logoutBtn}
//             onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#353739")}
//             onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#282a2c")}
//             title="Logout"
//           >
//             <span style={styles.iconSpan}>🚪</span>
//             {isExpanded && <span style={{ whiteSpace: "nowrap" }}>Logout</span>}
//           </button>
//         </div>
//       </aside>

//       {/* CORE OUTLET CONTAINER VIEWPORT */}
//       <main style={styles.mainContent}>
//         <Outlet />
//       </main>
//     </div>
//   );
// };

// export default Layout;


import React, { useState } from "react";
import { Outlet, Link, useLocation, useNavigate } from "react-router-dom";

const Layout = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isExpanded, setIsExpanded] = useState(true);

  const handleLogout = () => {
    localStorage.removeItem("adminToken");
    navigate("/login");
  };

  const navItems = [
    { path: "/dashboard", label: "Dashboard", icon: "📊" },
    { path: "/billing", label: " Billing", icon: "🛒" },
    { path: "/students", label: "Students", icon: "👨‍🎓" },
    { path: "/products", label: "Add Product", icon: "📦" },
{ path: "/purchase", label: "Purchase", icon: "🛒" },
{ path: "/purchased", label: "Purchased", icon: "✅" },
{ path: "/inventory", label: "Inventory", icon: "📈" },
    { path: "/recharge-history", label: "Recharge History", icon: "💰" },
  ];

  const styles = {
    layoutContainer: {
      display: "flex",
      height: "100vh",
      width: "100vw",
      backgroundColor: "#131314", // Base Gemini dark content area
      color: "#e3e3e3",
      fontFamily: "system-ui, -apple-system, sans-serif",
      overflow: "hidden",
      boxSizing: "border-box",
    },
    sidebar: {
      width: isExpanded ? "256px" : "68px",
      backgroundColor: "#1e1f20", // Deep dark sidebar background
      display: "flex",
      flexDirection: "column",
      transition: "width 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
      overflow: "hidden",
      height: "100%",
      flexShrink: 0,
      boxSizing: "border-box",
    },
    topBar: {
      display: "flex",
      alignItems: "center",
      justifyContent: "flex-start", // Changed to align items consistently from the left
      padding: "0 16px",
      height: "64px",
      flexShrink: 0,
      gap: "8px", // Clean gap between items in topBar
    },
    toggleBtn: {
      background: "none",
      border: "none",
      color: "#c4c7c5",
      fontSize: "20px",
      cursor: "pointer",
      width: "40px",
      height: "40px",
      borderRadius: "50%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      transition: "background-color 0.2s",
      flexShrink: 0,
    },
    brandWrapper: {
      display: "flex",
      alignItems: "center",
      gap: "10px", // Keeps logo and text close together
      overflow: "hidden",
      opacity: isExpanded ? 1 : 0,
      visibility: isExpanded ? "visible" : "hidden",
      transition: "opacity 0.2s, visibility 0.2s",
    },
    logoImg: {
      width: "50px",
      height: "50px",
      borderRadius: "6px",
      objectFit: "cover",
      flexShrink: 0,
    },
    logoText: {
      fontSize: "16px",
      fontWeight: "600",
      color: "#e3e3e3",
      whiteSpace: "nowrap",
    },
    navContainer: {
      flex: 1,
      padding: "0 12px",
      display: "flex",
      flexDirection: "column",
      gap: "4px",
      marginTop: "8px",
      overflowY: "auto",
    },
    navLink: (isActive) => ({
      display: "flex",
      alignItems: "center",
      padding: "12px 16px",
      borderRadius: "24px",
      color: isActive ? "#e3e3e3" : "#c4c7c5",
      backgroundColor: isActive ? "#004a77" : "transparent", // Active item blue accent
      textDecoration: "none",
      transition: "all 0.2s ease",
      whiteSpace: "nowrap",
      gap: "16px",
      boxSizing: "border-box",
    }),
    iconSpan: {
      fontSize: "18px",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      minWidth: "24px",
    },
    labelSpan: {
      fontSize: "14px",
      fontWeight: "500",
      opacity: isExpanded ? 1 : 0,
      transition: "opacity 0.15s ease",
    },
    footerSection: {
      padding: "16px 12px",
      boxSizing: "border-box",
      flexShrink: 0,
    },
    logoutBtn: {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: isExpanded ? "flex-start" : "center",
      gap: "16px",
      padding: "12px 16px",
      borderRadius: "24px",
      border: "none",
      backgroundColor: "#282a2c",
      color: "#f2b8b5", // Clear soft-red tone for dark mode readability
      fontWeight: "500",
      fontSize: "14px",
      cursor: "pointer",
      transition: "background-color 0.2s",
      boxSizing: "border-box",
    },
    mainContent: {
      flex: 1,
      overflowY: "auto",
      backgroundColor: "#131314", // Matches root container
      height: "100%",
      boxSizing: "border-box",
    },
  };

  return (
    <div style={styles.layoutContainer}>
      {/* SIDEBAR */}
      <aside style={styles.sidebar}>
        {/* TOP BAR */}
        <div style={styles.topBar}>
          <button
            style={styles.toggleBtn}
            onClick={() => setIsExpanded(!isExpanded)}
            title={isExpanded ? "Collapse menu" : "Expand menu"}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#2f3032")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
          >
            ☰
          </button>
          
          {/* Integrated Image and App Title Brand Unit */}
          <div style={styles.brandWrapper}>
            {/* <img 
              src="/Logo.jpeg" 
              alt="Hunger Hunt Logo" 
              style={styles.logoImg} 
            /> */}
            <span style={styles.logoText}>Hunger Hunt</span>
          </div>
        </div>

        {/* NAVIGATION LINKS */}
        <nav style={styles.navContainer}>
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                style={styles.navLink(isActive)}
                onMouseOver={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "#2f3032";
                }}
                onMouseOut={(e) => {
                  if (!isActive) e.currentTarget.style.backgroundColor = "transparent";
                }}
              >
                <span style={styles.iconSpan}>{item.icon}</span>
                {isExpanded && <span style={styles.labelSpan}>{item.label}</span>}
              </Link>
            );
          })}
        </nav>

        {/* FOOTER SECTION */}
        <div style={styles.footerSection}>
          <button
            onClick={handleLogout}
            style={styles.logoutBtn}
            onMouseOver={(e) => (e.currentTarget.style.backgroundColor = "#353739")}
            onMouseOut={(e) => (e.currentTarget.style.backgroundColor = "#282a2c")}
            title="Logout"
          >
            <span style={styles.iconSpan}>🚪</span>
            {isExpanded && <span style={{ whiteSpace: "nowrap" }}>Logout</span>}
          </button>
        </div>
      </aside>

      {/* CORE OUTLET CONTAINER VIEWPORT */}
      <main style={styles.mainContent}>
        <Outlet />
      </main>
    </div>
  );
};

export default Layout;