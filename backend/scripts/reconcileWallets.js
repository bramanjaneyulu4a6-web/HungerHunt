import 'dotenv/config';
import mongoose from 'mongoose';

import Student from '../models/Student.js';
import Transaction from '../models/Transaction.js';
import WalletAdjustment from '../models/WalletAdjustment.js';
import WalletReversal from '../models/WalletReversal.js';
import { reconcileWallet } from '../utils/walletReconciliation.js';

if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required.');

const includeNames = process.argv.includes('--include-names');
const outputJson = process.argv.includes('--json');
const students = new Map();
const failures = [];
let checkedStudents = 0;
let checkedEvents = 0;

await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });

try {
  for await (const student of Student.find({})
    .select('_id name pocketMoney active')
    .lean()
    .cursor()) {
    students.set(String(student._id), student);
  }

  const eventCursor = Transaction.aggregate([
    {
      $project: {
        studentId: 1,
        kind: { $literal: 'PURCHASE' },
        amount: '$totalAmount',
        previousBalance: 1,
        resultingBalance: '$remainingBalance',
        createdAt: 1,
      },
    },
    {
      $unionWith: {
        coll: WalletAdjustment.collection.name,
        pipeline: [{
          $project: {
            studentId: 1,
            kind: { $literal: 'TOP_UP' },
            amount: 1,
            previousBalance: 1,
            resultingBalance: '$newBalance',
            createdAt: 1,
          },
        }],
      },
    },
    {
      $unionWith: {
        coll: WalletReversal.collection.name,
        pipeline: [{
          $project: {
            studentId: 1,
            kind: { $literal: 'REFUND' },
            amount: 1,
            previousBalance: 1,
            resultingBalance: '$newBalance',
            createdAt: 1,
          },
        }],
      },
    },
    { $sort: { studentId: 1, createdAt: 1, _id: 1 } },
  ]).allowDiskUse(true).cursor({ batchSize: 1_000 });

  let currentStudentId;
  let currentEvents = [];

  const finishStudent = (studentId, events) => {
    if (!studentId) return;
    checkedEvents += events.length;
    const student = students.get(studentId);
    if (!student) {
      failures.push({
        studentId,
        eventCount: events.length,
        issues: [{ code: 'LEDGER_STUDENT_MISSING' }],
      });
      return;
    }

    const result = reconcileWallet(student, events);
    checkedStudents += 1;
    students.delete(studentId);
    if (result.issues.length) {
      failures.push({
        ...result,
        ...(includeNames ? { studentName: student.name } : {}),
      });
    }
  };

  for await (const event of eventCursor) {
    const studentId = String(event.studentId);
    if (currentStudentId && studentId !== currentStudentId) {
      finishStudent(currentStudentId, currentEvents);
      currentEvents = [];
    }
    currentStudentId = studentId;
    currentEvents.push(event);
  }
  finishStudent(currentStudentId, currentEvents);

  for (const [studentId, student] of students) {
    const result = reconcileWallet(student, []);
    checkedStudents += 1;
    if (result.issues.length) {
      failures.push({
        ...result,
        ...(includeNames ? { studentName: student.name } : {}),
      });
    }
  }

  const report = {
    status: failures.length ? 'mismatch' : 'reconciled',
    checkedStudents,
    checkedEvents,
    failedStudents: failures.length,
    failures,
  };

  console.log(outputJson ? JSON.stringify(report) : JSON.stringify(report, null, 2));
  if (failures.length) process.exitCode = 2;
} finally {
  await mongoose.disconnect();
}
