/* Make an admin account the super admin, on the database named by
   scripts/lib/connect.mjs (local via backend/.env, production via --prod).

   Usage:
     node scripts/grantSuperAdmin.js <email>                    # local dev
     node scripts/grantSuperAdmin.js <email> --prod             # production Atlas
     node scripts/grantSuperAdmin.js <email> --revoke           # take it back
     node scripts/grantSuperAdmin.js <email> --create \
       --name "Full Name" --phone 9000000000 --password ...     # no account yet

   Idempotent: an admin that already holds the flag is reported, not rewritten.
   Refuses a warehouse or caretaker row rather than promoting it — the flag
   belongs to the admin role alone. With --create, an account that is not
   there yet is registered as a full admin first; without it, a missing
   account is an error and nothing is written. Writes directly, so the
   MAX_ADMIN_ACCOUNTS cap on the /register route does not apply. */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin, { FULL_ADMIN, SUPER_ADMIN } from '../models/Admin.js';
import { connectForScript } from './lib/connect.mjs';
import { emailProblem, phoneProblem } from '../utils/validation.js';

const argv = process.argv.slice(2);
const flag = (name) => argv.includes(name);
const option = (name) => {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
};

const email = String(argv.find((arg) => !arg.startsWith('--') && !isOptionValue(arg)) ?? '')
  .trim()
  .toLowerCase();

function isOptionValue(arg) {
  const index = argv.indexOf(arg);
  return index > 0 && ['--name', '--phone', '--password'].includes(argv[index - 1]);
}

const run = async () => {
  if (!email || emailProblem(email)) {
    throw new Error(`Usage: node scripts/grantSuperAdmin.js <email> [--prod] [--revoke] [--create --name ... --phone ... --password ...]. Nothing was written.`);
  }

  const revoke = flag('--revoke');
  const create = flag('--create');
  const details = { name: option('--name')?.trim(), phone: option('--phone')?.trim(), password: option('--password') };

  if (create) {
    if (revoke) throw new Error('--create and --revoke do not go together. Nothing was written.');
    if (!details.name) throw new Error('--create needs --name. Nothing was written.');
    const phoneIssue = phoneProblem(details.phone ?? '');
    if (phoneIssue) throw new Error(`--create needs a valid --phone: ${phoneIssue} Nothing was written.`);
    if (!details.password || details.password.length < 8) {
      throw new Error('--create needs a --password of at least 8 characters. Nothing was written.');
    }
  }

  await connectForScript();

  let admin = await Admin.findOne({ email });

  if (admin && (admin.role || 'admin') !== 'admin') {
    throw new Error(`${email} is a ${admin.role} account, not an admin. Nothing was written.`);
  }

  if (!admin) {
    if (!create) {
      throw new Error(
        `No admin account has the email ${email}. Register it first, or re-run with --create --name --phone --password. Nothing was written.`
      );
    }
    if (await Admin.exists({ phone: details.phone })) {
      throw new Error(`Phone ${details.phone} already belongs to another account. Nothing was written.`);
    }
    admin = new Admin({
      name: details.name,
      email,
      phone: details.phone,
      password: details.password,
      role: 'admin',
      roomIds: [],
      active: true,
    });
    await admin.save();
    console.log(`created  ${email}  (${details.name})`);
  }

  const wanted = !revoke;
  if (admin.isSuperAdmin === wanted) {
    console.log(`${email} is already ${wanted ? 'a super admin' : 'a plain admin'}. Nothing to change.`);
  } else {
    admin.isSuperAdmin = wanted;
    if (admin.active === false) {
      admin.active = true;
      console.log(`${email} was archived; restored so the grant means something.`);
    }
    await admin.save();
    console.log(`${wanted ? 'granted' : 'revoked'}  super admin  ${email}  (${admin.name})`);
  }

  const [supers, admins] = await Promise.all([
    Admin.countDocuments({ ...SUPER_ADMIN, active: { $ne: false } }),
    Admin.countDocuments({ ...FULL_ADMIN, active: { $ne: false } }),
  ]);
  console.log(`\nActive super admins on this database: ${supers} (of ${admins} admins)`);
};

try {
  await run();
} catch (error) {
  // The message is the whole story for every refusal above; a stack trace
  // would bury "nothing was written" under module paths.
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
