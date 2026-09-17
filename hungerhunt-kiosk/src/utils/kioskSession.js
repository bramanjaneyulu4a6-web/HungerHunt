import { reloadIfDeployPending } from "./deployWatch";

/* Whether a student's order session is on screen right now.
 *
 * kioskToken cannot answer this. With the gate on it roughly does, but the
 * demo kiosk writes the next visitor's token the moment a session ends and
 * only clears it when the one after starts, so a token is nearly always
 * there. The till being mounted is the session: catalogue, basket, the pay
 * sheet, approval and the result screen all live inside KioskBilling.
 *
 * A new deploy must never land in the middle of that. The moment it ends is
 * the one safe point, and on the demo kiosk — which has no idle clock and
 * goes straight into the next session — the only one, so that is where a
 * waiting deploy is let in. */
let active = false;

export const isOrderSessionActive = () => active;

export const setOrderSessionActive = (next) => {
  active = Boolean(next);
  if (!active) reloadIfDeployPending();
};
