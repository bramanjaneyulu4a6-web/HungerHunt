import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";

import api from "../utils/api";
import { LOGIN_DISABLED } from "../constants/kioskMode";

const KIOSK_OFFLINE_MESSAGE =
  "Kiosk is currently offline. Please check again later.";

// Often enough that switching the kiosk off or on reaches every tablet within
// a minute; one small GET per tablet per minute.
const KIOSK_STATUS_INTERVAL_MS = 60 * 1000;

const endSession = () => {
  localStorage.removeItem("kioskToken");
  localStorage.removeItem("kioskStudent");
};

/* The super admin's kiosk switch (the Ordering rules card on /features).
 *
 * While it is off, the whole terminal is one screen saying so, and it checks
 * again every minute, so it comes back by itself once the switch is on. Any
 * session in progress is let go: the server refuses its orders anyway, and a
 * student left holding a basket that cannot be paid for is worse than a clear
 * "offline".
 *
 * Test-account students may still use the kiosk while it is off. The offline
 * screen offers them a small way to the sign-in screen (only when the server
 * says test accounts exist, and never in demo mode, which has no sign-in).
 * The server decides who is a test student: anyone else who signs in there is
 * refused as offline, which lands them straight back on this screen. The
 * status check carries the tablet's session, so a test student's session is
 * told the kiosk is open and is not cut off. Once opened, the sign-in screen
 * stays up with no time limit, until the kiosk is switched back on or someone
 * who is not a test student is refused there.
 *
 * A failed check leaves the kiosk as it was rather than taking it offline. A
 * network blip is not the office closing the kiosk, and the server still
 * refuses orders if the switch really is off. */
export default function KioskOfflineGate({ children }) {
  const navigate = useNavigate();
  const [status, setStatus] = useState({ open: true, message: "", testSignIn: false });
  const [testSignInOpen, setTestSignInOpen] = useState(false);

  useEffect(() => {
    let active = true;

    const closeTestSignIn = () => setTestSignInOpen(false);

    const check = async () => {
      try {
        const response = await api.get("/students/kiosk-status");
        const data = response?.data;
        if (!active || typeof data?.open !== "boolean") return;

        if (data.open) {
          closeTestSignIn();
        } else if (localStorage.getItem("kioskToken")) {
          // A session the server did not call open is not a test student's.
          endSession();
          closeTestSignIn();
        }
        setStatus({
          open: data.open,
          message: data.message || "",
          testSignIn: data.testSignIn === true,
        });
      } catch {
        // Keep whatever we last knew; see above.
      }
    };

    // Any request the server refused as offline (utils/api.js).
    const refused = (event) => {
      endSession();
      closeTestSignIn();
      setStatus((current) => ({
        ...current,
        open: false,
        message: event.detail?.message || "",
      }));
    };

    check();
    const timer = window.setInterval(check, KIOSK_STATUS_INTERVAL_MS);
    window.addEventListener("focus", check);
    window.addEventListener("kiosk-offline", refused);
    return () => {
      active = false;
      window.clearInterval(timer);
      window.removeEventListener("focus", check);
      window.removeEventListener("kiosk-offline", refused);
    };
  }, []);

  if (status.open || testSignInOpen) return children;

  const openTestSignIn = () => {
    setTestSignInOpen(true);
    navigate("/login", { replace: true });
  };

  return (
    <div className="kiosk-result kiosk-result--offline" role="status">
      <div className="kiosk-result-card">
        <div className="kiosk-result-mark kiosk-result-mark--offline" aria-hidden="true">
          ⏻
        </div>
        <p className="kiosk-result-kicker">Kiosk offline</p>
        <h1>{status.message || KIOSK_OFFLINE_MESSAGE}</h1>
        {status.testSignIn && !LOGIN_DISABLED && (
          <button type="button" className="kiosk-offline-test" onClick={openTestSignIn}>
            Test account sign-in
          </button>
        )}
      </div>
    </div>
  );
}
