import 'dotenv/config';

import mongoose from 'mongoose';

import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Room from '../models/Room.js';
import Product from '../models/Product.js';
import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';

const DEMO_ADMISSION_PREFIX = 'WHD';
const BLOCKS = ['A', 'B', 'C'];
const ROOMS_PER_BLOCK = 8;
const BASE_ORDERS_PER_STATUS = 2;
const EXTRA_NEW_ORDERS = 12;
const STATUSES = ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY'];

const FALLBACK_PRODUCTS = [
  ['Pepsi', 25],
  ['Mango juice', 30],
  ['Potato chips', 20],
  ['Chocolate bar', 35],
  ['Mineral water', 15],
  ['Cream biscuits', 20],
  ['Noodles cup', 45],
  ['Orange drink', 25],
].map(([name, price]) => ({ _id: new mongoose.Types.ObjectId(), name, price }));

const isLocalMongo = (uri) =>
  /^mongodb:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?\//i.test(uri);

const priceOf = (product) => {
  const sale = Number(product.discountPrice);
  if (Number.isFinite(sale) && sale >= 0) return sale;
  const regular = Number(product.price);
  return Number.isFinite(regular) && regular >= 0 ? regular : 25;
};

const seed = async () => {
  const uri = process.env.MONGO_URI?.trim() || '';
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Warehouse demo orders may only be seeded in NODE_ENV=development.');
  }
  if (!isLocalMongo(uri)) {
    throw new Error('Warehouse demo orders may only be seeded into localhost MongoDB.');
  }

  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10_000 });

  const previousStudents = await Student.find({
    admissionNumber: { $regex: `^${DEMO_ADMISSION_PREFIX}` },
  }).select('_id').lean();
  const previousStudentIds = previousStudents.map((student) => student._id);
  if (previousStudentIds.length) {
    await FulfillmentOrder.deleteMany({ studentId: { $in: previousStudentIds } });
    await Transaction.deleteMany({ studentId: { $in: previousStudentIds } });
    await Student.deleteMany({ _id: { $in: previousStudentIds } });
  }

  /* Room codes stay shaped <BLOCK>-<n>: the warehouse board derives the block
     it groups by from the part before the dash, so a code without one collapses
     every room into a single unnamed block. */
  const rooms = [];
  for (const block of BLOCKS) {
    for (let number = 1; number <= ROOMS_PER_BLOCK; number += 1) {
      const code = `${block}-${number}`;
      const room = await Room.findOneAndUpdate(
        { code },
        { $set: { name: `Block ${block} Room ${number}`, active: true } },
        { upsert: true, new: true, runValidators: true }
      );
      rooms.push(room);
    }
  }

  const catalogue = await Product.find({ active: { $ne: false } })
    .select('_id name price discountPrice')
    .sort({ name: 1 })
    .lean();
  const products = catalogue.length ? catalogue : FALLBACK_PRODUCTS;

  const specifications = [];
  for (const [roomIndex, room] of rooms.entries()) {
    for (const status of STATUSES) {
      for (let copy = 0; copy < BASE_ORDERS_PER_STATUS; copy += 1) {
        specifications.push({ room, roomIndex, status, copy });
      }
    }
  }
  for (let extra = 0; extra < EXTRA_NEW_ORDERS; extra += 1) {
    specifications.push({
      room: rooms[extra],
      roomIndex: extra,
      status: 'PENDING',
      copy: BASE_ORDERS_PER_STATUS,
    });
  }

  const students = await Student.insertMany(specifications.map((spec, index) => ({
    name: `Warehouse Demo Student ${String(index + 1).padStart(3, '0')}`,
    fatherName: `Demo Parent ${String(index + 1).padStart(3, '0')}`,
    roomNumber: spec.room.code,
    roomId: spec.room._id,
    className: `${9 + (index % 4)}`,
    parentPhoneNumber: String(8100000000 + index),
    admissionNumber: `${DEMO_ADMISSION_PREFIX}${String(index + 1).padStart(3, '0')}`,
    active: true,
    pocketMoney: 1000,
  })));

  const now = Date.now();
  const transactionRows = specifications.map((spec, index) => {
    const typeCount = 1 + ((index + spec.roomIndex) % 4);
    const items = Array.from({ length: typeCount }, (_, itemIndex) => {
      const product = products[(index * 3 + itemIndex) % products.length];
      const quantity = 1 + ((index + itemIndex) % 3);
      return {
        productId: product._id,
        name: product.name,
        quantity,
        price: priceOf(product),
      };
    });
    const totalAmount = items.reduce((sum, item) => sum + item.quantity * item.price, 0);
    return {
      studentId: students[index]._id,
      items,
      totalAmount,
      previousBalance: 1000,
      remainingBalance: 1000 - totalAmount,
      sourceType: 'DIRECT_CHECKOUT',
      createdAt: new Date(now - (index % 60) * 3_600_000),
    };
  });
  const transactions = await Transaction.insertMany(transactionRows);

  const orders = specifications.map((spec, index) => {
    const orderedAt = new Date(now - (8 + (index % 54)) * 3_600_000);
    const deliverBy = new Date(orderedAt.getTime() + 48 * 3_600_000);
    const packedAt = spec.status === 'PENDING'
      ? undefined
      : new Date(orderedAt.getTime() + 3 * 3_600_000);
    const dispatchedAt = spec.status === 'OUT_FOR_DELIVERY'
      ? new Date(orderedAt.getTime() + 6 * 3_600_000)
      : undefined;

    return {
      transactionId: transactions[index]._id,
      studentId: students[index]._id,
      studentSnapshot: {
        name: students[index].name,
        admissionNumber: students[index].admissionNumber,
        roomNumber: spec.room.code,
        roomId: spec.room._id,
      },
      items: transactionRows[index].items,
      totalAmount: transactionRows[index].totalAmount,
      status: spec.status,
      businessWeekStart: new Date(orderedAt.getTime() - orderedAt.getDay() * 86_400_000),
      orderedAt,
      deliverBy,
      ...(packedAt ? { packedAt } : {}),
      ...(dispatchedAt ? { dispatchedAt } : {}),
      transitions: [],
    };
  });
  await FulfillmentOrder.insertMany(orders);

  const counts = Object.fromEntries(STATUSES.map((status) => [
    status,
    orders.filter((order) => order.status === status).length,
  ]));
  console.log(
    `Warehouse demo ready: ${orders.length} orders, ${rooms.length} rooms, ${BLOCKS.length} blocks.`
  );
  console.log(`New ${counts.PENDING} · Packed ${counts.PACKED} · Out for delivery ${counts.OUT_FOR_DELIVERY}`);
};

try {
  await seed();
} finally {
  await mongoose.disconnect();
}
