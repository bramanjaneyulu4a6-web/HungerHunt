// import { getToken, onMessage } from "firebase/messaging";
// import { messaging } from "../firebase";
// import API from "../services/api";

// // const VAPID_KEY = "YOUR_VAPID_KEY_FROM_FIREBASE";
// const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;

// export const requestNotificationPermission = async () => {
//   try {
//     const permission = await Notification.requestPermission();

//     if (permission !== "granted") {
//       console.log("Notification permission denied");
//       return;
//     }

//     const token = await getToken(messaging, {
//       vapidKey: VAPID_KEY,
//     });

//     console.log("FCM Token:", token);

//     // Send token to backend
//     await API.post("/parent/save-fcm-token", {
//       token,
//     });

//     return token;
//   } catch (error) {
//     console.error("FCM error:", error);
//   }
// };

// // Foreground messages handler
// export const listenForMessages = () => {
//   onMessage(messaging, (payload) => {
//     console.log("Message received: ", payload);

//     alert(`${payload.notification.title}\n${payload.notification.body}`);
//   });
// };









import { getToken, onMessage } from "firebase/messaging";
import { messaging } from "../firebase";
import API from "../services/api";

const VAPID_KEY = import.meta.env.VITE_VAPID_KEY;

export const requestNotificationPermission = async () => {
  try {
    // Browser support check
    if (!("Notification" in window)) {
      console.log("This browser doesn't support notifications.");
      return;
    }

    const permission = await Notification.requestPermission();

    console.log("Notification Permission:", permission);

    if (permission !== "granted") {
      console.log("User denied notification permission");
      return;
    }
console.log("VAPID KEY =", VAPID_KEY);
    const token = await getToken(messaging, {
      vapidKey: VAPID_KEY,
    });

    if (!token) {
      console.log("No FCM token generated");
      return;
    }

    console.log("FCM TOKEN:");
    console.log(token);

    await API.post("/parent/save-fcm-token", {
      token,
    });

    console.log("✅ FCM Token saved to backend");

    return token;

  } catch (error) {
    console.error("FCM ERROR:", error);
  }
};

// Listen while app is open
// export const listenForMessages = () => {
//   onMessage(messaging, (payload) => {
//     console.log("Foreground Notification:", payload);

//     alert(
//       `${payload.notification?.title}\n${payload.notification?.body}`
//     );
//   });
// };



export const listenForMessages = (callback) => {
  onMessage(messaging, (payload) => {
    console.log("📩 Foreground Message:", payload);

    new Notification(payload.notification.title, {
      body: payload.notification.body,
    });

    // Refresh dashboard
    if (callback) {
      callback(payload);
    }
  });
};