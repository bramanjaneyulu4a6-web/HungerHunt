// Preview: npm run backfill:category-subcategories
// Apply:   npm run backfill:category-subcategories -- --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';
import { DEFAULT_SUBCATEGORY, normalizeSubCategory } from '../utils/productSubcategory.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');
const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGO_URI);

try {
  const [categories, products] = await Promise.all([
    StockGroup.find().sort({ order: 1, name: 1 }).lean(),
    Product.find().select('stockGroup subCategory').lean(),
  ]);

  const assignments = categories.map((category) => {
    const names = [...new Set(products
      .filter((product) => String(product.stockGroup) === String(category._id))
      .map((product) => normalizeSubCategory(product.subCategory)))]
      .sort((a, b) => (a === DEFAULT_SUBCATEGORY) - (b === DEFAULT_SUBCATEGORY) || a.localeCompare(b));
    if (!names.includes(DEFAULT_SUBCATEGORY)) names.push(DEFAULT_SUBCATEGORY);
    return { ...category, subCategories: names };
  });

  console.log('Proposed ordered sub-categories by category:');
  assignments.forEach((category) => console.log(`  ${category.name}: ${category.subCategories.join(' | ')}`));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to persist this ordering.');
    process.exitCode = 2;
  } else if (assignments.length) {
    await StockGroup.bulkWrite(assignments.map((category) => ({
      updateOne: {
        filter: { _id: category._id },
        update: { $set: { subCategories: category.subCategories } },
      },
    })));
    console.log(`Updated ${assignments.length} category record(s).`);
  }
} finally {
  await mongoose.disconnect();
}
