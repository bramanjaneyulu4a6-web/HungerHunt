/* A payment sheet showing its confirmation is mounted inside the very card
   that the next list refresh removes. Approving an order pushes "Order
   approved" to the parent's own device, and that push lands within a second
   of the charge — so the refresh it triggers would drop the order from the
   pending list and take the confirmation off screen mid-animation, before the
   parent has read it.

   So a page that reloads on a push or on regaining focus asks first. While a
   payment is open the answer is no, and the page is caught up the moment the
   payment is done instead. */

let holds = 0;
let missed = false;
const resumers = new Set();

// Held for as long as a payment sheet is on screen — while the parent is
// choosing as much as while the money moves, since either way the sheet
// disappearing under them is the failure. Call the returned release once.
export const holdBackgroundRefresh = () => {
  holds += 1;
  let released = false;

  return () => {
    if (released) return;
    released = true;
    holds -= 1;
    if (holds > 0 || !missed) return;
    missed = false;
    resumers.forEach((resume) => resume());
  };
};

// True when the caller may reload now. False means a payment is on screen —
// the reload is remembered and runs on release, so nothing stays stale.
export const claimBackgroundRefresh = () => {
  if (holds === 0) return true;
  missed = true;
  return false;
};

export const onBackgroundRefreshResumed = (resume) => {
  resumers.add(resume);
  return () => resumers.delete(resume);
};
