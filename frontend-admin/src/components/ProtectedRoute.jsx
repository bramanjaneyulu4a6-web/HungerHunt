import { Navigate } from 'react-router-dom';

import { readSession } from '../utils/session';

const ProtectedRoute = ({ children }) => {
  /* Reads the session rather than merely noting that one is stored. A token
     already past its own expiry is cleared here, so the console starts on the
     login screen instead of on a dashboard whose every request is about to
     401 — and says so, rather than appearing to have forgotten the sign-in. */
  const { token, expired } = readSession('adminToken');

  if (token) return children;

  return <Navigate to={expired ? '/login?expired=1' : '/login'} replace />;
};

export default ProtectedRoute;
