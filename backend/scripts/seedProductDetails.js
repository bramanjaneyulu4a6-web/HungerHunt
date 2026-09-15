// Fills in the details the kiosk shows behind a tile's "i" button — the
// description and the nutrition figures — from scripts/data/catalogue.json.
//
// Only those two are written. seedCatalogue.js would write them too, but it
// also resets price, stock group and the rest to the file's values, and the
// live catalogue has moved on from the file since (prices the office changed,
// for one). This touches nothing else.
//
// Fills blanks only, because anything already there was typed in the admin
// console by someone who meant it:
//   - a description is written where the product has none;
//   - nutrition is written where the product has no figure and no serving at
//     all. A partly filled panel is left whole rather than merged with the
//     file, since mixing figures from two sources would print a set nobody
//     read off one packet.
// Pass --overwrite to replace existing values too.
//
// Preview what would change first:
//   npm run seed:product-details
// Apply after reviewing the list:
//   npm run seed:product-details -- --apply
// Against production:
//   npm run seed:product-details -- --prod [--apply]
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';

import { connectForScript } from './lib/connect.mjs';

import Product from '../models/Product.js';
import { isNonNegativeNumber } from '../utils/quantities.js';


const MACROS = ['calories', 'protein', 'carbs', 'fat'];

const apply = process.argv.includes('--apply');
const overwrite = process.argv.includes('--overwrite');
const dataPath = new URL('./data/catalogue.json', import.meta.url);
const catalogue = JSON.parse(await readFile(dataPath, 'utf8'));

const listed = new Map(catalogue.products.map((p) => [p.name, p]));

const problems = [];

for (const p of catalogue.products) {
  if (p.description !== undefined && String(p.description).trim().length > 300) {
    problems.push(`${p.name}: description over 300 characters`);
  }

  for (const key of MACROS) {
    const v = p.nutrition?.[key];
    if (v !== undefined && !isNonNegativeNumber(v)) {
      problems.push(`${p.name}: nutrition.${key} must be a number of zero or more, got ${v}`);
    }
  }
}

if (problems.length) {
  console.error('Refusing to seed:');
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

// Nothing recorded at all — the shape an untouched product has, and also the
// all-null shell an admin form save leaves behind.
const hasNutrition = (n) =>
  Boolean(n) && (MACROS.some((key) => n[key] !== null && n[key] !== undefined) || Boolean(n.serving));

const sameNutrition = (a, b) =>
  hasNutrition(a) &&
  MACROS.every((key) => (a[key] ?? null) === (b[key] ?? null)) &&
  (a.serving || '') === (b.serving || '');

const describeNutrition = (n) =>
  `${n.serving || 'Per unit as sold'}: ${n.calories ?? '—'} kcal, ` +
  `protein ${n.protein ?? '—'} g, carbs ${n.carbs ?? '—'} g, fat ${n.fat ?? '—'} g`;

await connectForScript();

try {
  const products = await Product.find({}).select('_id name description nutrition').sort({ name: 1 }).lean();

  const writes = [];
  const kept = [];
  const uncovered = [];

  for (const product of products) {
    const entry = listed.get(product.name);

    if (!entry) {
      uncovered.push(product.name);
      continue;
    }

    const set = {};
    const lines = [];

    const text = entry.description?.trim();
    const current = product.description?.trim() || '';

    if (text && current !== text) {
      if (current && !overwrite) {
        kept.push(`${product.name} (description)`);
      } else {
        set.description = text;
        lines.push(`description: ${text}`);
      }
    }

    if (hasNutrition(entry.nutrition) && !sameNutrition(product.nutrition, entry.nutrition)) {
      if (hasNutrition(product.nutrition) && !overwrite) {
        kept.push(`${product.name} (nutrition)`);
      } else {
        // The whole panel, blanks as explicit nulls, so no figure from an
        // earlier source survives beside the new ones.
        set.nutrition = {
          ...Object.fromEntries(MACROS.map((key) => [key, entry.nutrition[key] ?? null])),
          serving: entry.nutrition.serving || null,
        };
        lines.push(`nutrition: ${describeNutrition(entry.nutrition)}`);
        if (entry.nutritionSource) lines.push(`  source: ${entry.nutritionSource}`);
      }
    }

    if (lines.length) writes.push({ product, set, lines });
  }

  if (writes.length) {
    console.log(`Would update ${writes.length} product(s):`);
    for (const { product, lines } of writes) {
      console.log(`  ${product.name}`);
      for (const line of lines) console.log(`    ${line}`);
    }
  } else {
    console.log('No product details need setting.');
  }

  if (kept.length) {
    console.log('\nAlready filled in, left alone (--overwrite to replace):');
    for (const name of kept) console.log(`  ${name}`);
  }

  // Named rather than skipped silently: a product the office added after the
  // file was last written has nothing here, and the list says who to write.
  if (uncovered.length) {
    console.log('\nNot in catalogue.json:');
    for (const name of uncovered) console.log(`  ${name}`);
  }

  if (!apply) {
    if (writes.length) {
      console.log('\nPreview only. Re-run with --apply to write these.');
      process.exitCode = 2;
    }
  } else if (writes.length) {
    await Product.bulkWrite(writes.map(({ product, set }) => ({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: set },
      },
    })));
    console.log(`\nUpdated ${writes.length} product(s).`);
  }
} finally {
  await mongoose.disconnect();
}
