import { useEffect, useState } from "react";

/* Anything shallower than this is browser chrome coming and going, not an
   on-screen keyboard. */
const KEYBOARD_MIN_PX = 80;

/* Where the on-screen keyboard leaves the pay sheet.
 *
 * In the Android build the WebView itself shrinks when the keyboard opens, so
 * a fixed, inset-0 backdrop already lines up. Mobile browsers are the problem:
 * most keep the layout viewport at full height and only shrink the *visual*
 * viewport, which sinks a centered modal behind the keys. While the consumer
 * is active, this reports the visible box to pin that backdrop to — or null
 * when no pinning is needed.
 */
export const useVisualViewportBox = (active) => {
  const [box, setBox] = useState(null);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!active || !viewport) return undefined;

    /* No initial measure: with the keyboard down the box is rightly null, and
       the keyboard's arrival always fires a resize. */
    const measure = () => {
      const keyboardUp =
        viewport.height < window.innerHeight - KEYBOARD_MIN_PX;
      setBox(
        keyboardUp
          ? { top: viewport.offsetTop, height: viewport.height }
          : null
      );
    };

    viewport.addEventListener("resize", measure);
    viewport.addEventListener("scroll", measure);
    return () => {
      viewport.removeEventListener("resize", measure);
      viewport.removeEventListener("scroll", measure);
      setBox(null);
    };
  }, [active]);

  return box;
};
