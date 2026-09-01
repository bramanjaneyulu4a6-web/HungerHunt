import { useEffect } from "react";

import { useVisualViewportBox } from "./useVisualViewportBox";

const ENTRY_TAGS = new Set(["INPUT", "TEXTAREA"]);

const centre = (element) => {
  if (!element || !ENTRY_TAGS.has(element.tagName)) return;
  element.scrollIntoView({ block: "center", behavior: "smooth" });
};

/* Keeps whatever the student is typing into above the on-screen keyboard.
 *
 * It leans on useVisualViewportBox for the one thing that is genuinely hard to
 * know: whether the keyboard is *covering* the page. Where the layout viewport
 * resizes with the keyboard — the Android WebView, and any browser honouring
 * this app's `interactive-widget=resizes-content` — that hook rightly reports
 * nothing, because the page simply got shorter and ordinary scrolling reaches
 * every field. Where it does not (iOS Safari), the hook reports the visible
 * box, and that is exactly when a field can sit behind the keys with nothing
 * to tell the browser to move.
 *
 * It fires on the keyboard arriving and on focus moving, and deliberately not
 * on every measurement: scrollIntoView moves the visual viewport, which fires
 * 'scroll', which would scroll again. Following focus matters on its own — the
 * five admission-number boxes hand focus along without resizing anything, so a
 * resize-only version would centre the first box and then hold still while the
 * student typed their way down behind the keys.
 *
 * The screen still has to be able to scroll for any of this to do anything. */
export const useKeepFocusedInView = (active = true) => {
  const box = useVisualViewportBox(active);
  const keyboardUp = Boolean(box);

  useEffect(() => {
    if (!keyboardUp) return undefined;

    centre(document.activeElement);

    const onFocusIn = (event) => centre(event.target);
    document.addEventListener("focusin", onFocusIn);
    return () => document.removeEventListener("focusin", onFocusIn);
  }, [keyboardUp]);
};
