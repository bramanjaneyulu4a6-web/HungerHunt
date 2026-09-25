/* Firebase web config.
   These values are not secrets — Firebase ships them in the client bundle by
   design, and access is controlled by the project's security rules, not by
   hiding the keys. They live in env vars anyway so that a staging project can
   be pointed at without editing source.

   Web push and web phone verification use this. On iOS and Android the native
   Firebase plugins read their credentials from GoogleService-Info.plist /
   google-services.json instead. */

/* Trimmed because the production appId was once deployed with a leading space
   pasted into the hosting dashboard. Firebase Installations rejects that as
   INVALID_ARGUMENT, so no browser could get a push token, while phone sign-in,
   which never sends the appId there, went on working and hid the fault. */
const env = (value) => (typeof value === 'string' ? value.trim() : value);

export const firebaseConfig = {
  apiKey: env(import.meta.env.VITE_FIREBASE_API_KEY),
  authDomain: env(import.meta.env.VITE_FIREBASE_AUTH_DOMAIN),
  projectId: env(import.meta.env.VITE_FIREBASE_PROJECT_ID),
  storageBucket: env(import.meta.env.VITE_FIREBASE_STORAGE_BUCKET),
  messagingSenderId: env(import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID),
  appId: env(import.meta.env.VITE_FIREBASE_APP_ID),
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey
  && firebaseConfig.authDomain
  && firebaseConfig.projectId
  && firebaseConfig.messagingSenderId
);

/* Imported dynamically, and only when a web Firebase feature is used. Loading the Firebase SDK
   at module scope pulled ~90 kB into every page load — including the native
   builds, which never use it. */
let appPromise;

export const getFirebaseApp = async () => {
  if (!appPromise) {
    appPromise = import('firebase/app').then(({ initializeApp, getApps, getApp }) =>
      getApps().length ? getApp() : initializeApp(firebaseConfig)
    );
  }

  return appPromise;
};
