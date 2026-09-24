/* Reconciles the 24 September opening-stock count with goods handed to
 * caretakers that business day, then records the supplier indents supplied by
 * Accounts. Preview is the default; --apply performs one Mongo transaction.
 *
 * Maaza is deliberately absent: it was not present in the production
 * catalogue and the operator explicitly asked for it to be skipped.
 *
 *   node scripts/reconcileOpeningStockAndIndents.js --prod --as dhruv.kamma04@gmail.com
 *   node scripts/reconcileOpeningStockAndIndents.js --prod --as dhruv.kamma04@gmail.com --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import StockAdjustment from '../models/StockAdjustment.js';
import Supplier from '../models/Supplier.js';
import { businessDateStart } from '../utils/businessTime.js';
import { connectForScript } from './lib/connect.mjs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');

const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};

const actorEmail = String(valueOf('--as') || '').trim().toLowerCase();
const BUSINESS_DATE = '2026-09-24';

const STOCK = Object.freeze([
  { product: 'Frooti', opening: 19 },
  { product: 'Appy Fizz', opening: 40 },
  { product: 'Aloo Bhujia', opening: 24 },
  { product: 'Khatta Meetha', opening: 24 },
  { product: "Lay's American Style Cream & Onion - Green Lays", opening: 108 },
  { product: "Lay's Magic Masala - Blue Lays", opening: 108 },
  { product: 'Dark Fantasy Choco Fills', opening: 12 },
  { product: 'Jim Jam', opening: 120 },
  { product: 'Oreo', opening: 120 },
  { product: 'Hide & Seek', opening: 160 },
]);

const INDENTS = Object.freeze([
  {
    supplier: 'Store-bought at MRP',
    batch: 'main',
    items: [{ product: 'Frooti', quantity: 19, purchasePrice: 10 }],
  },
  {
    supplier: 'Sri Rama Agencies',
    batch: 'main',
    items: [
      { product: 'Appy Fizz', quantity: 40, purchasePrice: 8.75 },
      { product: 'Jim Jam', quantity: 120, purchasePrice: 8.83 },
      { product: 'Oreo', quantity: 120, purchasePrice: 8.92 },
    ],
  },
  {
    supplier: 'Janani Agencies',
    batch: 'main',
    items: [
      { product: 'Aloo Bhujia', quantity: 24, purchasePrice: 8.13 },
      { product: 'Khatta Meetha', quantity: 24, purchasePrice: 8.13 },
    ],
  },
  {
    supplier: 'Flipkart Wholesale',
    batch: 'main',
    items: [
      { product: "Lay's American Style Cream & Onion - Green Lays", quantity: 108, purchasePrice: 8.01 },
      { product: "Lay's Magic Masala - Blue Lays", quantity: 108, purchasePrice: 8.01 },
      { product: 'Dark Fantasy Choco Fills', quantity: 10, purchasePrice: 34.4 },
      { product: 'Hide & Seek', quantity: 160, purchasePrice: 8.92 },
    ],
  },
  {
    supplier: 'Flipkart Wholesale',
    batch: 'Dark Fantasy second batch',
    items: [{ product: 'Dark Fantasy Choco Fills', quantity: 2, purchasePrice: 35 }],
  },
]);

const nextDate = (date) => {
  const [year, month, day] = date.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
};

const target = await connectForScript();

try {
  if (!target.viaProdFlag) {
    throw new Error('This reconciliation is production-only. Pass --prod.');
  }
  if (!actorEmail) {
    throw new Error('Pass --as <admin email> so every stock adjustment has an actor.');
  }

  const businessDate = BUSINESS_DATE;
  const from = businessDateStart(businessDate);
  const to = businessDateStart(nextDate(businessDate));
  const indentReason = (indent) =>
    `Opening stock indent ${businessDate} - ${indent.supplier}${indent.batch === 'main' ? '' : ` - ${indent.batch}`}`;

  const loadPlan = async (session) => {
    const actorQuery = Admin.findOne({
      email: actorEmail,
      active: { $ne: false },
      $or: [{ role: 'admin' }, { role: { $exists: false } }],
      isSuperAdmin: true,
    }).lean();
    const productsQuery = Product.find({ name: { $in: STOCK.map((row) => row.product) } })
      .select('_id name active')
      .lean();
    if (session) {
      actorQuery.session(session);
      productsQuery.session(session);
    }
    const [actor, products] = await Promise.all([actorQuery, productsQuery]);

    if (!actor) throw new Error(`No active super-admin found for ${actorEmail}.`);
    if (products.length !== STOCK.length) {
      const found = new Set(products.map((product) => product.name));
      const missing = STOCK.map((row) => row.product).filter((name) => !found.has(name));
      throw new Error(`Missing production product(s): ${missing.join(', ')}.`);
    }
    const inactive = products.filter((product) => product.active === false);
    if (inactive.length) throw new Error(`Inactive product(s): ${inactive.map((row) => row.name).join(', ')}.`);

    const productByName = new Map(products.map((product) => [product.name, product]));
    const productIds = products.map((product) => product._id);
    const inventoryQuery = Inventory.find({ productId: { $in: productIds } }).lean();
    const deliveredQuery = FulfillmentOrder.aggregate([
      { $match: { deliveredAt: { $gte: from, $lt: to } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': { $in: productIds } } },
      { $group: { _id: '$items.productId', quantity: { $sum: '$items.quantity' } } },
    ]);
    const duplicateQuery = Purchase.find({ reason: { $in: INDENTS.map(indentReason) } })
      .select('_id reason status')
      .lean();
    if (session) {
      inventoryQuery.session(session);
      deliveredQuery.session(session);
      duplicateQuery.session(session);
    }
    const [inventory, delivered, duplicateIndents] = await Promise.all([
      inventoryQuery,
      deliveredQuery,
      duplicateQuery,
    ]);
    if (inventory.length !== products.length) {
      const stocked = new Set(inventory.map((row) => String(row.productId)));
      const missing = products.filter((product) => !stocked.has(String(product._id)));
      throw new Error(`Missing inventory row(s): ${missing.map((row) => row.name).join(', ')}.`);
    }
    if (duplicateIndents.length) {
      throw new Error(`Indent marker already exists: ${duplicateIndents.map((row) => row.reason).join('; ')}.`);
    }

    const inventoryByProduct = new Map(inventory.map((row) => [String(row.productId), row]));
    const deliveredByProduct = new Map(delivered.map((row) => [String(row._id), Number(row.quantity) || 0]));
    const stock = STOCK.map((row) => {
      const product = productByName.get(row.product);
      const shelf = inventoryByProduct.get(String(product._id));
      const deliveredToday = deliveredByProduct.get(String(product._id)) || 0;
      const finalStock = row.opening - deliveredToday;
      if (finalStock < 0) {
        throw new Error(`${row.product} delivered ${deliveredToday}, above opening stock ${row.opening}.`);
      }
      return {
        product,
        shelf,
        opening: row.opening,
        deliveredToday,
        finalStock,
        delta: finalStock - shelf.stock,
      };
    });

    return { actor, productByName, stock, businessDate, from, to, indentReason };
  };

  const preview = await loadPlan();
  console.log(`Business day ${preview.businessDate}: ${from.toISOString()} through ${to.toISOString()}\n`);
  console.table(preview.stock.map((row) => ({
    Product: row.product.name,
    Current: row.shelf.stock,
    Opening: row.opening,
    Delivered: row.deliveredToday,
    Final: row.finalStock,
    Adjustment: row.delta,
  })));
  console.log('\nSupplier indents:');
  for (const indent of INDENTS) {
    console.log(`  ${indent.supplier} (${indent.batch})`);
    for (const item of indent.items) {
      console.log(`    ${item.product}: ${item.quantity} @ Rs ${item.purchasePrice}`);
    }
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write one transaction.');
    process.exitCode = 2;
  } else {
    const result = await mongoose.connection.transaction(async (session) => {
      const plan = await loadPlan(session);
      const suppliers = new Map();

      for (const name of new Set(INDENTS.map((indent) => indent.supplier))) {
        const supplier = await Supplier.findOneAndUpdate(
          { name },
          { $set: { active: true }, $setOnInsert: { leadTimeDays: 7 } },
          { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true, session }
        );
        suppliers.set(name, supplier);
      }

      let adjustments = 0;
      for (const row of plan.stock) {
        if (row.delta === 0) continue;
        const shelf = await Inventory.findOneAndUpdate(
          { _id: row.shelf._id, stock: row.shelf.stock },
          { $inc: { stock: row.delta } },
          { new: true, runValidators: true, session }
        );
        if (!shelf) throw new Error(`${row.product.name} stock changed during reconciliation; retry.`);
        await StockAdjustment.create([{
          productId: row.product._id,
          delta: row.delta,
          reason: `Opening stock ${plan.businessDate} less deliveries that day`,
          adjustedBy: plan.actor._id,
          stockAfter: shelf.stock,
        }], { session });
        adjustments += 1;
      }

      const purchases = [];
      for (const indent of INDENTS) {
        const [purchase] = await Purchase.create([{
          status: 'PENDING_REVIEW',
          supplierId: suppliers.get(indent.supplier)._id,
          raisedBy: plan.actor._id,
          reason: plan.indentReason(indent),
          items: indent.items.map((item) => ({
            productId: plan.productByName.get(item.product)._id,
            quantity: item.quantity,
            purchasePrice: item.purchasePrice,
            received: 0,
          })),
        }], { session });
        purchases.push(purchase._id);
      }

      return {
        adjustments,
        supplierCount: suppliers.size,
        purchaseIds: purchases.map(String),
        stock: plan.stock.map((row) => ({ product: row.product.name, finalStock: row.finalStock })),
      };
    });

    console.log('\nApplied successfully in one transaction.');
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
