import { firebaseEnabled } from "../config/firebase.js";
import { getMessaging } from "firebase-admin/messaging";
import Parent from "../models/Parent.js";

// Must match CHANNEL_ID in frontend-parent/src/utils/push.js. Android drops a
// notification naming a channel that does not exist.
const CHANNEL_ID = "wallet-updates";

// FCM rejects a data payload whose values are not all strings, and does it for
// the whole message rather than the offending key.
const asStrings = (data) =>
  Object.fromEntries(
    Object.entries(data)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => [key, String(value)])
  );

/* Web and native need different messages, and sending one shape to both breaks
   one of them.

   Native wants a `notification` block: that is what lets Android and iOS draw
   the notification themselves while the app is closed, which is the whole point
   of a real app notification.

   The browser wants data only. A `notification` block there is drawn by the
   Firebase service worker *and* passed to our own onBackgroundMessage handler,
   so the parent gets the same notification twice. Sending title and body as
   data leaves our handler as the only thing that draws. */
const buildMessage = (token, platform, title, body, data) => {
  const base = { token, data: asStrings(data) };

  if (platform === "web") {
    return { ...base, data: { ...base.data, title, body } };
  }

  return {
    ...base,
    notification: { title, body },
    android: {
      priority: "high",
      notification: {
        channelId: CHANNEL_ID,
        sound: "default",
        defaultSound: true,
        priority: "high"
      }
    },
    apns: {
      headers: { "apns-priority": "10" },
      payload: { aps: { sound: "default", badge: 1 } }
    }
  };
};

// FCM's way of saying the app was uninstalled, or the browser revoked the
// subscription. Nothing will ever be delivered to this token again, so it is
// removed rather than retried forever. Deliberately narrow: other error codes
// (a bad payload, a quota problem) say nothing about the token's validity and
// must not cost a parent their notifications.
const DEAD_TOKEN_CODES = new Set([
  "messaging/registration-token-not-registered",
  "messaging/invalid-registration-token"
]);

/* Tokens registered before pushTokens existed live in the old single-value
   field. Treated as a web token, since that is all the app could register then. */
const collectTokens = (parent) => {
  const tokens = (parent.pushTokens || []).map((entry) => ({
    token: entry.token,
    platform: entry.platform || "web"
  }));

  if (parent.fcmToken && !tokens.some((t) => t.token === parent.fcmToken)) {
    tokens.push({ token: parent.fcmToken, platform: "web" });
  }

  return tokens;
};

/* Sends to every device a parent has registered — phone and browser both, which
   the previous single-token field could not do.

   Never rejects. Callers deliberately do not await it: a checkout should not
   wait on, or fail because of, a push round-trip to Google. */
export const sendToParent = async (parent, title, body, data = {}) => {
  try {
    await deliver(parent, title, body, data);
  } catch (err) {
    console.error("❌ FCM Error:", err);
  }
};

const deliver = async (parent, title, body, data) => {
  if (!firebaseEnabled || !parent) return;

  const targets = collectTokens(parent);
  if (targets.length === 0) return;

  const messaging = getMessaging();

  const results = await Promise.allSettled(
    targets.map(({ token, platform }) =>
      messaging.send(buildMessage(token, platform, title, body, data))
    )
  );

  const dead = [];

  results.forEach((result, i) => {
    if (result.status === "fulfilled") return;

    const code = result.reason?.errorInfo?.code || result.reason?.code;

    if (DEAD_TOKEN_CODES.has(code)) {
      dead.push(targets[i].token);
    } else {
      console.error("❌ FCM Error:", code || result.reason);
    }
  });

  if (dead.length === 0) return;

  try {
    await Parent.updateOne(
      { _id: parent._id },
      {
        $pull: { pushTokens: { token: { $in: dead } } },
        ...(dead.includes(parent.fcmToken) ? { $set: { fcmToken: null } } : {})
      }
    );
  } catch (err) {
    console.error("❌ Could not prune dead push tokens:", err);
  }
};
