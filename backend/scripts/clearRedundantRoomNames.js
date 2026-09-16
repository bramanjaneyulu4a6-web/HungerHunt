// Clears a room's name where it only repeats the block already in its code.
// The roster imports stored "MINDS BOYS - 123" with the name "Minds Boys", and
// every screen that shows `code — name` then printed the block twice. Codes are
// left untouched: students, caretakers and order snapshots point at them.
//
// Preview:
//   node scripts/clearRedundantRoomNames.js --prod
// Apply:
//   node scripts/clearRedundantRoomNames.js --prod --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Room from '../models/Room.js';

const apply = process.argv.includes('--apply');

const squash = (value) => String(value ?? '').toUpperCase().replace(/\s+/g, ' ').trim();

// The name is redundant when the code already begins with it, which is the
// block ("MINDS BOYS - 123" begins with "MINDS BOYS").
const isRedundant = (room) => {
  const name = squash(room.name);
  return Boolean(name) && squash(room.code).startsWith(name);
};

await connectForScript();

try {
  const rooms = await Room.find({}, { code: 1, name: 1 }).lean();
  const redundant = rooms.filter(isRedundant);
  const kept = rooms.filter((room) => room.name && !isRedundant(room));

  console.log(`${rooms.length} rooms; ${redundant.length} carry a name that repeats their code.`);
  redundant.slice(0, 5).forEach((room) => console.log(`  ${room.code} — ${room.name}`));
  if (redundant.length > 5) console.log(`  … and ${redundant.length - 5} more`);
  if (kept.length) {
    console.log(`Left alone (name adds something):`);
    kept.forEach((room) => console.log(`  ${room.code} — ${room.name}`));
  }

  if (!apply) {
    console.log('Preview only — add --apply to clear them.');
  } else if (redundant.length) {
    const result = await Room.updateMany(
      { _id: { $in: redundant.map((room) => room._id) } },
      { $set: { name: '' } }
    );
    const left = (await Room.find({}, { code: 1, name: 1 }).lean()).filter(isRedundant).length;
    console.log(`Cleared ${result.modifiedCount} names; ${left} redundant names remain.`);
  }
} finally {
  await mongoose.disconnect();
}
