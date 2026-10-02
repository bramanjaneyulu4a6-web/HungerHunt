/* Point the live Naturo product at the cleaned image revision.
 *
 *   node scripts/replaceNaturoCatalogueImage.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import Product from '../models/Product.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const name = 'Naturo Mango Blast';
const oldImage =
  'https://raw.githubusercontent.com/bramanjaneyulu4a6-web/HungerHunt/main/catalogue-assets/2026-10-01/naturo-mango-blast.png';
const newImage = `${oldImage}?v=b19d7a7`;
const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This image replacement is production-only. Pass --prod.');
  const product = await Product.findOne({ name }).select('_id name image').lean();
  if (!product) throw new Error(`${name} was not found.`);

  console.log(JSON.stringify({ name, from: product.image, to: newImage }, null, 2));
  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update production.');
    process.exitCode = 2;
  } else {
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, name, image: oldImage },
      { $set: { image: newImage } },
      { new: true, runValidators: true }
    ).select('name image').lean();
    if (!updated) throw new Error('Naturo image changed after preview; nothing was overwritten.');
    console.log(`\nUpdated ${updated.name}: ${updated.image}`);
  }
} finally {
  await mongoose.disconnect();
}
