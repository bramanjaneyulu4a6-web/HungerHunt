// Sweeps unfinished payment intents and settles each against PhonePe's
// status API. This is the net under the webhook: a webhook that never
// arrived, a poll the parent closed the app before finishing, a process
// that died mid-apply — everything lands here and resolves the same way,
// through settlePaymentIntent, which is idempotent.
//
// Run it manually or from cron. It only touches intents older than
// STALE_MINUTES so it never races a payment that is genuinely in progress.
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import PaymentIntent from '../models/PaymentIntent.js';
import { settlePaymentIntent } from '../src/domain/payments/settlePaymentIntent.js';

const STALE_MINUTES = 5;
const BATCH_LIMIT = 500;

await connectForScript();

try {
  const cutoff = new Date(Date.now() - STALE_MINUTES * 60 * 1000);

  // APPLYING released to PENDING is the single most important line in this
  // file, not housekeeping. settlePaymentIntent refuses to touch a row that
  // is APPLYING — on purpose, so a genuinely in-flight apply is never double
  // run — which means the ONLY way an intent that crashed between the claim
  // and the final APPLIED write ever gets unstuck is this release. Skip or
  // "simplify away" this step and every such intent is stranded at APPLYING
  // forever: not retried by the webhook (which only ever moves PENDING),
  // not retried by the app poll, not retried by a later run of this script
  // either, since settle bails out on APPLYING before doing anything. The
  // STALE_MINUTES cutoff is what keeps this from racing a live apply: only
  // rows whose apply attempt started more than five minutes ago are assumed
  // dead, never one that is merely slow.
  const releasedApplying = await PaymentIntent.updateMany(
    { status: 'APPLYING', updatedAt: { $lt: cutoff } },
    { $set: { status: 'PENDING' } }
  );

  // A crash can also strand an intent at CREATED — between PhonePe
  // accepting the order and this process writing PENDING — and PhonePe may
  // have gone on to actually complete that payment. settlePaymentIntent's
  // final claim before applying is `findOneAndUpdate({_id, status:
  // 'PENDING'}, ...)`: a CREATED row can never win that claim, so without
  // this normalisation a stale CREATED intent would sit forever, correctly
  // read from PhonePe as COMPLETED on every sweep, and never once be
  // allowed to apply. Normalising it to PENDING first — the same move as
  // the APPLYING release above — is what lets it reach settle at all.
  const releasedCreated = await PaymentIntent.updateMany(
    { status: 'CREATED', updatedAt: { $lt: cutoff } },
    { $set: { status: 'PENDING' } }
  );

  const openFilter = {
    status: { $in: ['CREATED', 'PENDING'] },
    updatedAt: { $lt: cutoff },
  };

  // Counted before the capped fetch so a run that hits BATCH_LIMIT can say
  // plainly what it left behind, instead of quietly under-reporting.
  const totalOpen = await PaymentIntent.countDocuments(openFilter);

  const open = await PaymentIntent.find(openFilter)
    .sort({ updatedAt: 1 })
    .limit(BATCH_LIMIT);

  let moved = 0;
  const failures = [];

  for (const intent of open) {
    try {
      const before = intent.status;
      const after = await settlePaymentIntent(intent._id);
      if (after && after.status !== before) moved += 1;
    } catch (err) {
      failures.push({
        id: String(intent._id),
        merchantOrderId: intent.merchantOrderId,
        purpose: intent.purpose,
        status: intent.status,
        error: err.message,
      });
    }
  }

  const mismatches = await PaymentIntent.countDocuments({ status: 'AMOUNT_MISMATCH' });

  console.log('─'.repeat(66));
  console.log('Reconcile payment intents');
  console.log('─'.repeat(66));
  console.log(`Released ${releasedApplying.modifiedCount} stale APPLYING claim(s) back to PENDING.`);
  console.log(`Released ${releasedCreated.modifiedCount} stale CREATED intent(s) to PENDING.`);
  console.log(`Checked ${open.length} open intent(s); ${moved} changed state.`);

  if (totalOpen > open.length) {
    const remaining = totalOpen - open.length;
    console.log(
      `NOTE: ${totalOpen} intent(s) were eligible; BATCH_LIMIT=${BATCH_LIMIT} capped this run. ` +
      `${remaining} left unprocessed and will be picked up on the next run.`
    );
  }

  if (failures.length) {
    console.log(`FAILED: ${failures.length} intent(s) threw while settling. Each may need a human if it recurs across runs:`);
    for (const f of failures) {
      console.log(`  ${f.id} (merchantOrderId=${f.merchantOrderId}, purpose=${f.purpose}, status=${f.status}): ${f.error}`);
    }
  } else {
    console.log('Failed: 0');
  }

  // AMOUNT_MISMATCH is a queue for a person, not a retryable error: this
  // count is not "how many failed" above, it is the standing backlog of
  // every intent (from any run) still waiting on a human decision.
  if (mismatches) {
    console.log('─'.repeat(66));
    console.log(`ATTENTION: ${mismatches} AMOUNT_MISMATCH intent(s) need a human to review and resolve.`);
    console.log('─'.repeat(66));
  } else {
    console.log(`AMOUNT_MISMATCH backlog: 0`);
  }

  if (failures.length || mismatches) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
