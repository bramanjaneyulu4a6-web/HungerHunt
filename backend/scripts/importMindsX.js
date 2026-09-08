/* One-off import of the MINDS X roll into rooms, students and parents.
 *
 *   Preview (writes nothing):  node scripts/importMindsX.js --prod
 *   Apply:                     node scripts/importMindsX.js --prod --apply
 *
 * The source is scripts/data/mindsXImport.json, extracted verbatim from
 * "Minds X Data Download.xlsx": one row per student, carrying the sheet it came
 * from, the roll number, the room, the caretaker's name and the father's name
 * and number. The last four sheet columns were empty and are not carried.
 *
 * What it creates:
 *  - One Room per (sheet, room number), coded "MINDS BOYS - 201". The sheet
 *    name is the block, and it belongs in the code because the code is the only
 *    thing the warehouse and caretaker screens show — bare "201" would not say
 *    which side of the school it is on.
 *  - One Student per row. Grade is "10" for all of them: the sheet has no class
 *    column and every student on it is in Grade 10.
 *  - One Parent per father, from the father's name and number, linked to their
 *    child. Parents sign in by SMS, so no password is set and activation is
 *    required — the same shape the admin console's "add parent" produces.
 *    Email is required and unique on the model but is not in the sheet, so it
 *    is derived from the number: 9959544147@parents.hungerhunt.local.
 *
 * What it deliberately does NOT create: caretaker accounts. The sheet names the
 * six caretakers but carries no phone or email for them, and a staff account
 * whose reset link goes to an address nobody owns is worse than no account. The
 * caretaker-to-rooms mapping is printed at the end so the rooms can be picked
 * in the console when the accounts are made.
 *
 * Two boys have "#N/A" where the father's details should be. They are created
 * with a placeholder name and number and no parent account, so they exist and
 * can use the kiosk; the real details are to be filled in later.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Room, { normalizeRoomCode } from '../models/Room.js';
import Student from '../models/Student.js';
import Parent from '../models/Parent.js';
import { isValidAdmissionNumber, normalizeAdmissionNumber } from '../utils/admissionNumber.js';

const GRADE = '10';
const EMAIL_DOMAIN = 'parents.hungerhunt.local';
const PLACEHOLDER_FATHER = 'Not provided';

const apply = process.argv.includes('--apply');

const source = JSON.parse(
  await readFile(new URL('./data/mindsXImport.json', import.meta.url), 'utf8')
);

/* "MINDS Boys" + "201" -> "MINDS BOYS - 201". normalizeRoomCode is what the
   room routes and the bulk import both use, so a code built here is spelled the
   same way as one typed into the console. */
const roomCode = (block, room) => normalizeRoomCode(`${block} - ${room}`);

/* Rows missing a father get placeholder contact details rather than blanks:
   fatherName and parentPhoneNumber are required on Student, and the unique
   index over (name, fatherName, parentPhoneNumber) means the placeholders have
   to differ from each other. Numbered in sheet order, which is stable. */
let placeholders = 0;
const nextPlaceholderPhone = () => String(placeholders++).padStart(10, '0');

const problems = [];
const fail = (row, message) =>
  problems.push(`${row.block} row ${row.sheetRow} (${row.name || 'unnamed'}): ${message}`);

const rows = source.students.map((row) => {
  const hasParent = Boolean(row.fatherName && row.fatherPhone);
  return {
    ...row,
    hasParent,
    admissionNumber: normalizeAdmissionNumber(row.admissionNumber),
    code: roomCode(row.block, row.room),
    fatherName: hasParent ? row.fatherName : PLACEHOLDER_FATHER,
    parentPhoneNumber: hasParent ? row.fatherPhone : nextPlaceholderPhone(),
  };
});

/* ---- the sheet has to be right before the database is touched ------------ */
for (const row of rows) {
  if (!row.name) fail(row, 'student name is blank.');
  if (!row.room) fail(row, 'room is blank.');
  if (!row.caretakerName) fail(row, 'caretaker is blank.');
  if (!isValidAdmissionNumber(row.admissionNumber)) {
    fail(row, `roll number ${JSON.stringify(row.admissionNumber)} is not 4-8 letters or numbers.`);
  }
  if (row.hasParent && !/^\d{10}$/.test(row.parentPhoneNumber)) {
    fail(row, `father's number ${JSON.stringify(row.parentPhoneNumber)} is not 10 digits.`);
  }
}

const seenAdmission = new Map();
const seenIdentity = new Map();
for (const row of rows) {
  const first = seenAdmission.get(row.admissionNumber);
  if (first) fail(row, `roll number ${row.admissionNumber} repeats row ${first.sheetRow} of ${first.block}.`);
  else seenAdmission.set(row.admissionNumber, row);

  const identity = `${row.name.toLowerCase()}\0${row.fatherName.toLowerCase()}\0${row.parentPhoneNumber}`;
  const twin = seenIdentity.get(identity);
  if (twin) fail(row, `is the same student as row ${twin.sheetRow} of ${twin.block}.`);
  else seenIdentity.set(identity, row);
}

/* One parent per number. A father with two children on the roll is one account
   holding both, so a disagreement over his name between the two rows would
   silently pick one — it is worth stopping for. */
const parents = new Map();
for (const row of rows) {
  if (!row.hasParent) continue;
  const existing = parents.get(row.parentPhoneNumber);
  if (!existing) {
    parents.set(row.parentPhoneNumber, {
      fatherName: row.fatherName,
      phone: row.parentPhoneNumber,
      email: `${row.parentPhoneNumber}@${EMAIL_DOMAIN}`,
      children: [row],
    });
  } else if (existing.fatherName !== row.fatherName) {
    fail(row, `number ${row.parentPhoneNumber} is also ${JSON.stringify(existing.fatherName)} on row ${existing.children[0].sheetRow}.`);
  } else {
    existing.children.push(row);
  }
}

if (problems.length) {
  console.error(`The sheet has ${problems.length} problem(s). Nothing was read from the database.\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

/* ---- what will be written ------------------------------------------------ */
const codes = [...new Set(rows.map((row) => row.code))].sort();
const caretakers = new Map();
for (const row of rows) {
  if (!caretakers.has(row.caretakerName)) caretakers.set(row.caretakerName, new Set());
  caretakers.get(row.caretakerName).add(row.code);
}

await connectForScript();

try {
  /* ---- preflight: nothing here may already exist ------------------------- */
  const clashes = [];

  const existingStudents = await Student.find({
    $or: [
      { admissionNumber: { $in: rows.map((row) => row.admissionNumber) } },
      ...rows.map((row) => ({
        name: row.name,
        fatherName: row.fatherName,
        parentPhoneNumber: row.parentPhoneNumber,
      })),
    ],
  }).select('name admissionNumber').lean();
  for (const student of existingStudents) {
    clashes.push(`student ${student.name} (${student.admissionNumber}) is already in this database`);
  }

  const existingParents = await Parent.find({
    $or: [
      { phone: { $in: [...parents.keys()] } },
      { email: { $in: [...parents.values()].map((parent) => parent.email) } },
    ],
  }).select('fatherName phone').lean();
  for (const parent of existingParents) {
    clashes.push(`parent ${parent.fatherName} (${parent.phone}) is already in this database`);
  }

  const existingRooms = await Room.find({ code: { $in: codes } }).select('code active').lean();
  const byCode = new Map(existingRooms.map((room) => [room.code, room]));
  for (const room of existingRooms) {
    // Reused rather than treated as a clash — a room is a place, and the same
    // place being on the sheet twice is not a conflict. An inactive one is,
    // because students may not be imported into a room nobody is delivering to.
    if (room.active === false) clashes.push(`room ${room.code} exists but is inactive`);
  }

  console.log(`Rooms:      ${codes.length} (${existingRooms.length} already present, ${codes.length - existingRooms.length} to create)`);
  console.log(`Students:   ${rows.length} (${rows.filter((row) => !row.hasParent).length} without father's details)`);
  console.log(`Parents:    ${parents.size}`);
  console.log(`Caretakers: ${caretakers.size} named in the sheet, none created — see the mapping below.\n`);

  console.log('Rooms to be used:');
  for (const code of codes) {
    const count = rows.filter((row) => row.code === code).length;
    console.log(`  ${code.padEnd(20)} ${String(count).padStart(3)} students${byCode.has(code) ? '   (exists)' : ''}`);
  }

  console.log('\nCaretaker → rooms (assign these by hand when the accounts are made):');
  for (const [name, roomCodes] of caretakers) {
    console.log(`  ${name.padEnd(26)} ${[...roomCodes].sort().join(', ')}`);
  }

  const noParent = rows.filter((row) => !row.hasParent);
  if (noParent.length) {
    console.log('\nNo father on the sheet — created with placeholders and no parent account:');
    for (const row of noParent) {
      console.log(`  ${row.name} (${row.admissionNumber}), ${row.code} — ${row.fatherName} / ${row.parentPhoneNumber}`);
    }
  }

  if (clashes.length) {
    console.error(`\nRefusing to continue — ${clashes.length} of these already exist:\n`);
    for (const clash of clashes) console.error(`  ${clash}`);
    process.exit(1);
  }

  if (!apply) {
    console.log('\nPreview only. Nothing was written. Re-run with --apply to import.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await Room.bulkWrite(
          codes.map((code) => ({
            updateOne: {
              filter: { code },
              update: { $setOnInsert: { code, name: rows.find((row) => row.code === code).block, active: true } },
              upsert: true,
            },
          })),
          { session }
        );

        const rooms = await Room.find({ code: { $in: codes } }).select('code').session(session).lean();
        const roomByCode = new Map(rooms.map((room) => [room.code, room._id]));

        const studentIds = new Map();
        await Student.create(
          rows.map((row) => {
            const _id = new mongoose.Types.ObjectId();
            studentIds.set(row, _id);
            return {
              _id,
              name: row.name,
              fatherName: row.fatherName,
              admissionNumber: row.admissionNumber,
              grade: GRADE,
              roomNumber: row.code,
              roomId: roomByCode.get(row.code),
              parentPhoneNumber: row.parentPhoneNumber,
              active: true,
              // Set to match the parent rows written below in the same
              // transaction; a student with no father on the sheet keeps false.
              isParentRegistered: row.hasParent,
            };
          }),
          { session, ordered: true }
        );

        await Parent.create(
          [...parents.values()].map((parent) => ({
            fatherName: parent.fatherName,
            phone: parent.phone,
            email: parent.email,
            studentIds: parent.children.map((child) => studentIds.get(child)),
            active: true,
            // No password is set. The parent proves the number by SMS and
            // chooses one then, exactly as with a console-created account.
            activationRequired: true,
          })),
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }

    console.log(`\nImported ${rows.length} students, ${parents.size} parents and ${codes.length} rooms.`);
    console.log('Still to do by hand: the six caretaker accounts, and the two students above.');
  }
} finally {
  await mongoose.disconnect();
}
