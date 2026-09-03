import { initializeApp, cert, getApps } from "firebase-admin/app";

const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;

// Development can run without Firebase. Production validation requires it
// because first-time parent password setup verifies Firebase phone-auth tokens.
export const firebaseEnabled = Boolean(
  FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY
);

if (!firebaseEnabled) {
  console.warn(
    "⚠️  Firebase env vars missing — SMS verification and push notifications disabled. " +
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
