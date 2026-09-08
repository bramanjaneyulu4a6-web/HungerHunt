// Makes email uniqueness apply only when an email is present, and makes staff
// phone numbers unique so warehouse/caretaker login resolves one account.
// Preview first; --apply changes indexes only after collision checks pass.
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.includes('--apply');
await connectForScript();

const duplicateValues = (rows, field) => {
  const seen = new Map();
  const duplicates = new Set();
  for (const row of rows) {
    const value = String(row[field] ?? '').trim().toLowerCase();
    if (!value) continue;
    if (seen.has(value)) duplicates.add(value);
    else seen.set(value, row._id);
  }
  return [...duplicates];
};

const singleFieldIndex = (indexes, field) => indexes.find((index) => {
  const entries = Object.entries(index.key || {});
  return entries.length === 1 && entries[0][0] === field && entries[0][1] === 1;
});

try {
  const admins = mongoose.connection.collection('admins');
  const parents = mongoose.connection.collection('parents');
  const [adminRows, parentRows, adminIndexes, parentIndexes] = await Promise.all([
    admins.find({}, { projection: { _id: 1, phone: 1, email: 1 } }).toArray(),
    parents.find({}, { projection: { _id: 1, email: 1 } }).toArray(),
    admins.indexes(),
    parents.indexes(),
  ]);

  const problems = [
    ...duplicateValues(adminRows, 'phone').map((value) => `duplicate staff phone: ${value}`),
    ...duplicateValues(adminRows, 'email').map((value) => `duplicate staff email: ${value}`),
    ...duplicateValues(parentRows, 'email').map((value) => `duplicate parent email: ${value}`),
  ];
  if (problems.length) {
    console.error('Index migration refused:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exitCode = 1;
  } else if (!apply) {
    console.log('No contact collisions found. The following indexes will be ensured:');
    console.log('  admins.phone — unique');
    console.log('  admins.email — unique when present');
    console.log('  parents.email — unique when present');
    console.log('\nPreview only. Re-run with --apply to update the indexes.');
  } else {
    for (const [collection, indexes] of [[admins, adminIndexes], [parents, parentIndexes]]) {
      const current = singleFieldIndex(indexes, 'email');
      if (current && (!current.unique || !current.sparse)) {
        await collection.dropIndex(current.name);
      }
      await collection.createIndex(
        { email: 1 },
        { unique: true, sparse: true, name: 'email_1' }
      );
    }

    const phoneIndex = singleFieldIndex(adminIndexes, 'phone');
    if (phoneIndex && !phoneIndex.unique) await admins.dropIndex(phoneIndex.name);
    await admins.createIndex({ phone: 1 }, { unique: true, name: 'phone_1' });
    console.log('Contact indexes updated successfully.');
  }
} finally {
  await mongoose.disconnect();
}
