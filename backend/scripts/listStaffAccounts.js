/* Print every staff account on the database named by scripts/lib/connect.mjs
   (local via backend/.env, production via --prod): name, phone, email, role,
   super admin flag, active flag and rooms. Read-only; never prints a password
   hash or reset token.

   Usage:
     node scripts/listStaffAccounts.js                       # local dev
     node scripts/listStaffAccounts.js --prod                # production Atlas
     node scripts/listStaffAccounts.js --prod --role warehouse */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import '../models/Room.js'; // registers Room so the rooms populate resolves
import { connectForScript } from './lib/connect.mjs';

const argv = process.argv.slice(2);
const roleIndex = argv.indexOf('--role');
const ROLE = roleIndex === -1 ? null : String(argv[roleIndex + 1] ?? '').trim();

const run = async () => {
  await connectForScript();

  const filter = ROLE
    ? (ROLE === 'admin' ? { $or: [{ role: 'admin' }, { role: { $exists: false } }] } : { role: ROLE })
    : {};
  const rows = await Admin.find(filter, 'name phone email role isSuperAdmin active roomIds createdAt')
    .sort({ role: 1, name: 1 })
    .populate('roomIds', 'code')
    .lean();

  for (const row of rows) {
    const role = row.role || 'admin';
    const tag = role === 'admin' && row.isSuperAdmin ? 'super admin' : role;
    const rooms = (row.roomIds || []).map((room) => room.code).join(', ');
    console.log(
      `${tag.padEnd(12)} ${String(row.phone ?? '').padEnd(12)} ${(row.email || '-').padEnd(36)} ${row.name}`
      + (row.active === false ? '  [archived]' : '')
      + (rooms ? `  rooms: ${rooms}` : ''),
    );
  }
  console.log(`\n${rows.length} account(s)${ROLE ? ` with role ${ROLE}` : ''}.`);
};

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
