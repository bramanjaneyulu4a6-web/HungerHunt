// Converts legacy numeric admission numbers to canonical strings and uppercases
// existing string IDs. Preview first; --apply performs the writes only when
// every resulting ID is valid and unique.
import 'dotenv/config';
import mongoose from 'mongoose';

import Student from '../models/Student.js';
import {
  isValidAdmissionNumber,
  normalizeAdmissionNumber,
} from '../utils/admissionNumber.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.includes('--apply');
await connectForScript();

try {
  const students = await Student.collection.find({}, {
    projection: { _id: 1, name: 1, admissionNumber: 1 },
  }).toArray();

  const invalid = [];
  const byCanonical = new Map();
  const changes = [];

  for (const student of students) {
    const current = student.admissionNumber;
    const canonical = normalizeAdmissionNumber(current);
    if (!isValidAdmissionNumber(canonical)) {
      invalid.push({ student, current });
      continue;
    }

    const previous = byCanonical.get(canonical);
    if (previous) {
      invalid.push({
        student,
        current,
        reason: `collides with ${previous.name || previous._id}`,
      });
      continue;
    }
    byCanonical.set(canonical, student);

    if (typeof current !== 'string' || current !== canonical) {
      changes.push({ student, current, canonical });
    }
  }

  if (invalid.length) {
    console.error('Migration refused. Fix these admission numbers first:');
    for (const { student, current, reason } of invalid) {
      console.error(`  ${student.name || student._id}: ${String(current ?? '(missing)')}${reason ? ` — ${reason}` : ''}`);
    }
    process.exitCode = 1;
  } else if (!changes.length) {
    console.log('All admission numbers are already canonical strings.');
  } else {
    console.log('Admission numbers to convert:');
    for (const { student, current, canonical } of changes) {
      console.log(`  ${student.name || student._id}: ${String(current)} -> ${canonical}`);
    }

    if (!apply) {
      console.log('\nPreview only. Re-run with --apply to persist these changes.');
      process.exitCode = 2;
    } else {
      await Student.collection.bulkWrite(changes.map(({ student, canonical }) => ({
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { admissionNumber: canonical } },
        },
      })));
      console.log(`\nConverted ${changes.length} admission number(s) to strings.`);
    }
  }
} finally {
  await mongoose.disconnect();
}
