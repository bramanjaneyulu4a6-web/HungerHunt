import { Capacitor } from '@capacitor/core';

/* In the Android APK a navigation off the app's own origin is handed to the
   system rather than loaded in the WebView, so assigning the link opens
   WhatsApp and leaves this app where it was. In a browser the same assignment
   would navigate the caretaker away, so it gets a new tab instead. Called from
   a tap, so the browser's popup blocker lets it through. */
export const openWhatsApp = (link) => {
  if (!link) return false;
  if (Capacitor.isNativePlatform()) {
    window.location.assign(link);
    return true;
  }
  const opened = window.open(link, '_blank');
  if (opened) opened.opener = null;
  return Boolean(opened);
};
