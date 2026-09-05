// One-off migration for the caretaker role.
//
// Preview first (no writes): npm run backfill:rooms
// Apply after reviewing the printed values: npm run backfill:rooms -- --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import Room, { normalizeRoomCode } from '../models/Room.js';
import Student from '../models/Student.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGO_URI);

try {
  const rawValues = await Student.distinct('roomNumber');
  const rows = rawValues
    .map((raw) => ({ raw: String(raw ?? ''), code: normalizeRoomCode(raw) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  console.log('Distinct student room values (review before applying):');
  for (const row of rows) console.log(`  ${JSON.stringify(row.raw)} -> ${JSON.stringify(row.code)}`);

  const blank = rows.filter((row) => !row.code);
  if (blank.length) throw new Error('Blank room values must be corrected before this migration can run.');

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply after correcting any aliases or typos.');
    process.exitCode = 2;
  } else {
    const codes = [...new Set(rows.map((row) => row.code))];
    await Room.bulkWrite(codes.map((code) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, name: '', active: true } },
        upsert: true,
      },
    })));

    const rooms = await Room.find({ code: { $in: codes } }).lean();
    const byCode = new Map(rooms.map((room) => [room.code, room]));
    const students = await Student.find().select('_id roomNumber').lean();
    await Student.bulkWrite(students.map((student) => {
      const room = byCode.get(normalizeRoomCode(student.roomNumber));
      return {
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { roomId: room._id, roomNumber: room.code } },
        },
      };
    }));

    const studentRooms = new Map(students.map((student) => {
      const room = byCode.get(normalizeRoomCode(student.roomNumber));
      return [String(student._id), room._id];
    }));
    const orders = await FulfillmentOrder.find({ 'studentSnapshot.roomId': { $exists: false } })
      .select('_id studentId')
      .lean();
    const unresolved = orders.filter((order) => !studentRooms.has(String(order.studentId)));
    if (unresolved.length) {
      throw new Error(`${unresolved.length} fulfillment order(s) reference a missing student; no orders were updated.`);
    }
    if (orders.length) {
      await FulfillmentOrder.bulkWrite(orders.map((order) => ({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { 'studentSnapshot.roomId': studentRooms.get(String(order.studentId)) } },
        },
      })));
    }

    const remainingStudents = await Student.countDocuments({ roomId: { $exists: false } });
    const remainingOrders = await FulfillmentOrder.countDocuments({ 'studentSnapshot.roomId': { $exists: false } });
    if (remainingStudents || remainingOrders) {
      throw new Error(`Backfill incomplete: ${remainingStudents} students and ${remainingOrders} orders remain unresolved.`);
    }

    console.log(`Backfill complete: ${codes.length} rooms, ${students.length} students, ${orders.length} orders.`);
  }
} finally {
  await mongoose.disconnect();
}
