/* Creates (or repairs) the showroom student — the account a visiting parent is
 * handed at an open day to drive the kiosk themselves.
 *
 * This is the only thing in the codebase that sets Student.demoAccount. The
 * flag is deliberately absent from WRITABLE_FIELDS in
 * controllers/studentController.js, which is the whitelist every admin route
 * and the CSV importer write through, so neither the roster screen nor a
 * spreadsheet can turn a real child into a demo account by accident. A demo
 * account's orders are never recorded and its parent is never notified, so
 * that mistake would look exactly like a child's purchases silently vanishing.
 *
 * Preview by default, like student:checkout — it writes only with --apply.
 *
 *   npm run student:demo -- --room H1
 *   npm run student:demo -- --room H1 --prod --apply
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import Parent from '../models/Parent.js';
import { purchaseCodeProblem } from '../utils/validation.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag, fallback = null) => {
  const at = args.indexOf(flag);
  return at === -1 ? fallback : args[at + 1];
};

const admissionNumber = String(valueOf('--admission', 'DEMO01')).trim().toUpperCase();
const code = String(valueOf('--code', '2026'));
const roomCode = valueOf('--room');
const pocketMoney = Number(valueOf('--balance', '3000'));

/* A number that is not a phone number anybody has. parentPhoneNumber is
   required on the schema and studentLinks matches parents by it, so it cannot
   be left blank — but it must never reach a real family. 0000000000 fails the
   ten-digit Indian-mobile shape the parent app registers with, so no Parent
   row can ever come to exist carrying it. That is the second lock; the first
   is that no code path notifies a demo account's parent at all. */
const parentPhoneNumber = '0000000000';

if (!roomCode) throw new Error('Pass --room <code>, e.g. --room H1.');

const problem = purchaseCodeProblem(code);
if (problem) throw new Error(problem);

if (!Number.isFinite(pocketMoney) || pocketMoney <= 0) {
  throw new Error('--balance must be a positive number. The kiosk turns away an empty wallet.');
}

await connectForScript();

try {
  const room = await Room.findOne({ code: roomCode, active: true }).lean();

  if (!room) throw new Error(`No active room with code ${roomCode}.`);

  const existing = await Student.findOne({ admissionNumber })
    .select('_id name admissionNumber demoAccount pocketMoney roomNumber active')
    .lean();

  /* Refuses rather than converting. An admission number that is already on the
     roll belongs to a child, and turning that row into a demo account would
     stop their orders being recorded and their parent being told — quietly,
     and for as long as it took somebody to notice. */
  if (existing && existing.demoAccount !== true) {
    throw new Error(
      `${admissionNumber} already exists and is a real student (${existing.name}).` +
      ' Refusing to convert it. Pick a different --admission.'
    );
  }

  if (await Parent.exists({ phone: parentPhoneNumber })) {
    throw new Error(
      `A parent account exists on ${parentPhoneNumber}. The demo account's phone must` +
      ' reach nobody. Nothing was written.'
    );
  }

  console.log(existing ? `Repairing demo student ${admissionNumber}.` : `Creating demo student ${admissionNumber}.`);
  console.log(`  name           Demo Student`);
  console.log(`  room           ${room.code}`);
  console.log(`  balance        ₹${pocketMoney} (never debited)`);
  console.log(`  purchase code  ${code} (stored hashed)`);
  console.log(`  parent phone   ${parentPhoneNumber} (unreachable by design)`);
  console.log(`  demoAccount    true — no order is recorded, no parent is notified\n`);

  if (!apply) {
    console.log('Preview only. Re-run with --apply to write.');
    process.exitCode = 2;
  } else {
    const document = {
      name: 'Demo Student',
      fatherName: 'Demo',
      className: 'Demo',
      section: '',
      roomId: room._id,
      roomNumber: room.code,
      admissionNumber,
      parentPhoneNumber,
      demoAccount: true,
      pocketMoney,
      // A demo must never wait on a parent, and must never be capped.
      requiresParentApproval: false,
      'walletControl.enabled': false,
      isParentRegistered: false,
      purchasePassword: await bcrypt.hash(code, 10),
      purchaseCodeIsPin: true,
      purchaseCodeAttempts: 0,
      purchaseCodeLockedUntil: null,
      active: true,
    };

    await Student.updateOne({ admissionNumber }, { $set: document }, { upsert: true });

    // Read back rather than trusting the write: this is the one account whose
    // whole purpose is that a flag is set, and an upsert that silently did not
    // set it would look like a working demo that records everything.
    const written = await Student.findOne({ admissionNumber })
      .select('_id name admissionNumber demoAccount pocketMoney requiresParentApproval')
      .lean();

    if (written?.demoAccount !== true) {
      throw new Error('The demo flag did not stick. Check the Student schema.');
    }

    console.log(`Applied. ${written.name} (${written.admissionNumber}) is a demo account.`);
    console.log('Sign in at the kiosk with that admission number and code', code + '.');
  }
} finally {
  await mongoose.disconnect();
}
