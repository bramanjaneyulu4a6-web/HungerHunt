/* The caretaker accounts for the MINDS X roll, which scripts/importMindsX.js
 * deliberately did not create — the sheet named the six caretakers but carried
 * no way to reach them.
 *
 *   Preview (writes nothing):  node scripts/importMindsXCaretakers.js --prod
 *   Apply:                     node scripts/importMindsXCaretakers.js --prod --apply
 *
 * The phone numbers below were given by the school; everything else comes from
 * scripts/data/mindsXImport.json, so the rooms each caretaker holds are the
 * ones the sheet actually put under their name rather than a list retyped here.
 *
 * No email is set. Warehouse and caretaker accounts sign in with phone and
 * password, and an address nobody owns would only be a dead end for a reset
 * link. Passwords are the block name in lower case with no spaces followed by
 * the last four digits of the phone number, as instructed — they are printed
 * once by --apply and are not recoverable afterwards, only replaceable.
 *
 * KARNE VENKATA SIVAIAH is on the sheet and is deliberately not created, which
 * leaves MINDS BOYS - 318 without a caretaker.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Admin from '../models/Admin.js';
import Room from '../models/Room.js';
import Student from '../models/Student.js';

const apply = process.argv.includes('--apply');

/* `sheetName` is how the caretaker is spelled on the roll and is what the rooms
   are looked up by; `name` is how the account reads on screen. */
const CARETAKERS = [
  { sheetName: 'SATHARLA NARASIMHA', name: 'Satharla Narasimha', phone: '6305615518' },
  { sheetName: 'CHANDRA SEKHAR REDDY', name: 'Chandra Sekhar Reddy', phone: '9704274944' },
  { sheetName: 'KURUVA SUDHAKAR', name: 'Kuruva Sudhakar', phone: '8500044278' },
  { sheetName: 'TELUGU CHAMANTHI', name: 'Telugu Chamanthi', phone: '8309887455' },
  { sheetName: 'CHINTAMANI SIVAPARVATHI', name: 'Chintamani Sivaparvathi', phone: '9985146307' },
  { sheetName: 'KARNE VENKATA SIVAIAH', name: 'Karne Venkata Sivaiah', phone: '0123456789' },
];

const SKIPPED = [];

const source = JSON.parse(
  await readFile(new URL('./data/mindsXImport.json', import.meta.url), 'utf8')
);

const roomCode = (row) => `${row.block} - ${row.room}`.toUpperCase();

/* Rooms and block are read off the sheet rather than declared, so this can only
   disagree with the roll if the roll itself changed. */
const fromSheet = new Map();
for (const row of source.students) {
  const key = row.caretakerName.toUpperCase();
  if (!fromSheet.has(key)) fromSheet.set(key, { blocks: new Set(), codes: new Set() });
  fromSheet.get(key).blocks.add(row.block);
  fromSheet.get(key).codes.add(roomCode(row));
}

const problems = [];
const accounts = CARETAKERS.map((caretaker) => {
  const sheet = fromSheet.get(caretaker.sheetName);
  if (!sheet) {
    problems.push(`${caretaker.sheetName} is not named anywhere in the sheet.`);
    return null;
  }
  if (!/^\d{10}$/.test(caretaker.phone)) {
    problems.push(`${caretaker.sheetName}: phone ${JSON.stringify(caretaker.phone)} is not 10 digits.`);
    return null;
  }
  // The password is built from *the* block, so a caretaker holding rooms in two
  // of them has no single answer and has to be decided by a person.
  if (sheet.blocks.size !== 1) {
    problems.push(`${caretaker.sheetName} holds rooms in ${[...sheet.blocks].join(' and ')}, so there is no single block name to build a password from.`);
    return null;
  }
  const [block] = [...sheet.blocks];
  return {
    ...caretaker,
    block,
    codes: [...sheet.codes].sort(),
    password: `${block.toLowerCase().replace(/\s+/g, '')}${caretaker.phone.slice(-4)}`,
  };
}).filter(Boolean);

const phones = new Set();
for (const account of accounts) {
  if (phones.has(account.phone)) problems.push(`phone ${account.phone} is listed twice.`);
  phones.add(account.phone);
}

for (const name of SKIPPED) {
  if (!fromSheet.has(name)) problems.push(`${name} is marked as skipped but is not in the sheet — check the spelling.`);
}

const unclaimed = [...fromSheet.keys()].filter(
  (name) => !accounts.some((account) => account.sheetName === name) && !SKIPPED.includes(name)
);
for (const name of unclaimed) {
  problems.push(`${name} is on the sheet but is neither being created nor listed as skipped.`);
}

if (problems.length) {
  console.error(`Refusing to run — ${problems.length} problem(s) with the caretaker list:\n`);
  for (const problem of problems) console.error(`  ${problem}`);
  process.exit(1);
}

await connectForScript();

try {
  const clashes = [];

  /* An account already carrying this person's name and number is this same
     caretaker, created by an earlier run — that is a skip, not a conflict. The
     same number under a different name is somebody else, and is refused. */
  const existingStaff = await Admin.find({ phone: { $in: [...phones] } })
    .select('name phone role').lean();
  const alreadyPresent = new Set();
  for (const staff of existingStaff) {
    const match = accounts.find(
      (account) => account.phone === staff.phone && account.name === staff.name
    );
    if (match && (staff.role || 'admin') === 'caretaker') alreadyPresent.add(match.phone);
    else clashes.push(`${staff.phone} already belongs to ${staff.name} (${staff.role || 'admin'})`);
  }
  const pending = accounts.filter((account) => !alreadyPresent.has(account.phone));

  const codes = [...new Set(accounts.flatMap((account) => account.codes))];
  const rooms = await Room.find({ code: { $in: codes } }).select('code active').lean();
  const byCode = new Map(rooms.map((room) => [room.code, room]));
  for (const code of codes) {
    const room = byCode.get(code);
    if (!room) clashes.push(`room ${code} does not exist — run scripts/importMindsX.js first`);
    else if (room.active === false) clashes.push(`room ${code} is inactive`);
  }

  for (const account of accounts.filter((a) => alreadyPresent.has(a.phone))) {
    console.log(`  ${account.name} (${account.phone}) — already exists, leaving alone`);
  }
  console.log(`\nCaretakers to create: ${pending.length}\n`);
  for (const account of pending) {
    console.log(`  ${account.name} (${account.phone}) — ${account.block}`);
    console.log(`    rooms     ${account.codes.join(', ')}`);
    console.log(`    password  ${account.password}`);
    console.log('    email     (none — signs in with phone and password)');
  }

  /* A room nobody holds still receives students' packages; it simply has nobody
     to hand them to. Named rather than left to be discovered. */
  const held = new Set(accounts.flatMap((account) => account.codes));
  const uncovered = [];
  for (const room of await Room.find({ code: /^MINDS/, active: { $ne: false } }).select('code').lean()) {
    if (held.has(room.code)) continue;
    const covered = await Admin.exists({
      role: 'caretaker', active: { $ne: false }, roomIds: room._id,
    });
    if (!covered) {
      uncovered.push(`${room.code} (${await Student.countDocuments({ roomId: room._id, active: { $ne: false } })} students)`);
    }
  }
  if (uncovered.length) {
    console.log(`\nRooms left with no caretaker: ${uncovered.join(', ')}`);
  }

  if (clashes.length) {
    console.error(`\nRefusing to continue — ${clashes.length} problem(s):\n`);
    for (const clash of clashes) console.error(`  ${clash}`);
    process.exit(1);
  }

  if (!pending.length) {
    console.log('\nNothing to create — every caretaker listed already exists.');
  } else if (!apply) {
    console.log('\nPreview only. Nothing was written. Re-run with --apply to create the accounts.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        // create() rather than insertMany: the pre-save hook is what hashes the
        // password, and insertMany would store all five in clear.
        await Admin.create(
          pending.map((account) => ({
            name: account.name,
            phone: account.phone,
            password: account.password,
            role: 'caretaker',
            active: true,
            roomIds: account.codes.map((code) => byCode.get(code)._id),
          })),
          { session, ordered: true }
        );
      });
    } finally {
      await session.endSession();
    }
    console.log(`\nCreated ${pending.length} caretaker account(s). The passwords above are the only copy.`);
  }
} finally {
  await mongoose.disconnect();
}
