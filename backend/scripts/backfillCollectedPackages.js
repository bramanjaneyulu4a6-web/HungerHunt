/* Closes the packages that were delivered under the old rule.
 *
 * Until this deploy, DELIVERED meant a caretaker had pressed "received" — one
 * button that closed every package at their hostel at once. It now means the
 * warehouse handed the package over at the hostel door, and the package is
 * finished only when its student types their purchase code for it.
 *
 * So every DELIVERED row written before the cutover is ambiguous: the students
 * have long since eaten the food, but the new caretaker screen would show all
 * of them as waiting to be handed over, and would ask children to type a code
 * for a package they collected weeks ago. This marks that history COLLECTED
 * instead, timestamped from the delivery that was recorded at the time.
 *
 * There is no actor to name for those collections, and none is invented: the
 * trail gets an entry that says the transition came from this migration and
 * not from a code anyone typed, and collectedBy stays empty for exactly the
 * same reason. A reader of an old package must be able to tell that it was
 * closed by a rule change.
 *
 *   npm run backfill:collected-packages                    # preview local
 *   npm run backfill:collected-packages -- --prod          # preview production
 *   npm run backfill:collected-packages -- --prod --apply  # write
 *
 * Anything delivered after --since is left alone, which is what makes this
 * safe to run late: pass the deploy time and packages genuinely waiting for
 * their students are untouched.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const sinceArg = args.find((value) => value.startsWith('--since='));
const since = sinceArg ? new Date(sinceArg.slice('--since='.length)) : null;

if (since && Number.isNaN(since.getTime())) {
  throw new Error('--since must be a date, for example --since=2026-08-22T00:00:00Z');
}

await connectForScript();

try {
  const filter = {
    status: OrderStatus.DELIVERED,
    ...(since ? { deliveredAt: { $lt: since } } : {}),
  };

  const stale = await FulfillmentOrder.find(filter)
    .select('_id studentSnapshot.name studentSnapshot.hostelNumber deliveredAt')
    .sort({ deliveredAt: 1 })
    .lean();

  if (!stale.length) {
    console.log('No delivered packages are waiting to be closed.');
  } else {
    const first = stale[0].deliveredAt;
    const last = stale[stale.length - 1].deliveredAt;
    console.log(
      `${stale.length} delivered package(s) to close` +
        (first ? `, delivered between ${new Date(first).toISOString()} and ${new Date(last).toISOString()}` : '') +
        (since ? ` (only those delivered before ${since.toISOString()})` : '')
    );
    for (const order of stale.slice(0, 10)) {
      console.log(
        `  ${order.studentSnapshot?.name || 'Unknown student'}` +
          ` — hostel ${order.studentSnapshot?.hostelNumber || '?'}` +
          ` — delivered ${order.deliveredAt ? new Date(order.deliveredAt).toISOString() : 'at an unrecorded time'}`
      );
    }
    if (stale.length > 10) console.log(`  … and ${stale.length - 10} more`);
  }

  if (!apply) {
    if (stale.length) console.log('\nPreview only. Re-run with --apply to write.');
    process.exit(0);
  }

  let closed = 0;

  /* One package at a time, because each one's collection time is its own
     delivery time. A bulk update would have to invent a single timestamp for
     all of them, and a fleet of packages all collected at the same instant is
     a worse record than a slow migration. */
  for (const order of stale) {
    const at = order.deliveredAt ? new Date(order.deliveredAt) : new Date();
    const result = await FulfillmentOrder.updateOne(
      { _id: order._id, status: OrderStatus.DELIVERED },
      {
        $set: { status: OrderStatus.COLLECTED, collectedAt: at },
        $push: {
          transitions: {
            from: OrderStatus.DELIVERED,
            to: OrderStatus.COLLECTED,
            at,
            note: 'Closed by the collection migration — no code was typed for this package.',
          },
        },
      }
    );
    closed += result.modifiedCount;
  }

  console.log(`Closed ${closed} package(s) as COLLECTED.`);
} finally {
  await mongoose.disconnect();
}
