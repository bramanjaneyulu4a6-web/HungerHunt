import { Navigate } from "react-router-dom";

import { authBypassEnabled } from "../utils/authBypass";

const ProtectedRoute = ({ children }) => {
  if (authBypassEnabled) return children;

  const token = localStorage.getItem("kioskToken");

  if (!token) {
    return <Navigate to="/login" replace />;
  }

  return children;
};

export default ProtectedRoute;
