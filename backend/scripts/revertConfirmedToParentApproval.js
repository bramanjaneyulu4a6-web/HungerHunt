/* Sends confirmed packages back to their parents for approval, and returns
 * the money that was taken for them.
 *
 * These packages were rung up and charged while parent approval was switched
 * off for their students. Approval is now on, so the charges should never have
 * happened: the families paid for baskets they were never asked about. This
 * undoes each one and puts it back in front of the parent as a request they
 * can approve or decline.
 *
 * Per package, in this order:
 *
 *   1. the package is cancelled and refunded through the app's own
 *      cancel-and-refund path (utils/refunds.js) — the wallet is credited,
 *      the stock goes back on the shelf, and a numbered WalletReversal is
 *      written into the student's receipt series;
 *   2. a fresh approval request is raised, showing the parent the same basket
 *      at the same prices it was charged at;
 *   3. the parent is pushed "Approval needed".
 *
 * Refund first, raise second, deliberately. If the run dies between the two,
 * the family has their money back and no request — recoverable, and the right
 * way round. The reverse would leave a request standing beside a charge that
 * was never undone. Re-run with --resume to raise whatever was left unraised.
 *
 * A fresh request rather than the old one revived: most of these packages have
 * no request behind them at all, having been bought at the kiosk with a code.
 * Where one does exist, reusing it would break the parent's approval later —
 * Transaction carries a unique index on (sourceType, sourceId), so a second
 * charge against the same request cannot be written.
 *
 *   npm run orders:revert-to-approval                                    # preview local
 *   npm run orders:revert-to-approval -- --prod                          # preview production
 *   npm run orders:revert-to-approval -- --prod --apply --expect=41 \
 *       --actor=admin@example.com                                        # write
 *   npm run orders:revert-to-approval -- --prod --apply --expect=41 \
 *       --actor=admin@example.com --resume                               # raise what was missed
 *
 * --skip-approved leaves alone any package a parent or caretaker actually
 * approved, correcting only the charges nobody was asked about. Those packages
 * stay confirmed and go on to be packed and delivered as normal.
 *
 * --expect is required with --apply and is checked against the number of
 * confirmed packages found. If the count has moved since you counted them,
 * nothing is written and the run says so — the one guard between a miscounted
 * selection and forty-one wrongly refunded wallets.
 *
 * --actor names the member of staff the cancellations are recorded against;
 * every reversal carries their name in the ledger. Resume with the SAME actor:
 * the refund's replay guard is keyed on staff member and package together, so
 * a different one would be treated as a fresh request rather than a repeat.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Admin, { FULL_ADMIN } from '../models/Admin.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Parent from '../models/Parent.js';
import PendingOrder, { pendingOrderExpiry } from '../models/PendingOrder.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import WalletReversal from '../models/WalletReversal.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { cancelAndRefundFulfillment } from '../utils/refunds.js';
import { sendToParent } from '../utils/sendNotification.js';
import { approvalItemsFrom, expectationProblem, planPackages } from '../utils/revertToApproval.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const prefixed = argv.find((arg) => arg.startsWith(`${name}=`));
  return prefixed ? prefixed.slice(name.length + 1).trim() : undefined;
};

const apply = flag('--apply');
const resume = flag('--resume');
const skipApproved = flag('--skip-approved');
const actorRef = option('--actor');
const expected = option('--expect');

// Recorded on every cancellation, and read months later by whoever wonders why
// forty-one packages died at once. Inside WalletReversal's 200-character cap.
const REASON = 'Charged before parent approval was switched on; returned to the parent to approve.';

// Keyed on the package so a second run replays the same refund rather than
// writing a second one. See utils/refunds.js, which looks this up before it
// touches a wallet.
const idempotencyKeyFor = (orderId) => `revert-to-approval:${orderId}`;
const KEY_PREFIX = 'revert-to-approval:';

const rupees = (amount) => `₹${Number(amount ?? 0).toLocaleString('en-IN')}`;

/* Resolved by whichever of the two an admin is likelier to have to hand. Full
   admins only: a caretaker or storeroom account has no business holding the
   ledger entry for forty-one refunds. */
const resolveActor = async (reference) => {
  if (!reference) {
    throw new Error('--apply needs --actor=<admin email or phone>. Nothing was written.');
  }

  const actor = await Admin.findOne({
    ...FULL_ADMIN,
    $or: [{ email: reference.toLowerCase() }, { phone: reference }],
  });

  if (!actor) {
    throw new Error(`No full admin account matches ${reference}. Nothing was written.`);
  }

  return actor;
};

/* A student may hold one open request at a time — PendingOrder enforces it
   with a unique index — so this is asked immediately before each request is
   raised rather than once up front. Two of the packages in a single run can
   belong to the same student, and the second must see the first. */
const hasLiveRequest = async (studentId) =>
  Boolean(await PendingOrder.exists({ studentId, status: { $in: ['PENDING', 'PROCESSING'] } }));

const raiseRequest = async ({ student, parent, items, totalAmount, actor }) => {
  const request = await PendingOrder.create({
    studentId: student._id,
    parentId: parent._id,
    items,
    totalAmount,
    expiresAt: pendingOrderExpiry(),
    // Whoever ran this is who is asking the parent, which is what raisedBy
    // records. The kiosk sale that originally took the money is not the thing
    // being sent for approval; this request is.
    raisedBy: actor._id,
  });

  /* Worded as the counter words it, including the caretaker variant: a parent
     who handed approval to their room caretaker is told it is being looked
     after rather than asked to answer it themselves. */
  const caretakerReviews = Boolean(student.requiresParentApproval && student.caretakerMayApprove);

  // Awaited here, unlike at the counter — nobody is standing at a till waiting
  // on this run, and a push that fails is worth seeing in the log.
  await sendToParent(
    parent,
    caretakerReviews ? 'Order for the caretaker to review' : 'Approval needed',
    caretakerReviews
      ? `${student.name} wants to spend ${rupees(totalAmount)}. The room caretaker will review it. Tap to view.`
      : `${student.name} wants to spend ${rupees(totalAmount)}. Tap to review.`,
    {
      type: 'PENDING_ORDER',
      orderId: request._id.toString(),
      studentId: student._id.toString(),
    }
  );

  return request;
};

/* Everything knowable about one package before anything is written: the
   charge, the family, and whether a request is already open for them. The
   verdict itself is left to planPackages, which needs the whole run in order
   to see two packages belonging to one student. */
const examine = async (order) => {
  const [transaction, student] = await Promise.all([
    Transaction.findById(order.transactionId),
    Student.findById(order.studentId),
  ]);

  const parent = student ? await Parent.findOne({ studentIds: student._id }) : null;

  return {
    order,
    transaction,
    student,
    parent,
    hasLiveRequest: student ? await hasLiveRequest(student._id) : false,
  };
};

const describe = ({ order, transaction, student, plan }) => {
  const name = student?.name ?? order.studentSnapshot?.name ?? 'unknown student';
  const room = order.studentSnapshot?.roomNumber ?? '—';
  const funding = transaction?.sourceType ?? 'no charge';

  return `  ${plan.action.padEnd(12)} ${name} (${room})  ${rupees(order.totalAmount)}  ${funding}`;
};

const run = async () => {
  await connectForScript();

  const actor = apply || resume ? await resolveActor(actorRef) : null;

  if (actor) console.log(`Cancellations will be recorded against ${actor.name}.\n`);

  if (resume) return runResume(actor);

  const orders = await FulfillmentOrder.find({ status: OrderStatus.PENDING }).sort({ orderedAt: 1 });

  console.log(`${orders.length} package(s) are confirmed and waiting to be packed.\n`);

  if (!orders.length) return;

  // Checked before anything is examined, so a run that cannot proceed says so
  // without first printing a roster that reads like a plan.
  const problem = apply ? expectationProblem({ found: orders.length, expected }) : null;

  if (problem) throw new Error(problem);

  /* Read one at a time rather than in parallel. Forty-one packages is a
     trivial amount of work, and this shares a shared-tier cluster with the
     live service — see the pool note in scripts/lib/connect.mjs. */
  const entries = [];

  for (const order of orders) entries.push(await examine(order));

  const examined = planPackages(entries, { skipApproved });

  for (const entry of examined) {
    console.log(describe(entry));

    if (entry.plan.reason) console.log(`               ↳ ${entry.plan.reason}`);

    for (const warning of entry.plan.warnings) console.log(`               ⚠ ${warning}`);
  }

  const counts = examined.reduce((tally, { plan }) => {
    tally[plan.action] = (tally[plan.action] ?? 0) + 1;
    return tally;
  }, {});

  const refundable = examined.filter(({ plan }) => plan.action !== 'SKIP');
  const refundTotal = refundable.reduce((sum, { order }) => sum + order.totalAmount, 0);

  console.log(
    `\n${counts.REVERT ?? 0} to revert, ${counts.REFUND_ONLY ?? 0} to refund without raising, ` +
      `${counts.SKIP ?? 0} left alone. ${rupees(refundTotal)} goes back to ${refundable.length} wallet(s).`
  );

  if (!apply) {
    console.log('\nPreview only. Nothing was written. Re-run with --apply to commit.');
    return;
  }

  console.log('');

  let reverted = 0;
  let refunded = 0;
  const failures = [];

  for (const { order, student, parent, plan } of examined) {
    if (plan.action === 'SKIP') continue;

    const label = `${student.name} (${order.studentSnapshot?.roomNumber ?? '—'})`;

    try {
      await cancelAndRefundFulfillment({
        orderId: order._id,
        actorId: actor._id,
        idempotencyKey: idempotencyKeyFor(order._id),
        reason: REASON,
      });
      refunded += 1;
    } catch (err) {
      failures.push(`${label}: the refund failed — ${err.message}`);
      continue;
    }

    if (plan.action === 'REFUND_ONLY') {
      console.log(`  refunded  ${label} — ${plan.reason}`);
      continue;
    }

    /* Asked again against the database rather than trusted from the preview.
       The examination ran before any of this was written, and the refund above
       is the first thing in the run that could have changed the answer. */
    if (await hasLiveRequest(student._id)) {
      console.log(`  refunded  ${label} — a request is already open, so none was raised`);
      continue;
    }

    try {
      await raiseRequest({
        student,
        parent,
        items: plan.items,
        totalAmount: order.totalAmount,
        actor,
      });
      reverted += 1;
      console.log(`  reverted  ${label} — ${rupees(order.totalAmount)} back, parent notified`);
    } catch (err) {
      failures.push(
        `${label}: refunded, but the request was NOT raised — ${err.message}. Re-run with --resume.`
      );
    }
  }

  console.log(
    `\nDone. ${refunded} package(s) refunded, ${reverted} request(s) raised and ${reverted} parent(s) notified.`
  );

  if (failures.length) {
    console.log(`\n${failures.length} need a second look:`);
    for (const failure of failures) console.log(`  ✖ ${failure}`);
    console.log('\nRe-run with --resume (same --actor) to raise any request that was missed.');
    process.exitCode = 1;
  }
};

/* Picks up where a broken run stopped.
 *
 * The packages this run touched are exactly the ones carrying one of its
 * reversals, so there is nothing to write down between runs and nothing to go
 * stale. A student who now holds an open request has been dealt with, whether
 * by this script or by their own kiosk since; anyone else is still owed the
 * request their refund was supposed to come with. */
const runResume = async (actor) => {
  const reversals = await WalletReversal.find({
    performedBy: actor._id,
    idempotencyKey: { $regex: `^${KEY_PREFIX}` },
  }).sort({ createdAt: 1 });

  console.log(`${reversals.length} package(s) were refunded by this script.\n`);

  let raised = 0;
  const failures = [];

  for (const reversal of reversals) {
    const student = await Student.findById(reversal.studentId);

    if (!student) {
      failures.push(`${reversal.studentId}: the student record is missing`);
      continue;
    }

    if (await hasLiveRequest(student._id)) continue;

    const parent = await Parent.findOne({ studentIds: student._id });

    if (!parent) {
      failures.push(`${student.name}: no parent is linked, so no request can be raised`);
      continue;
    }

    const transaction = await Transaction.findById(reversal.transactionId);
    const items = approvalItemsFrom(transaction);

    if (!items.length) {
      failures.push(`${student.name}: the original charge and its lines are gone`);
      continue;
    }

    if (!apply) {
      console.log(`  would raise  ${student.name} — ${rupees(reversal.amount)}`);
      raised += 1;
      continue;
    }

    try {
      await raiseRequest({ student, parent, items, totalAmount: reversal.amount, actor });
      raised += 1;
      console.log(`  raised  ${student.name} — ${rupees(reversal.amount)}, parent notified`);
    } catch (err) {
      failures.push(`${student.name}: ${err.message}`);
    }
  }

  console.log(
    apply
      ? `\nDone. ${raised} request(s) raised.`
      : `\n${raised} request(s) would be raised. Preview only — re-run with --apply to commit.`
  );

  if (failures.length) {
    console.log(`\n${failures.length} need a second look:`);
    for (const failure of failures) console.log(`  ✖ ${failure}`);
    process.exitCode = 1;
  }
};

try {
  await run();
} finally {
  await mongoose.disconnect();
}
