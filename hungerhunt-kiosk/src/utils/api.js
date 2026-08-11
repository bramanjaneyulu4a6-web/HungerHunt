import axios from "axios";

import { authBypassEnabled } from "./authBypass";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("kioskToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // A 401 out here is the session's own token reaching its 450 seconds, or a
    // student removed from the roll mid-order. Either way the session is over
    // and the screen belongs to the next person.
    //
    // With the bypass on there is no token to clear and no login to return to,
    // so a stray 401 must not eject the kiosk.
    if (error.response?.status === 401 && !authBypassEnabled) {
      localStorage.removeItem("kioskToken");
      localStorage.removeItem("kioskStudent");

      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }

    return Promise.reject(error);
  }
);

export default api;
