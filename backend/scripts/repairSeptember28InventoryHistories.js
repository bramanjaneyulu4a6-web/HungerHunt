/* Removes the unrelated +100 manual movements from the histories of the five
 * products received through the two supplier orders raised on 28 Sep 2026.
 * Appy Fizz had two such rows, so six +100 movements are removed in total.
 *
 * Appy Fizz and Dark Fantasy were already corrected down to zero before the
 * real supplier receipts landed, so their compensating rows leave with their
 * source rows and live stock does not move. The two Lays products were rebased
 * by the 24 Sep stocktake after their source rows, so their live stock is also
 * already independent of those rows. Maaza was never corrected or rebased
 * after its source row, so its live balance is reduced by 100 in the same
 * transaction that removes the history entry.
 *
 * Preview is the default:
 *   node scripts/repairSeptember28InventoryHistories.js --prod
 *   node scripts/repairSeptember28InventoryHistories.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import GoodsReceipt from '../models/GoodsReceipt.js';
import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import StockAdjustment from '../models/StockAdjustment.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');

const ORDERS = Object.freeze([
  {
    id: '6aba306852f22e9073d4ee9f',
    items: [
      ['Dark Fantasy Choco Fills', 20],
      ["Lay's American Style Cream & Onion - Green Lays", 108],
      ["Lay's Magic Masala - Blue Lays", 108],
      ['Maaza', 80],
    ],
  },
  { id: '6aba306852f22e9073d4eea5', items: [['Appy Fizz', 80]] },
]);

const BAD_ADJUSTMENTS = Object.freeze([
  {
    id: '6ab8a5b8e6821e4a24920a84',
    product: 'Dark Fantasy Choco Fills',
    reason: 'Replenish for week 2',
    correctionId: '6aba306852f22e9073d4ee9d',
    correctionDelta: -86,
  },
  {
    id: '6ab1816135f1090219cf9032',
    product: "Lay's American Style Cream & Onion - Green Lays",
    reason: 'first run',
  },
  {
    id: '6ab1816a35f1090219cf904b',
    product: "Lay's Magic Masala - Blue Lays",
    reason: 'first run',
  },
  {
    id: '6ab8a748e6821e4a24920b48',
    product: 'Maaza',
    reason: '-',
    liveStockDelta: -100,
  },
  {
    id: '6ab8a5c6e6821e4a24920a8b',
    product: 'Appy Fizz',
    reason: 'replenish for week 2',
    correctionId: '6aba306852f22e9073d4ee9a',
    correctionDelta: -62,
  },
  {
    id: '6ab1812035f1090219cf8f88',
    product: 'Appy Fizz',
    reason: 'first run',
  },
]);

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This repair is production-only. Pass --prod.');

  const loadPlan = async (session) => {
    const orderIds = ORDERS.map((row) => new mongoose.Types.ObjectId(row.id));
    const adjustmentIds = BAD_ADJUSTMENTS.flatMap((row) => [row.id, row.correctionId].filter(Boolean))
      .map((id) => new mongoose.Types.ObjectId(id));

    const ordersQuery = Purchase.find({ _id: { $in: orderIds } })
      .populate('items.productId', 'name')
      .lean();
    const receiptsQuery = GoodsReceipt.find({
      purchaseId: { $in: orderIds },
      clientToken: { $regex: /^approval-backfill-/ },
    }).lean();
    const adjustmentsQuery = StockAdjustment.find({ _id: { $in: adjustmentIds } })
      .populate('productId', 'name')
      .lean();
    for (const query of [ordersQuery, receiptsQuery, adjustmentsQuery]) {
      if (session) query.session(session);
    }

    const [orders, receipts, adjustments] = await Promise.all([
      ordersQuery,
      receiptsQuery,
      adjustmentsQuery,
    ]);

    if (orders.length !== ORDERS.length) {
      throw new Error(`Expected ${ORDERS.length} September 28 orders; found ${orders.length}.`);
    }
    if (receipts.length !== ORDERS.length) {
      throw new Error(`Expected ${ORDERS.length} receipt records for those orders; found ${receipts.length}.`);
    }

    const orderById = new Map(orders.map((row) => [String(row._id), row]));
    for (const expected of ORDERS) {
      const actual = orderById.get(expected.id);
      const actualItems = new Map(actual.items.map((item) => [item.productId?.name, item.quantity]));
      if (
        actual.status !== 'RECEIVED' ||
        actualItems.size !== expected.items.length ||
        expected.items.some(([name, quantity]) => actualItems.get(name) !== quantity)
      ) {
        throw new Error(`Order ${expected.id} no longer matches the reviewed September 28 receipt.`);
      }
    }

    const adjustmentById = new Map(adjustments.map((row) => [String(row._id), row]));
    const missing = adjustmentIds.filter((id) => !adjustmentById.has(String(id)));
    if (missing.length) {
      throw new Error(`Expected history row(s) are missing: ${missing.join(', ')}. Nothing was changed.`);
    }

    for (const expected of BAD_ADJUSTMENTS) {
      const source = adjustmentById.get(expected.id);
      if (
        source.delta !== 100 ||
        source.reason !== expected.reason ||
        source.productId?.name !== expected.product
      ) {
        throw new Error(`Source adjustment ${expected.id} no longer matches the reviewed +100 entry.`);
      }

      if (expected.correctionId) {
        const correction = adjustmentById.get(expected.correctionId);
        if (
          correction.delta !== expected.correctionDelta ||
          correction.productId?.name !== expected.product ||
          !correction.reason.includes(expected.id)
        ) {
          throw new Error(`Correction ${expected.correctionId} no longer matches source ${expected.id}.`);
        }
      }
    }

    const productNames = [...new Set(BAD_ADJUSTMENTS.map((row) => row.product))];
    const productsQuery = Product.find({ name: { $in: productNames } }).select('_id name').lean();
    if (session) productsQuery.session(session);
    const products = await productsQuery;
    if (products.length !== productNames.length) throw new Error('One or more target products is missing.');

    const productByName = new Map(products.map((row) => [row.name, row]));
    const inventoryQuery = Inventory.find({
      productId: { $in: products.map((row) => row._id) },
    }).lean();
    if (session) inventoryQuery.session(session);
    const inventories = await inventoryQuery;
    if (inventories.length !== products.length) throw new Error('One or more target inventory rows is missing.');
    const inventoryByProduct = new Map(inventories.map((row) => [String(row.productId), row]));

    const rows = BAD_ADJUSTMENTS.map((row) => {
      const product = productByName.get(row.product);
      const inventory = inventoryByProduct.get(String(product._id));
      const liveStockDelta = row.liveStockDelta || 0;
      if (inventory.stock + liveStockDelta < 0) {
        throw new Error(`${row.product} has only ${inventory.stock}; cannot remove 100 without going negative.`);
      }
      return {
        ...row,
        productId: product._id,
        inventoryId: inventory._id,
        currentStock: inventory.stock,
        liveStockDelta,
        finalStock: inventory.stock + liveStockDelta,
      };
    });

    return { rows, adjustmentIds };
  };

  const preview = await loadPlan();
  console.log('\nHistory repair preview:');
  console.table(preview.rows.map((row) => ({
    product: row.product,
    removeHistory: row.correctionId ? '+100 and its correction' : '+100',
    currentStock: row.currentStock,
    stockChange: row.liveStockDelta,
    finalStock: row.finalStock,
  })));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write one transaction.');
    process.exitCode = 2;
  } else {
    const result = await mongoose.connection.transaction(async (session) => {
      const plan = await loadPlan(session);
      for (const row of plan.rows) {
        if (!row.liveStockDelta) continue;
        const updated = await Inventory.findOneAndUpdate(
          { _id: row.inventoryId, stock: row.currentStock },
          { $inc: { stock: row.liveStockDelta } },
          { new: true, runValidators: true, session }
        );
        if (!updated) throw new Error(`${row.product} stock changed during the repair; retry.`);
      }

      const deleted = await StockAdjustment.deleteMany(
        { _id: { $in: plan.adjustmentIds } },
        { session }
      );
      if (deleted.deletedCount !== plan.adjustmentIds.length) {
        throw new Error(`Expected to remove ${plan.adjustmentIds.length} history rows; removed ${deleted.deletedCount}.`);
      }

      return {
        removedHistoryRows: deleted.deletedCount,
        products: plan.rows.map((row) => ({
          product: row.product,
          stockBefore: row.currentStock,
          stockAfter: row.finalStock,
        })),
      };
    });

    console.log('\nRepair applied successfully in one transaction.');
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
