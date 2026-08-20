/* Loads only the measurement units from scripts/data/catalogue.json.
 *
 * Preview first (no writes):  npm run seed:units
 * Apply after reviewing:      npm run seed:units -- --apply
 *
 * This exists because seedCatalogue.js cannot be used for the job. That script
 * $sets price, active, subCategory, reorderLevel, safetyStock and unit on every
 * product it knows about, which is right when laying down an opening catalogue
 * and ruinous afterwards: on a trading database it would reset prices the
 * office has since changed, restore products they archived, and — the reason
 * this file exists — put every product back to `pc`, undoing the very unit
 * assignments a units seed is run to enable.
 *
 * So this touches the units collection and nothing else. It cannot write to
 * products; it does not import the model.
 *
 * Idempotent by name, and it never deletes: products reference units by id
 * forever, so removing one would leave a catalogue row pointing at nothing.
 * A unit that exists with a different symbol is corrected in place.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import Unit from '../models/Unit.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
const dataPath = new URL('./data/catalogue.json', import.meta.url);
const { units } = JSON.parse(await readFile(dataPath, 'utf8'));

const problems = [];
const seenNames = new Set();
const seenSymbols = new Set();

for (const unit of units) {
  const name = String(unit?.name ?? '').trim();
  const symbol = String(unit?.symbol ?? '').trim();

  if (!name) problems.push(`a unit has no name: ${JSON.stringify(unit)}`);
  if (!symbol) problems.push(`${name || 'a unit'} has no symbol`);
  if (seenNames.has(name)) problems.push(`duplicate unit name: ${name}`);
  // The admin console's category map keys on the symbol, so two units sharing
  // one would make the dropdown ambiguous even though Mongo would accept them.
  if (seenSymbols.has(symbol)) problems.push(`duplicate unit symbol: ${symbol}`);

  seenNames.add(name);
  seenSymbols.add(symbol);
}

if (problems.length) {
  console.error('Refusing to seed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

try {
  // Printed before anything else, because the one mistake this script can
  // still make is being pointed at the wrong database.
  console.log(`Target: ${mongoose.connection.name} on ${mongoose.connection.host}\n`);

  const existing = new Map(
    (await Unit.find({}, { name: 1, symbol: 1, _id: 0 }).lean()).map((u) => [u.name, u.symbol])
  );

  const toCreate = units.filter((u) => !existing.has(u.name));
  const toCorrect = units.filter((u) => existing.has(u.name) && existing.get(u.name) !== u.symbol);
  const unchanged = units.length - toCreate.length - toCorrect.length;

  for (const unit of toCreate) console.log(`  create   ${unit.symbol}  (${unit.name})`);
  for (const unit of toCorrect) {
    console.log(`  correct  ${unit.name}: ${existing.get(unit.name)} → ${unit.symbol}`);
  }
  console.log(`\n${toCreate.length} to create, ${toCorrect.length} to correct, ${unchanged} already correct.`);

  if (!apply) {
    // Exit 2, matching seedCatalogue.js: a preview is not a success, so a
    // script that chains on this one does not mistake it for work done.
    console.log('\nPreview only. Re-run with --apply to write.');
    process.exitCode = 2;
  } else if (!toCreate.length && !toCorrect.length) {
    console.log('\nNothing to do.');
  } else {
    await Unit.bulkWrite(units.map((unit) => ({
      updateOne: {
        filter: { name: unit.name },
        update: { $set: { symbol: unit.symbol } },
        upsert: true,
      },
    })));

    console.log(`\nApplied. ${await Unit.countDocuments()} units.`);
  }
} finally {
  await mongoose.disconnect();
}
