// Adds the required human identity to staff rows created before name and phone
// existed. These values cannot be inferred honestly, so a reviewed JSON file is
// required before this script will write anything.
//
// Preview missing accounts:
//   npm run backfill:staff-profiles
// Apply reviewed values:
//   npm run backfill:staff-profiles -- --apply --profiles=./staff-profiles.json
//
// JSON shape:
// {
//   "admin@example.com": { "name": "Priya Sharma", "phone": "9876543210" }
// }
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
const profilesArg = process.argv.find((value) => value.startsWith('--profiles='));
const profilesPath = profilesArg?.slice('--profiles='.length);

await mongoose.connect(process.env.MONGO_URI);

try {
  const missing = await Admin.find({
    $or: [
      { name: { $exists: false } },
      { name: '' },
      { phone: { $exists: false } },
      { phone: '' },
    ],
  }).select('_id email role name phone').lean();

  if (!missing.length) {
    console.log('Every staff account already has a name and phone number.');
  } else {
    console.log('Staff accounts missing required profile details:');
    for (const account of missing) {
      console.log(`  ${account.email} (${account.role || 'admin'})`);
    }
  }

  if (!apply) {
    if (missing.length) {
      console.log('\nPreview only. Create a reviewed profiles JSON file, then re-run with --apply and --profiles=<path>.');
      process.exitCode = 2;
    }
  } else {
    if (missing.length) {
      if (!profilesPath) throw new Error('--profiles=<path> is required with --apply.');

      const parsed = JSON.parse(await readFile(profilesPath, 'utf8'));
      const profiles = new Map(
        Object.entries(parsed).map(([email, profile]) => [email.trim().toLowerCase(), profile])
      );
      const unresolved = missing.filter((account) => {
        const profile = profiles.get(account.email.toLowerCase());
        return !String(profile?.name ?? '').trim() || !String(profile?.phone ?? '').trim();
      });

      if (unresolved.length) {
        throw new Error(`No complete reviewed profile was supplied for: ${unresolved.map((row) => row.email).join(', ')}`);
      }

      await Admin.bulkWrite(missing.map((account) => {
        const profile = profiles.get(account.email.toLowerCase());
        return {
          updateOne: {
            filter: { _id: account._id },
            update: {
              $set: {
                name: String(profile.name).trim(),
                phone: String(profile.phone).trim(),
              },
            },
          },
        };
      }));
    }

    const remaining = await Admin.countDocuments({
      $or: [
        { name: { $exists: false } }, { name: '' },
        { phone: { $exists: false } }, { phone: '' },
      ],
    });
    if (remaining) throw new Error(`Backfill incomplete: ${remaining} staff account(s) remain unresolved.`);

    console.log(`Staff profile backfill complete: ${missing.length} account(s) updated.`);
  }
} finally {
  await mongoose.disconnect();
}
