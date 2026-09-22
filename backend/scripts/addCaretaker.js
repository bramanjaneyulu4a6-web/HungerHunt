/* Create one caretaker and give them rooms, taking each room away from whoever
 * holds it now.
 *
 *   Preview (writes nothing):
 *     node scripts/addCaretaker.js --prod --name "Naraharireddy M" --phone 9553386602 \
 *       --hostel "MINDS BOYS" --rooms 419,420,421,422,423
 *   Apply:
 *     CARETAKER_PASSWORD=... node scripts/addCaretaker.js --prod --apply ...same flags
 *
 * The password comes from CARETAKER_PASSWORD rather than a flag or this file,
 * so it never lands in the repo. The account is created through Admin.create()
 * so the pre-save hook hashes it.
 *
 * Refuses, before writing anything, when: the name or phone is already on a
 * staff account, a room does not exist or is inactive, or moving a room would
 * leave its current caretaker with no rooms at all (a caretaker account is
 * invalid without one). Rooms move in one transaction with the new account, so
 * a failure leaves every room where it was. */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Admin from '../models/Admin.js';
import Room, { normalizeRoomCode } from '../models/Room.js';

const argv = process.argv.slice(2);
const flag = (name) => {
  const index = argv.indexOf(`--${name}`);
  return index === -1 ? '' : String(argv[index + 1] ?? '').trim();
};

const apply = argv.includes('--apply');
const name = flag('name');
const phone = flag('phone');
const hostel = flag('hostel');
const codes = [...new Set(
  flag('rooms').split(',').map((room) => room.trim()).filter(Boolean)
    .map((room) => normalizeRoomCode(`${hostel} - ${room}`)),
)];

const problems = [];
if (!name) problems.push('--name is required.');
if (!/^\d{10}$/.test(phone)) problems.push('--phone must be 10 digits.');
if (!hostel) problems.push('--hostel is required, e.g. "MINDS BOYS".');
if (!codes.length) problems.push('--rooms is required, e.g. 419,420.');
if (apply && !process.env.CARETAKER_PASSWORD) problems.push('Set CARETAKER_PASSWORD to apply.');
if (problems.length) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}

await connectForScript();

try {
  const clashes = [];

  const nameTaken = await Admin.findOne(
    { name: new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i') },
    'name phone role',
  ).lean();
  if (nameTaken) clashes.push(`${nameTaken.name} already exists (${nameTaken.role || 'admin'}, ${nameTaken.phone})`);

  const phoneTaken = await Admin.findOne({ phone }, 'name role').lean();
  if (phoneTaken) clashes.push(`${phone} already belongs to ${phoneTaken.name} (${phoneTaken.role || 'admin'})`);

  const rooms = await Room.find({ code: { $in: codes } }).select('code active').lean();
  const byCode = new Map(rooms.map((room) => [room.code, room]));
  for (const code of codes) {
    const room = byCode.get(code);
    if (!room) clashes.push(`room ${code} does not exist`);
    else if (room.active === false) clashes.push(`room ${code} is inactive`);
  }

  const roomIds = rooms.map((room) => room._id);
  const holders = await Admin.find({ role: 'caretaker', roomIds: { $in: roomIds } })
    .select('name phone active roomIds').populate('roomIds', 'code').lean();

  const moves = holders.map((holder) => {
    const held = holder.roomIds.map((room) => room.code);
    const losing = held.filter((code) => codes.includes(code));
    const keeping = held.filter((code) => !codes.includes(code));
    if (!keeping.length) {
      clashes.push(`${holder.name} (${holder.phone}) would be left with no rooms — they hold only ${losing.join(', ')}`);
    }
    return { holder, losing, keeping };
  });

  console.log(`New caretaker: ${name}  ${phone}  (no email)`);
  console.log(`  rooms: ${codes.join(', ')}\n`);
  if (moves.length) {
    console.log('Rooms taken from their current caretaker:');
    for (const { holder, losing, keeping } of moves) {
      console.log(`  ${holder.name} (${holder.phone})${holder.active === false ? ' [archived]' : ''}`);
      console.log(`    loses  ${losing.join(', ')}`);
      console.log(`    keeps  ${keeping.join(', ') || '(none)'}`);
    }
  } else {
    console.log('None of these rooms has a caretaker now.');
  }

  if (clashes.length) {
    console.error(`\nRefusing to continue — ${clashes.length} problem(s):`);
    for (const clash of clashes) console.error(`  ${clash}`);
    process.exitCode = 1;
  } else if (!apply) {
    console.log('\nPreview only. Nothing was written. Re-run with CARETAKER_PASSWORD=... and --apply.');
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const { holder } of moves) {
          await Admin.updateOne(
            { _id: holder._id },
            { $pull: { roomIds: { $in: roomIds } } },
            { session },
          );
        }
        await Admin.create([{
          name,
          phone,
          password: process.env.CARETAKER_PASSWORD,
          role: 'caretaker',
          active: true,
          roomIds,
        }], { session });
      });
    } finally {
      await session.endSession();
    }
    console.log(`\nCreated ${name} with ${codes.length} room(s); moved rooms from ${moves.length} caretaker(s).`);
  }
} finally {
  await mongoose.disconnect();
}
