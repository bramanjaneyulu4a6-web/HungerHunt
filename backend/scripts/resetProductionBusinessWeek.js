/* Start the current production business week over without rewriting history.
 * The deployed backend must include OrderingSettings.weeklyResetAt support
 * before this is applied.
 *
 *   node scripts/resetProductionBusinessWeek.js --prod
 *   node scripts/resetProductionBusinessWeek.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import OrderingSettings from '../models/OrderingSettings.js';
import { businessPeriodStart } from '../utils/businessTime.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const ACTOR_EMAIL = 'dhruv.kamma04@gmail.com';
const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This weekly reset is production-only. Pass --prod.');

  const [current, actor] = await Promise.all([
    OrderingSettings.findOne({ key: 'ordering' }).lean(),
    Admin.findOne({ email: ACTOR_EMAIL, active: { $ne: false } }).select('_id email').lean(),
  ]);
  if (!actor) throw new Error(`Active reset actor not found: ${ACTOR_EMAIL}.`);

  const now = new Date();
  const naturalStart = businessPeriodStart('WEEKLY', now);
  console.log(JSON.stringify({
    actor: actor.email,
    naturalWeekStart: naturalStart,
    previousResetAt: current?.weeklyResetAt ?? null,
    proposedResetAt: now,
    effects: [
      'one-order-per-week usage restarts',
      'weekly wallet-spending usage restarts',
      'weekly product, category and subcategory usage restarts',
      'existing orders, transactions and timestamps remain unchanged',
      'active pending or in-progress orders still block a second concurrent order',
    ],
  }, null, 2));

  if (!apply) {
    console.log('\nPreview only. Deploy weeklyResetAt support, then re-run with --apply.');
    process.exitCode = 2;
  } else {
    const resetAt = new Date();
    const updated = await OrderingSettings.findOneAndUpdate(
      { key: 'ordering' },
      { $set: { weeklyResetAt: resetAt, updatedBy: actor._id } },
      { upsert: true, new: true, setDefaultsOnInsert: true, runValidators: true }
    ).lean();
    console.log(`\nProduction business week restarted at ${updated.weeklyResetAt.toISOString()}.`);
  }
} finally {
  await mongoose.disconnect();
}
