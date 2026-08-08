/* Reports how far the roster has moved onto four-digit purchase codes.
 *
 * The codes are bcrypt hashes, so no query can ask whether one is four digits.
 * Student.purchaseCodeIsPin records the answer instead — set when a parent
 * saves a code, and set at the counter the first time a four-digit code is
 * accepted. This counts what is left.
 *
 * Read-only. It never writes, and never sees a code: the only fields it reads
 * are two booleans and a null check.
 *
 * Do not be alarmed by a large "not yet known" on the first run. It means
 * exactly that — not known — and most of it will be students whose code always
 * was four digits, clearing itself the next time they buy something. What is
 * left after that are the students whose parent has to set a new code before
 * the counter can serve them, which is what this number is for: knowing how
 * many families to warn, and watching it reach zero.
 *
 *   node scripts/purchaseCodeAudit.js
 */

import 'dotenv/config';
import mongoose from 'mongoose';

import Student from '../models/Student.js';

const run = async () => {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI is not set.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);

  const hasCode = { purchasePassword: { $ne: null } };

  const [total, withCode, confirmed] = await Promise.all([
    Student.countDocuments(),
    Student.countDocuments(hasCode),
    Student.countDocuments({ ...hasCode, purchaseCodeIsPin: true }),
  ]);

  const unknown = withCode - confirmed;
  const share = withCode === 0 ? 0 : Math.round((confirmed / withCode) * 100);

  console.log(`students on the roster                 ${total}`);
  console.log(`  with a purchase code set             ${withCode}`);
  console.log(`    confirmed four digits              ${confirmed}  (${share}%)`);
  console.log(`    not yet known                      ${unknown}`);
  console.log(`  no code set (nothing to migrate)     ${total - withCode}`);

  if (withCode === 0) {
    console.log('\nNobody has set a purchase code yet, so there is nothing to migrate.');
  } else if (unknown === 0) {
    console.log('\nEvery code in use is a four-digit one. Nothing left to migrate.');
  } else {
    console.log(
      `\n${unknown} student(s) have not used a four-digit code yet. Most will clear` +
      '\nthemselves on their next purchase, since a code that always was four digits' +
      '\nis recorded the first time it is accepted. Any that remain cannot be served' +
      '\nat the counter until their parent sets a new code — Forgot Purchase Code' +
      '\nasks only for the account password, so the old code is not needed.'
    );
  }

  await mongoose.disconnect();
};

run().catch(async (err) => {
  console.error(err);
  await mongoose.disconnect();
  process.exit(1);
});
