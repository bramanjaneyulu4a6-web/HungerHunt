/* Add 150 units to the union of:
 *   - the 1 Oct requested catalogue products; and
 *   - every active product whose production shelf is below 50.
 * Dark Fantasy is explicitly excluded. Every movement gets a ledger row.
 *
 *   node scripts/addProductionLowStockReplenishment.js --prod
 *   node scripts/addProductionLowStockReplenishment.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import StockAdjustment from '../models/StockAdjustment.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const DELTA = 150;
const EXCLUDED_NAME = 'Dark Fantasy Choco Fills';
const ACTOR_EMAIL = 'dhruv.kamma04@gmail.com';
const REASON = 'Bulk stock addition requested on 1 Oct 2026';
const REQUESTED_NAMES = new Set([
  'Naturo Mango Blast',
  'KitKat',
  'Sip On Tender Coconut Water',
  'Unibic Fruit & Nut Cookies',
  'Unibic Choco Chip Cookies',
  'Head & Shoulders Smooth & Silky 2-in-1 Shampoo Sachet',
  'Doms X1 Graphite Pencils, Sharpener, Eraser - 10 Pencils',
  'Doms Geometry Mathematical Drawing Instrument Box',
  'Pilot V7 Pen - Blue',
]);

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This stock addition is production-only. Pass --prod.');

  const [products, shelves, actor] = await Promise.all([
    Product.find({}).select('_id name active').sort({ name: 1 }).lean(),
    Inventory.find({}).select('_id productId stock').lean(),
    Admin.findOne({ email: ACTOR_EMAIL, active: { $ne: false } }).select('_id email role').lean(),
  ]);
  if (!actor) throw new Error(`Active adjustment actor not found: ${ACTOR_EMAIL}.`);

  const shelfByProduct = new Map(shelves.map((row) => [String(row.productId), row]));
  const productByName = new Map(products.map((row) => [row.name, row]));
  const missingRequested = [...REQUESTED_NAMES].filter((name) => !productByName.has(name));
  if (missingRequested.length) {
    const possibleMatches = products
      .filter((row) => missingRequested.some((name) =>
        row.name.toLowerCase().includes(name.split(' ')[0].toLowerCase())
      ))
      .map((row) => row.name);
    throw new Error(
      `Requested products not found: ${missingRequested.join(', ')}.` +
      (possibleMatches.length ? ` Possible matches: ${possibleMatches.join(', ')}.` : '')
    );
  }

  const plan = products.flatMap((product) => {
    if (product.name === EXCLUDED_NAME) return [];
    const shelf = shelfByProduct.get(String(product._id));
    if (!shelf) {
      if (REQUESTED_NAMES.has(product.name)) {
        throw new Error(`No inventory row for requested product: ${product.name}.`);
      }
      return [];
    }
    if (!REQUESTED_NAMES.has(product.name) && (product.active === false || shelf.stock >= 50)) return [];
    return [{
      inventoryId: shelf._id,
      productId: product._id,
      name: product.name,
      from: shelf.stock,
      delta: DELTA,
      to: shelf.stock + DELTA,
      reason: REQUESTED_NAMES.has(product.name) ? 'requested catalogue product' : 'active stock below 50',
    }];
  });

  const excluded = productByName.get(EXCLUDED_NAME);
  const excludedShelf = excluded ? shelfByProduct.get(String(excluded._id)) : null;
  console.log(JSON.stringify({
    actor: actor.email,
    adjustment: DELTA,
    qualifyingProducts: plan.length,
    excluded: excluded ? { name: excluded.name, stock: excludedShelf?.stock } : null,
    plan: plan.map(({ name, from, delta, to, reason }) => ({ name, from, delta, to, reason })),
  }, null, 2));

  if (!plan.length) {
    console.log('\nNothing qualifies.');
  } else if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update production.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const row of plan) {
          const updated = await Inventory.findOneAndUpdate(
            { _id: row.inventoryId, productId: row.productId, stock: row.from },
            { $inc: { stock: row.delta } },
            { new: true, session }
          );
          if (!updated) {
            throw new Error(`Concurrent stock change detected for ${row.name}; nothing was committed.`);
          }
          await StockAdjustment.create([{
            productId: row.productId,
            delta: row.delta,
            reason: REASON,
            adjustedBy: actor._id,
            stockAfter: updated.stock,
          }], { session });
        }
      });
    } finally {
      await session.endSession();
    }
    console.log(`\nApplied ${plan.length} stock additions and wrote ${plan.length} inventory-history rows.`);
  }
} finally {
  await mongoose.disconnect();
}
