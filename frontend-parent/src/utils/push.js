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

/* The token the backend currently has for this device. Kept so that logout can
   withdraw exactly that one, and so a re-register does not re-POST an
   unchanged token on every app start. */
let currentToken = null;

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
  if (!token || token === currentToken) return;

  try {
    await API.post('/parent/save-fcm-token', { token, platform: platform() });
    currentToken = token;
  } catch (err) {
    // A failed save means this device silently gets no notifications, which is
    // worth a console line — but never worth blocking sign-in over.
    console.error('Could not register this device for notifications:', err);
  }
};

/* ------------------------------------------------------------------ native */

const initNative = async () => {
  const { PushNotifications } = await import('@capacitor/push-notifications');

  let status = await PushNotifications.checkPermissions();

  if (status.receive !== 'granted') {
    status = await PushNotifications.requestPermissions();
  }

  if (status.receive !== 'granted') return;

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

    await PushNotifications.addListener('pushNotificationReceived', async (notification) => {
      // iOS draws foreground notifications itself, because presentationOptions
      // in capacitor.config.json asks it to. Android has no such setting: a
      // push arriving while the app is open is handed to the app and drawn by
      // nobody, so it gets redrawn here as a local notification to match.
      if (platform() === 'android') {
        await showLocalNotification(notification);
      }

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
};

let localNotificationId = 0;

const showLocalNotification = async (notification) => {
  try {
    const { LocalNotifications } = await import('@capacitor/local-notifications');

    await LocalNotifications.schedule({
      notifications: [
        {
          // Must be a 32-bit int, and unique per notification or each one
          // replaces the last.
          id: (localNotificationId = (localNotificationId + 1) % 2147483647),
          title: notification.title || 'Hunger Hunt',
          body: notification.body || '',
          channelId: CHANNEL_ID,
          extra: notification.data || {},
        },
      ],
    });
  } catch (err) {
    console.error('Could not display the notification:', err);
  }
};

/* --------------------------------------------------------------------- web */

const initWeb = async () => {
  if (!firebaseConfigured) {
    console.warn(
      'Firebase web config missing — browser notifications are disabled. ' +
        'Set the VITE_FIREBASE_* variables to enable them.'
    );
    return;
  }

  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;

  const { isSupported, getMessaging, getToken, onMessage } = await import(
    'firebase/messaging'
  );

  // Safari below 16.4, most in-app browsers, and any non-secure origin.
  if (!(await isSupported())) return;

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return;

  /* The worker is a static file and cannot read Vite's env, so the config
     rides along in its query string — one source of truth instead of a second
     copy that drifts. */
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?${new URLSearchParams(firebaseConfig)}`
  );

  const messaging = getMessaging(await getFirebaseApp());

  const token = await getToken(messaging, {
    vapidKey: import.meta.env.VITE_VAPID_KEY,
    serviceWorkerRegistration: registration,
  });

  await sendToken(token);

  if (webListenerAttached) return;
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
    await (isNative() ? initNative() : initWeb());
  } catch (err) {
    // Notifications are a convenience. Nothing here should be able to stop a
    // parent from using the app.
    console.error('Push setup failed:', err);
  }
};

/* Called on logout. Without this, a device keeps receiving one family's
   notifications after a different parent signs in on it — or after the app is
   signed out entirely. */
export const stopPush = async () => {
  started = false;

  const token = currentToken;
  currentToken = null;

  if (!token) return;

  try {
    await API.post('/parent/remove-fcm-token', { token });
  } catch {
    // Best effort: the session may already be gone. The backend also drops a
    // token as soon as FCM reports it dead, so this cannot leak forever.
  }
};
