// Takes every product in the catalogue back to its MRP: discountRate to zero,
// price recomputed from the MRP with nothing off.
//
// price is arithmetic, not a stored decision, so it is recalculated through
// utils/pricing.js rather than copied from mrp — the cap and the rounding are
// that function's business, and a product priced in paise must keep its paise.
//
// Archived and inactive products are included. One restored or re-activated
// later would otherwise be the only row still carrying a discount, and it
// would be found at the till rather than here.
//
// Preview what would change first:
//   npm run products:clear-discounts
// Apply after reviewing the list:
//   npm run products:clear-discounts -- --apply
// Add --prod for the live database.
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import { finalPrice } from '../utils/pricing.js';

import Product from '../models/Product.js';


const apply = process.argv.includes('--apply');
await connectForScript();

try {
  const discounted = await Product.find({ discountRate: { $gt: 0 } })
    .select('_id name mrp discountRate price')
    .sort({ name: 1 })
    .lean();

  if (!discounted.length) {
    console.log('No product carries a discount. Nothing to do.');
  } else {
    console.log(`${discounted.length} product(s) carry a discount:`);
    for (const product of discounted) {
      const was = product.price;
      const now = finalPrice(product.mrp, 0);
      console.log(
        `  ${product.name}: ${product.discountRate}% off ${product.mrp} -> 0%, ` +
          `sells at ${was} -> ${now}`
      );
    }
  }

  // A discounted row with no MRP has nothing to price against, and this script
  // will not invent one. It is named and left alone; backfill:product-mrp is
  // the script that gives it an MRP.
  const noMrp = discounted.filter((product) => !(product.mrp > 0));

  if (noMrp.length) {
    console.log('\nSkipped — no MRP to price against, run backfill:product-mrp first:');
    for (const product of noMrp) console.log(`  ${product.name}`);
  }

  const fixable = discounted.filter((product) => product.mrp > 0);

  if (!apply) {
    if (discounted.length) {
      console.log('\nPreview only. Re-run with --apply to persist these figures.');
      process.exitCode = 2;
    }
  } else if (fixable.length) {
    await Product.bulkWrite(fixable.map((product) => ({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { discountRate: 0, price: finalPrice(product.mrp, 0) } },
      },
    })));
    console.log(`\nUpdated ${fixable.length} product(s).`);
  }
} finally {
  await mongoose.disconnect();
}
