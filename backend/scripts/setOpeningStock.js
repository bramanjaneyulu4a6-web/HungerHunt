// Brings every active product's shelf to one opening figure.
//
// Writes deltas, not the number itself. The Inventory count is meant to stay
// derivable — goods receipts in, sales out, StockAdjustment rows for everything
// else — so each shelf moved here also gets a ledger row naming who moved it
// and why. StockAdjustment's own comment lists opening stock as the case it
// exists for, beside spoilage and stocktake corrections.
//
// That is why --as is required: adjustedBy is a required reference to a real
// Admin, and a movement nobody signed for is exactly what the ledger is meant
// to make impossible.
//
//   npm run stock:opening -- --to 20 --as you@school.org --prod
//   npm run stock:opening -- --to 20 --as you@school.org --prod --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';
import StockAdjustment from '../models/StockAdjustment.js';
import Admin from '../models/Admin.js';
import { planOpeningStock } from '../utils/openingStock.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const valueOf = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? null : args[at + 1];
};

const target = Number(valueOf('--to') ?? 20);
const asEmail = valueOf('--as');

if (!Number.isInteger(target) || target < 0) {
  throw new Error('--to needs a whole number of zero or more.');
}

await connectForScript();

try {
  // Resolved before anything is written: a run that would fail at the last
  // ledger row is better refused at the first.
  const admin = asEmail ? await Admin.findOne({ email: asEmail.toLowerCase() }).lean() : null;

  if (apply && !admin) {
    throw new Error(
      asEmail
        ? `No admin with the email ${asEmail}. Every adjustment has to name one.`
        : 'Pass --as <admin email>. Every stock adjustment names who made it.'
    );
  }

  const products = await Product.find({}).select('_id name active').sort({ name: 1 }).lean();
  const shelves = await Inventory.find({}, { productId: 1, stock: 1 }).lean();
  const plan = planOpeningStock({ products, shelves, target });

  const active = products.filter((p) => p.active !== false).length;
  console.log(`${active} active product(s); ${plan.length} shelf/shelves to move to ${target}.\n`);

  for (const row of plan) {
    console.log(`  ${row.name.padEnd(48)} ${String(row.from).padStart(4)} -> ${row.to}  (${row.delta > 0 ? '+' : ''}${row.delta})`);
  }

  if (!plan.length) {
    console.log('  Nothing to do — every active shelf already reads that figure.');
  }

  if (!apply) {
    if (plan.length) {
      console.log('\nPreview only. Re-run with --apply to write.');
      process.exitCode = 2;
    }
  } else {
    for (const row of plan) {
      // $inc, not $set: another sale or receipt landing mid-run should move
      // the shelf with this, not be overwritten by a figure read seconds ago.
      const shelf = await Inventory.findOneAndUpdate(
        { productId: row.productId },
        { $inc: { stock: row.delta } },
        { new: true, upsert: true }
      );

      await StockAdjustment.create({
        productId: row.productId,
        delta: row.delta,
        reason: `Opening stock set to ${target}`,
        adjustedBy: admin._id,
        stockAfter: shelf.stock,
      });
    }

    console.log(`\nApplied. ${plan.length} shelf/shelves moved, ${plan.length} ledger row(s) written by ${admin.email}.`);
  }
} finally {
  await mongoose.disconnect();
}
