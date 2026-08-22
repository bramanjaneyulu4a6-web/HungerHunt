import { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

import ProtectedRoute from './components/ProtectedRoute';

const Login = lazy(() => import('./pages/Login'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const Register = lazy(() => import('./pages/Register'));
const Layout = lazy(() => import('./components/Layout'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Students = lazy(() => import('./pages/Students'));
const Hostels = lazy(() => import('./pages/Hostels'));
const Billing = lazy(() => import('./pages/Billing'));
const RechargeHistory = lazy(() => import('./pages/RechargeHistory'));
const WarehouseOverview = lazy(() => import('./pages/WarehouseOverview'));
const ProcurementReview = lazy(() => import('./pages/ProcurementReview'));
const ProcurementOrders = lazy(() => import('./pages/ProcurementOrders'));
const Inventory = lazy(() => import('./pages/Inventory'));
const Products = lazy(() => import('./pages/Products'));
const Suppliers = lazy(() => import('./pages/Suppliers'));
const AccountingExport = lazy(() => import('./pages/AccountingExport'));
const StaffReports = lazy(() => import('./pages/StaffReports'));

const RouteFallback = () => (
  <div className="route-fallback" role="status" aria-live="polite">
    <span className="route-fallback__spinner" aria-hidden="true" />
    <span>Loading workspace…</span>
  </div>
);

function App() {
  return (
    <Router>
      <Toaster position="top-center" />
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password/:token" element={<ResetPassword />} />
          <Route path="/register" element={<Register />} />

          <Route element={<ProtectedRoute><Layout /></ProtectedRoute>}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/students" element={<Students />} />
            <Route path="/hostels" element={<Hostels />} />
            <Route path="/billing" element={<Billing />} />
            <Route path="/recharge-history" element={<RechargeHistory />} />
            <Route path="/accounting-export" element={<AccountingExport />} />
            <Route path="/reports" element={<StaffReports />} />
            <Route path="/warehouse" element={<WarehouseOverview />} />
            <Route path="/warehouse/review" element={<ProcurementReview />} />
            <Route path="/warehouse/orders" element={<ProcurementOrders />} />
            <Route path="/warehouse/inventory" element={<Inventory />} />
            <Route path="/warehouse/products" element={<Products />} />
            <Route path="/warehouse/suppliers" element={<Suppliers />} />

            {/* Preserve bookmarks while keeping one canonical Warehouse workspace. */}
            <Route path="/products" element={<Navigate to="/warehouse/products" replace />} />
            <Route path="/inventory" element={<Navigate to="/warehouse/inventory" replace />} />
            <Route path="/suppliers" element={<Navigate to="/warehouse/suppliers" replace />} />
            <Route path="/procurement-review" element={<Navigate to="/warehouse/review" replace />} />
            <Route path="/purchase" element={<Navigate to="/warehouse" replace />} />
            <Route path="/purchased" element={<Navigate to="/warehouse/orders" replace />} />
          </Route>

          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </Suspense>
    </Router>
  );
}

export default App;
