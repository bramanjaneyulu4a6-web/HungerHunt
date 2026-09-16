/* The MINDS 6-10 roll: students, their parents and the links between them.
 *
 *   Preview (writes nothing):  node scripts/importStudentRoster.js --prod
 *   Apply:                     node scripts/importStudentRoster.js --prod --apply
 *
 * The source is scripts/data/studentRoster.json, extracted verbatim from
 * "MINDS 6-10 with Ph.xlsx": one row per student carrying the roll number, the
 * hostel, caretaker and room, the combined Class-Section, and the parent's
 * phone number and name. Run scripts/importCaretakerRoster.js first — a student
 * needs a roomId, and this refuses to invent rooms.
 *
 * NOTHING THAT ALREADY EXISTS IS RECREATED. A student is recognised by roll
 * number and a parent by phone, so the 221 students and 219 parents the Grade
 * 10 import already made are matched rather than duplicated. Where one half of
 * a pair exists and the other does not, the missing half is created and the two
 * are linked; where both exist, only the link is checked. Re-running changes
 * nothing.
 *
 * What it writes to a record that already exists, and nothing else:
 *  - className and section, where the student has none. The Grade 10 import
 *    wrote the retired combined `grade` field, so all 221 of those students
 *    have a blank class; this is where they get one. `grade` is left alone —
 *    splitGradeToClassSection.js is what retires it.
 *  - The real guardian name and phone for a student imported with the
 *    placeholder "Not provided", which is how the two boys whose details were
 *    missing from the Grade 10 sheet finally become reachable.
 *
 * What it deliberately does NOT write: a spelling of a name or a phone number
 * that merely disagrees with the sheet. Seventeen guardian names are spelled
 * differently here than in the database ("PRAVEEN KUMAR K" against "PRAVEEN K")
 * and there is no reason to believe the spreadsheet is the more correct of the
 * two. They are listed in the output so a person can decide; none is touched.
 *
 * Class-Section is split by utils/studentClass.js, on the last hyphen, so
 * "IX-MB 1" is class IX section "MB 1" and it splits the same way here as it
 * does in the migration and in every legacy fallback.
 *
 * Parents sign in by SMS, so no password is set and activation is required.
 * Email is unique on the model and is not on the sheet, so it is derived from
 * the number: 9959544147@parents.hungerhunt.local.
 *
 * One student, MITHUNESWAR (M250852A), has "#N/A" for both the phone number and
 * the guardian's name. He is skipped entirely, by decision, and named at the
 * end so the office can add him once the details are known.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Room, { normalizeRoomCode } from '../models/Room.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import { normalizeClassName, splitGrade } from '../utils/studentClass.js';
import { isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admissionNumber.js';

const apply = process.argv.includes('--apply');

const EMAIL_DOMAIN = 'parents.hungerhunt.local';
const NOT_PROVIDED = 'Not provided';
const MISSING = '#N/A';

const source = JSON.parse(
  await readFile(new URL('./data/studentRoster.json', import.meta.url), 'utf8')
);

/* ---- the sheet has to be right before the database is touched ------------ */
const problems = [];
const skipped = [];

const rows = [];
for (const row of source.students) {
  const name = String(row.name ?? '').trim();
  const guardianName = String(row.guardianName ?? '').trim();
  const parentPhone = String(row.parentPhone ?? '').trim();
  const admissionNumber = normalizeAdmissionNumber(row.admissionNumber);

  // A row with no way to reach anybody is not imported half-way. Recorded and
  // set aside before validation, so it is a decision rather than a failure.
  if (guardianName === MISSING || parentPhone === MISSING) {
    skipped.push({ ...row, name, admissionNumber, reason: 'no guardian name or phone number on the sheet' });
    continue;
  }

  // The sheet writes classes in Roman numerals; the database stores numbers.
  // Converted on the way in so a later import cannot reintroduce the spelling
  // that scripts/normalizeStudentClasses.js was written to remove.
  const split = splitGrade(row.classSection);
  const className = normalizeClassName(split.className);
  const { section } = split;
  rows.push({
    sheetRow: row.sheetRow,
    name,
    admissionNumber,
    guardianName,
    parentPhone,
    className,
    section,
    classSection: row.classSection,
    code: normalizeRoomCode(`${row.hostel} - ${row.room}`),
  });
}

const fail = (row, message) =>
  problems.push(`row ${row.sheetRow} (${row.name || 'unnamed'}): ${message}`);

for (const row of rows) {
  if (!row.name) fail(row, 'student name is blank.');
  if (!isValidAdmissionNumber(row.admissionNumber)) {
    fail(row, `roll number ${JSON.stringify(row.admissionNumber)} is not 4-9 letters or numbers.`);
  }
  if (!/^\d{10}$/.test(row.parentPhone)) {
    fail(row, `phone number ${JSON.stringify(row.parentPhone)} is not 10 digits.`);
  }
  if (!row.guardianName) fail(row, 'guardian name is blank.');
  // A student with no class is a blank column on every admin screen, and the
  // model requires one on a new document, so an unsplittable value stops here
  // rather than failing halfway through the write.
  if (!row.className) fail(row, `Class-Section ${JSON.stringify(row.classSection)} does not yield a class.`);
}

const seenRoll = new Map();
const seenIdentity = new Map();
for (const row of rows) {
  const first = seenRoll.get(row.admissionNumber);
  if (first) fail(row, `roll number ${row.admissionNumber} repeats row ${first.sheetRow}.`);
  else seenRoll.set(row.admissionNumber, row);

  // The model's unique index over these three, checked here so a collision is
  // a message about two spreadsheet rows rather than a write error.
  const identity = `${row.name.toUpperCase()}\0${row.guardianName.toUpperCase()}\0${row.parentPhone}`;
  const twin = seenIdentity.get(identity);
  if (twin) fail(row, `is the same student as row ${twin.sheetRow}.`);
  else seenIdentity.set(identity, row);
}

/* One parent per number. A father with two children on the roll is one account
   holding both, so a disagreement over his name between two rows would pick
   one silently — it is worth stopping for. */
const sheetParents = new Map();
for (const row of rows) {
  const existing = sheetParents.get(row.parentPhone);
  if (!existing) {
    sheetParents.set(row.parentPhone, {
      fatherName: row.guardianName,
      phone: row.parentPhone,
      email: `${row.parentPhone}@${EMAIL_DOMAIN}`,
      children: [row],
    });
  } else if (existing.fatherName.toUpperCase() !== row.guardianName.toUpperCase()) {
    fail(row, `number ${row.parentPhone} is also ${JSON.stringify(existing.fatherName)} on row ${existing.children[0].sheetRow}.`);
  } else {
    existing.children.push(row);
  }
}

if (problems.length) {
  console.error(`The sheet has ${problems.length} problem(s). Nothing was read from the database.\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await connectForScript();

try {
  const clashes = [];

  /* ---- rooms: used, never created --------------------------------------- */
  const codes = [...new Set(rows.map((row) => row.code))].sort();
  const rooms = await Room.find({ code: { $in: codes } }).select('code active').lean();
  const roomByCode = new Map(rooms.map((room) => [room.code, room]));
  for (const code of codes) {
    const room = roomByCode.get(code);
    if (!room) clashes.push(`room ${code} does not exist — run scripts/importCaretakerRoster.js first`);
    else if (room.active === false) clashes.push(`room ${code} is inactive`);
  }

  /* ---- students ---------------------------------------------------------- */
  const liveStudents = await Student.find({})
    .select('name fatherName admissionNumber parentPhoneNumber roomNumber roomId className section isParentRegistered')
    .lean();
  const studentByRoll = new Map(liveStudents.map((s) => [s.admissionNumber, s]));

  /* A roll number is the identity, but the model is also unique over
     (name, fatherName, parentPhoneNumber). A sheet row that is a new student by
     roll and an existing student by that triple would fail the write, so it is
     caught here where it can be explained. */
  const studentByIdentity = new Map(
    liveStudents.map((s) => [`${s.name.trim().toUpperCase()}\0${(s.fatherName ?? '').trim().toUpperCase()}\0${s.parentPhoneNumber}`, s])
  );

  const newStudents = [];
  const classBackfill = [];
  const contactRepairs = [];
  const spellingDifferences = [];

  for (const row of rows) {
    const live = studentByRoll.get(row.admissionNumber);

    if (!live) {
      const twin = studentByIdentity.get(`${row.name.toUpperCase()}\0${row.guardianName.toUpperCase()}\0${row.parentPhone}`);
      if (twin) {
        clashes.push(`row ${row.sheetRow} ${row.name} is a new roll number ${row.admissionNumber}, but the same name, guardian and phone is already student ${twin.admissionNumber}`);
        continue;
      }
      newStudents.push(row);
      continue;
    }

    // Exists. Only the two repairs below may touch it.
    if (!live.className) classBackfill.push({ row, live });

    if ((live.fatherName ?? '').trim() === NOT_PROVIDED) {
      contactRepairs.push({ row, live });
    } else {
      const notes = [];
      if (live.name.trim().toUpperCase() !== row.name.toUpperCase()) notes.push(`name ${JSON.stringify(live.name)} / sheet ${JSON.stringify(row.name)}`);
      if ((live.fatherName ?? '').trim().toUpperCase() !== row.guardianName.toUpperCase()) notes.push(`guardian ${JSON.stringify(live.fatherName)} / sheet ${JSON.stringify(row.guardianName)}`);
      if (live.parentPhoneNumber !== row.parentPhone) notes.push(`phone ${live.parentPhoneNumber} / sheet ${row.parentPhone}`);
      if (notes.length) spellingDifferences.push({ row, live, notes });
    }
  }

  /* ---- parents ----------------------------------------------------------- */
  const phones = [...sheetParents.keys()];
  const liveParents = await Parent.find({
    $or: [{ phone: { $in: phones } }, { email: { $in: [...sheetParents.values()].map((p) => p.email) } }],
  }).select('fatherName phone email studentIds').lean();

  const parentByPhone = new Map(liveParents.map((p) => [p.phone, p]));
  for (const parent of liveParents) {
    // An address already on a different number would fail the unique index.
    const owner = sheetParents.get(parent.phone);
    if (!owner && parent.email) {
      const claimant = [...sheetParents.values()].find((p) => p.email === parent.email);
      if (claimant) clashes.push(`email ${parent.email} already belongs to ${parent.fatherName} on ${parent.phone}, but the sheet derives it for ${claimant.phone}`);
    }
  }

  const newParents = [];
  const linkOnly = [];
  for (const parent of sheetParents.values()) {
    const live = parentByPhone.get(parent.phone);
    if (!live) {
      newParents.push(parent);
      continue;
    }
    linkOnly.push({ parent, live });
  }

  /* ---- what will happen --------------------------------------------------- */
  console.log(`Sheet rows:  ${source.students.length} (${skipped.length} set aside, ${rows.length} to import)`);
  console.log(`Students:    ${rows.length} on the sheet — ${newStudents.length} to create, ${rows.length - newStudents.length} already exist`);
  console.log(`Parents:     ${sheetParents.size} on the sheet — ${newParents.length} to create, ${linkOnly.length} already exist`);
  console.log(`Rooms:       ${codes.length} used, all must already exist\n`);

  if (classBackfill.length) {
    console.log(`Class and section to be filled in on ${classBackfill.length} existing student(s) that have none:`);
    for (const { row } of classBackfill.slice(0, 6)) {
      console.log(`  ${row.admissionNumber.padEnd(9)} ${row.name.padEnd(30)} "${row.classSection}" -> class "${row.className}"${row.section ? `, section "${row.section}"` : ''}`);
    }
    if (classBackfill.length > 6) console.log(`  ... and ${classBackfill.length - 6} more`);
    console.log('');
  }

  if (contactRepairs.length) {
    console.log(`Placeholder guardian details to be replaced with the sheet's:`);
    for (const { row, live } of contactRepairs) {
      console.log(`  ${row.admissionNumber} ${row.name}`);
      console.log(`    guardian ${JSON.stringify(live.fatherName)} -> ${JSON.stringify(row.guardianName)}`);
      console.log(`    phone    ${live.parentPhoneNumber} -> ${row.parentPhone}`);
    }
    console.log('');
  }

  if (spellingDifferences.length) {
    console.log(`${spellingDifferences.length} existing student(s) differ from the sheet and are LEFT ALONE — decide by hand if any is wrong:`);
    for (const { row, notes } of spellingDifferences) {
      console.log(`  ${row.admissionNumber.padEnd(9)} ${row.name.padEnd(30)} ${notes.join(' | ')}`);
    }
    console.log('');
  }

  if (clashes.length) {
    console.error(`Refusing to continue — ${clashes.length} problem(s):\n`);
    for (const clash of clashes) console.error(`  ${clash}`);
    process.exit(1);
  }

  if (skipped.length) {
    console.log('Set aside, not imported — add by hand once the details are known:');
    for (const row of skipped) console.log(`  ${row.admissionNumber} ${row.name} (${row.hostel} - ${row.room}, ${row.classSection}) — ${row.reason}`);
    console.log('');
  }

  if (!apply) {
    console.log('Preview only. Nothing was written. Re-run with --apply to import.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        const idByCode = new Map(
          (await Room.find({ code: { $in: codes } }).select('code').session(session).lean())
            .map((room) => [room.code, room._id])
        );

        /* Students first: a parent's studentIds needs their ids. */
        const idByRoll = new Map(liveStudents.map((s) => [s.admissionNumber, s._id]));

        if (newStudents.length) {
          const docs = newStudents.map((row) => {
            const _id = new mongoose.Types.ObjectId();
            idByRoll.set(row.admissionNumber, _id);
            return {
              _id,
              name: row.name,
              fatherName: row.guardianName,
              admissionNumber: row.admissionNumber,
              className: row.className,
              section: row.section,
              roomNumber: row.code,
              roomId: idByCode.get(row.code),
              parentPhoneNumber: row.parentPhone,
              active: true,
              // Every row here has a parent, created below in this same
              // transaction, so this is true for all of them.
              isParentRegistered: true,
            };
          });
          await Student.create(docs, { session, ordered: true });
        }

        if (classBackfill.length) {
          await Student.bulkWrite(
            classBackfill.map(({ row, live }) => ({
              updateOne: {
                // Re-checked at write time so a class set by somebody else
                // between the preview and here is never clobbered.
                filter: { _id: live._id, $or: [{ className: { $exists: false } }, { className: null }, { className: '' }] },
                update: { $set: { className: row.className, section: row.section } },
              },
            })),
            { session }
          );
        }

        if (contactRepairs.length) {
          await Student.bulkWrite(
            contactRepairs.map(({ row, live }) => ({
              updateOne: {
                filter: { _id: live._id, fatherName: NOT_PROVIDED },
                update: { $set: { fatherName: row.guardianName, parentPhoneNumber: row.parentPhone, isParentRegistered: true } },
              },
            })),
            { session }
          );
        }

        if (newParents.length) {
          await Parent.create(
            newParents.map((parent) => ({
              fatherName: parent.fatherName,
              phone: parent.phone,
              email: parent.email,
              studentIds: parent.children.map((child) => idByRoll.get(child.admissionNumber)),
              active: true,
              // No password. The parent proves the number by SMS and chooses
              // one then, exactly as with a console-created account.
              activationRequired: true,
            })),
            { session, ordered: true }
          );
        }

        /* An existing parent gains only the children they do not already hold.
           $addToSet rather than $set: an account may legitimately carry a child
           who is not on this sheet, and replacing the list would drop them. */
        for (const { parent } of linkOnly) {
          const ids = parent.children.map((child) => idByRoll.get(child.admissionNumber)).filter(Boolean);
          if (ids.length) {
            await Parent.updateOne(
              { phone: parent.phone },
              { $addToSet: { studentIds: { $each: ids } } },
              { session }
            );
          }
        }

        /* Every student on the sheet now answers to a parent account. */
        await Student.updateMany(
          { admissionNumber: { $in: rows.map((row) => row.admissionNumber) }, isParentRegistered: { $ne: true } },
          { $set: { isParentRegistered: true } },
          { session }
        );
      });
    } finally {
      await session.endSession();
    }

    console.log(`Created ${newStudents.length} student(s) and ${newParents.length} parent(s).`);
    console.log(`Filled in class and section on ${classBackfill.length}, repaired ${contactRepairs.length} placeholder contact(s).`);
    console.log(`Checked the links on ${linkOnly.length} existing parent(s).`);
  }
} finally {
  await mongoose.disconnect();
}
