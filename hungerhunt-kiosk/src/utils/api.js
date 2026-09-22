import axios from "axios";
import { LOGIN_DISABLED } from "../constants/kioskMode";
import { observeMutationRevision } from "./dataAutoRefresh";

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
  observeMutationRevision,
  (error) => {
    // The office switched the kiosk off between this tablet's status checks.
    // Tell the offline gate now rather than a minute from now, so the student
    // sees "offline" instead of a generic failure. See KioskOfflineGate.
    if (error.response?.data?.code === "KIOSK_OFFLINE") {
      window.dispatchEvent(new CustomEvent("kiosk-offline", { detail: error.response.data }));
    }

    // A 401 out here is the session's own token reaching its 450 seconds, or a
    // student removed from the roll mid-order. Either way the session is over
    // and the screen belongs to the next person.
    if (error.response?.status === 401) {
      localStorage.removeItem("kioskToken");
      localStorage.removeItem("kioskStudent");

      // With no gate there is nowhere to send them but back to the start,
      // which opens a fresh demo session rather than a login screen.
      const start = LOGIN_DISABLED ? "/" : "/login";

      if (window.location.pathname !== start) {
        window.location.href = start;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
