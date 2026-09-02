import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle } from '@capacitor/haptics';

/* A soft-UI press with no physical tick reads as unresponsive, and users tap
   it twice. Every control that presses inward rather than lighting up owes
   the finger this much.

   Await it before acting, so the tick lands with the press rather than after
   whatever the press opened. Web and desktop have no haptics engine and
   simply go without. */
export const tick = async () => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // A device without a haptics engine is not a reason to drop the tap.
  }
};
