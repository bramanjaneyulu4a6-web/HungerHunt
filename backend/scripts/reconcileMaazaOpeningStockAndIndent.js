/* Adds the Maaza line that was intentionally skipped during the original
 * 24 September reconciliation because the product did not yet exist.
 * Preview is the default; --apply performs stock and indent writes together.
 *
 *   node scripts/reconcileMaazaOpeningStockAndIndent.js --prod --as dhruv.kamma04@gmail.com
 *   node scripts/reconcileMaazaOpeningStockAndIndent.js --prod --as dhruv.kamma04@gmail.com --apply
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

const BUSINESS_DATE = '2026-09-24';
const PRODUCT_NAME = 'Maaza';
const SUPPLIER_NAME = 'Sri Rama Agencies';
const OPENING_STOCK = 40;
const PURCHASE_RATE = 8;
const INDENT_REASON = `Opening stock indent ${BUSINESS_DATE} - ${SUPPLIER_NAME} - ${PRODUCT_NAME}`;

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
const actorEmail = String(valueOf('--as') || '').trim().toLowerCase();

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This reconciliation is production-only. Pass --prod.');
  if (!actorEmail) throw new Error('Pass --as <admin email> for the stock audit trail.');

  const from = businessDateStart(BUSINESS_DATE);
  const to = businessDateStart('2026-09-25');

  const loadPlan = async (session) => {
    const actorQuery = Admin.findOne({
      email: actorEmail,
      active: { $ne: false },
      $or: [{ role: 'admin' }, { role: { $exists: false } }],
      isSuperAdmin: true,
    }).lean();
    const productQuery = Product.findOne({ name: PRODUCT_NAME, active: { $ne: false } })
      .select('_id name')
      .lean();
    const supplierQuery = Supplier.findOne({ name: SUPPLIER_NAME, active: { $ne: false } })
      .select('_id name')
      .lean();
    const duplicateQuery = Purchase.findOne({ reason: INDENT_REASON }).select('_id status').lean();
    if (session) {
      actorQuery.session(session);
      productQuery.session(session);
      supplierQuery.session(session);
      duplicateQuery.session(session);
    }

    const [actor, product, supplier, duplicate] = await Promise.all([
      actorQuery,
      productQuery,
      supplierQuery,
      duplicateQuery,
    ]);
    if (!actor) throw new Error(`No active super-admin found for ${actorEmail}.`);
    if (!product) throw new Error(`No active product named ${PRODUCT_NAME}.`);
    if (!supplier) throw new Error(`No active supplier named ${SUPPLIER_NAME}.`);
    if (duplicate) throw new Error(`Maaza indent already exists (${duplicate._id}, ${duplicate.status}).`);

    const inventoryQuery = Inventory.findOne({ productId: product._id }).lean();
    const deliveredQuery = FulfillmentOrder.aggregate([
      { $match: { deliveredAt: { $gte: from, $lt: to } } },
      { $unwind: '$items' },
      { $match: { 'items.productId': product._id } },
      { $group: { _id: null, quantity: { $sum: '$items.quantity' } } },
    ]);
    if (session) {
      inventoryQuery.session(session);
      deliveredQuery.session(session);
    }
    const [shelf, deliveredRows] = await Promise.all([inventoryQuery, deliveredQuery]);
    if (!shelf) throw new Error(`No inventory row exists for ${PRODUCT_NAME}.`);

    const delivered = Number(deliveredRows[0]?.quantity) || 0;
    const finalStock = OPENING_STOCK - delivered;
    if (finalStock < 0) {
      throw new Error(`${PRODUCT_NAME} delivered ${delivered}, above opening stock ${OPENING_STOCK}.`);
    }

    return {
      actor,
      product,
      supplier,
      shelf,
      delivered,
      finalStock,
      delta: finalStock - shelf.stock,
    };
  };

  const preview = await loadPlan();
  console.table([{
    Product: PRODUCT_NAME,
    Current: preview.shelf.stock,
    Opening: OPENING_STOCK,
    Delivered: preview.delivered,
    Final: preview.finalStock,
    Adjustment: preview.delta,
  }]);
  console.log(`\nIndent: ${SUPPLIER_NAME} - ${OPENING_STOCK} ${PRODUCT_NAME} @ Rs ${PURCHASE_RATE}`);

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write one transaction.');
    process.exitCode = 2;
  } else {
    const result = await mongoose.connection.transaction(async (session) => {
      const plan = await loadPlan(session);

      if (plan.delta !== 0) {
        const shelf = await Inventory.findOneAndUpdate(
          { _id: plan.shelf._id, stock: plan.shelf.stock },
          { $inc: { stock: plan.delta } },
          { new: true, runValidators: true, session }
        );
        if (!shelf) throw new Error(`${PRODUCT_NAME} stock changed during reconciliation; retry.`);
        await StockAdjustment.create([{
          productId: plan.product._id,
          delta: plan.delta,
          reason: `Opening stock ${BUSINESS_DATE} less deliveries that day`,
          adjustedBy: plan.actor._id,
          stockAfter: shelf.stock,
        }], { session });
      }

      const [purchase] = await Purchase.create([{
        status: 'PENDING_REVIEW',
        supplierId: plan.supplier._id,
        raisedBy: plan.actor._id,
        reason: INDENT_REASON,
        items: [{
          productId: plan.product._id,
          quantity: OPENING_STOCK,
          purchasePrice: PURCHASE_RATE,
          received: 0,
        }],
      }], { session });

      return { finalStock: plan.finalStock, adjustment: plan.delta, purchaseId: String(purchase._id) };
    });
    console.log('\nApplied successfully in one transaction.');
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
