import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import { Banner } from "../components/ui";

/* The kiosk's resting state, and the whole of what it asks for: the number the
   school already gave the student. No secret here — the four-digit code is
   asked for at checkout, where the money is. What this screen settles is whose
   session the next seven and a half minutes belong to.

   Nobody signs in to this terminal any more, staff included. It stopped being
   a counter somebody stands behind. */
const Login = () => {
  const navigate = useNavigate();
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    if (!sessionReady) return undefined;

    const enter = window.setTimeout(
      () => navigate("/", { replace: true }),
      650
    );
    return () => window.clearTimeout(enter);
  }, [navigate, sessionReady]);

  const handleSubmit = async (e) => {
    e?.preventDefault();

    if (!admissionNumber.trim() || loading) return;

    setError("");

    try {
      setLoading(true);

      const { data } = await api.post("/students/kiosk-session", {
        admissionNumber: admissionNumber.trim(),
      });

      localStorage.setItem("kioskToken", data.token);
      localStorage.setItem("kioskStudent", JSON.stringify(data.student));
      setSessionReady(true);
    } catch (err) {
      // The server's own words. An unknown number and a student whose parent
      // never set a code are different problems with different answers, and
      // only one of them is worth trying again.
      setError(
        err.response?.data?.message ||
          "Could not start a session. Please try again."
      );
      setLoading(false);
    }
  };

  return (
    /* Built on .kiosk-welcome rather than beside it. The attract screen and
       the login are now the same screen — one tap fewer, and the brand ground
       it already had is kept, so restyling it onto the till's white remains
       the open decision it was. */
    <div
      className={`kiosk-welcome kiosk-gate${
        sessionReady ? " kiosk-gate--ready" : ""
      }`}
      aria-busy={loading}
    >
      <div className="kiosk-gate-orb kiosk-gate-orb--one" aria-hidden="true" />
      <div className="kiosk-gate-orb kiosk-gate-orb--two" aria-hidden="true" />

      <div className="kiosk-gate-content">
        <img className="kiosk-welcome-logo" src={hungerLogo} alt="Hunger Hunt" />

        <p className="kiosk-gate-kicker">Ready when you are</p>
        <h1 className="kiosk-gate-prompt">Enter your admission number</h1>

        {error && (
          <Banner variant="alert" icon="⚠️" style={{ marginBottom: 20 }}>
            {error}
          </Banner>
        )}

        <form onSubmit={handleSubmit} className="kiosk-gate-form">
        {/* Not restricted to digits: a school's admission numbers may carry a
            letter or a dash, and a field that refuses them locks the student
            out of the only screen they can start from. inputMode brings up the
            number pad for the common case without ruling the rest out. */}
          <input
            className="kiosk-gate-input"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            aria-label="Admission number"
            placeholder="Admission number"
            value={admissionNumber}
            onChange={(e) => setAdmissionNumber(e.target.value.trim())}
            disabled={sessionReady}
          />

          <button
            type="submit"
            className="kiosk-start"
            disabled={loading || !admissionNumber.trim()}
          >
            {sessionReady ? (
              <><span className="kiosk-ready-check">✓</span> Welcome!</>
            ) : loading ? (
              <><span className="kiosk-button-spinner" /> Finding you…</>
            ) : (
              "START ORDER"
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
