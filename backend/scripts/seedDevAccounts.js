import 'dotenv/config';

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

import Admin from '../models/Admin.js';
import Parent from '../models/Parent.js';
import Student from '../models/Student.js';

export const DEV_ACCOUNTS = Object.freeze({
  admin: {
    email: 'admin.dev@hungerhunt.local',
    password: 'DevAdmin123!',
  },
  warehouse: {
    email: 'warehouse.dev@hungerhunt.local',
    password: 'DevWarehouse123!',
  },
  parent: {
    fatherName: 'Dev Parent',
    phone: '9000000001',
    email: 'parent.dev@hungerhunt.local',
    password: 'DevParent123!',
  },
  student: {
    name: 'Dev Student',
    admissionNumber: 'HH-DEV-001',
    purchaseCode: '1234',
  },
});

const ensureStaffAccount = async (role, credentials) => {
  const account = await Admin.findOne({ email: credentials.email }) ?? new Admin();
  account.email = credentials.email;
  account.password = credentials.password;
  account.role = role;
  await account.save();
  return account;
};

const seed = async () => {
  if (process.env.NODE_ENV !== 'development') {
    throw new Error('Dev accounts may only be seeded with NODE_ENV=development.');
  }

  if (!process.env.MONGO_URI?.trim()) {
    throw new Error('MONGO_URI is required. Set it in backend/.env and run this command again.');
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10_000 });

  await ensureStaffAccount('admin', DEV_ACCOUNTS.admin);
  await ensureStaffAccount('warehouse', DEV_ACCOUNTS.warehouse);

  const { student: studentDetails, parent: parentDetails } = DEV_ACCOUNTS;
  const student = await Student.findOne({ admissionNumber: studentDetails.admissionNumber })
    ?? new Student();

  Object.assign(student, {
    name: studentDetails.name,
    fatherName: parentDetails.fatherName,
    hostelNumber: 'DEV-HOSTEL-01',
    grade: 'DEV',
    parentPhoneNumber: parentDetails.phone,
    admissionNumber: studentDetails.admissionNumber,
    active: true,
    pocketMoney: 1000,
    isParentRegistered: true,
    purchasePassword: await bcrypt.hash(studentDetails.purchaseCode, 10),
    purchaseCodeIsPin: true,
  });
  await student.save();

  const parent = await Parent.findOne({ phone: parentDetails.phone }) ?? new Parent();
  Object.assign(parent, {
    fatherName: parentDetails.fatherName,
    phone: parentDetails.phone,
    email: parentDetails.email,
    password: await bcrypt.hash(parentDetails.password, 10),
    studentIds: [student._id],
  });
  await parent.save();

  console.log('Development accounts are ready. Re-running this command updates the same accounts.');
};

try {
  await seed();
} finally {
  await mongoose.disconnect();
}
