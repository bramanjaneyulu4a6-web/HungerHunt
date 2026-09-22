/* How many of each product the storeroom still owes students: every item on
 * a package not yet handed to a caretaker (Pending, Packed, Out for delivery),
 * summed per product. Read-only.
 *
 *   node scripts/openOrderItemTotals.js --prod
 *   node scripts/openOrderItemTotals.js --prod --csv > open-items.csv
 *
 * The status columns show where the units are: "To pack" still has to come off
 * the shelf. Orders waiting on a parent or caretaker are not here — nothing is
 * owed until they are approved. */
import 'dotenv/config';
import mongoose from 'mongoose';

import FulfillmentOrder from '../models/FulfillmentOrder.js';
import { OPEN_STATUSES } from '../src/domain/fulfillment/overdue.js';
import { connectForScript } from './lib/connect.mjs';

const CSV = process.argv.includes('--csv');
const COLUMNS = [
  ['PENDING', 'To pack'],
  ['PACKED', 'Packed'],
  ['OUT_FOR_DELIVERY', 'Out for delivery'],
];

const log = CSV ? console.error : console.log;

try {
  // The banner goes to stderr in CSV mode so the file stays clean.
  const original = console.log;
  if (CSV) console.log = console.error;
  await connectForScript();
  console.log = original;

  const rows = await FulfillmentOrder.aggregate([
    { $match: { status: { $in: OPEN_STATUSES } } },
    { $unwind: '$items' },
    {
      $group: {
        _id: { productId: '$items.productId', status: '$status' },
        name: { $last: '$items.name' },
        quantity: { $sum: '$items.quantity' },
        orders: { $addToSet: '$_id' },
      },
    },
  ]);
  const packageCount = await FulfillmentOrder.countDocuments({ status: { $in: OPEN_STATUSES } });

  const byProduct = new Map();
  for (const row of rows) {
    const key = String(row._id.productId);
    const entry = byProduct.get(key) ?? { name: row.name, total: 0, orders: new Set() };
    entry[row._id.status] = (entry[row._id.status] ?? 0) + row.quantity;
    entry.total += row.quantity;
    for (const id of row.orders) entry.orders.add(String(id));
    byProduct.set(key, entry);
  }
  const products = [...byProduct.values()].sort((a, b) => b.total - a.total || a.name.localeCompare(b.name));

  if (CSV) {
    const quote = (value) => `"${String(value).replace(/"/g, '""')}"`;
    console.log(['Product', ...COLUMNS.map(([, label]) => label), 'Total units', 'Orders'].map(quote).join(','));
    for (const p of products) {
      console.log([p.name, ...COLUMNS.map(([status]) => p[status] ?? 0), p.total, p.orders.size].map(quote).join(','));
    }
  } else {
    const nameWidth = Math.max(7, ...products.map((p) => p.name.length));
    const header = ['Product'.padEnd(nameWidth), ...COLUMNS.map(([, label]) => label.padStart(16)), 'Total'.padStart(7), 'Orders'.padStart(7)];
    log(`\n${header.join('  ')}`);
    log('-'.repeat(header.join('  ').length));
    for (const p of products) {
      log([
        p.name.padEnd(nameWidth),
        ...COLUMNS.map(([status]) => String(p[status] ?? 0).padStart(16)),
        String(p.total).padStart(7),
        String(p.orders.size).padStart(7),
      ].join('  '));
    }
    const units = products.reduce((sum, p) => sum + p.total, 0);
    log(`\n${products.length} product(s), ${units} unit(s) across ${packageCount} open package(s).`);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
