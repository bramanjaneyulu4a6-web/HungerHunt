import 'dotenv/config';
import mongoose from 'mongoose';

import Student from '../models/Student.js';
import Product from '../models/Product.js';
import Supplier from '../models/Supplier.js';
import PendingOrder from '../models/PendingOrder.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import Purchase from '../models/Purchase.js';
import GoodsReceipt from '../models/GoodsReceipt.js';
import Parent from '../models/Parent.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import ReplenishmentDraft from '../models/ReplenishmentDraft.js';
import WalletReversal from '../models/WalletReversal.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

await mongoose.connect(process.env.MONGO_URI);

try {
  const hello = await mongoose.connection.db.admin().command({ hello: 1 });
  if (!hello.setName && hello.msg !== 'isdbgrid') {
    throw new Error(
      'MongoDB must be a replica set or sharded cluster; wallet and approval transactions are not safe on standalone MongoDB.'
    );
  }

  const backfills = await Promise.all([
    Student.updateMany({ active: { $exists: false } }, { $set: { active: true } }),
    Product.updateMany({ active: { $exists: false } }, { $set: { active: true } }),
    Product.updateMany({ safetyStock: { $exists: false } }, { $set: { safetyStock: 0 } }),
    Supplier.updateMany({ active: { $exists: false } }, { $set: { active: true } }),
    Supplier.updateMany({ leadTimeDays: { $exists: false } }, { $set: { leadTimeDays: 7 } }),
  ]);

  // The active-order constraint was expanded from PENDING to include the
  // short-lived PROCESSING claim. MongoDB will not replace an index merely
  // because the options behind the same name changed.
  const indexes = await PendingOrder.collection.indexes();
  if (indexes.some((index) => index.name === 'one_pending_order_per_student')) {
    await PendingOrder.collection.dropIndex('one_pending_order_per_student');
  }

  const fulfillmentIndexes = await FulfillmentOrder.collection.indexes();
  if (fulfillmentIndexes.some((index) => index.name === 'one_fulfillment_order_per_student_business_week')) {
    await FulfillmentOrder.collection.dropIndex('one_fulfillment_order_per_student_business_week');
  }

  for (const model of [
    Student,
    Product,
    Supplier,
    PendingOrder,
    Transaction,
    WalletAdjustment,
    Purchase,
    GoodsReceipt,
    Parent,
    FulfillmentOrder,
    ReplenishmentDraft,
    WalletReversal,
  ]) {
    await model.createIndexes();
  }

  console.log(
    JSON.stringify({
      status: 'complete',
      backfilledDocuments: backfills.reduce(
        (sum, result) => sum + (result.modifiedCount || 0),
        0
      ),
    })
  );
} finally {
  await mongoose.disconnect();
}
