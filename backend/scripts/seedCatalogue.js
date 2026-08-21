/* Loads the opening catalogue — stock groups, units, products and their
 * shelves — from scripts/data/catalogue.json.
 *
 * Preview first (no writes):  npm run seed:catalogue
 * Apply after reviewing:      npm run seed:catalogue -- --apply
 *
 * Idempotent by name: every product, group and unit is matched on its unique
 * name, so a second run reconciles rather than duplicates. It never deletes,
 * because money remembers products — the catalogue's own rule.
 *
 * Prices are not defaulted here. A row without one is refused before anything
 * is written, since an unpriced product on the till is given away free.
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';
import Unit from '../models/Unit.js';
import Inventory from '../models/Inventory.js';
import { normalizeSubCategory } from '../utils/productSubcategory.js';
import { isNonNegativeNumber, isPositiveNumber } from '../utils/quantities.js';
import { finalPrice, isValidDiscountRate } from '../utils/pricing.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
const dataPath = new URL('./data/catalogue.json', import.meta.url);
const { stockGroups, units, products } = JSON.parse(await readFile(dataPath, 'utf8'));

/* Everything that would make Mongo refuse a row, checked before the first
 * write. A partial seed is harder to reason about than none at all. */
const groupNames = new Set(stockGroups.map((g) => g.name));
const unitNames = new Set(units.map((u) => u.name));
const problems = [];

const seen = new Set();
for (const p of products) {
  if (seen.has(p.name)) problems.push(`duplicate product name: ${p.name}`);
  seen.add(p.name);

  if (!groupNames.has(p.stockGroup)) problems.push(`${p.name}: unknown stock group ${p.stockGroup}`);
  if (!unitNames.has(p.unit)) problems.push(`${p.name}: unknown unit ${p.unit}`);
  if (!isPositiveNumber(p.mrp ?? p.price)) problems.push(`${p.name}: MRP must be above zero, got ${p.mrp ?? p.price}`);
  if (p.discountRate !== undefined && !isValidDiscountRate(p.discountRate)) {
    problems.push(`${p.name}: discount must be between 0% and under 100%, got ${p.discountRate}`);
  }
  if (p.packSize !== undefined && !isPositiveNumber(p.packSize)) {
    problems.push(`${p.name}: pack size must be above zero, got ${p.packSize}`);
  }

  // Nutrition is optional and may be partial, but a figure that is present
  // must be a real one — the till prints these to children unedited.
  for (const key of ['calories', 'protein', 'carbs', 'fat']) {
    const v = p.nutrition?.[key];
    if (v !== undefined && !isNonNegativeNumber(v)) {
      problems.push(`${p.name}: nutrition.${key} must be a number of zero or more, got ${v}`);
    }
  }

  const sub = normalizeSubCategory(p.subCategory);
  const declared = stockGroups.find((g) => g.name === p.stockGroup)?.subCategories || [];
  if (!declared.includes(sub)) problems.push(`${p.name}: sub-category ${sub} is not declared on ${p.stockGroup}`);
}

if (problems.length) {
  console.error('Refusing to seed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

await mongoose.connect(process.env.MONGO_URI);

try {
  const db = mongoose.connection.name;
  const host = mongoose.connection.host;
  console.log(`Target: ${db} on ${host}`);
  console.log(`${stockGroups.length} stock groups, ${units.length} units, ${products.length} products\n`);

  const existing = new Set(
    (await Product.find({}, { name: 1, _id: 0 }).lean()).map((p) => p.name)
  );
  const fresh = products.filter((p) => !existing.has(p.name));
  const already = products.length - fresh.length;

  console.log(`${fresh.length} new, ${already} already present (will be reconciled, not duplicated)`);

  if (!apply) {
    console.log('\nWould create:');
    for (const p of fresh) {
      const mrp = p.mrp ?? p.price;
      const rate = p.discountRate ?? 0;
      const charged = finalPrice(mrp, rate);
      console.log(
        `  ${p.stockGroup} / ${p.subCategory} — ${p.name} @ ${mrp}` +
          (rate ? ` less ${rate}% = ${charged}` : '')
      );
    }
    console.log('\nPreview only. Re-run with --apply to write.');
    process.exitCode = 2;
  } else {
    await StockGroup.bulkWrite(stockGroups.map((g) => ({
      updateOne: {
        filter: { name: g.name },
        update: { $set: { order: g.order ?? 0, subCategories: g.subCategories } },
        upsert: true,
      },
    })));

    await Unit.bulkWrite(units.map((u) => ({
      updateOne: {
        filter: { name: u.name },
        update: { $set: { symbol: u.symbol } },
        upsert: true,
      },
    })));

    const groupIds = new Map((await StockGroup.find({}).lean()).map((g) => [g.name, g._id]));
    const unitIds = new Map((await Unit.find({}).lean()).map((u) => [u.name, u._id]));

    await Product.bulkWrite(products.map((p) => ({
      updateOne: {
        filter: { name: p.name },
        update: {
          $set: {
            stockGroup: groupIds.get(p.stockGroup),
            subCategory: normalizeSubCategory(p.subCategory),
            unit: unitIds.get(p.unit),
            // The catalogue file lists what the packet costs; a listing with
            // no discountRate is simply sold at its MRP. price is never read
            // from the file — it is arithmetic, here as everywhere else.
            mrp: p.mrp ?? p.price,
            discountRate: p.discountRate ?? 0,
            price: finalPrice(p.mrp ?? p.price, p.discountRate ?? 0),
            // Only when the file carries one: a listing with no size must
            // leave the field absent rather than writing a null over a size an
            // admin typed into the form.
            ...(p.packSize !== undefined ? { packSize: p.packSize } : {}),
            reorderLevel: p.reorderLevel ?? 5,
            safetyStock: p.safetyStock ?? 0,
            active: p.active ?? true,
            ...(p.nutrition ? { nutrition: p.nutrition } : {}),
          },
        },
        upsert: true,
      },
    })));

    // A product without a shelf is invisible to every sale screen, so the two
    // are created together here exactly as the controller creates them.
    // $setOnInsert, not $set: a re-run must not reset counted stock to zero.
    const rows = await Product.find({}, { _id: 1 }).lean();
    await Inventory.bulkWrite(rows.map((row) => ({
      updateOne: {
        filter: { productId: row._id },
        update: { $setOnInsert: { productId: row._id, stock: 0 } },
        upsert: true,
      },
    })));

    console.log(`\nApplied. ${await Product.countDocuments()} products, ${await Inventory.countDocuments()} shelves.`);
  }
} finally {
  await mongoose.disconnect();
}
