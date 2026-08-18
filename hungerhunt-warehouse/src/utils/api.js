import axios from "axios";

import { clearSession } from "./session";

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("warehouseToken");

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }

  return config;
});

/* Only a dead session ejects. A 403 is this account reaching past the
   storeroom, which its own screens never do — but it must not sign anyone out.
   Nor may every 401: the auth middleware marks the ones that mean "this session
   is finished" with code: 'AUTH_REQUIRED', and /admin/login answers a wrong
   password with a bare 401 that means only that. Ejecting on that one would
   clear the form's own error on the way past. */
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (
      error.response?.status === 401 &&
      error.response?.data?.code === "AUTH_REQUIRED" &&
      localStorage.getItem("warehouseToken")
    ) {
      clearSession(["warehouseToken", "staffRole", "staffProfile"]);

      // replace() rather than href: the page behind this can no longer load, so
      // the back button should not be able to return to it.
      if (!window.location.pathname.startsWith("/login")) {
        window.location.replace("/login?expired=1");
      }
    }

    return Promise.reject(error);
  }
);

export default api;
