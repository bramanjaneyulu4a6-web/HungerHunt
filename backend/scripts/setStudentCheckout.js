// Prepares one student's checkout settings — the purchase code, the wallet
// limit and whether a parent has to approve. Written for standing up a test
// account, which otherwise means a parent app sign-up to set a code the school
// side cannot set at all.
//
// Deliberately one student at a time, named in full, with a preview: the
// purchase code is a child's only secret at the till, and a tool that could
// rewrite them in bulk is not one worth having.
//
//   npm run student:checkout -- --student "Test Student" --hostel TEST --prod
//   npm run student:checkout -- --student "Test Student" --hostel TEST --code 0000 \
//     --no-limit --no-approval --prod --apply
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Student from '../models/Student.js';
import { purchaseCodeProblem } from '../utils/validation.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : args[at + 1];
};

const name = valueOf('--student');
const hostel = valueOf('--hostel');
const code = valueOf('--code');

if (!name) throw new Error('Pass --student "<full name>".');

if (code !== null) {
  // The same rule the parent app enforces, rather than a second opinion on it.
  const problem = purchaseCodeProblem(code);
  if (problem) throw new Error(problem);
}

await connectForScript();

try {
  const query = { name, ...(hostel ? { hostelNumber: hostel } : {}) };
  const matches = await Student.find(query)
    .select('_id name hostelNumber admissionNumber active requiresParentApproval walletControl purchaseCodeIsPin')
    .lean();

  if (!matches.length) {
    throw new Error(`No student named "${name}"${hostel ? ` in hostel ${hostel}` : ''}.`);
  }

  // Names are not unique — the roster's uniqueness is name+father+phone — so a
  // second match is a question for a person, not something to guess at.
  if (matches.length > 1) {
    console.log('More than one student matches. Narrow it with --hostel:');
    for (const s of matches) console.log(`  ${s.name} — hostel ${s.hostelNumber}, admission ${s.admissionNumber ?? '(none)'}`);
    throw new Error('Refusing to guess which student was meant.');
  }

  const student = matches[0];
  const changes = [];

  if (code !== null) changes.push(`purchase code -> ${code} (stored hashed)`);
  if (args.includes('--no-limit')) changes.push('wallet limit -> off');
  if (args.includes('--limit')) changes.push('wallet limit -> on');
  if (args.includes('--no-approval')) changes.push('parent approval -> off');
  if (args.includes('--approval')) changes.push('parent approval -> on');

  console.log(`${student.name} — hostel ${student.hostelNumber}, admission ${student.admissionNumber ?? '(none)'}${student.active === false ? ' [ARCHIVED]' : ''}`);
  console.log(`  now: limit ${student.walletControl?.enabled ? 'on' : 'off'}, approval ${student.requiresParentApproval ? 'on' : 'off'}, code ${student.purchaseCodeIsPin ? 'set (4-digit)' : 'not known to be a 4-digit code'}\n`);

  if (!changes.length) {
    console.log('  Nothing asked for. Pass --code, --no-limit/--limit, --no-approval/--approval.');
  } else {
    for (const line of changes) console.log(`  ${line}`);
  }

  if (!apply) {
    if (changes.length) {
      console.log('\nPreview only. Re-run with --apply to write.');
      process.exitCode = 2;
    }
  } else if (changes.length) {
    const update = {};

    if (code !== null) {
      // Same cost factor the parent app uses, so the hash is indistinguishable
      // from one a parent set.
      update.purchasePassword = await bcrypt.hash(String(code), 10);
      update.purchaseCodeIsPin = true;
      // A test account that has been failing codes would otherwise stay locked
      // out with a fresh code in hand.
      update.purchaseCodeAttempts = 0;
      update.purchaseCodeLockedUntil = null;
    }

    if (args.includes('--no-limit')) update['walletControl.enabled'] = false;
    if (args.includes('--limit')) update['walletControl.enabled'] = true;
    if (args.includes('--no-approval')) update.requiresParentApproval = false;
    if (args.includes('--approval')) update.requiresParentApproval = true;

    await Student.updateOne({ _id: student._id }, { $set: update });
    console.log(`\nApplied to ${student.name}.`);
  }
} finally {
  await mongoose.disconnect();
}
