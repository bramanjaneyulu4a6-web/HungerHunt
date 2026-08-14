import axios from 'axios';
import { Capacitor } from '@capacitor/core';

const configuredApiUrl =
  import.meta.env.VITE_API_BASE_URL || 'http://localhost:5001/api';

/* Android Emulator owns its own loopback interface, so localhost there cannot
   reach the backend running on the developer's computer. 10.0.2.2 is the
   emulator's stable alias for the host loopback. Keep the configured URL for
   browsers, iOS Simulator, physical devices, and every non-local deployment. */
export const resolveApiBaseUrl = (configured = configuredApiUrl) => {
  if (Capacitor.getPlatform() !== 'android') return configured;

  try {
    const url = new URL(configured);
    if (url.hostname === 'localhost' || url.hostname === '127.0.0.1') {
      url.hostname = '10.0.2.2';
      return url.toString().replace(/\/$/, '');
    }
  } catch {
    // Axios will surface the original invalid URL as it did before.
  }

  return configured;
};

const API = axios.create({
  baseURL: resolveApiBaseUrl(),
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
