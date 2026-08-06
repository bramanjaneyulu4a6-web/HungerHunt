import axios from "axios";

import { authBypassEnabled } from "./authBypass";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("adminToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // With the bypass on there is no token to clear and no login to return to,
    // so a stray 401 must not eject the kiosk.
    if (error.response?.status === 401 && !authBypassEnabled) {
      localStorage.removeItem("adminToken");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;