// Preview inferred sub-categories first:
//   npm run backfill:product-subcategories
// Apply after reviewing the list:
//   npm run backfill:product-subcategories -- --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import { inferSubCategory, normalizeSubCategory } from '../utils/productSubcategory.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGO_URI);

try {
  const products = await Product.find({
    $or: [
      { subCategory: { $exists: false } },
      { subCategory: null },
      { subCategory: '' },
      { subCategory: 'Others' },
    ],
  }).select('_id name subCategory').sort({ name: 1 }).lean();

  const assignments = products.map((product) => ({
    ...product,
    subCategory: normalizeSubCategory(inferSubCategory(product.name)),
  }));

  console.log('Proposed product sub-categories (review before applying):');
  for (const product of assignments) {
    console.log(`  ${product.name} -> ${product.subCategory}`);
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to persist these assignments.');
    process.exitCode = 2;
  } else if (assignments.length) {
    await Product.bulkWrite(assignments.map((product) => ({
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { subCategory: product.subCategory } },
      },
    })));
    console.log(`Updated ${assignments.length} product(s).`);
  } else {
    console.log('No products need a sub-category backfill.');
  }
} finally {
  await mongoose.disconnect();
}
