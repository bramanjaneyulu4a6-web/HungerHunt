import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import KioskResultScreen from "../components/KioskResultScreen";
import { TECHNICAL_DIFFICULTIES_SCREEN } from "../constants/kioskScreens";
import { ErrorFeedback } from "../components/error/ErrorFeedback";
import { presentError } from "../utils/errorPresentation";
import { useKeepFocusedInView } from "../hooks/useKeepFocusedInView";

/* The kiosk's resting state, and the whole of what it asks for: the number the
   school already gave the student. No secret here — the four-digit code is
   asked for at checkout, where the money is. What this screen settles is whose
   session the next seven and a half minutes belong to.

   Nobody signs in to this terminal any more, staff included. It stopped being
   a counter somebody stands behind. */
const Login = () => {
  // The admission field is the only input on this screen, and on a phone the
  // keyboard can sit over it.
  useKeepFocusedInView();

  const navigate = useNavigate();
  const [admissionNumber, setAdmissionNumber] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [blockedScreen, setBlockedScreen] = useState(null);
  const admissionInputRef = useRef(null);
  const requestInFlight = useRef(false);

  useEffect(() => {
    if (!sessionReady) return undefined;

    const enter = window.setTimeout(
      () => navigate("/", { replace: true }),
      650
    );
    return () => window.clearTimeout(enter);
  }, [navigate, sessionReady]);

  const startSession = async (admissionNumber) => {
    if (!/^[A-Z0-9]{4,8}$/.test(admissionNumber) || requestInFlight.current) return;

    setError("");
    requestInFlight.current = true;

    try {
      setLoading(true);

      const { data } = await api.post("/students/kiosk-session", {
        admissionNumber,
      });

      localStorage.setItem("kioskToken", data.token);
      localStorage.setItem("kioskStudent", JSON.stringify(data.student));
      setSessionReady(true);
    } catch (err) {
      // The server's own words. An unknown number and a student whose parent
      // never set a code are different problems with different answers, and
      // only one of them is worth trying again.
      const response = err.response?.data;
      if (
        ["KIOSK_WALLET_EMPTY", "KIOSK_ACTIVE_ORDER"].includes(response?.code) &&
        response?.screen
      ) {
        setBlockedScreen(response.screen);
      } else if (!err.response || err.response.status >= 500) {
        setBlockedScreen(TECHNICAL_DIFFICULTIES_SCREEN);
      } else {
        setError(
          response?.message || "Could not start a session. Please try again."
        );
      }
      setAdmissionNumber("");
      setLoading(false);
      requestInFlight.current = false;
      window.setTimeout(() => admissionInputRef.current?.focus(), 0);
    }
  };

  const returnToLogin = () => {
    setBlockedScreen(null);
    setError("");
    setAdmissionNumber("");
    requestInFlight.current = false;
    window.setTimeout(() => admissionInputRef.current?.focus(), 0);
  };

  const updateAdmissionNumber = (rawValue) => {
    if (loading || sessionReady) return;

    const value = rawValue
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    setAdmissionNumber(value);
    setError("");
  };

  const handleSubmit = (event) => {
    event.preventDefault();
    startSession(admissionNumber);
  };

  if (blockedScreen) {
    return (
      <KioskResultScreen
        {...blockedScreen}
        onDone={returnToLogin}
      />
    );
  }

  return (
    <div
      className={`kiosk-login${
        sessionReady ? " kiosk-login--ready" : ""
      }`}
      aria-busy={loading}
    >
      <div className="kiosk-login-glow kiosk-login-glow--one" aria-hidden="true" />
      <div className="kiosk-login-glow kiosk-login-glow--two" aria-hidden="true" />

      <header className="kiosk-login-brand">
        <img src={hungerLogo} alt="Hunger Hunt" />
        <span>Student self-service</span>
      </header>

      <main className="kiosk-login-shell">
        <section className="kiosk-login-intro">
          <p className="kiosk-login-eyebrow">Fresh picks. Your way.</p>
          <h1>Welcome to<br />Hunger Hunt</h1>
          <p className="kiosk-login-copy">
            Sign in, choose what you like, and review your order before paying.
          </p>
          <ol className="kiosk-login-steps" aria-label="How ordering works">
            <li><span>1</span>Sign in</li>
            <li><span>2</span>Choose items</li>
            <li><span>3</span>Place order</li>
          </ol>
        </section>

        <section className="kiosk-login-card" aria-labelledby="student-sign-in-title">
          <div className="kiosk-login-card__icon" aria-hidden="true">#</div>
          <p className="kiosk-login-card__kicker">Let&rsquo;s find your account</p>
          <h2 id="student-sign-in-title">Enter admission number</h2>

          {error && (
            <ErrorFeedback
              issue={presentError({ message: error })}
              level="inline"
              className="kiosk-login-error"
            />
          )}

          <form className="kiosk-login-form" onSubmit={handleSubmit}>
            <label htmlFor="admission-number">Admission number</label>
            <input
              id="admission-number"
              ref={admissionInputRef}
              className="kiosk-login-admission"
              type="text"
              inputMode="text"
              pattern="[A-Za-z0-9]{4,8}"
              minLength="4"
              maxLength="8"
              autoCapitalize="characters"
              autoComplete="off"
              autoFocus
              aria-invalid={Boolean(error)}
              value={admissionNumber}
              disabled={loading || sessionReady}
              onChange={(event) => updateAdmissionNumber(event.target.value)}
            />
            <button
              type="submit"
              className="kiosk-login-submit"
              disabled={loading || sessionReady || admissionNumber.length < 4}
            >
              {loading ? <><span className="kiosk-button-spinner" /> Finding you…</> : 'Continue'}
            </button>
          </form>

          <div className="kiosk-login-status" aria-live="polite">
            {sessionReady && (
              <><span className="kiosk-ready-check">✓</span> Welcome!</>
            )}
          </div>

          <p className="kiosk-login-help">
            Having trouble? Ask a staff member for help.
          </p>
        </section>
      </main>

      <footer className="kiosk-login-footer">
        <span>Secure school ordering</span>
        <span>Your purchase code is only requested at checkout</span>
      </footer>
    </div>
  );
};

export default Login;
