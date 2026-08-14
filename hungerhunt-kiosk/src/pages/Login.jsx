import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../utils/api";
import hungerLogo from "../assets/Logo.png";
import KioskResultScreen from "../components/KioskResultScreen";
import { ErrorFeedback } from "../components/error/ErrorFeedback";
import { presentError } from "../utils/errorPresentation";

/* The kiosk's resting state, and the whole of what it asks for: the number the
   school already gave the student. No secret here — the four-digit code is
   asked for at checkout, where the money is. What this screen settles is whose
   session the next seven and a half minutes belong to.

   Nobody signs in to this terminal any more, staff included. It stopped being
   a counter somebody stands behind. */
const Login = () => {
  const navigate = useNavigate();
  const [digits, setDigits] = useState(["", "", "", "", ""]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [blockedScreen, setBlockedScreen] = useState(null);
  const digitRefs = useRef([]);
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
    if (!/^\d{5}$/.test(admissionNumber) || requestInFlight.current) return;

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
      } else {
        setError(
          response?.message || "Could not start a session. Please try again."
        );
      }
      setDigits(["", "", "", "", ""]);
      setLoading(false);
      requestInFlight.current = false;
      window.setTimeout(() => digitRefs.current[0]?.focus(), 0);
    }
  };

  const returnToLogin = () => {
    setBlockedScreen(null);
    setError("");
    setDigits(["", "", "", "", ""]);
    requestInFlight.current = false;
    window.setTimeout(() => digitRefs.current[0]?.focus(), 0);
  };

  const updateDigit = (index, rawValue) => {
    if (loading || sessionReady) return;

    const value = rawValue.replace(/\D/g, "").slice(-1);
    const next = [...digits];
    next[index] = value;
    setDigits(next);
    setError("");

    if (value && index < next.length - 1) {
      digitRefs.current[index + 1]?.focus();
    }
    if (next.every(Boolean)) startSession(next.join(""));
  };

  const handleKeyDown = (event, index) => {
    if (event.key === "Backspace") {
      event.preventDefault();
      const next = [...digits];

      if (next[index]) {
        next[index] = "";
      } else if (index > 0) {
        next[index - 1] = "";
        digitRefs.current[index - 1]?.focus();
      }
      setDigits(next);
      setError("");
    } else if (event.key === "ArrowLeft" && index > 0) {
      digitRefs.current[index - 1]?.focus();
    } else if (event.key === "ArrowRight" && index < digits.length - 1) {
      digitRefs.current[index + 1]?.focus();
    }
  };

  const handlePaste = (event) => {
    const pasted = event.clipboardData.getData("text").replace(/\D/g, "").slice(0, 5);
    if (!pasted) return;

    event.preventDefault();
    const next = Array.from({ length: 5 }, (_, index) => pasted[index] || "");
    setDigits(next);
    setError("");

    if (pasted.length === 5) {
      startSession(pasted);
    } else {
      digitRefs.current[pasted.length]?.focus();
    }
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
          <p>Use the five-digit number provided by your school.</p>

          {error && (
            <ErrorFeedback
              issue={presentError({ message: error })}
              level="inline"
              className="kiosk-login-error"
            />
          )}

          <fieldset className="kiosk-login-form" disabled={loading || sessionReady}>
            <legend>Five-digit admission number</legend>
            <div className="kiosk-login-otp" onPaste={handlePaste}>
              {digits.map((digit, index) => (
                <input
                  key={index}
                  ref={(element) => { digitRefs.current[index] = element; }}
                  className="kiosk-login-otp__digit"
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength="1"
                  autoComplete={index === 0 ? "one-time-code" : "off"}
                  autoFocus={index === 0}
                  aria-label={`Admission number digit ${index + 1} of 5`}
                  value={digit}
                  aria-invalid={Boolean(error)}
                  onChange={(event) => updateDigit(index, event.target.value)}
                  onKeyDown={(event) => handleKeyDown(event, index)}
                  onFocus={(event) => event.target.select()}
                />
              ))}
            </div>
          </fieldset>

          <div className="kiosk-login-status" aria-live="polite">
            {sessionReady ? (
              <><span className="kiosk-ready-check">✓</span> Welcome!</>
            ) : loading ? (
              <><span className="kiosk-button-spinner" /> Finding you…</>
            ) : (
              <span>Enter all five digits to continue automatically</span>
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
