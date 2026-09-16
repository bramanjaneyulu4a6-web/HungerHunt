/* The hostel rooms and caretaker accounts for the whole MINDS roll.
 *
 *   Preview (writes nothing):  node scripts/importCaretakerRoster.js --prod
 *   Apply:                     node scripts/importCaretakerRoster.js --prod --apply
 *
 * The source is scripts/data/caretakerRoster.json, extracted verbatim from
 * "Caretaker list.xlsx": one entry per caretaker named on the roll, carrying
 * the hostel and the room numbers the sheet puts under their name. Room codes
 * are built here rather than listed there, so a code written by this script is
 * spelled the same way as one typed into the console.
 *
 * This runs BEFORE the student import: a student needs a roomId, and a
 * caretaker account is refused without at least one room, so the rooms have to
 * exist first and this is what creates them.
 *
 * What it does:
 *  - Creates any room on the sheet that is not already there, coded
 *    "MINDS BOYS - 101" from the hostel and the room number. The 22 rooms the
 *    Grade 10 import already made are reused, not duplicated.
 *  - Creates a caretaker account for every name on the sheet that is not
 *    already a caretaker, matched on name without regard to case. The six
 *    created on 2026-09-05 are left exactly as they are.
 *  - Adds to an existing caretaker any room the sheet puts under their name
 *    that their account does not already hold. Only roomIds is touched: the
 *    name, phone and password of an account already in use are never rewritten.
 *    Without this, Karne Venkata Sivaiah's rooms 315-317 would go live with
 *    nobody to hand a package to.
 *
 * Phone numbers are placeholders, as instructed — the sheet carries no way to
 * reach anybody on it. They are allocated from 0000000003 upwards in the order
 * the caretakers are listed, skipping any number already taken by a staff
 * account; 0000000000 to 0000000002 are the warehouse account and two admins.
 * Phone is how a caretaker signs in, so these are real credentials and have to
 * be replaced with the school's actual numbers before they mean anything.
 *
 * No email is set. Caretakers sign in with phone and password, and an address
 * nobody owns would only be a dead end for a reset link.
 *
 * Every new account gets the same password, as instructed, to be changed later.
 * Until it is, any caretaker can sign in as any other, and all of them can be
 * signed in as by anyone who learns the one password. Worth doing early.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Admin from '../models/Admin.js';
import Room, { normalizeRoomCode } from '../models/Room.js';
import Student from '../models/Student.js';

const apply = process.argv.includes('--apply');

const PASSWORD = 'HH2026';
const FIRST_PLACEHOLDER_PHONE = 3;

/* The sheet puts room 304 under two caretakers. Decided by the school rather
   than guessed: it goes to Dolu Raviteja, whose other rooms are 301-303, and
   Karne Venkata Sivaiah keeps 315-318. Recorded here rather than edited into
   the JSON so the extract stays a faithful copy of the spreadsheet and the
   decision is visible to whoever reads this next. */
const ROOM_HELD_BY = new Map([['MINDS BOYS - 304', 'DOLU RAVITEJA']]);

const source = JSON.parse(
  await readFile(new URL('./data/caretakerRoster.json', import.meta.url), 'utf8')
);

const roomCode = (hostel, room) => normalizeRoomCode(`${hostel} - ${room}`);

/* "RAJU BR" -> "Raju BR". Initials are left alone: every one- and two-letter
   word on this sheet is an initial, and "Br" would be a misspelling of a
   person's name rather than a tidier version of it. */
const displayName = (sheetName) =>
  sheetName
    .split(/\s+/)
    .map((word) => (word.length <= 2 ? word : word[0] + word.slice(1).toLowerCase()))
    .join(' ');

/* ---- the sheet has to be right before the database is touched ------------ */
const problems = [];
const fail = (message) => problems.push(message);

const roster = source.caretakers.map((entry) => ({
  sheetName: String(entry.sheetName ?? '').trim(),
  name: displayName(String(entry.sheetName ?? '').trim()),
  hostel: String(entry.hostel ?? '').trim(),
  codes: [...new Set((entry.rooms ?? []).map((room) => roomCode(entry.hostel, room)))].sort(),
}));

for (const entry of roster) {
  if (!entry.sheetName) fail('a caretaker row has no name.');
  if (!entry.hostel) fail(`${entry.sheetName}: no hostel.`);
  if (!entry.codes.length) fail(`${entry.sheetName}: no rooms.`);
}

const seenName = new Set();
for (const entry of roster) {
  const key = entry.sheetName.toUpperCase();
  if (seenName.has(key)) fail(`${entry.sheetName} is listed twice in the extract.`);
  seenName.add(key);
}

/* A room belongs to one caretaker. Two people holding the same room both see
   its packages and both can mark them handed over, so a sheet that says so is
   a question for the school rather than something to average out. */
const claims = new Map();
for (const entry of roster) {
  for (const code of entry.codes) {
    if (!claims.has(code)) claims.set(code, []);
    claims.get(code).push(entry);
  }
}
for (const [code, claimants] of claims) {
  if (claimants.length === 1) continue;

  const decided = ROOM_HELD_BY.get(code);
  if (!decided) {
    fail(`room ${code} is claimed by ${claimants.map((c) => c.sheetName).join(' and ')}, and there is no decision for it.`);
    continue;
  }
  if (!claimants.some((c) => c.sheetName === decided)) {
    fail(`room ${code} is decided for ${decided}, who does not claim it on the sheet.`);
    continue;
  }
  for (const claimant of claimants) {
    if (claimant.sheetName !== decided) {
      claimant.codes = claimant.codes.filter((c) => c !== code);
    }
  }
}

/* A decision for a room nobody disputes is stale — the sheet changed under it. */
for (const [code, decided] of ROOM_HELD_BY) {
  const claimants = claims.get(code) ?? [];
  if (claimants.length < 2) {
    fail(`room ${code} is decided for ${decided} but is not disputed on the sheet — the decision is out of date.`);
  }
}

if (problems.length) {
  console.error(`The sheet has ${problems.length} problem(s). Nothing was read from the database.\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

const allCodes = [...new Set(roster.flatMap((entry) => entry.codes))].sort();

await connectForScript();

try {
  const clashes = [];

  /* ---- who is already here ---------------------------------------------- */
  const staff = await Admin.find({}).select('name phone role roomIds active').lean();
  const staffByName = new Map(staff.map((s) => [s.name.trim().toUpperCase(), s]));
  const takenPhones = new Set(staff.map((s) => s.phone));

  const existing = [];
  const pending = [];
  for (const entry of roster) {
    const live = staffByName.get(entry.sheetName.toUpperCase());
    if (!live) {
      pending.push(entry);
      continue;
    }
    // A name already on a full admin or the warehouse account is not this
    // caretaker. Giving that person a second role by accident is worse than
    // stopping, so it is refused rather than skipped.
    if ((live.role || 'admin') !== 'caretaker') {
      clashes.push(`${entry.sheetName} is already a ${live.role || 'admin'} account (${live.phone}), not a caretaker`);
      continue;
    }
    existing.push({ ...entry, live });
  }

  /* Placeholder numbers, allocated in listing order so a re-run of the preview
     shows the same number against the same person. */
  let next = FIRST_PLACEHOLDER_PHONE;
  for (const entry of pending) {
    let phone = String(next).padStart(10, '0');
    while (takenPhones.has(phone)) {
      next += 1;
      phone = String(next).padStart(10, '0');
    }
    entry.phone = phone;
    takenPhones.add(phone);
    next += 1;
  }

  /* ---- rooms ------------------------------------------------------------- */
  const rooms = await Room.find({ code: { $in: allCodes } }).select('code active').lean();
  const byCode = new Map(rooms.map((room) => [room.code, room]));
  for (const room of rooms) {
    if (room.active === false) clashes.push(`room ${room.code} exists but is inactive`);
  }
  const toCreate = allCodes.filter((code) => !byCode.has(code));

  /* Rooms an existing caretaker is on the sheet for but does not hold yet. */
  const idToCode = new Map();
  for (const room of rooms) idToCode.set(String(room._id), room.code);
  const toExtend = [];
  for (const entry of existing) {
    const held = new Set((entry.live.roomIds ?? []).map((id) => idToCode.get(String(id)) ?? String(id)));
    const missing = entry.codes.filter((code) => !held.has(code));
    // Rooms the account holds that the sheet no longer gives them are reported
    // but never removed — taking a room away silently is how a package ends up
    // with nobody able to hand it over.
    const surplus = [...held].filter((code) => !entry.codes.includes(code));
    if (missing.length || surplus.length) toExtend.push({ ...entry, held: [...held].sort(), missing, surplus });
  }

  /* ---- what will happen --------------------------------------------------- */
  console.log(`Rooms:      ${allCodes.length} on the sheet (${rooms.length} already present, ${toCreate.length} to create)`);
  console.log(`Caretakers: ${roster.length} on the sheet (${existing.length} already exist, ${pending.length} to create)\n`);

  if (toCreate.length) {
    console.log('Rooms to create:');
    const byHostel = new Map();
    for (const code of toCreate) {
      const hostel = roster.find((e) => e.codes.includes(code)).hostel;
      if (!byHostel.has(hostel)) byHostel.set(hostel, []);
      byHostel.get(hostel).push(code.slice(code.lastIndexOf('- ') + 2));
    }
    for (const [hostel, numbers] of byHostel) {
      console.log(`  ${hostel.padEnd(12)} ${numbers.length} rooms: ${numbers.join(', ')}`);
    }
    console.log('');
  }

  if (existing.length) {
    console.log('Already caretakers — account, phone and password left alone:');
    for (const entry of existing) {
      console.log(`  ${entry.name.padEnd(28)} ${entry.live.phone}`);
    }
    console.log('');
  }

  if (toExtend.length) {
    console.log('Room lists to bring in line with the sheet:');
    for (const entry of toExtend) {
      console.log(`  ${entry.name} (${entry.live.phone})`);
      console.log(`    holds now  ${entry.held.join(', ') || '(none)'}`);
      if (entry.missing.length) console.log(`    ADDING     ${entry.missing.join(', ')}`);
      if (entry.surplus.length) console.log(`    not on the sheet, left in place: ${entry.surplus.join(', ')}`);
    }
    console.log('');
  }

  console.log(`Caretakers to create (all with password ${JSON.stringify(PASSWORD)}, no email):`);
  for (const entry of pending) {
    console.log(`  ${entry.phone}  ${entry.name.padEnd(28)} ${entry.hostel}`);
    console.log(`      ${entry.codes.join(', ')}`);
  }

  if (clashes.length) {
    console.error(`\nRefusing to continue — ${clashes.length} problem(s):\n`);
    for (const clash of clashes) console.error(`  ${clash}`);
    process.exit(1);
  }

  if (!pending.length && !toCreate.length && !toExtend.length) {
    console.log('\nNothing to do — every room and caretaker on the sheet is already correct.');
  } else if (!apply) {
    console.log('\nPreview only. Nothing was written. Re-run with --apply.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        if (toCreate.length) {
          await Room.bulkWrite(
            toCreate.map((code) => ({
              updateOne: {
                filter: { code },
                update: {
                  $setOnInsert: {
                    // No name: the hostel is already the code's block, and a
                    // name repeating it prints the block twice on screen.
                    code,
                    active: true,
                  },
                },
                upsert: true,
              },
            })),
            { session }
          );
        }

        const all = await Room.find({ code: { $in: allCodes } }).select('code').session(session).lean();
        const idByCode = new Map(all.map((room) => [room.code, room._id]));

        if (pending.length) {
          // create() rather than insertMany: the pre-save hook is what hashes
          // the password, and insertMany would store it in clear.
          await Admin.create(
            pending.map((entry) => ({
              name: entry.name,
              phone: entry.phone,
              password: PASSWORD,
              role: 'caretaker',
              active: true,
              roomIds: entry.codes.map((code) => idByCode.get(code)),
            })),
            { session, ordered: true }
          );
        }

        for (const entry of toExtend.filter((e) => e.missing.length)) {
          await Admin.updateOne(
            { _id: entry.live._id },
            { $addToSet: { roomIds: { $each: entry.missing.map((code) => idByCode.get(code)) } } },
            { session }
          );
        }
      });
    } finally {
      await session.endSession();
    }

    console.log(`\nCreated ${toCreate.length} room(s) and ${pending.length} caretaker account(s).`);
    console.log(`Extended ${toExtend.filter((e) => e.missing.length).length} existing caretaker(s).`);
    console.log(`Every new account signs in with its number above and the password ${JSON.stringify(PASSWORD)}.`);
  }

  /* A room nobody holds still receives packages; it simply has nobody to hand
     them to. Named rather than left to be discovered. */
  const live = await Room.find({ active: { $ne: false } }).select('code').lean();
  const uncovered = [];
  for (const room of live) {
    const covered = await Admin.exists({
      role: 'caretaker', active: { $ne: false }, roomIds: room._id,
    });
    if (!covered) {
      uncovered.push(`${room.code} (${await Student.countDocuments({ roomId: room._id, active: { $ne: false } })} students)`);
    }
  }
  console.log(`\nRooms with no caretaker: ${uncovered.join(', ') || 'none'}`);
} finally {
  await mongoose.disconnect();
}
