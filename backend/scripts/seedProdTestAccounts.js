/* One-off: seed a clearly-marked TEST parent + 3 students + orders in the
 * LIVE database, for exercising the parent app end to end in production.
 *
 *   node scripts/seedProdTestAccounts.js
 *
 * Reads backend/.env.production.local (never backend/.env), prints the host
 * it connected to, aborts if any of the test identities already exist, and
 * writes everything in one transaction — a failure part-way leaves nothing.
 *
 * What it creates:
 *  - Room TEST-HOSTEL-01 ("Test Room") so no real caretaker sees test
 *    packages. The code keeps its original spelling: it names rows that
 *    already exist in the live database, and renaming it would orphan them.
 *  - Parent "Test Parent" (phone 9000000021 / TestParent123!) linked to all 3.
 *  - Students 990001/990002/990003, ₹500 wallet each, spending limit OFF,
 *    requiresParentApproval ON, purchase PINs 1111/2222/3333.
 *  - Students One & Two: a PENDING pending-order each (awaiting the parent).
 *  - Student Three: an APPROVED pending-order + PARENT_APPROVAL transaction +
 *    a PACKED fulfillment order. Deliberately does NOT touch Inventory stock:
 *    the packed order is a fiction, and shorting real shelves for it would
 *    corrupt real counts. The two PENDING orders, if actually approved later,
 *    go through the real chargeCart and DO move real stock and the test
 *    student's wallet.
 */
import dotenv from 'dotenv';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

dotenv.config({ path: fileURLToPath(new URL('../.env.production.local', import.meta.url)) });

import Parent from '../models/Parent.js';
import Student from '../models/Student.js';
import Room from '../models/Room.js';
import '../models/Product.js';
import Inventory from '../models/Inventory.js';
import PendingOrder, { pendingOrderExpiry } from '../models/PendingOrder.js';
import Transaction from '../models/Transaction.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import { OrderStatus } from '../src/domain/fulfillment/orderState.js';
import { fulfillmentSchedule } from '../utils/fulfillment.js';

const PARENT = {
  fatherName: 'Test Parent',
  phone: '9000000021',
  email: 'test.parent@hungerhunt.local',
  password: 'TestParent123!',
};

const STUDENTS = [
  { name: 'Test Student One', admissionNumber: '990001', pin: '1111' },
  { name: 'Test Student Two', admissionNumber: '990002', pin: '2222' },
  { name: 'Test Student Three', admissionNumber: '990003', pin: '3333' },
];

const OPENING_BALANCE = 500;

if (!process.env.MONGO_URI?.trim()) {
  throw new Error('MONGO_URI missing from backend/.env.production.local');
}

// SEED_REHEARSAL=local (with MONGO_URI pointing at 127.0.0.1) runs the whole
// script against the local dev replica set first, so the real run against
// Atlas is a re-run of something already seen to work — not a first attempt.
const rehearsal = process.env.SEED_REHEARSAL === 'local';

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15_000 });
console.log(`Connected to ${mongoose.connection.host} / db "${mongoose.connection.name}"`);
const hostOk = rehearsal
  ? mongoose.connection.host.startsWith('127.0.0.1')
  : mongoose.connection.host.includes('mongodb.net');
if (!hostOk) {
  throw new Error('Connected host does not match the intended target — refusing to continue.');
}

try {
  /* ---- preflight: none of the test identities may already exist ---------- */
  const clashes = [];
  if (await Parent.exists({ $or: [{ phone: PARENT.phone }, { email: PARENT.email }] })) {
    clashes.push(`parent ${PARENT.phone} / ${PARENT.email}`);
  }
  for (const s of STUDENTS) {
    if (await Student.exists({ admissionNumber: s.admissionNumber })) {
      clashes.push(`admission number ${s.admissionNumber}`);
    }
  }
  if (clashes.length) {
    throw new Error(
      `Already present in this database: ${clashes.join(', ')}. ` +
      'Nothing was written — remove the old test rows first or pick new identifiers.'
    );
  }

  /* ---- pick real, in-stock, active products to snapshot ------------------ */
  const inventories = (
    await Inventory.find({ stock: { $gte: 5 } }).populate('productId').limit(50)
  ).filter(
    (row) =>
      row.productId &&
      row.productId.active !== false &&
      Number.isFinite(row.productId.price) &&
      row.productId.price > 0 &&
      row.productId.price <= 100
  );
  if (inventories.length < 3) {
    throw new Error('Fewer than 3 affordable in-stock products found to build orders from.');
  }
  const [prodA, prodB, prodC] = inventories
    .sort((a, b) => a.productId.price - b.productId.price)
    .slice(0, 3)
    .map((row) => row.productId);

  const line = (product, quantity) => ({
    productId: product._id,
    name: product.name,
    quantity,
    price: product.price,
  });
  const total = (items) => items.reduce((sum, i) => sum + i.price * i.quantity, 0);

  const hashedPins = await Promise.all(STUDENTS.map((s) => bcrypt.hash(s.pin, 10)));
  const parentPasswordHash = await bcrypt.hash(PARENT.password, 10);

  const session = await mongoose.startSession();
  const summary = { orders: [] };

  await session.withTransaction(async () => {
    const room = await Room.findOneAndUpdate(
      { code: 'TEST-HOSTEL-01' },
      { $setOnInsert: { code: 'TEST-HOSTEL-01', name: 'Test Room', active: true } },
      { upsert: true, new: true, session }
    );

    const studentIds = STUDENTS.map(() => new mongoose.Types.ObjectId());
    const parentId = new mongoose.Types.ObjectId();

    // Student Three's approved-and-packed purchase.
    const packedItems = [line(prodA, 1), line(prodC, 1)];
    const packedTotal = total(packedItems);
    if (packedTotal > OPENING_BALANCE) {
      throw new Error('Cheapest products still exceed the opening balance — adjust OPENING_BALANCE.');
    }

    await Student.create(
      STUDENTS.map((s, i) => ({
        _id: studentIds[i],
        name: s.name,
        fatherName: PARENT.fatherName,
        roomNumber: room.code,
        roomId: room._id,
        grade: 'TEST',
        parentPhoneNumber: PARENT.phone,
        admissionNumber: s.admissionNumber,
        active: true,
        // Student Three has already "paid" for the packed order.
        pocketMoney: i === 2 ? OPENING_BALANCE - packedTotal : OPENING_BALANCE,
        isParentRegistered: true,
        purchasePassword: hashedPins[i],
        purchaseCodeIsPin: true,
        requiresParentApproval: true,
        walletControl: { enabled: false, limitAmount: 0, limitType: 'WEEKLY' },
      })),
      { session, ordered: true }
    );

    await Parent.create(
      [{
        _id: parentId,
        fatherName: PARENT.fatherName,
        phone: PARENT.phone,
        email: PARENT.email,
        password: parentPasswordHash,
        active: true,
        activationRequired: false,
        studentIds,
      }],
      { session }
    );

    // Students One & Two: awaiting approval and payment.
    for (const [i, items] of [
      [0, [line(prodA, 1), line(prodB, 1)]],
      [1, [line(prodB, 2)]],
    ]) {
      const [order] = await PendingOrder.create(
        [{
          studentId: studentIds[i],
          parentId,
          items,
          totalAmount: total(items),
          status: 'PENDING',
          expiresAt: pendingOrderExpiry(),
        }],
        { session }
      );
      summary.orders.push(`${STUDENTS[i].name}: PENDING order ₹${order.totalAmount} (${order._id})`);
    }

    // Student Three: approved, charged, packed.
    const now = new Date();
    const pendingOrderId = new mongoose.Types.ObjectId();
    const transactionId = new mongoose.Types.ObjectId();

    await Transaction.create(
      [{
        _id: transactionId,
        studentId: studentIds[2],
        items: packedItems,
        totalAmount: packedTotal,
        previousBalance: OPENING_BALANCE,
        remainingBalance: OPENING_BALANCE - packedTotal,
        sourceType: 'PARENT_APPROVAL',
        sourceId: pendingOrderId,
        idempotencyKey: `seed-test-${pendingOrderId}`,
      }],
      { session }
    );

    await PendingOrder.create(
      [{
        _id: pendingOrderId,
        studentId: studentIds[2],
        parentId,
        items: packedItems,
        totalAmount: packedTotal,
        status: 'APPROVED',
        expiresAt: pendingOrderExpiry(),
        approvedAt: now,
        approvalKey: `seed-test-${pendingOrderId}`,
        transactionId,
      }],
      { session }
    );

    const schedule = fulfillmentSchedule(now);
    const [fulfillment] = await FulfillmentOrder.create(
      [{
        transactionId,
        studentId: studentIds[2],
        studentSnapshot: {
          name: STUDENTS[2].name,
          admissionNumber: STUDENTS[2].admissionNumber,
          roomNumber: room.code,
          roomId: room._id,
        },
        items: packedItems,
        totalAmount: packedTotal,
        status: OrderStatus.PACKED,
        ...schedule,
        packedAt: now,
        transitions: [
          { from: OrderStatus.PENDING, to: OrderStatus.PACKED, at: now, note: 'Seeded test data' },
        ],
      }],
      { session }
    );
    summary.orders.push(
      `${STUDENTS[2].name}: PACKED fulfillment order ₹${packedTotal} (${fulfillment._id}), deliver by ${schedule.deliverBy.toISOString()}`
    );
  });

  session.endSession();

  console.log('─'.repeat(64));
  console.log('Test data seeded.');
  console.log(`Parent login: phone ${PARENT.phone}  password ${PARENT.password}`);
  for (const s of STUDENTS) {
    console.log(`${s.name}: admission ${s.admissionNumber}, purchase PIN ${s.pin}`);
  }
  console.log(`Products used: ${[prodA, prodB, prodC].map((p) => `${p.name} ₹${p.price}`).join(', ')}`);
  for (const o of summary.orders) console.log(o);
} finally {
  await mongoose.disconnect();
}
