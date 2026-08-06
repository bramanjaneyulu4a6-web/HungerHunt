import { Navigate } from 'react-router-dom';

import { authBypassEnabled } from '../utils/authBypass';

const ProtectedRoute = ({ children }) => {
  if (authBypassEnabled) return children;

  const token = localStorage.getItem('adminToken');
  return token ? children : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
