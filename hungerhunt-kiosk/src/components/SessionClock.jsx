import { useEffect, useRef, useState } from "react";
import { HARD_CAP_SECONDS, WARNING_SECONDS } from "../hooks/useSessionTimers";

const formatSessionTime = (seconds) => {
  const safeSeconds = Math.max(0, seconds);
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
};

/* Below this width the header cannot hold the numeric pill, so the timer folds
   into a small clock face. Matches the phone breakpoint in kiosk.css. */
const NARROW_QUERY = "(max-width: 600px)";

// How long a tap holds the numeric pill open before it folds back.
const PEEK_MS = 2000;

const HAND_RADIUS = 14;
const ARC_LENGTH = 2 * Math.PI * HAND_RADIUS;

const useNarrowScreen = () => {
  const [narrow, setNarrow] = useState(
    () => window.matchMedia?.(NARROW_QUERY).matches ?? false
  );

  useEffect(() => {
    const media = window.matchMedia?.(NARROW_QUERY);
    if (!media?.addEventListener) return undefined;

    const onChange = (event) => setNarrow(event.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  return narrow;
};

/* The session countdown, in the shape the screen has room for.

   Wide screens get the numeric pill. On a phone the same element is a round
   clock face whose arc and hand wind down with the session; tapping it morphs
   the circle open into the pill for two seconds, then it folds back. Both
   faces stay mounted so the change is a crossfade inside one morphing
   container, not a swap. */
const SessionClock = ({ remaining, total = HARD_CAP_SECONDS }) => {
  const narrow = useNarrowScreen();
  const [peeking, setPeeking] = useState(false);
  const peekTimerRef = useRef(null);

  /* No reset when the layout widens: a peek clears itself by its own timeout,
     so a stale flag can only survive the two seconds it was granted. */
  useEffect(() => () => window.clearTimeout(peekTimerRef.current), []);

  const peek = () => {
    setPeeking(true);
    window.clearTimeout(peekTimerRef.current);
    peekTimerRef.current = window.setTimeout(() => setPeeking(false), PEEK_MS);
  };

  const time = formatSessionTime(remaining);
  const warning = remaining <= WARNING_SECONDS && remaining > 0;

  if (!narrow) {
    return (
      <div
        className={`kiosk-session-clock${warning ? " kiosk-session-clock--warning" : ""}`}
        role="timer"
        aria-label={`${time} remaining in this session`}
      >
        <small>Session</small>
        <strong>{time}</strong>
      </div>
    );
  }

  const fraction = total > 0 ? Math.min(1, Math.max(0, remaining / total)) : 0;

  return (
    <button
      type="button"
      className={`kiosk-session-clock kiosk-session-clock--morph${
        peeking ? " kiosk-session-clock--peek" : ""
      }${warning ? " kiosk-session-clock--warning" : ""}`}
      aria-label={
        peeking
          ? `${time} remaining in this session`
          : `Session timer, ${time} left. Tap to show the countdown.`
      }
      onClick={peek}
    >
      <svg
        className="kiosk-session-clock__face"
        viewBox="0 0 36 36"
        aria-hidden="true"
      >
        <circle className="kiosk-session-clock__track" cx="18" cy="18" r={HAND_RADIUS} />
        <circle
          className="kiosk-session-clock__arc"
          cx="18"
          cy="18"
          r={HAND_RADIUS}
          strokeDasharray={ARC_LENGTH}
          strokeDashoffset={ARC_LENGTH * (1 - fraction)}
        />
        <line
          className="kiosk-session-clock__hand"
          x1="18"
          y1="18"
          x2="18"
          y2="8.5"
          style={{ transform: `rotate(${fraction * 360}deg)` }}
        />
        <circle className="kiosk-session-clock__pin" cx="18" cy="18" r="1.7" />
      </svg>

      <span className="kiosk-session-clock__time" aria-hidden="true">
        <small>Session</small>
        <strong>{time}</strong>
      </span>
    </button>
  );
};

export default SessionClock;
