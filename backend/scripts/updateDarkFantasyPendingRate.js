/* One-time guarded correction for the 28 Sep Flipkart/Walmart review order.
 * It refuses to alter an order that has moved beyond review or whose current
 * Dark Fantasy rate is no longer the value reviewed before this change.
 *
 *   node scripts/updateDarkFantasyPendingRate.js --prod --apply
 */
import 'dotenv/config';
import mongoose from 'mongoose';

import Product from '../models/Product.js';
import Purchase from '../models/Purchase.js';
import { connectForScript } from './lib/connect.mjs';

const apply = process.argv.slice(2).includes('--apply');
const ORDER_ID = '6aba306852f22e9073d4ee9f';
const PRODUCT_NAME = 'Dark Fantasy Choco Fills';
const OLD_RATE = 35;
const NEW_RATE = 35.71;

const target = await connectForScript();

try {
  if (!target.viaProdFlag) throw new Error('This rate correction is production-only. Pass --prod.');

  const product = await Product.findOne({ name: PRODUCT_NAME }).select('_id name').lean();
  if (!product) throw new Error(`Product not found: ${PRODUCT_NAME}.`);

  const order = await Purchase.findById(ORDER_ID).lean();
  if (!order) throw new Error(`Purchase order not found: ${ORDER_ID}.`);
  const line = order.items.find((item) => String(item.productId) === String(product._id));
  if (!line) throw new Error(`${PRODUCT_NAME} is not on order ${ORDER_ID}.`);

  console.log(JSON.stringify({
    orderId: ORDER_ID,
    supplierId: String(order.supplierId),
    status: order.status,
    product: PRODUCT_NAME,
    quantity: line.quantity,
    currentRate: line.purchasePrice,
    requestedRate: NEW_RATE,
  }, null, 2));

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply to update the rate.');
    process.exitCode = 2;
  } else {
    const updated = await Purchase.findOneAndUpdate(
      {
        _id: new mongoose.Types.ObjectId(ORDER_ID),
        status: 'PENDING_REVIEW',
        items: { $elemMatch: { productId: product._id, purchasePrice: OLD_RATE } },
      },
      { $set: { 'items.$[line].purchasePrice': NEW_RATE } },
      {
        new: true,
        runValidators: true,
        arrayFilters: [{ 'line.productId': product._id, 'line.purchasePrice': OLD_RATE }],
      }
    ).lean();

    if (!updated) {
      throw new Error('Order is no longer pending review or its Dark Fantasy rate is no longer ₹35.');
    }

    const updatedLine = updated.items.find((item) => String(item.productId) === String(product._id));
    console.log(`\nUpdated ${PRODUCT_NAME}: ₹${OLD_RATE} → ₹${updatedLine.purchasePrice}.`);
  }
} finally {
  await mongoose.disconnect();
}
