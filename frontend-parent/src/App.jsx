// // import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
// // import { AuthProvider, useAuth } from './context/AuthContext';
// // import Navbar from './components/Navbar';
// // import Login from './pages/Login';
// // import Register from './pages/Register';
// // import Dashboard from './pages/Dashboard';
// // import ChildDetails from './pages/ChildDetails';
// // import ForgotPassword from './pages/ForgotPassword';
// // // import ResetPassword from "./pages/ResetPassword";
// // import ResetPassword from "./pages/ResetPassword";

// // // Protect Route wrapper to stop unauthorized viewing
// // const ProtectedRoute = ({ children }) => {
// //   const { parent } = useAuth();
// //   return parent ? children : <Navigate to="/login" replace />;
// // };

// // function AppContent() {
// //   const { parent } = useAuth();

// //   return (
// //     <div className="min-h-screen bg-gray-50 flex flex-col">
// //       {parent && <Navbar />}
// //       <main className="flex-grow">
       
// //         <Routes>
// //   <Route path="/login" element={!parent ? <Login /> : <Navigate to="/" />} />
// //   <Route path="/register" element={!parent ? <Register /> : <Navigate to="/" />} />

// //   <Route
// //     path="/"
// //     element={<ProtectedRoute><Dashboard /></ProtectedRoute>}
// //   />

// //   <Route
// //     path="/child/:id"
// //     element={<ProtectedRoute><ChildDetails /></ProtectedRoute>}
// //   />

// //   PUBLIC ROUTES (IMPORTANT)
// //   <Route path="/forgot-password" element={<ForgotPassword />} />
// //   <Route path="/reset-password/:token" element={<ResetPassword />} />



// //   <Route path="/forgot-password" element={<ForgotPassword />} />
// // {/* <Route path="/reset-password/:token" element={<ResetPassword />} /> */}
// // <Route
// //   path="/reset-password/:token"
// //   element={<div>RESET ROUTE WORKS</div>}
// // />
// //   {/* MUST BE LAST */}
// //   <Route path="*" element={<Navigate to="/" replace />} />
// // </Routes>
// //       </main>
// //     </div>
// //   );
// // }

// // export default function App() {
// //   return (
// //     <AuthProvider>
// //       <Router>
// //         <AppContent />
// //       </Router>
// //     </AuthProvider>
// //   );
// // }











// import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
// import { AuthProvider, useAuth } from "./context/AuthContext";

// import Login from "./pages/Login";
// import Register from "./pages/Register";
// import Dashboard from "./pages/Dashboard";
// import ChildDetails from "./pages/ChildDetails";
// import ForgotPassword from "./pages/ForgotPassword";
// import ResetPassword from "./pages/ResetPassword";
// import Navbar from "./components/Navbar";
// import { useEffect } from "react";
// import { listenForMessages } from "./utils/notification";
// import SetPurchasePassword from "./pages/SetPurchasePassword";

// const ProtectedRoute = ({ children }) => {
//   const { parent } = useAuth();
//   return parent ? children : <Navigate to="/login" replace />;
// };

// function AppContent() {
//   useEffect(() => {
//   listenForMessages();
// }, []);
//   const { parent } = useAuth();

//   return (
//     <>
//       {parent && <Navbar />}

//       <Routes>
//         <Route path="/login" element={<Login />} />
//         <Route path="/register" element={<Register />} />

//         <Route path="/" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
//         <Route path="/child/:id" element={<ProtectedRoute><ChildDetails /></ProtectedRoute>} />

//         {/* PUBLIC ROUTES */}
//         <Route path="/forgot-password" element={<ForgotPassword />} />
//         <Route path="/reset-password/:token" element={<ResetPassword />} />

//         <Route path="*" element={<Navigate to="/" replace />} />
//       </Routes>
//     </>
//   );
// }

// export default function App() {
//   return (
//     <AuthProvider>
//       <Router>
//         <AppContent />
//       </Router>
//     </AuthProvider>
//   );
// }






import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ChildDetails from "./pages/ChildDetails";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import SetPurchasePassword from "./pages/SetPurchasePassword";

import Navbar from "./components/Navbar";
import { useEffect } from "react";
import { listenForMessages } from "./utils/notification";

const ProtectedRoute = ({ children }) => {
  const { parent } = useAuth();
  return parent ? children : <Navigate to="/login" replace />;
};

function AppContent() {
  useEffect(() => {
    listenForMessages();
  }, []);

  const { parent } = useAuth();

  return (
    <>
      {parent && <Navbar />}

      <Routes>
        {/* Public Routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
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

        {/* NEW PAGE */}
        {/* Purchase Password Page */}
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
    <AuthProvider>
      <Router>
        <AppContent />
      </Router>
    </AuthProvider>
  );
}