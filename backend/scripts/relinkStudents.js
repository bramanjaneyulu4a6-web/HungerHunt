/* Repairs parent↔student links that were never formed.
 *
 * Registration linked a parent only to the children who existed at that moment,
 * and nothing linked the ones enrolled afterwards. Those children are invisible
 * in the parent app, and re-registering cannot fix it because the phone number
 * is already taken. Every write path forms the link now — this reconciles the
 * records already in the database.
 *
 * Safe to re-run: syncStudentLinks is idempotent, and a correct link is left
 * alone. Reports what it would do without writing when passed --dry-run.
 *
 *   node scripts/relinkStudents.js --dry-run
 *   node scripts/relinkStudents.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import { syncStudentLinks } from '../utils/studentLinks.js';

const dryRun = process.argv.includes('--dry-run');

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log(`Connected.${dryRun ? ' DRY RUN — nothing will be written.' : ''}`);

  const students = await Student.find().select('_id name fatherName parentPhoneNumber');
  const parents = await Parent.find().select('_id fatherName phone studentIds');

  // Keyed the same way registration and syncStudentLinks match.
  const byIdentity = new Map(
    parents.map((p) => [`${p.fatherName} ${p.phone}`, p])
  );

  const missing = [];

  for (const student of students) {
    const parent = byIdentity.get(
      `${student.fatherName} ${student.parentPhoneNumber}`
    );

    if (!parent) continue;

    const alreadyLinked = parent.studentIds.some(
      (id) => id.toString() === student._id.toString()
    );

    if (!alreadyLinked) missing.push({ student, parent });
  }

  console.log(`${students.length} students, ${parents.length} registered parents.`);
  console.log(`${missing.length} student(s) not linked to their registered parent:`);

  for (const { student, parent } of missing) {
    console.log(`  · ${student.name} → ${parent.fatherName} (${parent.phone})`);
  }

  if (missing.length === 0) {
    console.log('Nothing to repair.');
  } else if (dryRun) {
    console.log('\nDry run — re-run without --dry-run to apply.');
  } else {
    const linked = await syncStudentLinks(students);
    console.log(`\nRepaired. ${linked} link(s) created.`);
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
