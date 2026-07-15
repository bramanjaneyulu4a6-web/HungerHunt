import { initializeApp } from "firebase/app";
import { getMessaging, getToken } from "firebase/messaging";

const firebaseConfig = {
  apiKey: "AIzaSyBEvWAmL7sRp-we38W15pwBARNi2il_7S0",
  authDomain: "hungerhuntm.firebaseapp.com",
  projectId: "hungerhuntm",
  storageBucket: "hungerhuntm.firebasestorage.app",
  messagingSenderId: "383327390863",
  appId: "1:383327390863:web:7e45235d7eaa71b9fb34fa",
  measurementId: "G-Y6WE8P0P8N"
};

const app = initializeApp(firebaseConfig);
export const messaging = getMessaging(app);

export const requestFCMToken = async () => {
  try {
    const token = await getToken(messaging, {
      vapidKey: "BFuTs7ZBf_-Cm_zvY_h7djgvQK3hyMc8qqC22KQRj1eXx00OlBpnqvNr-kjJqaRUjOp99YZw4K9Dml5eSJ0HotE",
    });
    return token;
  } catch (err) {
    console.log("FCM error", err);
  }
};