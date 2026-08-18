import mongoose from 'mongoose';

// One row per notification a parent is owed, written before the first send is
// attempted. Before this, a push that failed vanished into a console line:
// checkout fired it without awaiting — rightly, the sale must not wait on
// Google — but nothing remembered that it never went out. A Firebase outage or
// an expired credential meant parents silently stopped hearing about their
// children's money until somebody read the logs.
//
// The row is the memory. It outlives the request that created it, a crash, and
// a restart, for the same reason PurchaseAuthorization lives in Mongo rather
// than a Map: any instance sharing the database can finish the job.
const pushOutboxSchema = new mongoose.Schema(
  {
    parentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Parent',
      required: true,
      index: true,
    },

    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Object, default: {} },

    // PENDING rows are owed and will be retried; SENT means FCM accepted the
    // message for every device the parent had (acceptance is as far as a
    // server can see — FCM does not report the phone actually drawing it);
    // GAVE_UP is the honest record that retries ran out.
    status: {
      type: String,
      enum: ['PENDING', 'SENT', 'GAVE_UP'],
      default: 'PENDING',
      index: true,
    },

    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, required: true },

    // Devices FCM has already accepted this message for, so a retry finishes
    // the job instead of repeating it — the phone that got the alert the first
    // time must not get it again because the browser was unreachable.
    deliveredTokens: { type: [String], default: [] },

    lastError: String,

    // Past this, the notification is stale enough that delivering it would be
    // noise, and the next sweep marks it GAVE_UP instead of retrying.
    retryUntil: { type: Date, required: true },

    // Mongo's TTL sweep removes the row itself well after it stops mattering,
    // so SENT and GAVE_UP rows stay readable long enough to debug a complaint
    // ("I never got the alert") but do not accumulate forever.
    purgeAt: { type: Date, required: true },
  },
  { timestamps: true }
);

pushOutboxSchema.index({ status: 1, nextAttemptAt: 1 });
pushOutboxSchema.index({ purgeAt: 1 }, { expireAfterSeconds: 0 });

export default mongoose.model('PushOutbox', pushOutboxSchema);
