/* Removes unavailable lines from still-open parent approval requests. These
 * baskets have not been charged, so this changes no wallet or refund ledger.
 * Preview is read-only; apply snapshots the full requests before one guarded
 * transaction.
 *
 *   node scripts/removeUnavailablePendingApprovalItems.js --prod
 *   node scripts/removeUnavailablePendingApprovalItems.js --prod --apply
 */
import 'dotenv/config';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';

import PendingOrder from '../models/PendingOrder.js';
import { connectForScript } from './lib/connect.mjs';

const TARGETS = [/^KitKat$/i, /^Pilot V7 Pen/i];
const EXPECTED = Object.freeze({ orders: 1, units: 1, value: 25 });
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const matches = (name) => TARGETS.some((pattern) => pattern.test(String(name || '')));

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This correction is production-only. Pass --prod.');
  const now = new Date();
  const orders = await PendingOrder.find({
    status: 'PENDING',
    expiresAt: { $gt: now },
    'items.name': { $in: TARGETS },
  }).sort({ _id: 1 }).lean();
  const plan = orders.map((order) => {
    const removed = order.items.filter((item) => matches(item.name));
    const items = order.items.filter((item) => !matches(item.name));
    return {
      order,
      removed,
      items,
      totalAmount: items.reduce((sum, item) => sum + item.quantity * item.price, 0),
    };
  });
  const totals = {
    orders: plan.length,
    units: plan.reduce((sum, row) => sum + row.removed.reduce((n, item) => n + item.quantity, 0), 0),
    value: plan.reduce((sum, row) => sum + row.removed.reduce((n, item) => n + item.quantity * item.price, 0), 0),
  };
  console.table([{
    Orders: totals.orders,
    UnitsRemoved: totals.units,
    BasketValueRemoved: `Rs ${totals.value}`,
    RequestsClosed: plan.filter((row) => row.items.length === 0).length,
  }]);
  if (Object.keys(EXPECTED).some((key) => totals[key] !== EXPECTED[key])) {
    throw new Error(`Live totals changed; expected ${JSON.stringify(EXPECTED)}, found ${JSON.stringify(totals)}. Nothing was written.`);
  }

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to snapshot and update.');
    process.exitCode = 2;
  } else {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const snapshotDir = fileURLToPath(new URL('../private-snapshots/', import.meta.url));
    const snapshotPath = `${snapshotDir}pending-approvals-before-${stamp}.json`;
    await mkdir(snapshotDir, { recursive: true });
    await writeFile(snapshotPath, JSON.stringify({
      createdAt: new Date().toISOString(),
      target: { database: 'graarr_ecommerce', expected: EXPECTED },
      orders,
    }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Pre-change snapshot: ${snapshotPath}`);

    await mongoose.connection.transaction(async (session) => {
      for (const row of plan) {
        const empty = row.items.length === 0;
        const updated = await PendingOrder.findOneAndUpdate(
          {
            _id: row.order._id,
            status: 'PENDING',
            expiresAt: row.order.expiresAt,
            updatedAt: row.order.updatedAt,
          },
          {
            $set: {
              items: row.items,
              totalAmount: row.totalAmount,
              ...(empty ? { status: 'REJECTED', rejectedAt: new Date() } : {}),
            },
          },
          { new: true, session, runValidators: true }
        );
        if (!updated) throw new Error(`Pending request ${row.order._id} changed; transaction aborted.`);
      }
    });

    const remaining = await PendingOrder.countDocuments({
      _id: { $in: orders.map((order) => order._id) },
      'items.name': { $in: TARGETS },
    });
    if (remaining) throw new Error(`Post-check failed: ${remaining} request(s) still contain unavailable items.`);
    console.log(`Updated ${plan.length} pending approval request(s); no wallet movement was created.`);
    console.log('Post-check passed: no snapshotted request still contains KitKat or Pilot V7 Pen lines.');
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
