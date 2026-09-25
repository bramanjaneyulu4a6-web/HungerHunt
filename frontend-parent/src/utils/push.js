/* Push notifications, on both the native shells and the browser.
 *
 * The two platforms deliver a push by completely different routes, and the
 * difference is not something the rest of the app should have to know about:
 *
 *   native (iOS/Android) — @capacitor/push-notifications registers with
 *     APNs/FCM and hands back a device token. The OS draws the notification
 *     itself whenever the app is backgrounded or closed, which is what makes it
 *     look like any other app's notification rather than a web page's.
 *
 *   web — Firebase Cloud Messaging with a service worker. The worker draws
 *     notifications while the tab is closed; this module draws them while it is
 *     open, because FCM deliberately does not.
 *
 * Both paths end at the same two things: a token POSTed to the backend, and an
 * onPush callback for screens that want to refresh when data changes.
 */

import { Capacitor } from '@capacitor/core';
import API from '../services/api';
import { firebaseConfig, firebaseConfigured, getFirebaseApp } from '../firebase';
import { alreadySent, hasSentToken, markSent, takeSent } from './pushTokenStore';

const platform = () => Capacitor.getPlatform();
const isNative = () => Capacitor.isNativePlatform();

/* Android groups notifications by channel, and a channel's importance is fixed
   the first time it is created — changing these values later has no effect on a
   device that has already installed the app, short of a new channel id. */
const CHANNEL_ID = 'wallet-updates';

const CHANNEL = {
  id: CHANNEL_ID,
  name: 'Wallet updates',
  description: 'Recharges and purchases on your children’s accounts',
  importance: 5, // IMPORTANCE_HIGH — heads-up banner
  visibility: 1, // VISIBILITY_PUBLIC — shows on the lock screen
  vibration: true,
};

/* The token the backend currently has for this device lives in pushTokenStore,
   not here: it has to outlive a page reload, or every boot re-sends it. */

let started = false;

/* Listeners are attached once for the lifetime of the app, but a parent can
   sign out and a different one sign in beneath them. So they call through this
   rather than closing over the handler they were given: attaching a fresh set
   per sign-in would leave the old ones live, and every notification would be
   acted on once per session that had ever been opened. */
let pushHandler = () => {};

let nativeListenersAttached = false;
let webListenerAttached = false;

const sendToken = async (token) => {
  if (!token) return false;
  if (alreadySent(token)) return true;

  try {
    await API.post('/parent/save-fcm-token', { token, platform: platform() });
    markSent(token);
    return true;
  } catch (err) {
    // A failed save means this device silently gets no notifications, which is
    // worth a console line — but never worth blocking sign-in over.
    console.error('Could not register this device for notifications:', err);
    return false;
  }
};

/* ------------------------------------------------------------------ native */

/* `prompt` decides whether the OS permission dialog may be shown. Android and
   iOS apps conventionally ask at first launch, so sign-in passes true; the
   Enable button always does. */
const initNative = async ({ prompt }) => {
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let status = await PushNotifications.checkPermissions();

  if (status.receive !== 'granted' && prompt) {
    status = await PushNotifications.requestPermissions();
  }

  if (status.receive !== 'granted') return false;

  if (platform() === 'android') {
    await PushNotifications.createChannel(CHANNEL);
  }

  if (!nativeListenersAttached) {
    // Listeners go on before register(), because the token arrives as an event
    // and registration is fast enough to beat a listener attached afterwards.
    await PushNotifications.addListener('registration', (token) => {
      sendToken(token.value);
    });

    await PushNotifications.addListener('registrationError', (err) => {
      console.error('Push registration failed:', err);
    });

    await PushNotifications.addListener('pushNotificationReceived', (notification) => {
      /* Nothing is drawn here, on either platform.
       *
       * This used to redraw the notification on Android, on the belief that a
       * push arriving while the app is open is handed to the app and drawn by
       * nobody. That is not what happens: every message the backend sends to a
       * device carries a `notification` block, and the system draws it whether
       * the app is open or not. The redraw made a second copy, so a parent with
       * the app open saw every notification twice — measured on the emulator as
       * two notification records for one send, against one when backgrounded.
       *
       * iOS draws its own foreground notification from presentationOptions in
       * capacitor.config.json, so it never needed this either.
       */
      pushHandler({ data: notification.data || {}, tapped: false });
    });

    await PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
      // Fired when the notification is tapped, including from a cold start.
      pushHandler({ data: action.notification?.data || {}, tapped: true });
    });

    nativeListenersAttached = true;
  }

  // Re-registering on a later sign-in is the point: it re-fires 'registration',
  // which attaches this device to whichever parent is signed in now.
  await PushNotifications.register();
  return true;
};

/* --------------------------------------------------------------------- web */

/* Never prompts unless asked to. A permission request nobody tapped for is
   refused outright by iPhone Safari and quietly muted by Chrome, which is how
   every signed-in parent ended up with no registered browser. Sign-in only
   re-registers a browser that already said yes; asking is the Enable
   button's job. */
const initWeb = async ({ prompt }) => {
  if (!firebaseConfigured) {
    console.warn(
      'Firebase web config missing — browser notifications are disabled. ' +
        'Set the VITE_FIREBASE_* variables to enable them.'
    );
    return false;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) return false;

  const { isSupported, getMessaging, getToken, onMessage } = await import(
    'firebase/messaging'
  );

  // Safari below 16.4, most in-app browsers, and any non-secure origin.
  if (!(await isSupported())) return false;

  let permission = Notification.permission;

  if (permission === 'default' && prompt) {
    permission = await Notification.requestPermission();
  }

  if (permission !== 'granted') return false;

  /* The worker is a static file and cannot read Vite's env, so the config
     rides along in its query string — one source of truth instead of a second
     copy that drifts. */
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig)}`
  );

  const messaging = getMessaging(await getFirebaseApp());

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_VAPID_KEY?.trim(),
    serviceWorkerRegistration: registration,
  });

  const saved = await sendToken(token);

  if (webListenerAttached) return saved;
  webListenerAttached = true;

  onMessage(messaging, (payload) => {
    // FCM hands foreground messages to the page rather than the worker, so
    // nothing is drawn unless the page draws it. Title and body arrive as data
    // rather than a notification block — see buildMessage on the backend for
    // why the web payload is shaped that way.
    const data = payload.data || {};

    try {
      if (data.title) {
        registration.showNotification(data.title, {
          body: data.body || '',
          icon: '/Logo.jpeg',
          data,
        });
      }
    } catch (err) {
      console.error('Could not display the notification:', err);
    }

    pushHandler({ data, tapped: false });
  });

  return saved;
};

/* ------------------------------------------------------------------ public */

/* Called whenever a parent is signed in — at login, and at each later start
   that restores a session. Repeat calls only refresh the handler; the setup
   itself runs once per sign-in. */
export const startPush = async (onPush) => {
  // Swapped even when already started, so the live listeners always call the
  // current sign-in's handler rather than a previous one's.
  pushHandler = onPush;

  if (started) return;
  started = true;

  try {
    await (isNative() ? initNative({ prompt: true }) : initWeb({ prompt: false }));
  } catch (err) {
    // Notifications are a convenience. Nothing here should be able to stop a
    // parent from using the app.
    console.error('Push setup failed:', err);
  }
};

/* Called from a tap, which is what lets the browser show its permission
   dialog. Resolves to true once this device is registered with the backend. */
export const enablePush = async () => {
  try {
    return await (isNative() ? initNative({ prompt: true }) : initWeb({ prompt: true }));
  } catch (err) {
    console.error('Push setup failed:', err);
    return false;
  }
};

const userAgent = () => (typeof navigator === 'undefined' ? '' : navigator.userAgent || '');

// WhatsApp, Facebook, Instagram and other apps open links in a built-in
// browser that has no notification support at all.
const inAppBrowser = () =>
  /WhatsApp|FBAN|FBAV|FB_IAB|Instagram|Line\/|Snapchat|; wv\)/i.test(userAgent());

const isIos = () =>
  /iPhone|iPad|iPod/i.test(userAgent())
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

const installedToHomeScreen = () =>
  window.navigator.standalone === true
  || window.matchMedia?.('(display-mode: standalone)').matches === true;

/* What the notifications card should say for this device:
     on          — permission granted (and, on the web, a token saved)
     off         — never asked; the Enable button can ask
     blocked     — refused; only the phone or browser settings can undo it
     unsupported — with a reason: 'in-app', 'ios-install' or 'browser' */
export const pushStatus = async () => {
  if (isNative()) {
    try {
      const { PushNotifications } = await import('@capacitor/push-notifications');
      const { receive } = await PushNotifications.checkPermissions();
      if (receive === 'granted') return { state: 'on', registered: hasSentToken() };
      if (receive === 'denied') return { state: 'blocked' };
      return { state: 'off' };
    } catch {
      return { state: 'unsupported', reason: 'browser' };
    }
  }

  if (inAppBrowser()) return { state: 'unsupported', reason: 'in-app' };

  // iPhone Safari offers web push only to a site added to the Home Screen.
  if (isIos() && !installedToHomeScreen()) return { state: 'unsupported', reason: 'ios-install' };

  if (!firebaseConfigured || !('Notification' in window) || !('serviceWorker' in navigator)) {
    return { state: 'unsupported', reason: 'browser' };
  }

  try {
    const { isSupported } = await import('firebase/messaging');
    if (!(await isSupported())) return { state: 'unsupported', reason: 'browser' };
  } catch {
    return { state: 'unsupported', reason: 'browser' };
  }

  if (Notification.permission === 'denied') return { state: 'blocked' };
  if (Notification.permission === 'granted') {
    return { state: 'on', registered: hasSentToken() };
  }
  return { state: 'off' };
};

/* Called on logout. Without this, a device keeps receiving one family's
   notifications after a different parent signs in on it — or after the app is
   signed out entirely. */
export const stopPush = async () => {
  started = false;

  const token = takeSent();

  if (!token) return;

  try {
    await API.post('/parent/remove-fcm-token', { token });
  } catch {
    // Best effort: the session may already be gone. The backend also drops a
    // token as soon as FCM reports it dead, so this cannot leak forever.
  }
};
