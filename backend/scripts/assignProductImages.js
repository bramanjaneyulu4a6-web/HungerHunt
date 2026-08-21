// Uploads a folder of product art to Cloudinary and points each product at it.
//
// The stored URL asks Cloudinary to choose the format per browser (f_auto)
// rather than naming the AVIF directly. The pictures are AVIF to stay small,
// but the kiosk runs as a sideloaded APK inside Android's WebView, and whether
// that WebView can decode AVIF depends on a version nobody controls from here.
// f_auto keeps the size win on anything modern and serves WebP or JPEG to
// anything that cannot, instead of showing an empty tile at the till.
//
// The Cloudinary public id is derived from the product name, so re-running
// replaces the picture it uploaded last time rather than leaving a duplicate.
//
// Preview the pairings first:
//   npm run assign:product-images -- <folder>
// Upload and assign after reading them:
//   npm run assign:product-images -- <folder> --apply
import 'dotenv/config';
import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import cloudinary from '../config/cloudinary.js';
import { planImageAssignments, cloudinaryIdFor } from '../utils/productImageMap.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const folder = args.find((arg) => !arg.startsWith('--'));

if (!folder) {
  throw new Error('Give the folder holding the images, e.g. npm run assign:product-images -- ~/Downloads/art');
}

const files = await readdir(folder);

await mongoose.connect(process.env.MONGO_URI);
console.log(`Connected to ${mongoose.connection.host} / ${mongoose.connection.name}`);
console.log(`Reading ${folder}\n`);

try {
  const products = await Product.find({}).select('_id name image').sort({ name: 1 }).lean();

  // Throws if two files claim one product, rather than uploading both and
  // letting whichever finished last win.
  const { matched, unmatched } = planImageAssignments(files, products);

  for (const { file, product, replacing } of matched) {
    console.log(`  ${file}  ->  ${product.name}${replacing ? '   (replacing existing art)' : ''}`);
  }

  if (unmatched.length) {
    console.log(`\n${unmatched.length} file(s) match no product — rename the file or add the product:`);
    for (const file of unmatched) console.log(`  ${file}`);
  }

  const without = products.filter((p) => !p.image && !matched.some((m) => String(m.product._id) === String(p._id)));

  if (without.length) {
    console.log(`\n${without.length} product(s) will still have no picture:`);
    for (const product of without) console.log(`  ${product.name}`);
  }

  if (!apply) {
    console.log(`\nPreview only. ${matched.length} would be uploaded. Re-run with --apply to write.`);
    process.exitCode = 2;
  } else {
    let done = 0;

    for (const { file, product } of matched) {
      // The path, not a base64 data URI: Cloudinary sniffs the format from the
      // file itself, and an octet-stream URI would leave it guessing at AVIF.
      const result = await cloudinary.uploader.upload(
        join(folder, file),
        {
          folder: 'products',
          public_id: cloudinaryIdFor(product.name),
          overwrite: true,
          invalidate: true,
        }
      );

      // Built rather than taken from result.secure_url, which names the AVIF
      // directly and would strand a WebView that cannot decode one.
      const url = cloudinary.url(result.public_id, {
        secure: true,
        version: result.version,
        fetch_format: 'auto',
        quality: 'auto',
      });

      await Product.updateOne({ _id: product._id }, { $set: { image: url } });
      done += 1;
      console.log(`  uploaded ${product.name}`);
    }

    console.log(`\nApplied. ${done} product image(s) assigned.`);
  }
} finally {
  await mongoose.disconnect();
}
