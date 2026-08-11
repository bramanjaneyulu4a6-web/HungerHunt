import { firebaseEnabled } from '../config/firebase.js';
import { getMessaging } from 'firebase-admin/messaging';

// The one line that actually talks to Google, behind an object so the retry
// logic can be tested against a fake without Firebase credentials or network.
// Everything above this seam is ours to verify; everything below it is FCM's.
export const transport = {
  enabled: () => firebaseEnabled,
  send: (message) => getMessaging().send(message),
};
