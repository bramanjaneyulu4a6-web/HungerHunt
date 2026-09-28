/* Corrects the three erroneous +100 manual replenishments made on 27 Sep
 * 2026, then creates the supplier orders requested on 28 Sep for review.
 *
 * The original movements are retained as audit evidence. A compensating
 * movement removes up to the 100 units still on hand; units already sold are
 * not allowed to drive inventory negative. Preview is the default.
 *
 *   node scripts/correctReplenishmentAndSeedSupplierOrders.js --prod
 *   node scripts/correctReplenishmentAndSeedSupplierOrders.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import StockAdjustment from '../models/StockAdjustment.js';
import Supplier from '../models/Supplier.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const REQUEST_DATE = '2026-09-28';

const REVERSALS = Object.freeze([
  { id: '6ab8a717e6821e4a24920b2d', product: 'Aloo Bhujia', originalReason: 'replenish' },
  { id: '6ab8a5c6e6821e4a24920a8b', product: 'Appy Fizz', originalReason: 'replenish for week 2' },
  { id: '6ab8a5b8e6821e4a24920a84', product: 'Dark Fantasy Choco Fills', originalReason: 'Replenish for week 2' },
]);

const ORDER_REQUESTS = Object.freeze([
  {
    supplier: 'Flipkart Wholesale/Walmart',
    items: [
      { product: 'Dark Fantasy Choco Fills', quantity: 20, rate: 35 },
      { product: "Lay's American Style Cream & Onion - Green Lays", quantity: 108, rate: 8.01 },
      { product: "Lay's Magic Masala - Blue Lays", quantity: 108, rate: 8.01 },
      { product: 'Maaza', quantity: 80, rate: 7.5 },
    ],
  },
  {
    supplier: 'Sri Rama Agencies',
    items: [{ product: 'Appy Fizz', quantity: 80, rate: 8.75 }],
  },
]);

const orderReason = (supplier) => `Supplier replenishment request ${REQUEST_DATE} - ${supplier}`;
const correctionReason = (row) =>
  `Correction ${REQUEST_DATE}: remove erroneous +100 replenishment ${row.id}`;

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This correction is production-only. Pass --prod.');

  const loadPlan = async (session) => {
    const adjustmentIds = REVERSALS.map((row) => new mongoose.Types.ObjectId(row.id));
    const productNames = [...new Set([
      ...REVERSALS.map((row) => row.product),
      ...ORDER_REQUESTS.flatMap((order) => order.items.map((item) => item.product)),
    ])];
    const supplierNames = ORDER_REQUESTS.map((order) => order.supplier);

    const adjustmentsQuery = StockAdjustment.find({ _id: { $in: adjustmentIds } })
      .populate('productId', 'name')
      .lean();
    const productsQuery = Product.find({ name: { $in: productNames }, active: { $ne: false } })
      .select('_id name')
      .lean();
    const suppliersQuery = Supplier.find({ name: { $in: supplierNames }, active: { $ne: false } })
      .select('_id name')
      .lean();
    const duplicateCorrectionsQuery = StockAdjustment.find({
      reason: { $in: REVERSALS.map(correctionReason) },
    }).select('_id reason').lean();
    const duplicateOrdersQuery = Purchase.find({
      reason: { $in: supplierNames.map(orderReason) },
    }).select('_id reason status').lean();

    for (const query of [
      adjustmentsQuery,
      productsQuery,
      suppliersQuery,
      duplicateCorrectionsQuery,
      duplicateOrdersQuery,
    ]) {
      if (session) query.session(session);
    }

    const [adjustments, products, suppliers, duplicateCorrections, duplicateOrders] = await Promise.all([
      adjustmentsQuery,
      productsQuery,
      suppliersQuery,
      duplicateCorrectionsQuery,
      duplicateOrdersQuery,
    ]);

    if (adjustments.length !== REVERSALS.length) {
      throw new Error(`Expected ${REVERSALS.length} source adjustments; found ${adjustments.length}.`);
    }
    if (products.length !== productNames.length) {
      const found = new Set(products.map((row) => row.name));
      throw new Error(`Missing active product(s): ${productNames.filter((name) => !found.has(name)).join(', ')}.`);
    }
    if (suppliers.length !== supplierNames.length) {
      const found = new Set(suppliers.map((row) => row.name));
      throw new Error(`Missing active supplier(s): ${supplierNames.filter((name) => !found.has(name)).join(', ')}.`);
    }
    if (duplicateCorrections.length) {
      throw new Error(`Correction already applied: ${duplicateCorrections.map((row) => row.reason).join('; ')}.`);
    }
    if (duplicateOrders.length) {
      throw new Error(`Supplier order already exists: ${duplicateOrders.map((row) => `${row.reason} (${row.status})`).join('; ')}.`);
    }

    const adjustmentById = new Map(adjustments.map((row) => [String(row._id), row]));
    for (const expected of REVERSALS) {
      const actual = adjustmentById.get(expected.id);
      if (
        actual.delta !== 100 ||
        actual.reason !== expected.originalReason ||
        actual.productId?.name !== expected.product
      ) {
        throw new Error(`Source adjustment ${expected.id} no longer matches the reviewed +100 entry.`);
      }
    }

    const actorIds = new Set(adjustments.map((row) => String(row.adjustedBy)));
    if (actorIds.size !== 1) throw new Error('The source adjustments do not share one actor.');
    const actorQuery = Admin.findOne({
      _id: [...actorIds][0],
      active: { $ne: false },
      $or: [{ role: 'admin' }, { role: { $exists: false } }],
    }).select('_id name email').lean();
    if (session) actorQuery.session(session);
    const actor = await actorQuery;
    if (!actor) throw new Error('The admin who made the source adjustments is no longer active.');

    const productByName = new Map(products.map((row) => [row.name, row]));
    const inventoriesQuery = Inventory.find({
      productId: { $in: REVERSALS.map((row) => productByName.get(row.product)._id) },
    }).lean();
    if (session) inventoriesQuery.session(session);
    const inventories = await inventoriesQuery;
    if (inventories.length !== REVERSALS.length) throw new Error('One or more correction products has no inventory row.');
    const inventoryByProduct = new Map(inventories.map((row) => [String(row.productId), row]));

    const corrections = REVERSALS.map((row) => {
      const product = productByName.get(row.product);
      const shelf = inventoryByProduct.get(String(product._id));
      const unitsToRemove = Math.min(100, shelf.stock);
      return {
        ...row,
        productId: product._id,
        inventoryId: shelf._id,
        currentStock: shelf.stock,
        unitsToRemove,
        finalStock: shelf.stock - unitsToRemove,
        unitsAlreadyGone: 100 - unitsToRemove,
      };
    });

    return {
      actor,
      productByName,
      supplierByName: new Map(suppliers.map((row) => [row.name, row])),
      corrections,
    };
  };

  const preview = await loadPlan();
  console.log(`\nCorrection actor: ${preview.actor.name} (${preview.actor.email})`);
  console.log('\nInventory corrections:');
  console.table(preview.corrections.map((row) => ({
    product: row.product,
    currentStock: row.currentStock,
    removeNow: row.unitsToRemove,
    alreadySoldOrGone: row.unitsAlreadyGone,
    finalStock: row.finalStock,
    sourceAdjustment: row.id,
  })));
  console.log('\nOrders to create as PENDING_REVIEW:');
  console.table(ORDER_REQUESTS.flatMap((order) => order.items.map((item) => ({
    supplier: order.supplier,
    product: item.product,
    quantity: item.quantity,
    rate: item.rate,
    value: item.quantity * item.rate,
  }))));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write one transaction.');
    process.exitCode = 2;
  } else {
    const result = await mongoose.connection.transaction(async (session) => {
      const plan = await loadPlan(session);
      const correctionIds = [];

      for (const row of plan.corrections) {
        if (row.unitsToRemove === 0) continue;
        const shelf = await Inventory.findOneAndUpdate(
          { _id: row.inventoryId, stock: row.currentStock },
          { $inc: { stock: -row.unitsToRemove } },
          { new: true, runValidators: true, session }
        );
        if (!shelf) throw new Error(`${row.product} stock changed during correction; retry.`);

        const [correction] = await StockAdjustment.create([{
          productId: row.productId,
          delta: -row.unitsToRemove,
          reason: correctionReason(row),
          adjustedBy: plan.actor._id,
          stockAfter: shelf.stock,
        }], { session });
        correctionIds.push(String(correction._id));
      }

      const orderIds = [];
      for (const request of ORDER_REQUESTS) {
        const [purchase] = await Purchase.create([{
          status: 'PENDING_REVIEW',
          supplierId: plan.supplierByName.get(request.supplier)._id,
          raisedBy: plan.actor._id,
          reason: orderReason(request.supplier),
          items: request.items.map((item) => ({
            productId: plan.productByName.get(item.product)._id,
            quantity: item.quantity,
            purchasePrice: item.rate,
            received: 0,
          })),
        }], { session });
        orderIds.push(String(purchase._id));
      }

      return {
        corrections: plan.corrections.map((row) => ({
          product: row.product,
          removed: row.unitsToRemove,
          finalStock: row.finalStock,
        })),
        correctionIds,
        orderIds,
      };
    });

    console.log('\nApplied successfully in one transaction.');
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
