/* Firebase web config.
   These values are not secrets — Firebase ships them in the client bundle by
   design, and access is controlled by the project's security rules, not by
   hiding the keys. They live in env vars anyway so that a staging project can
   be pointed at without editing source.

   Only the *web* push path uses this. On iOS and Android the native
   @capacitor/push-notifications plugin talks to APNs/FCM directly and reads its
   credentials from GoogleService-Info.plist / google-services.json instead. */

export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(
  firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId
);

/* Imported dynamically, and only on the web push path. Loading the Firebase SDK
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
