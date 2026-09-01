/* Copies the product-to-image URL mapping from the live catalogue into the
 * local development database. It never downloads or re-uploads an asset, and
 * it refuses to write unless the destination is explicitly localhost.
 *
 * Preview:  node scripts/syncLiveProductImagesToLocal.js
 * Apply:    node scripts/syncLiveProductImagesToLocal.js --apply
 */
import 'dotenv/config';
import { readFile } from 'node:fs/promises';
import mongoose from 'mongoose';
import { parse } from 'dotenv';

const apply = process.argv.includes('--apply');
const localEnvPath = new URL('../.env', import.meta.url);
const liveEnvPath = new URL('../.env.production.local', import.meta.url);

const [localEnv, liveEnv] = await Promise.all([
  readFile(localEnvPath, 'utf8').then(parse),
  readFile(liveEnvPath, 'utf8').then(parse),
]);

const localUri = localEnv.MONGO_URI;
const liveUri = liveEnv.MONGO_URI;
const isLocalMongo = (uri) => /^mongodb(?:\+srv)?:\/\/(?:[^@/]+@)?(?:127\.0\.0\.1|localhost)(?::|\/)/i.test(uri || '');

if (!isLocalMongo(localUri)) {
  throw new Error('Refusing to sync: backend/.env MONGO_URI is not a localhost database.');
}

if (!liveUri || isLocalMongo(liveUri)) {
  throw new Error('Refusing to sync: the live source is missing or resolves to localhost.');
}

const [local, live] = await Promise.all([
  mongoose.createConnection(localUri).asPromise(),
  mongoose.createConnection(liveUri).asPromise(),
]);

try {
  const [localProducts, liveProducts] = await Promise.all([
    local.collection('products').find({}, { projection: { name: 1, image: 1 } }).toArray(),
    live.collection('products').find({}, { projection: { name: 1, image: 1 } }).toArray(),
  ]);

  const localByName = new Map(localProducts.map((product) => [product.name, product]));
  const assignments = liveProducts
    .filter((product) =>
      localByName.has(product.name) &&
      typeof product.image === 'string' &&
      product.image.startsWith('https://res.cloudinary.com/') &&
      localByName.get(product.name).image !== product.image
    )
    .map((product) => ({ name: product.name, image: product.image }));

  const liveWithCloudinary = liveProducts.filter((product) =>
    typeof product.image === 'string' && product.image.startsWith('https://res.cloudinary.com/')
  );
  const missingLocally = liveWithCloudinary.filter((product) => !localByName.has(product.name));

  console.log(`${liveWithCloudinary.length} live Cloudinary image(s), ${localProducts.length} local product(s).`);
  console.log(`${assignments.length} local image URL(s) ${apply ? 'to update' : 'would be updated'}.`);
  for (const assignment of assignments) console.log(`  ${assignment.name}`);

  if (missingLocally.length) {
    console.log(`\n${missingLocally.length} live product(s) have no same-named local product:`);
    for (const product of missingLocally) console.log(`  ${product.name}`);
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update localhost.');
    process.exitCode = assignments.length ? 2 : 0;
  } else if (assignments.length) {
    await local.collection('products').bulkWrite(assignments.map(({ name, image }) => ({
      updateOne: { filter: { name }, update: { $set: { image } } },
    })));
    console.log(`\nApplied ${assignments.length} live image URL(s) to localhost.`);
  }
} finally {
  await Promise.all([local.close(), live.close()]);
}
