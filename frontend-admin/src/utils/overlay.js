/* How every overlay on the console behaves: Escape closes the one in front,
 * and the page underneath stops scrolling while any of them is open.
 *
 * Kept in one place because the rule is about the stack, not about any single
 * dialog. Each overlay minding its own body style works right up until two are
 * open at once — a receipt over a student's activity, a confirmation over an
 * editor — and then the inner one closing hands the scroll back while the
 * outer one is still covering the page. Likewise two independent key
 * listeners would both answer one Escape and close both dialogs at once.
 *
 * So the open overlays are a stack: the page locks when the first arrives and
 * unlocks when the last leaves, restoring whatever the page had before rather
 * than assuming it was scrollable; and one shared listener hands Escape to the
 * top of the stack only. Order of leaving does not matter — React does not
 * promise siblings unmount in the order they mounted.
 */
import { useEffect, useRef } from 'react';

const open = [];
let restoreOverflow = null;

const onKeyDown = (event) => {
  if (event.key !== 'Escape') return;
  open[open.length - 1]?.dismiss();
};

const activate = (token) => {
  if (open.length === 0) {
    restoreOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKeyDown);
  }
  open.push(token);
};

const deactivate = (token) => {
  const at = open.indexOf(token);
  if (at !== -1) open.splice(at, 1);
  if (open.length === 0) {
    window.removeEventListener('keydown', onKeyDown);
    document.body.style.overflow = restoreOverflow;
    restoreOverflow = null;
  }
};

/* `active` is for a screen that owns a dialog it is not always showing — the
   hook must still be called every render, so the flag says whether this one is
   on the stack right now. A component that only exists while it is open can
   leave it alone.

   onDismiss is read fresh on each keypress rather than captured: a dialog that
   refuses to close mid-save decides that against current state, and a stale
   closure would close it anyway. */
export const useDismissableOverlay = (onDismiss, { active = true } = {}) => {
  const latest = useRef(onDismiss);
  // Assigned in an effect, not during render: a ref written while rendering is
  // a write React is free to throw away when it discards that render.
  useEffect(() => {
    latest.current = onDismiss;
  });

  useEffect(() => {
    if (!active) return undefined;
    const token = { dismiss: () => latest.current?.() };
    activate(token);
    return () => deactivate(token);
  }, [active]);
};
