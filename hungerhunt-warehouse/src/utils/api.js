import axios from "axios";

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

api.interceptors.response.use(
  (response) => response,
  (error) => {
    // Only a dead session (401) ejects. A 403 is this account reaching past
    // the storeroom, which its own screens never do — but it must not sign
    // anyone out.
    if (error.response?.status === 401) {
      localStorage.removeItem("warehouseToken");
      localStorage.removeItem("staffRole");
      if (window.location.pathname !== "/login") {
        window.location.href = "/login";
      }
    }
    return Promise.reject(error);
  }
);

export default api;
