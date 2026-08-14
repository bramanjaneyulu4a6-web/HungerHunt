import { Navigate } from "react-router-dom";

import { readSession } from "../utils/session";

const ProtectedRoute = ({ children }) => {
  /* Reads the session rather than merely noting that one is stored. A token
     already past its own expiry is cleared here, so the storeroom device starts
     on the login screen instead of on a stock list whose every request is about
     to 401 — and says so, rather than appearing to have forgotten the sign-in. */
  const { token, expired } = readSession("warehouseToken", ["staffRole", "staffProfile"]);

  if (!token) {
    return <Navigate to={expired ? "/login?expired=1" : "/login"} replace />;
  }

  return children;
};

export default ProtectedRoute;
