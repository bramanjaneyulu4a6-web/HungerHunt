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
import {
  AGE_OUT_DAYS,
  shouldAgeOut,
  unknownProviderStateFilter,
} from '../src/domain/payments/reconcilePolicy.js';

const STALE_MINUTES = 5;
const BATCH_LIMIT = 500;

await connectForScript();

/* Which PhonePe this sweep is about to ask. Printed beside the database
   banner because the failure it catches is silent and destructive: pointed at
   a different gateway than the one that created these orders, every status
   read comes back order-not-found, and shouldAgeOut cannot tell that from an
   order PhonePe genuinely never registered — so intents that are perfectly
   healthy age out. This line and the web service's PHONEPE_ENV must agree. */
console.log(`PhonePe gateway: ${process.env.PHONEPE_ENV || 'sandbox (unset)'}`);

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
  const agedOut = [];

  for (const intent of open) {
    try {
      const before = intent.status;
      const after = await settlePaymentIntent(intent._id);
      if (after && after.status !== before) moved += 1;
    } catch (err) {
      // A row PhonePe has answered "no such order" about since before the
      // age-out horizon will answer the same way forever: its order was
      // never registered (a crash before the create call landed, or a
      // rejected create), so no checkout ever existed for money to be
      // captured against. Left alone it fails identically every night —
      // exit code 2 forever, the same lines in every report, and genuinely
      // new failures buried under it. Retire it with its reason attached;
      // everything genuinely retryable (network, 5xx, token trouble)
      // carries no statusCode and keeps looping. See reconcilePolicy.js
      // for why AGE_OUT_DAYS is what it is.
      if (shouldAgeOut(intent, err)) {
        await PaymentIntent.updateOne(
          { _id: intent._id, status: { $in: ['CREATED', 'PENDING'] } },
          {
            $set: {
              status: 'FAILED',
              // Sliced to the schema's 500-char cap so a long provider
              // message can never turn the retirement write into a
              // validation error that resurrects the loop this exists to end.
              failureReason: (
                `Aged out by reconcile: provider has reported no such order since creation, ` +
                `${AGE_OUT_DAYS}+ days ago (${err.message})`
              ).slice(0, 500),
            },
          }
        );
        agedOut.push({
          id: String(intent._id),
          merchantOrderId: intent.merchantOrderId,
          purpose: intent.purpose,
          createdAt: intent.createdAt?.toISOString?.() ?? String(intent.createdAt),
          error: err.message,
        });
        continue;
      }

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

  // Open intents parked on a provider state settle does not recognise: settle
  // deliberately leaves these non-terminal (a false FAILED is how captured
  // money would vanish silently — see the unknown-state branch there), which
  // makes this count the ONLY place an operator hears about them.
  const unknownStates = await PaymentIntent.countDocuments(unknownProviderStateFilter());

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

  if (agedOut.length) {
    console.log(
      `Aged out: ${agedOut.length} intent(s) marked FAILED — PhonePe has reported no such order ` +
      `since they were created, ${AGE_OUT_DAYS}+ days ago. No order ever existed to capture money against:`
    );
    for (const a of agedOut) {
      console.log(`  ${a.id} (merchantOrderId=${a.merchantOrderId}, purpose=${a.purpose}, createdAt=${a.createdAt}): ${a.error}`);
    }
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

  // The same kind of queue: settle refuses to guess about a provider state
  // it does not recognise (paying on one could double-move money; failing on
  // one could silently strand it), so these rows sit open, re-checked every
  // run, until a person reads what PhonePe actually said. failureReason on
  // each row carries the verbatim state.
  if (unknownStates) {
    console.log('─'.repeat(66));
    console.log(
      `ATTENTION: ${unknownStates} open intent(s) report a provider state this code does not ` +
      `recognise. They stay open and re-checked each run; a human should read their failureReason.`
    );
    console.log('─'.repeat(66));
  } else {
    console.log('Unrecognised provider states: 0');
  }

  // Aged-out rows deliberately do NOT set the failure exit code: retiring
  // them (with the reason on the row and a line in this report) is this
  // script succeeding at keeping the report meaningful, not failing.
  if (failures.length || mismatches || unknownStates) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
