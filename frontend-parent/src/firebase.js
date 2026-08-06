import { initializeApp } from "firebase/app";
import { getMessaging } from "firebase/messaging";

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