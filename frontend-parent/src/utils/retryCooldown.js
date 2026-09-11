import { useCallback, useEffect, useState } from 'react';

/* The client half of the backend's sign-in queue.
 *
 * Signing in costs the server a password hash, which is CPU work it cannot
 * parallelise, so the backend serves a few at a time and answers the overflow
 * with 503 and "Please try again in a few seconds." That reply is not an
 * error: nothing is wrong with the account, the phone or the password, and
 * the request never reached the database.
 *
 * What this exists to prevent is the retry. A parent given a message and a
 * live button taps it again immediately, and every immediate retry adds more
 * hashing to the thing that is already the bottleneck — which is how a busy
 * launch turns into a stuck one. Holding the button for a few seconds spreads
 * the same parents over time the server can actually use.
 *
 * The wait comes from the server's own Retry-After header where it sends one,
 * so the pause can be retuned during an incident without shipping a new
 * frontend build.
 */

export const DEFAULT_RETRY_SECONDS = 3;
export const BUSY_MESSAGE = 'Please try again in a few seconds.';

export const useRetryCooldown = () => {
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (secondsLeft <= 0) return undefined;
    const timer = setTimeout(() => setSecondsLeft((remaining) => remaining - 1), 1000);
    return () => clearTimeout(timer);
  }, [secondsLeft]);

  /* Call from a catch block. Returns true when it recognised a busy server and
     took over, so the caller can stop before its own error handling runs —
     which matters where that handling does something destructive, like sending
     a parent back through SMS verification. */
  const startFrom = useCallback((error) => {
    if (error?.response?.status !== 503) return false;

    const advertised = Number(error.response.headers?.['retry-after']);
    setSecondsLeft(Number.isFinite(advertised) && advertised > 0 ? advertised : DEFAULT_RETRY_SECONDS);
    setBusy(true);
    return true;
  }, []);

  // Called as a new attempt begins, so the previous notice does not linger
  // over a fresh try.
  const reset = useCallback(() => {
    setSecondsLeft(0);
    setBusy(false);
  }, []);

  return { secondsLeft, waiting: secondsLeft > 0, busy, startFrom, reset };
};
