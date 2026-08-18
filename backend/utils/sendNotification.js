import { transport } from "./pushTransport.js";
import Parent from "../models/Parent.js";
import PushOutbox from "../models/PushOutbox.js";

// Must match CHANNEL_ID in frontend-parent/src/utils/push.js. Android drops a
// notification naming a channel that does not exist.
const CHANNEL_ID = "wallet-updates";

/* How long a notification stays worth delivering, and the pauses between
   tries. The schedule leans forward — most outages are seconds, not hours —
   then spreads out, and the whole thing gives up inside a day: a purchase
   alert arriving later than that is noise about money the parent has long
   since seen move in the app.

   The last backoff step is reused if the attempt count somehow passes the end
   of the list; retryUntil is what actually ends the retrying. */
const RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;
const PURGE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const BACKOFF_MINUTES = [1, 5, 15, 60, 180, 360];

const backoffAfter = (attempts) => {
  const minutes =
    BACKOFF_MINUTES[Math.min(attempts - 1, BACKOFF_MINUTES.length - 1)];
  return new Date(Date.now() + minutes * 60 * 1000);
};

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

const pruneDeadTokens = async (parentId, dead, legacyToken) => {
  try {
    await Parent.updateOne(
      { _id: parentId },
      {
        $pull: { pushTokens: { token: { $in: dead } } },
        ...(dead.includes(legacyToken) ? { $set: { fcmToken: null } } : {})
      }
    );
  } catch (err) {
    console.error("❌ Could not prune dead push tokens:", err);
  }
};

/* One try at delivering an outbox row to every device its parent has that has
   not already been reached. Returns nothing; its outcome is written back onto
   the row, which is the only place the next try looks.

   The rules per device:
     accepted        → remembered in deliveredTokens, never sent to again
     token is dead   → removed from the parent, no longer owed anything
     anything else   → transient; the row stays PENDING and comes back later */
const attemptDelivery = async (row, parent) => {
  row.attempts += 1;

  const fail = (reason) => {
    row.lastError = String(reason).slice(0, 500);

    if (Date.now() >= row.retryUntil.getTime()) {
      // The record of failure is the point: a GAVE_UP row is what lets
      // "did the alert ever go out?" be answered with a query, not a guess.
      row.status = "GAVE_UP";
    } else {
      row.nextAttemptAt = backoffAfter(row.attempts);
    }
  };

  if (!parent) {
    row.status = "GAVE_UP";
    row.lastError = "parent account no longer exists";
    return row.save();
  }

  /* Push being unconfigured is a deploy problem, not a delivery verdict.
     The rows wait; the moment a properly-configured process runs the sweep,
     everything still inside its retry window goes out. That turns a broken
     credential from silent loss into a delayed queue. */
  if (!transport.enabled()) {
    fail("push transport disabled — FIREBASE_* env vars missing");
    return row.save();
  }

  const delivered = new Set(row.deliveredTokens);
  const targets = collectTokens(parent).filter((t) => !delivered.has(t.token));

  /* Nobody to send to. A parent with no devices is not a failure to retry on a
     timer — savePushToken flushes this row the moment a device appears, which
     is what carries a notification across an uninstall/reinstall. Until then
     the row just waits out its window. */
  if (targets.length === 0) {
    if (delivered.size > 0) {
      row.status = "SENT";
    } else {
      fail("parent has no registered devices");
    }
    return row.save();
  }

  const results = await Promise.allSettled(
    targets.map(({ token, platform }) =>
      transport.send(buildMessage(token, platform, row.title, row.body, row.data))
    )
  );

  const dead = [];
  let transientFailures = 0;
  let lastTransientError = null;

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      row.deliveredTokens.push(targets[i].token);
      return;
    }

    const code = result.reason?.errorInfo?.code || result.reason?.code;

    if (DEAD_TOKEN_CODES.has(code)) {
      dead.push(targets[i].token);
    } else {
      transientFailures += 1;
      lastTransientError = code || result.reason;
      console.error("❌ FCM Error:", code || result.reason);
    }
  });

  if (dead.length > 0) {
    await pruneDeadTokens(parent._id, dead, parent.fcmToken);
  }

  if (transientFailures > 0) {
    fail(lastTransientError);
  } else {
    // Every device that still exists has accepted the message. Acceptance by
    // FCM is the strongest claim a server can make; "drawn on the screen" is
    // between Google and the phone.
    row.status = "SENT";
  }

  return row.save();
};

/* Sends to every device a parent has registered — phone and browser both.

   Never rejects, and callers deliberately do not await it: a checkout should
   not wait on, or fail because of, a push round-trip to Google. What changed
   underneath that contract is that the notification is now written down before
   the first try, so a failure is a row the retry sweep owns rather than a
   console line nobody owns. */
export const sendToParent = async (parent, title, body, data = {}) => {
  try {
    const row = await PushOutbox.create({
      parentId: parent._id,
      title,
      body,
      data,
      nextAttemptAt: new Date(),
      retryUntil: new Date(Date.now() + RETRY_WINDOW_MS),
      purgeAt: new Date(Date.now() + PURGE_AFTER_MS),
    });

    await attemptDelivery(row, parent);
  } catch (err) {
    console.error("❌ FCM Error:", err);
  }
};

/* The retry sweep. Claims due rows one at a time by pushing nextAttemptAt
   forward in the same atomic read — the same move completePurchase uses to
   claim an order — so two instances sweeping together cannot double-send;
   whichever claims the row re-schedules it before the other can see it, and
   attemptDelivery then overwrites that placeholder with the real outcome. */
const CLAIM_HOLD_MS = 5 * 60 * 1000;
const SWEEP_BATCH = 50;

export const deliverDuePushes = async () => {
  for (let i = 0; i < SWEEP_BATCH; i += 1) {
    let row;

    try {
      row = await PushOutbox.findOneAndUpdate(
        { status: "PENDING", nextAttemptAt: { $lte: new Date() } },
        { $set: { nextAttemptAt: new Date(Date.now() + CLAIM_HOLD_MS) } },
        { sort: { nextAttemptAt: 1 }, new: true }
      );
    } catch (err) {
      console.error("❌ Push sweep could not read the outbox:", err);
      return;
    }

    if (!row) return;

    try {
      const parent = await Parent.findById(row.parentId);
      await attemptDelivery(row, parent);
    } catch (err) {
      console.error("❌ Push retry failed:", err);
    }
  }
};

/* Runs when a parent registers a device, so anything still owed lands right
   then rather than on the next sweep. This is what makes a reinstall or a
   fresh sign-in the moment missed notifications arrive. Fire and forget for
   the same reason sendToParent is: registration must not wait on Google. */
export const flushQueuedPushes = async (parentId) => {
  try {
    const due = await PushOutbox.find({ parentId, status: "PENDING" })
      .sort({ createdAt: 1 })
      .limit(20);

    if (due.length === 0) return;

    const parent = await Parent.findById(parentId);

    for (const row of due) {
      await attemptDelivery(row, parent);
    }
  } catch (err) {
    console.error("❌ Could not flush queued pushes:", err);
  }
};

/* Started by server.js once the database is connected — deliberately not by
   app.js, which the tests mount and which owns nothing that ticks. unref() so
   a process that is done exiting does not stay alive to keep sweeping. */
let sweepTimer = null;

export const startPushRetrySweep = (intervalMs = 60 * 1000) => {
  if (sweepTimer) return sweepTimer;

  sweepTimer = setInterval(() => {
    deliverDuePushes();
  }, intervalMs);

  sweepTimer.unref();
  return sweepTimer;
};
