import { initializeApp, cert, getApps } from "firebase-admin/app";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

// Push notifications are non-critical: a missing key degrades them rather than
// taking down the whole server.
export const firebaseEnabled = Boolean(
  FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY
);

if (!firebaseEnabled) {
  console.warn(
    "⚠️  Firebase env vars missing — push notifications disabled. " +
    "Set FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL and FIREBASE_PRIVATE_KEY to enable."
  );
} else if (getApps().length === 0) {
  initializeApp({
    credential: cert({
      type: "service_account",
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    }),
  });
  console.log("✅ Firebase initialized");
}
