/* Rewrites Roman class names as numbers: VI becomes 6, X becomes 10.
 *
 *   Preview (writes nothing):  npm run migrate:class-names -- --prod
 *   Apply:                     npm run migrate:class-names -- --prod --apply
 *
 * The roll was extracted from a spreadsheet that writes classes in Roman
 * numerals, and a handful of students created by hand carry Arabic ones. To a
 * database that matches exactly those are different classes, so every filter
 * offered both "VIII" and "8" and a student was reachable only through
 * whichever their own row happened to hold.
 *
 * The conversion is utils/studentClass.js, shared with the admin routes and
 * the roster import so nothing can write the old spelling back afterwards.
 * It converts the twelve class names and is blind to everything else: LKG,
 * Demo, and the students with no class recorded are not touched.
 *
 * Classes merge. Where a "6" already exists the "VI" students join it, which
 * is the point rather than a side effect — they were always the same class.
 *
 * The retired `grade` field is deliberately left alone. Nothing writes it, and
 * it is read only as a fallback for students who have no className at all,
 * which is nobody this script touches.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Student from '../models/Student.js';
import { normalizeClassName } from '../utils/studentClass.js';

const apply = process.argv.includes('--apply');

await connectForScript();

try {
  // Archived students are included. They keep appearing in the archived tab
  // and in old receipts, and leaving half the roll in the old spelling would
  // put the mixture back the moment one was restored.
  const students = await Student.find({ className: { $nin: [null, ''] } })
    .select('_id name admissionNumber className active')
    .lean();

  const changes = [];
  const byMove = new Map();

  for (const student of students) {
    const next = normalizeClassName(student.className);

    if (next === student.className) continue;

    changes.push({ _id: student._id, from: student.className, to: next });
    const key = `${student.className} -> ${next}`;
    byMove.set(key, (byMove.get(key) || 0) + 1);
  }

  const settled = new Map();
  for (const student of students) {
    const next = normalizeClassName(student.className);
    settled.set(next, (settled.get(next) || 0) + 1);
  }

  console.log(`${students.length} student(s) carry a class. ${changes.length} need rewriting.\n`);

  if (changes.length === 0) {
    console.log('Nothing to do — every class is already a number.');
  } else {
    for (const [move, count] of [...byMove].sort()) {
      console.log(`  ${move.padEnd(14)} ${count} student(s)`);
    }

    console.log('\nClasses afterwards:');
    for (const [name, count] of [...settled].sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(name).padEnd(8)} ${count} student(s)`);
    }
  }

  if (!apply) {
    if (changes.length) {
      console.log('\nPreview only. Re-run with --apply to write.');
      process.exitCode = 2;
    }
  } else if (changes.length) {
    /* One updateMany per distinct class rather than one write per student:
       five statements instead of nine hundred, against a shared-tier cluster
       the live service is also using. Filtered on the old value so a row that
       changed under us is left for the next run rather than overwritten. */
    const moves = new Map();
    for (const change of changes) moves.set(change.from, change.to);

    let written = 0;
    for (const [from, to] of moves) {
      const result = await Student.updateMany({ className: from }, { $set: { className: to } });
      written += result.modifiedCount ?? 0;
      console.log(`  ${from} -> ${to}: ${result.modifiedCount} written`);
    }

    // Read back rather than trusting the writes: the whole point is that no
    // Roman spelling survives, and a partial run looks like a finished one.
    const left = await Student.find({ className: { $nin: [null, ''] } })
      .select('className').lean();
    const stragglers = left.filter((s) => normalizeClassName(s.className) !== s.className);

    console.log(`\nWrote ${written} student(s).`);

    if (stragglers.length) {
      throw new Error(`${stragglers.length} student(s) still carry a Roman class. Re-run.`);
    }
    console.log('Verified: every class is now a number (or a name that is not a year).');
  }
} finally {
  await mongoose.disconnect();
}
