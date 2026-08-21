// Gives rows written before the MRP field an MRP to be discounted from.
//
// Every such product already has a price the till has been charging, and that
// price is by definition what the school sells it for with nothing taken off.
// So mrp becomes that price and the rate becomes zero: nothing at the till
// moves, and the office can set a real MRP and discount per product whenever
// it next edits one.
//
// Preview what would change first:
//   npm run backfill:product-mrp
// Apply after reviewing the list:
//   npm run backfill:product-mrp -- --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import Product from '../models/Product.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGO_URI);

// Said out loud before any figure is printed, because the failure this script
// invites is running it against the wrong database and believing the result:
// "no products need a backfill" reads identically whether production is
// already done or whether a mistyped MONGO_URI quietly fell back to dev.
console.log(`Connected to ${mongoose.connection.host} / ${mongoose.connection.name}\n`);

try {
  // Archived products are included on purpose: one restored later would
  // otherwise be the single row in the catalogue with no MRP, and it would be
  // found by an admin trying to discount it rather than by this script.
  const products = await Product.find({
    $or: [{ mrp: { $exists: false } }, { mrp: null }],
  }).select('_id name price').sort({ name: 1 }).lean();

  if (!products.length) {
    console.log('No products need an MRP backfill.');
  } else {
    console.log('Products to be given an MRP (review before applying):');
    for (const product of products) {
      console.log(`  ${product.name} -> mrp ${product.price}, 0% off, still sells at ${product.price}`);
    }
  }

  // A row with no price either is a row this script cannot reason about — it
  // predates a rule the catalogue has enforced since, so it is named and left
  // alone rather than given an invented figure.
  const unpriced = products.filter((product) => !(product.price > 0));

  if (unpriced.length) {
    console.log('\nSkipped — no price to copy, fix these by hand:');
    for (const product of unpriced) console.log(`  ${product.name}`);
  }

  const fixable = products.filter((product) => product.price > 0);

  if (!apply) {
    if (products.length) {
      console.log('\nPreview only. Re-run with --apply to persist these figures.');
      process.exitCode = 2;
    }
  } else if (fixable.length) {
    await Product.bulkWrite(fixable.map((product) => ({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { mrp: product.price, discountRate: 0 } },
      },
    })));
    console.log(`\nUpdated ${fixable.length} product(s).`);
  }
} finally {
  await mongoose.disconnect();
}
