import { useEffect, useRef, useState } from "react";

/* The two clocks that end a kiosk session.
 *
 * The hard cap runs from login and nothing the student does moves it. The
 * token expires at the same moment server-side, so stretching it here would
 * only manufacture 401s — and a terminal that can be kept open by touching it
 * is a terminal that stays open on somebody's wallet.
 *
 * The idle clock is the opposite: every touch resets it. It is not there to
 * limit anyone, only to free a screen somebody walked away from long before
 * the cap would.
 *
 * One exception, and it is about correctness rather than kindness: if the cap
 * lands while a bill is in flight, expiry waits for the answer. Otherwise the
 * money moves and nobody is told it did. The session still ends the moment
 * that answer arrives — the cap is not extended, the confirmation is simply
 * not thrown away.
 */

export const HARD_CAP_SECONDS = 450; // 7:30
export const WARNING_SECONDS = 30;
export const IDLE_SECONDS = 60;
export const PROMPT_SECONDS = 10;

/* `enabled` turns both clocks off for the demo account, which runs the kiosk
   at an open day and must never hurry a visitor or reset itself in the middle
   of a conversation. It is an argument rather than a second hook because the
   session is otherwise identical, and because the thing that actually ends a
   demo session is the same thing that ends any other: somebody tapping Done.

   Turning this off alone would not lengthen anything — the cap on screen is a
   drawing of the token's own lifetime, and the server issues demo tokens with
   a matching one. Both halves are decided in createKioskSession. */
export const useSessionTimers = ({ active, onExpire, isBusy, enabled = true }) => {
  const [capRemaining, setCapRemaining] = useState(HARD_CAP_SECONDS);
  const [idlePrompt, setIdlePrompt] = useState(false);
  const [idleRemaining, setIdleRemaining] = useState(PROMPT_SECONDS);

  /* Held in refs so the effect can run once for the whole session rather than
     restarting whenever the component re-renders — which it does on every tap,
     every tile, every second of the countdown. An effect that depended on the
     callbacks would tear down and rebuild both clocks each time, and the cap
     would never arrive. */
  const onExpireRef = useRef(onExpire);
  const isBusyRef = useRef(isBusy);

  // Refreshed in an effect rather than during render: a ref written while
  // rendering is a value the next render may not agree with, and React says so.
  // No dependency array, so both stay current after every render.
  useEffect(() => {
    onExpireRef.current = onExpire;
    isBusyRef.current = isBusy;
  });

  // Reached by the prompt's own button, which is outside the effect's closure.
  const restartQuietRef = useRef(() => {});

  useEffect(() => {
    if (!active || !enabled) return undefined;

    let capLeft = HARD_CAP_SECONDS;
    let quietFor = 0;
    let promptLeft = PROMPT_SECONDS;
    let showingPrompt = false;
    let expired = false;

    const expire = () => {
      if (expired) return;
      // A charge is in flight. Come back on the next tick.
      if (isBusyRef.current?.()) return;

      expired = true;
      onExpireRef.current();
    };

    const present = () => {
      quietFor = 0;

      if (showingPrompt) {
        showingPrompt = false;
        promptLeft = PROMPT_SECONDS;
        setIdlePrompt(false);
        setIdleRemaining(PROMPT_SECONDS);
      }
    };

    restartQuietRef.current = present;

    const second = setInterval(() => {
      capLeft -= 1;
      setCapRemaining(capLeft);

      if (capLeft <= 0) {
        // Keeps ticking rather than returning: expiry may be waiting on a bill,
        // and this is what tries again once it lands.
        expire();
        return;
      }

      if (showingPrompt) {
        promptLeft -= 1;
        setIdleRemaining(promptLeft);

        if (promptLeft <= 0) expire();
        return;
      }

      quietFor += 1;

      if (quietFor >= IDLE_SECONDS) {
        showingPrompt = true;
        promptLeft = PROMPT_SECONDS;
        setIdleRemaining(PROMPT_SECONDS);
        setIdlePrompt(true);
      }
    }, 1000);

    // On the window rather than the till's own container: a tap anywhere is
    // somebody being there, including on the prompt's own backdrop.
    window.addEventListener("pointerdown", present);
    window.addEventListener("keydown", present);

    return () => {
      clearInterval(second);
      window.removeEventListener("pointerdown", present);
      window.removeEventListener("keydown", present);
    };
  }, [active, enabled]);

  return {
    capRemaining,
    // Explicitly false rather than left to capRemaining sitting at its
    // initial value: a demo session must not flash "session ending" if the
    // cap ever starts being seeded from somewhere else.
    capWarning: enabled && capRemaining <= WARNING_SECONDS && capRemaining > 0,
    idlePrompt,
    idleRemaining,
    dismissIdle: () => restartQuietRef.current(),
  };
};
