/* Add the products requested on 1 Oct 2026 and refresh the three existing
 * stationery listings. The script is production-only and previews by default.
 *
 *   node scripts/addOctoberCatalogueItems.js --prod
 *   node scripts/addOctoberCatalogueItems.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import StockGroup from '../models/StockGroup.js';
import Unit from '../models/Unit.js';
import { finalPrice } from '../utils/pricing.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const RAW_ASSET_BASE =
  'https://raw.githubusercontent.com/bramanjaneyulu4a6-web/HungerHunt/main/catalogue-assets/2026-10-01';

const EXISTING_IDS = {
  domsGeometry: '6a8813803cee190c9e3b95e3',
  domsPencils: '6a8813803cee190c9e3b95e1',
  pilot: '6a8813803cee190c9e3b95e0',
};

const newProducts = [
  {
    name: 'Naturo Mango Blast',
    group: 'Snacks',
    subCategory: 'Chocolates',
    unit: 'Gram',
    mrp: 5,
    discountRate: 0,
    packSize: 7.5,
    image: `${RAW_ASSET_BASE}/naturo-mango-blast.png`,
    description: 'A sweet-and-spicy raw mango fruit bar made with mango pulp, green mango and chilli.',
    nutrition: { calories: 377, protein: 1.65, carbs: 92.28, fat: 0.1, serving: 'Per 100g' },
  },
  {
    name: 'KitKat 3 Finger Wafer Chocolate',
    group: 'Snacks',
    subCategory: 'Chocolates',
    unit: 'Gram',
    mrp: 25,
    discountRate: 0,
    packSize: 28.5,
    image: `${RAW_ASSET_BASE}/kitkat-3-finger-28-5g.jpg`,
    description: 'Three crisp wafer fingers covered in a smooth chocolate layer.',
    nutrition: { calories: 438, protein: 6.4, carbs: 47.4, fat: 24.8, serving: 'Per 100g' },
  },
  {
    name: 'Sip On Tender Coconut Water',
    group: 'Drinks',
    subCategory: 'Other Drinks',
    unit: 'Millilitre',
    mrp: 40,
    discountRate: 12.5,
    packSize: 250,
    image: `${RAW_ASSET_BASE}/sipon-tender-coconut-water-250ml.png`,
    description: 'A refreshing tender coconut water drink with natural coconut pulp and electrolytes.',
    nutrition: {
      calories: 19,
      protein: 0.72,
      carbs: 3.71,
      fat: 0.2,
      serving: 'Per 100ml (tender coconut reference)',
    },
  },
  {
    name: 'Unibic Fruit & Nut Cookies',
    group: 'Snacks',
    subCategory: 'Biscuits & Cookies',
    unit: 'Gram',
    mrp: 20,
    discountRate: 0,
    packSize: 52.5,
    image: `${RAW_ASSET_BASE}/unibic-fruit-nut-52-5g.png`,
    description: 'Crunchy cookies with mixed fruit pieces, cashews and almonds.',
    nutrition: { calories: 458, protein: 6.4, carbs: 63, fat: 20, serving: 'Per 100g' },
  },
  {
    name: 'Unibic Choco Chip Cookies',
    group: 'Snacks',
    subCategory: 'Biscuits & Cookies',
    unit: 'Gram',
    mrp: 20,
    discountRate: 0,
    packSize: 52.5,
    image: `${RAW_ASSET_BASE}/unibic-choco-chip-52-5g.png`,
    description: 'Crisp cookies baked with chocolate chips for a rich chocolate bite.',
    nutrition: { calories: 471, protein: 5.8, carbs: 68, fat: 19.5, serving: 'Per 100g' },
  },
  {
    name: 'Head & Shoulders Smooth & Silky 2-in-1 Shampoo Sachet',
    group: 'Essentials',
    subCategory: 'Personal Care',
    unit: 'Piece',
    mrp: 4,
    discountRate: 0,
    image: `${RAW_ASSET_BASE}/head-and-shoulders-smooth-silky-sachet.png`,
    description: 'A single-use anti-dandruff 2-in-1 shampoo and conditioner sachet for smooth, silky hair.',
  },
];

const existingUpdates = [
  {
    id: EXISTING_IDS.domsPencils,
    name: 'Doms X1 Graphite Pencils, Sharpener, Eraser - 10 Pencils',
    set: {
      image: `${RAW_ASSET_BASE}/doms-x1-pencil-pack.png`,
      description: 'A 10-pencil pack with a sharpener and eraser for writing, drawing and rough work.',
    },
  },
  {
    id: EXISTING_IDS.domsGeometry,
    name: 'Doms Geometry Mathematical Drawing Instrument Box',
    set: {
      image: `${RAW_ASSET_BASE}/doms-geometry-box.png`,
      description: 'A DOMS set of mathematical drawing instruments in a tin case, for geometry in maths class.',
    },
  },
  {
    id: EXISTING_IDS.pilot,
    name: 'Pilot V7 Pen - Blue',
    set: {
      discountRate: 25,
      price: finalPrice(70, 25),
      image: `${RAW_ASSET_BASE}/pilot-v7-blue-pen.png`,
      description: 'A blue Pilot V7 Hi-Tecpoint pen with a 0.7 mm liquid-ink tip for smooth, neat writing.',
    },
  },
];

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This catalogue update is production-only. Pass --prod.');

  const [groups, units, existing, conflicts] = await Promise.all([
    StockGroup.find({ name: { $in: ['Snacks', 'Drinks', 'Essentials'] } }).lean(),
    Unit.find({ name: { $in: ['Gram', 'Millilitre', 'Piece'] } }).lean(),
    Product.find({ _id: { $in: existingUpdates.map((item) => item.id) } }).lean(),
    Product.find({ name: { $in: newProducts.map((item) => item.name) } }).select('_id name').lean(),
  ]);

  const groupByName = new Map(groups.map((row) => [row.name, row]));
  const unitByName = new Map(units.map((row) => [row.name, row]));
  for (const name of ['Snacks', 'Drinks', 'Essentials']) {
    if (!groupByName.has(name)) throw new Error(`Missing stock group: ${name}.`);
  }
  for (const name of ['Gram', 'Millilitre', 'Piece']) {
    if (!unitByName.has(name)) throw new Error(`Missing unit: ${name}.`);
  }

  const existingById = new Map(existing.map((row) => [String(row._id), row]));
  for (const update of existingUpdates) {
    const product = existingById.get(update.id);
    if (!product || product.name !== update.name) {
      throw new Error(`Existing-product guard failed for ${update.name} (${update.id}).`);
    }
  }

  if (conflicts.length) {
    throw new Error(`Products already exist: ${conflicts.map((row) => row.name).join(', ')}.`);
  }

  const preview = {
    addSubCategory: groupByName.get('Snacks').subCategories.includes('Chocolates')
      ? null
      : 'Snacks > Chocolates',
    create: newProducts.map((item) => ({
      name: item.name,
      category: `${item.group} > ${item.subCategory}`,
      mrp: item.mrp,
      discountRate: item.discountRate,
      price: finalPrice(item.mrp, item.discountRate),
      openingStock: 0,
    })),
    update: existingUpdates.map((item) => ({ name: item.name, ...item.set })),
    unchanged: ['Dark Fantasy Choco Fills'],
  };
  console.log(JSON.stringify(preview, null, 2));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update production.');
    process.exitCode = 2;
  } else {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await StockGroup.updateOne(
          { _id: groupByName.get('Snacks')._id },
          { $addToSet: { subCategories: 'Chocolates' } },
          { session }
        );

        for (const definition of newProducts) {
          const [product] = await Product.create([{
            name: definition.name,
            stockGroup: groupByName.get(definition.group)._id,
            subCategory: definition.subCategory,
            unit: unitByName.get(definition.unit)._id,
            mrp: definition.mrp,
            discountRate: definition.discountRate,
            price: finalPrice(definition.mrp, definition.discountRate),
            ...(definition.packSize ? { packSize: definition.packSize } : {}),
            image: definition.image,
            description: definition.description,
            ...(definition.nutrition ? { nutrition: definition.nutrition } : {}),
            active: true,
            kioskVisible: true,
          }], { session });
          await Inventory.create([{ productId: product._id, stock: 0 }], { session });
        }

        for (const update of existingUpdates) {
          const result = await Product.updateOne(
            { _id: update.id, name: update.name },
            { $set: update.set },
            { runValidators: true, session }
          );
          if (result.matchedCount !== 1) throw new Error(`Update guard failed for ${update.name}.`);
        }
      });
    } finally {
      await session.endSession();
    }
    console.log('\nProduction catalogue updated. Six products created and three stationery listings refreshed.');
  }
} finally {
  await mongoose.disconnect();
}
