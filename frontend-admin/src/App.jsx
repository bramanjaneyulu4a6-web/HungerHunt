import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';

import Login from './pages/Login';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Register from './pages/Register';

import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Products from './pages/Products';
import Inventory from './pages/Inventory';
import Billing from './pages/Billing';

import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import { authBypassEnabled } from './utils/authBypass';
import RechargeHistory from './pages/RechargeHistory';
import Purchase from "./pages/Purchase";
import Purchased from "./pages/Purchased";
import KioskBilling from "./pages/KioskBilling";

function App() {
  return (
    <Router>
      <Routes>
        {/* Public Routes */}
        <Route
          path="/"
          element={<Navigate to={authBypassEnabled ? "/dashboard" : "/login"} replace />}
        />
        <Route path="/login" element={<Login />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password/:token" element={<ResetPassword />} />
        <Route path="/register" element={<Register />} />

        {/* Protected Nested Routes */}

<Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
  <Route path="/dashboard" element={<Dashboard />} />
  <Route path="/students" element={<Students />} />
  <Route path="/products" element={<Products />} />
  <Route path="/inventory" element={<Inventory />} />
  <Route path="/billing" element={<Billing />} />
  <Route path="/purchase" element={<Purchase />} />
  <Route path="/purchased" element={<Purchased />} />
  <Route path="/recharge-history" element={<RechargeHistory />} />
  <Route path="/kiosk" element={<KioskBilling />} />
</Route>
      </Routes>
    </Router>
  );
}

export default App;