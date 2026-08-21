// Takes the products and stock groups the new catalogue no longer lists off
// sale, after seedCatalogue.js has written the ones it does.
//
// Archives rather than deletes, because the catalogue has no delete anywhere:
// orders, receipts and transactions reference product rows forever, and a
// removed row would break history that is already written. An archived product
// disappears from the kiosk and every sale screen, keeps its stock and its
// sales, and can be restored from the admin console.
//
// The old stock groups are genuinely deleted — nothing references a group the
// way a receipt references a product. The archived products under them keep a
// group id that no longer resolves, so they show a blank category in the
// admin's archived view. That is the cost of retiring a category, and it is
// paid by rows nobody is selling.
//
// Preview what would change first:
//   npm run archive:retired-catalogue
// Apply after reading the list:
//   npm run archive:retired-catalogue -- --apply
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';

import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';
import { retiredProducts, retiredGroups } from '../utils/catalogueRetirement.js';


const apply = process.argv.includes('--apply');
const dataPath = new URL('./data/catalogue.json', import.meta.url);
const catalogue = JSON.parse(await readFile(dataPath, 'utf8'));

const keepProducts = catalogue.products.map((p) => p.name);
const keepGroups = catalogue.stockGroups.map((g) => g.name);

await connectForScript();

try {
  const products = await Product.find({}).select('_id name active').sort({ name: 1 }).lean();
  const groups = await StockGroup.find({}).select('_id name').sort({ name: 1 }).lean();

  // Throws rather than returning everything if the catalogue failed to parse
  // into names — archiving the whole shop is never an intention anyone typed.
  const products_ = retiredProducts(products, keepProducts);
  const groups_ = retiredGroups(groups, keepGroups);

  console.log(`${products.length} products in the catalogue, ${keepProducts.length} on the new list.`);

  if (products_.length) {
    console.log(`\nWould archive ${products_.length} product(s) — off sale, history kept:`);
    for (const product of products_) console.log(`  ${product.name}`);
  } else {
    console.log('\nNo products need archiving.');
  }

  if (groups_.length) {
    console.log(`\nWould delete ${groups_.length} stock group(s):`);
    for (const group of groups_) console.log(`  ${group.name}`);
  } else {
    console.log('\nNo stock groups need deleting.');
  }

  if (!apply) {
    if (products_.length || groups_.length) {
      console.log('\nPreview only. Re-run with --apply to write these changes.');
      process.exitCode = 2;
    }
  } else {
    if (products_.length) {
      await Product.bulkWrite(products_.map((product) => ({
        updateOne: { filter: { _id: product._id }, update: { $set: { active: false } } },
      })));
    }

    if (groups_.length) {
      await StockGroup.deleteMany({ _id: { $in: groups_.map((g) => g._id) } });
    }

    console.log(`\nApplied. ${products_.length} archived, ${groups_.length} group(s) deleted.`);
  }
} finally {
  await mongoose.disconnect();
}
