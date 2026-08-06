import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "../firebase";
import API from "../services/api";

const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;

export const requestNotificationPermission = async () => {
  try {
    // Browser support check
    if (!("Notification" in window)) {
      return;
    }

    const permission = await Notification.requestPermission();

    if (permission !== "granted") {
      return;
    }

    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (!token) {
      return;
    }

    await API.post("/parent/save-fcm-token", {
      token,
    });

    return token;

  } catch (error) {
    console.error("FCM ERROR:", error);
  }
};

// Listen while app is open
export const listenForMessages = (callback) => {
  onMessage(messaging, (payload) => {
    try {
      if (typeof Notification !== "undefined" && Notification.permission === "granted") {
        new Notification(payload.notification.title, {
          body: payload.notification.body,
        });
      }
    } catch (error) {
      console.error("Foreground notification display failed:", error);
    }

    if (callback) {
      callback(payload);
    }
  });
};