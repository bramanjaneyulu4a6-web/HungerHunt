import { useEffect, useState } from "react";

import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import KioskBilling from "./KioskBilling";
import KioskResultScreen from "../components/KioskResultScreen";
import { TECHNICAL_DIFFICULTIES_SCREEN } from "../constants/kioskScreens";
import { DEMO_ADMISSION } from "../constants/kioskMode";

/* One visitor's turn at a kiosk with no gate, from the session being started to
   whatever ends it. It holds no reset of its own: the session it belongs to is
   fixed at mount, so DemoKiosk below starts the next one by remounting this. */
const DemoSession = ({ onEnded }) => {
  const [student, setStudent] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    /* Cleared before the call, not after it. A tablet that was serving real
       students when this flag was built in still has the last child's token
       here, and resuming it would put their wallet on screen with nobody
       having signed in. A failed start must leave nothing behind either. */
    localStorage.removeItem("kioskToken");
    localStorage.removeItem("kioskStudent");

    api
      .post("/students/kiosk-session", { admissionNumber: DEMO_ADMISSION })
      .then(({ data }) => {
        if (cancelled) return;

        /* The one check this screen owes the school. Without a gate, whose
           session this is was decided by whatever admission number the
           terminal was built pointing at — so a row the server does not call
           a demo account is refused rather than served. A real student handed
           out here would have their orders recorded, their wallet spent and
           their parent notified, by a machine that asked nobody who they were. */
        if (data?.student?.demo !== true) {
          setFailed(true);
          return;
        }

        localStorage.setItem("kioskToken", data.token);
        localStorage.setItem("kioskStudent", JSON.stringify(data.student));
        setStudent(data.student);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  if (failed) {
    return <KioskResultScreen {...TECHNICAL_DIFFICULTIES_SCREEN} onDone={onEnded} />;
  }

  if (!student) {
    return (
      <div className="kiosk-login" aria-busy="true">
        <div className="kiosk-login-glow kiosk-login-glow--one" aria-hidden="true" />
        <div className="kiosk-login-glow kiosk-login-glow--two" aria-hidden="true" />

        <header className="kiosk-login-brand">
          <img src={hungerLogo} alt="Hunger Hunt" />
          <span>Student self-service</span>
        </header>

        <main className="kiosk-login-shell">
          <p className="kiosk-login-status" aria-live="polite">
            <span className="kiosk-button-spinner" /> Opening the store&hellip;
          </p>
        </main>
      </div>
    );
  }

  return <KioskBilling student={student} onLogout={onEnded} />;
};

/* The kiosk with its gate switched off: no admission number is asked for, and
   the terminal opens straight onto the selection screen driving the demo
   student. This stands in for both Login and KioskScreen while
   VITE_KIOSK_LOGIN_DISABLED is set — see src/constants/kioskMode.js.

   The session is started through the same POST /students/kiosk-session that
   Login uses. There is no second way in and no client-side pretending: the
   catalogue, the prices, the purchase code and the limits are all the real
   ones, and what makes the session cost nothing is demoAccount on the server's
   row rather than anything decided here.

   Every way a session can end — Done, the hard cap, a finished sale — arrives
   as onLogout. With no gate to return to, that opens the next visitor's
   session instead, and the remount is what clears the last one's basket,
   phase and result screen. */
const DemoKiosk = () => {
  const [visitor, setVisitor] = useState(0);

  return (
    <DemoSession key={visitor} onEnded={() => setVisitor((previous) => previous + 1)} />
  );
};

export default DemoKiosk;
