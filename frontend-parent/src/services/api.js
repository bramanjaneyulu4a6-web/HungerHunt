import axios from 'axios';

const API = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api',
});

// Automatically inject JWT token into headers for secured routes
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('parentToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

/* A parent token lasts seven days. Without this, day eight looked like a broken
   app rather than an expired session: every screen kept its stored parent, so
   the app stayed "signed in" while every request behind it failed, and the
   error shown was the generic "check your connection".

   Only the auth middleware's 401s are treated as an expired session. A
   controller can answer 401 for a password typed into a form — resetPurchase-
   Password does exactly that when the account password is wrong — and signing
   someone out for a typo would be its own bug. The backend marks the difference
   with code: 'AUTH_REQUIRED'. */
API.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'AUTH_REQUIRED' &&
      localStorage.getItem('parentToken')
    ) {
      localStorage.removeItem('parentToken');
      localStorage.removeItem('parentData');

      // A full load rather than a router navigation: this can fire from
      // anywhere, including outside the router, and it clears any state that
      // was built from the dead session.
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?expired=1');
      }
    }

    return Promise.reject(error);
  }
);

export default API;
