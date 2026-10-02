/* Removes every +100 manual stock movement left after the September 28
 * five-product cleanup. Rows superseded by the 24 Sep physical stocktake do
 * not change live stock. Aloo Bhujia's source and exact -100 correction leave
 * together. Khatta Meetha's later +100 was never rebased or corrected, so its
 * live balance is reduced by 100 in the same transaction.
 *
 * Preview is the default:
 *   node scripts/repairRemainingHundredAdjustments.js --prod
 *   node scripts/repairRemainingHundredAdjustments.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Inventory from '../models/Inventory.js';
import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import StockAdjustment from '../models/StockAdjustment.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');

const ROWS = Object.freeze([
  {
    id: '6ab1812b35f1090219cf8faa',
    product: 'Frooti',
    reason: 'first run',
    rebaseId: '6ab55606d445458eb2bfdad3',
  },
  {
    id: '6ab1814535f1090219cf8fea',
    product: 'Hide & Seek',
    reason: 'first run',
    rebaseId: '6ab55607d445458eb2bfdaf1',
  },
  {
    id: '6ab1814e35f1090219cf8ffa',
    product: 'Jim Jam',
    reason: 'first run',
    openingOrderId: '6ab55607d445458eb2bfdaf6',
    openingQuantity: 120,
  },
  {
    id: '6ab1815835f1090219cf9019',
    product: 'Khatta Meetha',
    reason: 'first run',
    rebaseId: '6ab55606d445458eb2bfdae0',
  },
  {
    id: '6ab1817235f1090219cf906c',
    product: 'Oreo',
    reason: 'first run',
    rebaseId: '6ab55607d445458eb2bfdaee',
  },
  {
    id: '6ab8a717e6821e4a24920b2d',
    product: 'Aloo Bhujia',
    reason: 'replenish',
    correctionId: '6aba306852f22e9073d4ee97',
    correctionDelta: -100,
  },
  {
    id: '6ab8a72ce6821e4a24920b3c',
    product: 'Khatta Meetha',
    reason: '-',
    liveStockDelta: -100,
  },
]);

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This repair is production-only. Pass --prod.');

  const loadPlan = async (session) => {
    const historyIds = ROWS.flatMap((row) => [row.id, row.correctionId, row.rebaseId].filter(Boolean))
      .map((id) => new mongoose.Types.ObjectId(id));
    const sourceAndCorrectionIds = ROWS.flatMap((row) => [row.id, row.correctionId].filter(Boolean))
      .map((id) => new mongoose.Types.ObjectId(id));

    const adjustmentsQuery = StockAdjustment.find({ _id: { $in: historyIds } })
      .populate('productId', 'name')
      .lean();
    const openingOrderQuery = Purchase.findById('6ab55607d445458eb2bfdaf6')
      .populate('items.productId', 'name')
      .lean();
    if (session) {
      adjustmentsQuery.session(session);
      openingOrderQuery.session(session);
    }
    const [adjustments, openingOrder] = await Promise.all([adjustmentsQuery, openingOrderQuery]);
    const adjustmentById = new Map(adjustments.map((row) => [String(row._id), row]));

    for (const expected of ROWS) {
      const source = adjustmentById.get(expected.id);
      if (
        !source || source.delta !== 100 || source.reason !== expected.reason ||
        source.productId?.name !== expected.product
      ) {
        throw new Error(`Source +100 row ${expected.id} is missing or no longer matches.`);
      }

      if (expected.rebaseId) {
        const rebase = adjustmentById.get(expected.rebaseId);
        if (
          !rebase || rebase.productId?.name !== expected.product ||
          rebase.createdAt <= source.createdAt ||
          rebase.reason !== 'Opening stock 2026-09-24 less deliveries that day'
        ) {
          throw new Error(`The later stocktake rebase for ${expected.product} is missing or changed.`);
        }
      }

      if (expected.correctionId) {
        const correction = adjustmentById.get(expected.correctionId);
        if (
          !correction || correction.delta !== expected.correctionDelta ||
          correction.productId?.name !== expected.product ||
          !correction.reason.includes(expected.id)
        ) {
          throw new Error(`The linked correction for ${expected.product} is missing or changed.`);
        }
      }
    }

    const jimJam = ROWS.find((row) => row.product === 'Jim Jam');
    const openingLine = openingOrder?.items?.find((item) => item.productId?.name === jimJam.product);
    if (
      String(openingOrder?._id) !== jimJam.openingOrderId ||
      openingOrder?.reason !== 'Opening stock indent 2026-09-24 - Sri Rama Agencies' ||
      openingLine?.quantity !== jimJam.openingQuantity
    ) {
      throw new Error('Jim Jam is not backed by the reviewed 24 Sep physical opening count.');
    }

    const names = [...new Set(ROWS.map((row) => row.product))];
    const productsQuery = Product.find({ name: { $in: names } }).select('_id name').lean();
    if (session) productsQuery.session(session);
    const products = await productsQuery;
    if (products.length !== names.length) throw new Error('One or more target products is missing.');

    const productByName = new Map(products.map((row) => [row.name, row]));
    const inventoryQuery = Inventory.find({ productId: { $in: products.map((row) => row._id) } }).lean();
    if (session) inventoryQuery.session(session);
    const inventories = await inventoryQuery;
    if (inventories.length !== products.length) throw new Error('One or more target inventory rows is missing.');
    const inventoryByProduct = new Map(inventories.map((row) => [String(row.productId), row]));

    const rows = ROWS.map((row) => {
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

    return { rows, sourceAndCorrectionIds };
  };

  const preview = await loadPlan();
  console.log('\nRemaining +100 cleanup preview:');
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
        if (!updated) throw new Error(`${row.product} stock changed during repair; retry.`);
      }

      const deleted = await StockAdjustment.deleteMany(
        { _id: { $in: plan.sourceAndCorrectionIds } },
        { session }
      );
      if (deleted.deletedCount !== plan.sourceAndCorrectionIds.length) {
        throw new Error(
          `Expected to remove ${plan.sourceAndCorrectionIds.length} history rows; removed ${deleted.deletedCount}.`
        );
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
