/* Correct the package sizes/nutrition requested after the 1 Oct catalogue
 * addition, set Pilot V7 to a ₹55 selling price, and enforce the supplied DOMS
 * images. Production-only; previews unless --apply is supplied.
 *
 *   node scripts/correctOctoberCataloguePackDetails.js --prod
 *   node scripts/correctOctoberCataloguePackDetails.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import { finalPrice } from '../utils/pricing.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const RAW_ASSET_BASE =
  'https://raw.githubusercontent.com/bramanjaneyulu4a6-web/HungerHunt/main/catalogue-assets/2026-10-01';
const PILOT_DISCOUNT = 21.43;

const corrections = [
  {
    name: 'Naturo Mango Blast',
    expected: { packSize: 7.5, 'nutrition.serving': 'Per 100g' },
    set: {
      packSize: 10,
      nutrition: {
        calories: 37.7,
        protein: 0.17,
        carbs: 9.23,
        fat: 0.01,
        serving: 'Per 10g pack',
      },
    },
  },
  {
    name: 'KitKat 3 Finger Wafer Chocolate',
    expected: { packSize: 28.5, 'nutrition.serving': 'Per 100g' },
    set: {
      packSize: 28,
      nutrition: {
        calories: 122.6,
        protein: 1.79,
        carbs: 13.27,
        fat: 6.94,
        serving: 'Per 28g pack',
      },
    },
  },
  {
    name: 'Unibic Fruit & Nut Cookies',
    expected: { packSize: 52.5, 'nutrition.serving': 'Per 100g' },
    set: {
      packSize: 52.5,
      nutrition: {
        calories: 240.5,
        protein: 3.36,
        carbs: 33.08,
        fat: 10.5,
        serving: 'Per 52.5g pack',
      },
    },
  },
  {
    name: 'Unibic Choco Chip Cookies',
    expected: { packSize: 52.5, 'nutrition.serving': 'Per 100g' },
    set: {
      packSize: 52.5,
      nutrition: {
        calories: 247.3,
        protein: 3.05,
        carbs: 35.7,
        fat: 10.24,
        serving: 'Per 52.5g pack',
      },
    },
  },
  {
    name: 'Sip On Tender Coconut Water',
    expected: { packSize: 250, 'nutrition.serving': 'Per 100ml (tender coconut reference)' },
    set: {
      packSize: 250,
      nutrition: {
        calories: 47.5,
        protein: 1.8,
        carbs: 9.28,
        fat: 0.5,
        serving: 'Per 250ml bottle (tender coconut reference)',
      },
    },
  },
  {
    name: 'Pilot V7 Pen - Blue',
    expected: { mrp: 70, discountRate: 25, price: 53 },
    set: { discountRate: PILOT_DISCOUNT, price: finalPrice(70, PILOT_DISCOUNT) },
  },
  {
    name: 'Doms X1 Graphite Pencils, Sharpener, Eraser - 10 Pencils',
    expected: {},
    set: { image: `${RAW_ASSET_BASE}/doms-x1-pencil-pack.png` },
  },
  {
    name: 'Doms Geometry Mathematical Drawing Instrument Box',
    expected: {},
    set: { image: `${RAW_ASSET_BASE}/doms-geometry-box.png` },
  },
];

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This correction is production-only. Pass --prod.');

  const products = await Product.find({ name: { $in: corrections.map((row) => row.name) } }).lean();
  const byName = new Map(products.map((row) => [row.name, row]));
  if (products.length !== corrections.length) {
    const missing = corrections.filter((row) => !byName.has(row.name)).map((row) => row.name);
    throw new Error(`Missing products: ${missing.join(', ')}.`);
  }

  for (const correction of corrections) {
    const product = byName.get(correction.name);
    for (const [path, expected] of Object.entries(correction.expected)) {
      const actual = path.split('.').reduce((value, key) => value?.[key], product);
      if (actual !== expected) {
        throw new Error(
          `Guard failed for ${correction.name} ${path}: expected ${expected}, found ${actual}.`
        );
      }
    }
  }

  console.log(JSON.stringify({
    update: corrections.map((row) => ({ name: row.name, ...row.set })),
  }, null, 2));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update production.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        for (const correction of corrections) {
          const result = await Product.updateOne(
            { _id: byName.get(correction.name)._id, name: correction.name, ...correction.expected },
            { $set: correction.set },
            { runValidators: true, session }
          );
          if (result.matchedCount !== 1) {
            throw new Error(`Concurrent update guard failed for ${correction.name}.`);
          }
        }
      });
    } finally {
      await session.endSession();
    }
    console.log('\nProduction package details, Pilot price, and DOMS images corrected.');
  }
} finally {
  await mongoose.disconnect();
}
