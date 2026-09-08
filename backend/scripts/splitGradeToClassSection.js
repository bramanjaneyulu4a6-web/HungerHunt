// Splits the retired combined grade field ("9-B") into className and section
// on every student that has not been converted yet, then removes grade from
// the converted documents. Preview first; --apply performs the writes.
//
// Idempotent: a student who already has a className is left alone, so a
// re-run after a partial failure only touches what remains.
import 'dotenv/config';

import Student from '../models/Student.js';
import { splitGrade } from '../utils/studentClass.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.includes('--apply');
await connectForScript();

try {
  const students = await Student.collection.find(
    {
      $and: [
        { $or: [{ className: { $exists: false } }, { className: null }, { className: '' }] },
      ],
    },
    { projection: { _id: 1, name: 1, admissionNumber: 1, grade: 1 } }
  ).toArray();

  const changes = [];
  const blank = [];

  for (const student of students) {
    const { className, section } = splitGrade(student.grade);
    if (!className) {
      // No grade to split. Left untouched and reported: the office fills the
      // class in through the admin screen.
      blank.push(student);
      continue;
    }
    changes.push({ student, className, section });
  }

  if (!changes.length && !blank.length) {
    console.log('Every student already has a class. Nothing to do.');
  } else {
    for (const { student, className, section } of changes) {
      console.log(
        `  ${student.admissionNumber || student._id} ${student.name || ''}: "${student.grade}" -> class "${className}"${section ? `, section "${section}"` : ''}`
      );
    }
    if (blank.length) {
      console.log(`\n${blank.length} student(s) have no grade to split and will keep a blank class:`);
      for (const student of blank) {
        console.log(`  ${student.admissionNumber || student._id} ${student.name || ''}`);
      }
    }

    if (apply) {
      let converted = 0;
      for (const { student, className, section } of changes) {
        const result = await Student.collection.updateOne(
          // Re-checked at write time so a concurrent edit is never clobbered.
          { _id: student._id, $or: [{ className: { $exists: false } }, { className: null }, { className: '' }] },
          { $set: { className, section }, $unset: { grade: '' } }
        );
        converted += result.modifiedCount;
      }
      console.log(`\nConverted ${converted} of ${changes.length} student(s).`);
    } else {
      console.log(`\nPreview only: ${changes.length} student(s) would be converted. Re-run with --apply to write.`);
    }
  }
} finally {
  const mongoose = (await import('mongoose')).default;
  await mongoose.disconnect();
}
