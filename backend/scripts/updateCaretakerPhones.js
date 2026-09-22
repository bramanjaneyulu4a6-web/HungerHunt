/* Replace staff phone numbers by name. Matches each name exactly (case and
   surrounding spaces ignored), refuses a name that matches zero or several
   accounts, and refuses a phone another account already holds. Preview by
   default; nothing is written without --apply.

   Usage:
     node scripts/updateCaretakerPhones.js --prod "Kuruva Sudhakar=8500044248" ...
     node scripts/updateCaretakerPhones.js --prod --apply "Kuruva Sudhakar=8500044248" ... */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import { connectForScript } from './lib/connect.mjs';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const UPDATES = argv
  .filter((arg) => arg.includes('='))
  .map((arg) => {
    const [name, phone] = arg.split('=').map((part) => part.trim());
    return { name, phone };
  });

const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const run = async () => {
  if (!UPDATES.length) throw new Error('Pass at least one "Name=phone" pair.');
  for (const { name, phone } of UPDATES) {
    if (!name || !/^\d{10}$/.test(phone)) throw new Error(`Bad pair: "${name}=${phone}"`);
  }

  await connectForScript();

  const plan = [];
  for (const { name, phone } of UPDATES) {
    const rows = await Admin.find(
      { name: new RegExp(`^\\s*${escapeRegex(name)}\\s*$`, 'i') },
      'name phone role active',
    ).lean();
    if (rows.length !== 1) throw new Error(`${name}: expected 1 account, found ${rows.length}`);

    const [row] = rows;
    const clash = await Admin.findOne({ phone, _id: { $ne: row._id } }, 'name role').lean();
    if (clash) throw new Error(`${phone} already belongs to ${clash.name} (${clash.role})`);

    console.log(`${row.role || 'admin'} ${row.name}: ${row.phone} -> ${phone}`
      + (row.active === false ? '  [archived]' : ''));
    plan.push({ id: row._id, phone });
  }

  if (!APPLY) {
    console.log('\nPreview only; rerun with --apply to write.');
    return;
  }
  for (const { id, phone } of plan) {
    await Admin.updateOne({ _id: id }, { $set: { phone } });
  }
  console.log(`\nUpdated ${plan.length} account(s).`);
};

try {
  await run();
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
