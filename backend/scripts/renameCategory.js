// Renames a stock group in place, keeping its id, so every product under it
// stays attached. The API seals category names (see routes/stockGroupRoutes.js)
// and the catalogue seed matches groups by name, so a rename is this row plus
// the same edit in scripts/data/catalogue.json and frontend-admin's units map.
//
// Preview:
//   node scripts/renameCategory.js "Beverages" "Drinks" --prod
// Apply:
//   node scripts/renameCategory.js "Beverages" "Drinks" --prod --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';

import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';

const [from, to] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');

if (!from || !to) {
  console.error('Usage: node scripts/renameCategory.js "<old name>" "<new name>" [--prod] [--apply]');
  process.exit(1);
}

await connectForScript();

try {
  const groups = await StockGroup.find({}, { name: 1 }).lean();
  console.log(`Categories: ${groups.map((g) => g.name).join(' | ')}`);

  const group = await StockGroup.findOne({ name: from });
  if (!group) {
    console.log(`No "${from}" category — nothing to do.`);
  } else if (await StockGroup.exists({ name: to })) {
    console.error(`"${to}" already exists — refusing to rename onto it.`);
    process.exitCode = 1;
  } else {
    const count = await Product.countDocuments({ stockGroup: group._id });
    console.log(`"${from}" (${group._id}) holds ${count} products.`);

    if (apply) {
      group.name = to;
      await group.save();
      const after = await Product.countDocuments({ stockGroup: group._id });
      console.log(`Renamed to "${to}"; it holds ${after} products.`);
    } else {
      console.log('Preview only — add --apply to rename.');
    }
  }
} finally {
  await mongoose.disconnect();
}
