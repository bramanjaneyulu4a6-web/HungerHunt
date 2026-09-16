/* Sets up the showroom family — the parent account a visitor is handed at an
 * open day so they can drive the parent app themselves.
 *
 * Unlike the kiosk's DEMO01, this account's orders are real rows: a real
 * transaction, a real package, a real wallet debit, a real walk through the
 * warehouse state machine. That is what makes the demonstration worth
 * anything. What keeps it from silting up is that each package deletes
 * everything it created the moment it is collected, and seeds the next basket
 * in the rotation — see utils/demoParentReset.js.
 *
 * This script only prepares the data. The account is not a demo account until
 * its phone is named in DEMO_PARENT_PHONES on the server, and nothing here can
 * do that: a variable is not writable by anything that writes parents, which
 * is the whole reason the switch lives there. The summary at the end says so.
 *
 * Preview by default, like student:demo — it writes only with --apply.
 *
 *   npm run parent:demo
 *   npm run parent:demo -- --prod --apply
 *   npm run parent:demo -- --prod --apply --reset   (clear and start over)
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Parent from '../models/Parent.js';
import Student from '../models/Student.js';
import Product from '../models/Product.js';
import Transaction from '../models/Transaction.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import PendingOrder, { pendingOrderExpiry } from '../models/PendingOrder.js';
import { buildDemoBaskets } from '../utils/demoBaskets.js';
import { DEMO_OPENING_BALANCE, demoParentPhones } from '../config/demoAccess.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const reset = args.includes('--reset');
const force = args.includes('--force');
const valueOf = (flag, fallback = null) => {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : args[at + 1];
};

const phone = String(valueOf('--phone', '7995601391')).trim();
/* Defaults to the same constant the reset writes, so the account a visitor
   first meets and the account every later visitor meets are the same account.
   A --balance that differed would last exactly until the first collection. */
const balance = Number(valueOf('--balance', String(DEMO_OPENING_BALANCE)));

if (!/^\d{10}$/.test(phone)) {
  throw new Error(`--phone must be a ten-digit number. Got "${phone}".`);
}
if (!Number.isFinite(balance) || balance <= 0) {
  throw new Error('--balance must be a positive number. A demo with an empty wallet buys nothing.');
}

await connectForScript();

try {
  const parent = await Parent.findOne({ phone })
    .select('name fatherName phone studentIds active activationRequired')
    .lean();

  if (!parent) {
    throw new Error(
      `No parent account on ${phone}. This script prepares an existing account rather than` +
        ' inventing a family; create the parent and child first, then re-run.'
    );
  }

  const students = await Student.find({ parentPhoneNumber: phone })
    .select('name admissionNumber roomNumber pocketMoney active demoAccount requiresParentApproval')
    .sort({ admissionNumber: 1 })
    .lean();

  if (students.length === 0) {
    throw new Error(`No student carries parentPhoneNumber ${phone}. There is nobody to order for.`);
  }

  const child = students[0];

  /* The kiosk's demo flag and this one are different animals and must not meet.
     chargeCart and createPendingOrder refuse a demoAccount student outright, so
     a child carrying it could never place the order this demo is built around —
     it would fail at approval with a message about demo accounts, which reads
     like a bug rather than a misconfiguration. */
  if (child.demoAccount === true) {
    throw new Error(
      `${child.admissionNumber} is a kiosk demo account (demoAccount: true). Its orders are` +
        ' refused before they are charged, so it cannot be the showroom parent\'s child.'
    );
  }

  /* The guard that matters. Everything below prepares an account whose orders
     will later delete themselves, wallet and all. Run against a real family by
     a mistyped number, that is their purchase history quietly erasing itself. */
  const realHistory = await Transaction.countDocuments({
    studentId: { $in: students.map((s) => s._id) },
  });

  if (realHistory > 0 && !force) {
    throw new Error(
      `${phone} has ${realHistory} transaction(s) against its children. A demo account's orders` +
        ' delete themselves, so this refuses to touch an account with real history.' +
        ' Check the number. Pass --force only if you are certain this is a test account.'
    );
  }

  const catalogue = await Product.find({ active: { $ne: false }, kioskVisible: { $ne: false } })
    .select('name price')
    .lean();
  const baskets = buildDemoBaskets(catalogue);

  if (baskets.length === 0) {
    throw new Error('The kiosk catalogue has too few products to build a demo basket from.');
  }

  const openRequests = await PendingOrder.countDocuments({
    studentId: child._id,
    status: { $in: ['PENDING', 'PROCESSING'] },
  });
  const packages = await FulfillmentOrder.countDocuments({ studentId: child._id });

  console.log(`\nShowroom parent  ${parent.fatherName || parent.name || '(unnamed)'}  ${phone}`);
  console.log(`  child          ${child.name} (${child.admissionNumber}), room ${child.roomNumber}`);
  console.log(`  wallet         Rs.${child.pocketMoney} -> Rs.${balance}`);
  console.log(`  approval       ${child.requiresParentApproval ? 'already required' : 'will be switched on'}`);
  console.log(
    `  parent login   ${
      parent.active !== false && parent.activationRequired !== true
        ? 'already usable'
        : 'blocked — will be opened up'
    }`
  );
  console.log(`  open request   ${openRequests > 0 ? `${openRequests} (left alone)` : 'none — one will be seeded'}`);
  console.log(`  packages       ${packages}${reset ? ' (will be cleared)' : ''}`);

  console.log(`\n  the rotation, ${baskets.length} baskets from the live catalogue:`);
  baskets.forEach((basket, index) => {
    const lines = basket.items.map((i) => `${i.name} x${i.quantity}`).join(', ');
    console.log(`    ${index + 1}. Rs.${String(basket.totalAmount).padEnd(5)} ${lines}`);
  });

  const declared = demoParentPhones().has(phone);
  console.log(
    `\n  DEMO_PARENT_PHONES  ${declared ? 'declares this number' : 'DOES NOT declare this number'}`
  );

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write.');
    process.exitCode = 2;
  } else {
    if (reset) {
      const ids = students.map((s) => s._id);
      const orders = await FulfillmentOrder.find({ studentId: { $in: ids } }).select('transactionId').lean();

      await FulfillmentOrder.deleteMany({ studentId: { $in: ids } });
      await Transaction.deleteMany({ _id: { $in: orders.map((o) => o.transactionId).filter(Boolean) } });
      await PendingOrder.deleteMany({ studentId: { $in: ids } });
      console.log(`\nCleared ${orders.length} package(s) and every open request.`);
    }

    /* protectParent refuses an inactive parent or one still awaiting
       activation, so a demo account left either way cannot log in at all —
       which looks like a broken app rather than a parent that was never
       switched on. */
    await Parent.updateOne(
      { _id: parent._id },
      { $set: { active: true, activationRequired: false } }
    );

    await Student.updateOne(
      { _id: child._id },
      {
        $set: {
          pocketMoney: balance,
          // The parent must be the one who pays, or there is no wallet step to
          // demonstrate — the kiosk would simply charge the child and be done.
          requiresParentApproval: true,
          'walletControl.enabled': false,
          active: true,
        },
      }
    );

    const stillOpen = await PendingOrder.countDocuments({
      studentId: child._id,
      status: { $in: ['PENDING', 'PROCESSING'] },
    });

    /* One at a time: one_pending_order_per_student is a unique index, so
       seeding a second would throw rather than queue. The rotation is what
       delivers the other four, as each package is collected. */
    if (stillOpen === 0) {
      await PendingOrder.create({
        studentId: child._id,
        parentId: parent._id,
        items: baskets[0].items,
        totalAmount: baskets[0].totalAmount,
        status: 'PENDING',
        expiresAt: pendingOrderExpiry(),
      });
      console.log('Seeded the first basket, waiting for the parent to approve.');
    } else {
      console.log('A request is already open; left as it is.');
    }

    const written = await Student.findById(child._id).select('pocketMoney requiresParentApproval').lean();
    const parentNow = await Parent.findById(parent._id).select('active activationRequired').lean();

    if (written?.requiresParentApproval !== true) {
      throw new Error('requiresParentApproval did not stick — the parent would never be asked to pay.');
    }
    if (parentNow?.active === false || parentNow?.activationRequired === true) {
      throw new Error('The parent account is still blocked from signing in.');
    }

    console.log(`\nApplied. ${child.name} has Rs.${written.pocketMoney} and asks a parent to approve.`);

    if (!declared) {
      console.log(
        `\nNot a demo account yet. Add ${phone} to DEMO_PARENT_PHONES on both Render services` +
          ' and redeploy, or its orders will behave like any real family\'s: stock will be taken' +
          ' and nothing will reset.'
      );
    }
  }
} finally {
  await mongoose.disconnect();
}
