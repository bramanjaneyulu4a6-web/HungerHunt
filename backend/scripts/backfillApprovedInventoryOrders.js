/* Brings purchase orders approved before approval-time stock booking into the
 * new completed workflow. Opening-stock indents are marked received without
 * another shelf increment because their stock was already applied by the
 * 24 Sep reconciliation. The two 28 Sep supplier requests are incremented.
 * Preview is the default; --apply performs one Mongo transaction.
 *
 *   node scripts/backfillApprovedInventoryOrders.js --prod
 *   node scripts/backfillApprovedInventoryOrders.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import GoodsReceipt from '../models/GoodsReceipt.js';
import Inventory from '../models/Inventory.js';
import Purchase from '../models/Purchase.js';
import '../models/Product.js';
import '../models/Supplier.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const STOCK_BACKFILL_IDS = new Set([
  '6aba306852f22e9073d4ee9f',
  '6aba306852f22e9073d4eea5',
]);
const OPENING_REASON = /^Opening stock indent 2026-09-24 - /;

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This backfill is production-only. Pass --prod.');

  const loadPlan = async (session) => {
    const ordersQuery = Purchase.find({ status: 'APPROVED' })
      .populate('supplierId', 'name')
      .populate('items.productId', 'name')
      .sort({ createdAt: 1 });
    if (session) ordersQuery.session(session);
    const orders = await ordersQuery;

    if (!orders.length) throw new Error('No approved orders remain to backfill.');

    const unexpected = orders.filter((order) =>
      !STOCK_BACKFILL_IDS.has(String(order._id)) && !OPENING_REASON.test(order.reason || '')
    );
    if (unexpected.length) {
      throw new Error(`Unclassified approved order(s): ${unexpected.map((row) => row._id).join(', ')}.`);
    }

    const existingReceiptsQuery = GoodsReceipt.find({
      purchaseId: { $in: orders.map((order) => order._id) },
    }).select('purchaseId clientToken').lean();
    if (session) existingReceiptsQuery.session(session);
    const existingReceipts = await existingReceiptsQuery;
    if (existingReceipts.length) {
      throw new Error(`Approved order already has a receipt: ${existingReceipts.map((row) => row.purchaseId).join(', ')}.`);
    }

    const actorIds = [...new Set(orders.map((order) => String(order.reviewedBy)).filter(Boolean))];
    const actorsQuery = Admin.find({
      _id: { $in: actorIds },
      active: { $ne: false },
      $or: [{ role: 'admin' }, { role: { $exists: false } }],
    }).select('_id').lean();
    if (session) actorsQuery.session(session);
    const actors = await actorsQuery;
    const activeActors = new Set(actors.map((row) => String(row._id)));
    const missingActor = orders.find((order) => !activeActors.has(String(order.reviewedBy)));
    if (missingActor) throw new Error(`Order ${missingActor._id} has no active reviewing admin.`);

    return orders.map((order) => ({
      order,
      addStock: STOCK_BACKFILL_IDS.has(String(order._id)),
    }));
  };

  const preview = await loadPlan();
  console.log('\nApproved orders to backfill:');
  console.table(preview.flatMap(({ order, addStock }) => order.items.map((item) => ({
    orderId: String(order._id),
    supplier: order.supplierId?.name,
    product: item.productId?.name,
    quantity: item.quantity,
    rate: item.purchasePrice,
    inventoryAction: addStock ? `add ${item.quantity}` : 'already represented — no increment',
  }))));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to write one transaction.');
    process.exitCode = 2;
  } else {
    const result = await mongoose.connection.transaction(async (session) => {
      const plan = await loadPlan(session);
      const completed = [];

      for (const { order, addStock } of plan) {
        if (addStock) {
          for (const item of order.items) {
            const productId = item.productId?._id ?? item.productId;
            await Inventory.updateOne(
              { productId },
              { $inc: { stock: item.quantity } },
              { upsert: true, session }
            );
          }
        }

        const [receipt] = await GoodsReceipt.create([{
          purchaseId: order._id,
          receivedBy: order.reviewedBy,
          invoiceNumber: '',
          note: addStock
            ? 'Backfilled inventory for an order approved before automatic stock booking.'
            : 'Backfilled receipt record; stock was already represented by the opening-stock reconciliation.',
          stockApplied: addStock,
          clientToken: `approval-backfill-${order._id}`,
          lines: order.items.map((item) => ({
            productId: item.productId?._id ?? item.productId,
            received: item.quantity,
            damaged: 0,
            purchasePrice: item.purchasePrice,
          })),
        }], { session });

        order.items.forEach((item) => { item.received = item.quantity; });
        order.status = 'RECEIVED';
        order.receivedAt = new Date();
        order.completedAt = order.receivedAt;
        await order.save({ session });

        completed.push({
          orderId: String(order._id),
          receiptId: String(receipt._id),
          stockIncremented: addStock,
        });
      }

      return completed;
    });

    console.log('\nBackfill applied successfully in one transaction.');
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await mongoose.disconnect();
}
