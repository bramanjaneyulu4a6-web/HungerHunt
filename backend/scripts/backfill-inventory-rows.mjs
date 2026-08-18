// One-off: give every existing product an Inventory row at stock 0.
// Products created before this repair only got a row on their first goods
// receipt, so anything added and never ordered against is invisible to the
// kiosk, the till, and the Inventory page. Idempotent — the upsert with
// $setOnInsert touches nothing that already has a shelf, so running it twice
// is safe and running it after the fix ships is a no-op.
//
// Run from backend/:  node scripts/backfill-inventory-rows.mjs
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import Inventory from '../models/Inventory.js';

if (!process.env.MONGO_URI) {
  console.error('MONGO_URI is not set — run this from backend/ with its .env present.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

const products = await Product.find().select('_id name').lean();
let created = 0;

for (const product of products) {
  const result = await Inventory.updateOne(
    { productId: product._id },
    { $setOnInsert: { stock: 0 } },
    { upsert: true }
  );

  if (result.upsertedCount) {
    created += 1;
    console.log(`shelved: ${product.name}`);
  }
}

console.log(`${created} inventory row(s) created; ${products.length - created} already had one.`);
await mongoose.disconnect();
