/* Takes a group of products off the students' kiosk screen, or puts them back.
 *
 * This writes kioskVisible, not active, and the difference is the whole point.
 * Archiving a product (active: false) withdraws it from sale everywhere and
 * files it away; disabling it (kioskVisible: false) only takes it off the
 * students' screen, so staff can still ring it up at the admin till and it
 * stays in the admin's catalogue views wearing an overlay. "Disable the soft
 * drinks" is the second of those. See models/Product.js.
 *
 * Both flags follow the same convention: a row written before the field has
 * no flag and absent means visible, so the filters spell that out as
 * { kioskVisible: { $ne: false } } rather than letting Mongo infer it.
 *
 * Preview what would change first:
 *   npm run products:kiosk -- --sub "Soft Drinks" --hide
 * Apply after reviewing the list:
 *   npm run products:kiosk -- --sub "Soft Drinks" --hide --apply
 * Add --prod for the live database, and --show to reverse it.
 *
 * --group narrows to one stock group when a subcategory name is not unique
 * across the catalogue. Without it the name is matched wherever it appears,
 * which is reported either way — the preview names every row it would touch,
 * so a match in a group you did not mean is visible before anything is written.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const hide = args.includes('--hide');
const show = args.includes('--show');
const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : args[at + 1];
};

const subCategory = valueOf('--sub');
const groupName = valueOf('--group');

if (hide === show) {
  throw new Error('Pass exactly one of --hide or --show.');
}
if (!subCategory) {
  throw new Error('Pass --sub "<subcategory>", e.g. --sub "Soft Drinks".');
}

// The value being written, and the one that means "already like that".
const kioskVisible = show;

await connectForScript();

try {
  const filter = { subCategory };

  if (groupName) {
    const group = await StockGroup.findOne({ name: groupName }).select('_id').lean();

    if (!group) throw new Error(`No stock group named ${groupName}.`);

    filter.stockGroup = group._id;
  }

  const products = await Product.find(filter)
    .select('_id name subCategory stockGroup active kioskVisible')
    .populate('stockGroup', 'name')
    .sort({ name: 1 })
    .lean();

  if (!products.length) {
    throw new Error(
      `No product has subCategory "${subCategory}"` +
        (groupName ? ` in ${groupName}.` : '.') +
        ' Nothing was written — check the spelling against the catalogue.'
    );
  }

  const verb = hide ? 'Hiding' : 'Showing';
  console.log(`${verb} ${products.length} product(s) with subCategory "${subCategory}":\n`);

  /* Archived rows are named but left out of the count that matters. Their
     kioskVisible is not what is keeping them off the screen, so flipping it
     would report a change that nobody can see — and on --show it would read
     as putting a withdrawn product back on sale, which this script does not
     do. reactivating one is products' own job. */
  const archived = products.filter((product) => product.active === false);
  const changing = products.filter(
    (product) => product.active !== false && (product.kioskVisible !== false) !== kioskVisible
  );
  const already = products.filter(
    (product) => product.active !== false && (product.kioskVisible !== false) === kioskVisible
  );

  for (const product of products) {
    const group = product.stockGroup?.name ?? '(no group)';
    const state =
      product.active === false
        ? 'archived — left alone'
        : (product.kioskVisible !== false) === kioskVisible
          ? 'already ' + (kioskVisible ? 'visible' : 'hidden')
          : (kioskVisible ? 'hidden -> visible' : 'visible -> hidden');
    console.log(`  ${group.padEnd(14)} ${product.name.padEnd(22)} ${state}`);
  }

  console.log(
    `\n${changing.length} to change, ${already.length} already ${kioskVisible ? 'visible' : 'hidden'}` +
      (archived.length ? `, ${archived.length} archived and skipped.` : '.')
  );

  if (!changing.length) {
    console.log('Nothing to do.');
  } else if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write.');
    process.exitCode = 2;
  } else {
    const result = await Product.updateMany(
      { _id: { $in: changing.map((product) => product._id) } },
      { $set: { kioskVisible } }
    );

    // Read back rather than trusting the write. The whole purpose here is that
    // a flag is set, and an update that silently did not set it would look
    // like a working change that students can still see.
    const written = await Product.find({ _id: { $in: changing.map((p) => p._id) } })
      .select('name kioskVisible')
      .lean();
    const wrong = written.filter((product) => (product.kioskVisible !== false) !== kioskVisible);

    if (wrong.length) {
      throw new Error(
        `The flag did not stick on: ${wrong.map((p) => p.name).join(', ')}. Check the Product schema.`
      );
    }

    console.log(`\nApplied. ${result.modifiedCount} product(s) updated and verified.`);
    console.log(
      kioskVisible
        ? 'They are back on the kiosk. No rebuild needed — this is data, not code.'
        : 'They are off the kiosk. Staff can still ring them up at the admin till.'
    );
  }
} finally {
  await mongoose.disconnect();
}
