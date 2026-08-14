import axios from 'axios';

import { clearSession } from './session';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

// Interceptor to attach Auth token automatically
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('adminToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});

/* A staff token lasts a day, and until this existed day two looked like a
   broken console rather than an expired session: the token stayed in storage,
   ProtectedRoute saw one and admitted it, so every screen rendered and every
   request behind it failed with nothing on screen to say why.

   Only the auth middleware's 401s end a session. It marks them with
   code: 'AUTH_REQUIRED'; a controller answering 401 about credentials typed
   into a form does not, and /admin/login is exactly that — ejecting on it would
   wipe the "Invalid credentials" message off the form that just earned it.
   Nor does a 403, which is a signed-in account reaching past its role and no
   reason at all to sign it out. */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === 'AUTH_REQUIRED' &&
      localStorage.getItem('adminToken')
    ) {
      clearSession(['adminToken']);

      /* A full load rather than a router navigation: this can fire from
         anywhere, including outside the router, and it clears whatever state
         was built from the dead session. replace() rather than href so the
         back button cannot return to a page that can no longer load. */
      if (!window.location.pathname.startsWith('/login')) {
        window.location.replace('/login?expired=1');
      }
    }

    return Promise.reject(error);
  }
);

export default api;
