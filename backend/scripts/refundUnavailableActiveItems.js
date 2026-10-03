/* One-off, guarded production correction for unavailable active-order lines.
 * Preview is read-only. Apply first writes a private JSON snapshot, then
 * refunds every matching line in one MongoDB transaction.
 *
 *   node scripts/refundUnavailableActiveItems.js --prod --as dhruv.kamma04@gmail.com
 *   node scripts/refundUnavailableActiveItems.js --prod --as dhruv.kamma04@gmail.com --apply
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Inventory from '../models/Inventory.js';
import ItemRefund from '../models/ItemRefund.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import { OPEN_STATUSES } from '../src/domain/fulfillment/overdue.js';
import { refundFulfillmentItems } from '../utils/itemRefunds.js';
import { connectForScript } from './lib/connect.mjs';

const TARGETS = [/^KitKat$/i, /^Pilot V7 Pen/i];
const EXPECTED = Object.freeze({ orders: 48, units: 58, amount: 1480 });
const REASON = 'Item unavailable: KitKat and Pilot V7 pens';
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const valueOf = (flag) => {
  const index = args.indexOf(flag);
  return index === -1 ? null : args[index + 1];
};
const actorEmail = String(valueOf('--as') || '').trim().toLowerCase();
const matches = (name) => TARGETS.some((pattern) => pattern.test(String(name || '')));
const asJson = (value) => JSON.parse(JSON.stringify(value));

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This correction is production-only. Pass --prod.');
  if (!actorEmail) throw new Error('Pass --as <super-admin email> for the refund audit trail.');

  const actor = await Admin.findOne({
    email: actorEmail,
    active: { $ne: false },
    $or: [{ role: 'admin' }, { role: { $exists: false } }],
    isSuperAdmin: true,
  }).select('_id name email').lean();
  if (!actor) throw new Error(`No active super-admin found for ${actorEmail}.`);

  const orders = await FulfillmentOrder.find({
    status: { $in: OPEN_STATUSES },
    'items.name': { $in: TARGETS },
  }).sort({ _id: 1 }).lean();
  const plan = orders.map((order) => {
    const items = order.items.filter((item) => matches(item.name));
    return {
      order,
      items,
      units: items.reduce((sum, item) => sum + item.quantity, 0),
      amount: items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    };
  });
  const totals = {
    orders: plan.length,
    units: plan.reduce((sum, row) => sum + row.units, 0),
    amount: plan.reduce((sum, row) => sum + row.amount, 0),
  };
  console.table([{
    Orders: totals.orders,
    Units: totals.units,
    Refund: `Rs ${totals.amount}`,
    Actor: `${actor.name} <${actor.email}>`,
  }]);
  if (Object.keys(EXPECTED).some((key) => totals[key] !== EXPECTED[key])) {
    throw new Error(`Live totals changed; expected ${JSON.stringify(EXPECTED)}, found ${JSON.stringify(totals)}. Nothing was written.`);
  }

  const transactionIds = orders.map((order) => order.transactionId);
  const studentIds = [...new Set(orders.map((order) => String(order.studentId)))];
  const productIds = [...new Set(plan.flatMap((row) => row.items.map((item) => String(item.productId))))];
  const [transactions, students, inventory, existingRefunds] = await Promise.all([
    Transaction.find({ _id: { $in: transactionIds } }).lean(),
    Student.find({ _id: { $in: studentIds } }).select('_id name admissionNumber pocketMoney updatedAt').lean(),
    Inventory.find({ productId: { $in: productIds } }).lean(),
    ItemRefund.find({ fulfillmentOrderId: { $in: orders.map((order) => order._id) } }).lean(),
  ]);
  if (transactions.length !== orders.length) throw new Error('At least one affected order has no payment transaction. Nothing was written.');
  if (existingRefunds.length) throw new Error('At least one affected order already has an item refund. Nothing was written.');

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to snapshot and refund in one transaction.');
    process.exitCode = 2;
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = fileURLToPath(new URL('../private-snapshots/', import.meta.url));
    const snapshotPath = `${snapshotDir}unavailable-items-before-${stamp}.json`;
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      target: { database: 'graarr_ecommerce', reason: REASON, expected: EXPECTED },
      actor: asJson(actor),
      orders: asJson(orders),
      transactions: asJson(transactions),
      students: asJson(students),
      inventory: asJson(inventory),
    }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Pre-refund snapshot: ${snapshotPath}`);

    // Establish the collection and its idempotency indexes before the money
    // transaction. MongoDB cannot build an index inside a transaction.
    await ItemRefund.init();

    const results = await mongoose.connection.transaction(async (session) => {
      const written = [];
      for (const row of plan) {
        written.push(await refundFulfillmentItems({
          orderId: row.order._id,
          actorId: actor._id,
          idempotencyKey: `unavailable-items-2026-10-03-${row.order._id}`,
          reason: REASON,
          items: row.items.map((item) => ({ productId: item.productId, quantity: item.quantity })),
          session,
        }));
      }
      return written;
    });
    const writtenAmount = results.reduce((sum, row) => sum + row.refund.amount, 0);
    const remaining = await FulfillmentOrder.countDocuments({
      _id: { $in: orders.map((order) => order._id) },
      'items.name': { $in: TARGETS },
    });
    if (results.length !== EXPECTED.orders || writtenAmount !== EXPECTED.amount || remaining !== 0) {
      throw new Error(`Post-check failed: ${results.length} refunds, Rs ${writtenAmount}, ${remaining} affected orders still contain target items.`);
    }
    console.log(`Applied ${results.length} item refunds totalling Rs ${writtenAmount}.`);
    console.log('Post-check passed: no snapshotted order still contains KitKat or Pilot V7 Pen lines.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
