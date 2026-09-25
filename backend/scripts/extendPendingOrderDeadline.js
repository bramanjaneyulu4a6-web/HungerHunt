/* Ensures every open purchase request stays open at least until tomorrow
 * night, pushing forward any that would otherwise lapse sooner.
 *
 * Only PENDING and PROCESSING requests are touched — an already-answered
 * one has nothing left to extend. The target is a fixed instant (tomorrow's
 * 23:59:59 IST, by PendingOrder's own formula for "the school's business
 * day"), not an offset, so re-running this is harmless: a request already at
 * or past the target is left alone, however it got there.
 *
 * --student narrows to whichever request's student name contains it
 * (case-insensitive), for extending one family's deadline without touching
 * the rest that happen to lapse the same night.
 *
 *   npm run orders:extend-deadline                                # preview local
 *   npm run orders:extend-deadline -- --prod                       # preview production
 *   npm run orders:extend-deadline -- --prod --student="Geetha"    # preview one student
 *   npm run orders:extend-deadline -- --prod --apply                # write, everyone short of tomorrow night
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import PendingOrder from '../models/PendingOrder.js';
import Student from '../models/Student.js';
import { businessDateAt, businessDateStart } from '../utils/businessTime.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const studentFilter = args
  .find((arg) => arg.startsWith('--student='))
  ?.slice('--student='.length)
  .trim()
  .toLowerCase();

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const todayStart = businessDateStart(businessDateAt());
const tomorrowStart = new Date(todayStart.getTime() + ONE_DAY_MS);
const dayAfterStart = new Date(todayStart.getTime() + 2 * ONE_DAY_MS);
// Tomorrow's 23:59:59 IST — one second before the day after that begins.
const target = new Date(dayAfterStart.getTime() - 1000);

await connectForScript();

try {
  const short = await PendingOrder.find({
    status: { $in: ['PENDING', 'PROCESSING'] },
    expiresAt: { $lt: target },
  }).sort({ expiresAt: 1 });

  console.log(`${short.length} open request(s) currently lapse before tomorrow night.\n`);

  const students = await Student.find({ _id: { $in: short.map((o) => o.studentId) } })
    .select('name roomNumber')
    .lean();
  const studentById = new Map(students.map((s) => [s._id.toString(), s]));

  const orders = studentFilter
    ? short.filter((order) =>
        studentById.get(order.studentId.toString())?.name.toLowerCase().includes(studentFilter)
      )
    : short;

  if (studentFilter) {
    console.log(`Matching --student="${studentFilter}": ${orders.length} of ${short.length}.\n`);
  }

  if (!orders.length) {
    console.log('Nothing to do.');
  } else {
    for (const order of orders) {
      const student = studentById.get(order.studentId.toString());
      const label = student ? `${student.name} (${student.roomNumber ?? '—'})` : order.studentId;
      const overdue = order.expiresAt < tomorrowStart && order.expiresAt < new Date() ? ' [already past due]' : '';
      console.log(`  ${label}  ${order.expiresAt.toISOString()} -> ${target.toISOString()}${overdue}`);
    }

    if (!apply) {
      console.log('\nPreview only. Re-run with --apply to write.');
      process.exitCode = 2;
    } else {
      const result = await PendingOrder.updateMany(
        { _id: { $in: orders.map((o) => o._id) } },
        { $set: { expiresAt: target } }
      );

      // Read back rather than trusting the write, same as the other scripts here.
      const written = await PendingOrder.find({ _id: { $in: orders.map((o) => o._id) } })
        .select('expiresAt')
        .lean();
      const stillShort = written.filter((o) => o.expiresAt.getTime() !== target.getTime());

      if (stillShort.length) {
        throw new Error(
          `${stillShort.length} request(s) did not move. Check the PendingOrder schema.`
        );
      }

      console.log(`\nApplied. ${result.modifiedCount} request(s) now expire tomorrow at 23:59:59 IST.`);
    }
  }
} finally {
  await mongoose.disconnect();
}
