/* Create the two test staff accounts — a caretaker on the test room and a
   warehouse account — on the database named by scripts/lib/connect.mjs
   (local via backend/.env, production via --prod).

   Usage:
     node scripts/createTestStaffAccounts.js                # local dev
     node scripts/createTestStaffAccounts.js --prod         # production Atlas
     node scripts/createTestStaffAccounts.js --room H1      # another test room

   Idempotent by phone: an existing row with the same phone has its name,
   password, role and rooms reset, so a re-run corrects rather than duplicates.
   The caretaker is put on the test room alone (H1 by default, the room that
   holds the test students and no real caretaker), so nothing a tester does
   reaches a real child's packages. Refuses before connecting if the room is
   missing, and refuses a phone that belongs to some other account. */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Room from '../models/Room.js';
import { connectForScript } from './lib/connect.mjs';
import { phoneProblem } from '../utils/validation.js';

const argv = process.argv.slice(2);
const roomIndex = argv.indexOf('--room');
const ROOM_CODE = roomIndex === -1 ? 'H1' : String(argv[roomIndex + 1] ?? '').trim();

// Phones sit next to the test parent's 9000000021 so the whole test set reads
// as one block. Both sign in by phone; the warehouse email is optional and
// only there so a password reset has somewhere to go.
export const ACCOUNTS = [
  {
    role: 'caretaker',
    name: 'Test Caretaker',
    phone: '9000000022',
    password: 'TestCaretaker123!',
  },
  {
    role: 'warehouse',
    name: 'Test Warehouse',
    phone: '9000000023',
    email: 'test.warehouse@hungerhunt.local',
    password: 'TestWarehouse123!',
  },
];

const run = async () => {
  if (!ROOM_CODE) throw new Error('--room needs a room code. Nothing was written.');
  for (const account of ACCOUNTS) {
    const problem = phoneProblem(account.phone);
    if (problem) throw new Error(`${account.name}: ${problem} Nothing was written.`);
  }

  await connectForScript();

  const room = await Room.findOne({ code: ROOM_CODE, active: { $ne: false } }).lean();
  if (!room) throw new Error(`No active room with code ${ROOM_CODE} on this database. Nothing was written.`);

  const phones = ACCOUNTS.map((a) => a.phone);
  const taken = await Admin.find({ phone: { $in: phones } }, 'name phone role').lean();
  for (const row of taken) {
    const owner = ACCOUNTS.find((a) => a.phone === row.phone);
    if (row.name !== owner.name) {
      throw new Error(`Phone ${row.phone} already belongs to ${row.name} (${row.role}). Nothing was written.`);
    }
  }

  for (const { role, name, phone, email, password } of ACCOUNTS) {
    const existing = await Admin.findOne({ phone });
    const admin = existing ?? new Admin();
    Object.assign(admin, {
      name,
      phone,
      email: email || undefined,
      password,
      role,
      roomIds: role === 'caretaker' ? [room._id] : [],
      active: true,
      isSuperAdmin: false,
    });
    await admin.save();
    console.log(`${existing ? 'updated' : 'created'}  ${role.padEnd(9)}  ${name}  phone ${phone}  password ${password}`
      + (role === 'caretaker' ? `  room ${room.code}` : ''));
  }
};

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
