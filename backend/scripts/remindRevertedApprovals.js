/* Reminds parents about approval requests raised by revertConfirmedToParentApproval.js
 * that they have not yet answered, every few hours until a cutoff time.
 *
 * The requests are the ones that run raised on --date (IST): each is a fresh
 * PendingOrder for a student whose package was refunded under a
 * revert-to-approval reversal, raised by the same member of staff. The set is
 * fixed when the script starts, and every pass re-reads each request, so a
 * parent who answers is never reminded again.
 *
 *   node scripts/remindRevertedApprovals.js --date=2026-09-23 --prod            # preview one pass
 *   node scripts/remindRevertedApprovals.js --date=2026-09-23 --prod --apply \
 *       --every=120 --until=17:00                                               # remind until 5 pm IST
 *
 * The process stays alive between passes, so run it where it can keep running
 * (nohup), and keep the machine awake until the cutoff.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Parent from '../models/Parent.js';
import PendingOrder from '../models/PendingOrder.js';
import PushOutbox from '../models/PushOutbox.js';
import Student from '../models/Student.js';
import WalletReversal from '../models/WalletReversal.js';
import { businessDateStart } from '../utils/businessTime.js';
import { cutoffOn, nextPassAt, reminderMessage, reminderPlan } from '../utils/approvalReminders.js';
import { sendToParent } from '../utils/sendNotification.js';

const argv = process.argv.slice(2);
const option = (name) => {
  const prefixed = argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1).trim() : undefined;
};

const apply = argv.includes('--apply');
const date = option('--date');
const everyMinutes = Number(option('--every') ?? 120);
const until = option('--until') ?? '17:00';

const KEY_PREFIX = 'revert-to-approval:';
const DAY_MS = 24 * 60 * 60 * 1000;

const stamp = () => new Date().toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false });
const sleepUntil = (when) => new Promise((resolve) => setTimeout(resolve, Math.max(0, when - Date.now())));

const selectRequestIds = async () => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date ?? '')) {
    throw new Error('--date=YYYY-MM-DD (the IST day the revert run happened) is required.');
  }

  const dayStart = businessDateStart(date);
  const dayEnd = new Date(dayStart.getTime() + DAY_MS);

  const reversals = await WalletReversal.find({
    idempotencyKey: { $regex: `^${KEY_PREFIX}` },
    createdAt: { $gte: dayStart, $lt: dayEnd },
  }).select('studentId performedBy createdAt');

  const ids = new Set();

  for (const reversal of reversals) {
    const request = await PendingOrder.findOne({
      studentId: reversal.studentId,
      raisedBy: reversal.performedBy,
      createdAt: { $gte: reversal.createdAt, $lt: dayEnd },
    })
      .sort({ createdAt: 1 })
      .select('_id');

    if (request) ids.add(request._id.toString());
  }

  return { reversals: reversals.length, ids: [...ids] };
};

/* A queued push about a request that has been answered would reach the parent
   the moment they register a device, asking them to approve something already
   settled. Retired instead, with the reason on the row. */
const retireQueued = (orderId, reason) =>
  PushOutbox.updateMany(
    { status: 'PENDING', 'data.orderId': orderId, deliveredTokens: { $size: 0 } },
    { $set: { status: 'GAVE_UP', lastError: `not delivered: ${reason}` } }
  );

const pass = async (ids) => {
  const now = new Date();
  const stillOpen = [];
  const tally = { SEND: 0, SKIP: 0, DONE: 0 };

  for (const id of ids) {
    const request = await PendingOrder.findById(id);
    const student = request ? await Student.findById(request.studentId) : null;
    const parent = request ? await Parent.findById(request.parentId) : null;

    // Only a push still inside its delivery window counts as waiting. One past
    // it is on its way to GAVE_UP and is superseded by the reminder below.
    const queuedReminder = request
      ? await PushOutbox.findOne({
          parentId: request.parentId,
          status: 'PENDING',
          'data.orderId': id,
          deliveredTokens: { $size: 0 },
          retryUntil: { $gt: now },
        }).select('_id')
      : null;

    const plan = reminderPlan({ request, now, queuedReminder });
    const devices = (parent?.pushTokens?.length ?? 0) + (parent?.fcmToken ? 1 : 0);
    const label = `${student?.name ?? id} (${student?.roomNumber ?? '—'})`;

    tally[plan.action] += 1;

    if (plan.action === 'DONE') {
      console.log(`  done     ${label} — ${plan.reason}`);
      if (apply) await retireQueued(id, plan.reason);
      continue;
    }

    stillOpen.push(id);

    if (plan.action === 'SKIP') {
      console.log(`  waiting  ${label} — ${plan.reason}`);
      continue;
    }

    if (!student || !parent) {
      console.log(`  ✖        ${label} — ${!student ? 'student' : 'parent'} record missing, not reminded`);
      continue;
    }

    const where = devices ? `${devices} device(s)` : 'no device yet, queued for 24h';

    if (!apply) {
      console.log(`  would    ${label} — parent ${parent.phone}, ${where}`);
      continue;
    }

    const { title, body } = reminderMessage({ student, totalAmount: request.totalAmount });

    // Otherwise a device registering later would receive the stale push and
    // this reminder back to back.
    await retireQueued(id, 'superseded by a newer reminder');

    await sendToParent(parent, title, body, {
      type: 'PENDING_ORDER',
      orderId: id,
      studentId: student._id.toString(),
      reminder: 'true',
    });

    console.log(`  reminded ${label} — parent ${parent.phone}, ${where}`);
  }

  console.log(
    `  → ${tally.SEND} ${apply ? 'reminded' : 'to remind'}, ${tally.SKIP} already waiting, ${tally.DONE} finished`
  );

  return stillOpen;
};

const run = async () => {
  if (!Number.isFinite(everyMinutes) || everyMinutes < 15) {
    throw new Error('--every must be a number of minutes, at least 15.');
  }

  await connectForScript();

  const cutoff = cutoffOn(new Date(), until);
  const { reversals, ids } = await selectRequestIds();

  console.log(`${reversals} revert-to-approval refund(s) on ${date}; ${ids.length} request(s) raised by that run.`);
  console.log(`Reminding every ${everyMinutes} min until ${until} IST.${apply ? '' : ' PREVIEW — nothing is sent.'}\n`);

  let open = ids;

  for (;;) {
    console.log(`[${stamp()} IST] pass over ${open.length} request(s)`);
    open = await pass(open);

    if (!apply) {
      console.log('\nPreview only. Re-run with --apply to send.');
      return;
    }

    if (!open.length) {
      console.log('\nEvery request has been answered or has expired. Stopping.');
      return;
    }

    const next = nextPassAt({ now: new Date(), everyMinutes, cutoff });

    if (!next) {
      console.log(`\nThe next pass would fall after ${until} IST. Stopping with ${open.length} still open.`);
      return;
    }

    console.log(`  next pass at ${next.toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour12: false })} IST\n`);
    await sleepUntil(next);
  }
};

try {
  await run();
} finally {
  await mongoose.disconnect();
}
