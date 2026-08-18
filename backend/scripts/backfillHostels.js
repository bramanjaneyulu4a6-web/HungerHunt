// One-off migration for the caretaker role.
//
// Preview first (no writes): npm run backfill:hostels
// Apply after reviewing the printed values: npm run backfill:hostels -- --apply
import 'dotenv/config';
import mongoose from 'mongoose';

import Hostel, { normalizeHostelCode } from '../models/Hostel.js';
import Student from '../models/Student.js';
import FulfillmentOrder from '../models/FulfillmentOrder.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGO_URI);

try {
  const rawValues = await Student.distinct('hostelNumber');
  const rows = rawValues
    .map((raw) => ({ raw: String(raw ?? ''), code: normalizeHostelCode(raw) }))
    .sort((a, b) => a.code.localeCompare(b.code));

  console.log('Distinct student hostel values (review before applying):');
  for (const row of rows) console.log(`  ${JSON.stringify(row.raw)} -> ${JSON.stringify(row.code)}`);

  const blank = rows.filter((row) => !row.code);
  if (blank.length) throw new Error('Blank hostel values must be corrected before this migration can run.');

  if (!apply) {
    console.log('\nPreview only. Re-run with --apply after correcting any aliases or typos.');
    process.exitCode = 2;
  } else {
    const codes = [...new Set(rows.map((row) => row.code))];
    await Hostel.bulkWrite(codes.map((code) => ({
      updateOne: {
        filter: { code },
        update: { $setOnInsert: { code, name: '', active: true } },
        upsert: true,
      },
    })));

    const hostels = await Hostel.find({ code: { $in: codes } }).lean();
    const byCode = new Map(hostels.map((hostel) => [hostel.code, hostel]));
    const students = await Student.find().select('_id hostelNumber').lean();
    await Student.bulkWrite(students.map((student) => {
      const hostel = byCode.get(normalizeHostelCode(student.hostelNumber));
      return {
        updateOne: {
          filter: { _id: student._id },
          update: { $set: { hostelId: hostel._id, hostelNumber: hostel.code } },
        },
      };
    }));

    const studentHostels = new Map(students.map((student) => {
      const hostel = byCode.get(normalizeHostelCode(student.hostelNumber));
      return [String(student._id), hostel._id];
    }));
    const orders = await FulfillmentOrder.find({ 'studentSnapshot.hostelId': { $exists: false } })
      .select('_id studentId')
      .lean();
    const unresolved = orders.filter((order) => !studentHostels.has(String(order.studentId)));
    if (unresolved.length) {
      throw new Error(`${unresolved.length} fulfillment order(s) reference a missing student; no orders were updated.`);
    }
    if (orders.length) {
      await FulfillmentOrder.bulkWrite(orders.map((order) => ({
        updateOne: {
          filter: { _id: order._id },
          update: { $set: { 'studentSnapshot.hostelId': studentHostels.get(String(order.studentId)) } },
        },
      })));
    }

    const remainingStudents = await Student.countDocuments({ hostelId: { $exists: false } });
    const remainingOrders = await FulfillmentOrder.countDocuments({ 'studentSnapshot.hostelId': { $exists: false } });
    if (remainingStudents || remainingOrders) {
      throw new Error(`Backfill incomplete: ${remainingStudents} students and ${remainingOrders} orders remain unresolved.`);
    }

    console.log(`Backfill complete: ${codes.length} hostels, ${students.length} students, ${orders.length} orders.`);
  }
} finally {
  await mongoose.disconnect();
}
