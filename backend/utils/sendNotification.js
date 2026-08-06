import { firebaseEnabled } from "../config/firebase.js";
import { getMessaging } from "firebase-admin/messaging";

export const sendNotification = async (token, title, body, data = {}) => {
  if (!firebaseEnabled) return;
  if (!token) return;

  try {
    await getMessaging().send({
      token,
      notification: { title, body },
      data,
    });
  } catch (err) {
    console.error("❌ FCM Error:", err);
  }
};
