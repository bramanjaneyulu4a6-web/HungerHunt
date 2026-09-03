import mongoose from 'mongoose';

import Admin, { FULL_ADMIN } from '../models/Admin.js';
import Hostel from '../models/Hostel.js';
import Parent from '../models/Parent.js';
import PendingOrder from '../models/PendingOrder.js';
import Student from '../models/Student.js';
import { syncStudentRegistration } from '../utils/studentRegistration.js';
import { emailProblem, phoneProblem } from '../utils/validation.js';

const STAFF_ROLES = ['admin', 'warehouse', 'caretaker'];

const validId = (value) => mongoose.Types.ObjectId.isValid(value);

const parentView = (parent) => ({
  id: String(parent._id),
  fatherName: parent.fatherName,
  phone: parent.phone,
  email: parent.email,
  active: parent.active !== false,
  activationRequired: Boolean(parent.activationRequired),
  activatedAt: parent.activatedAt || null,
  archivedAt: parent.archivedAt || null,
  archivedReason: parent.archivedReason || null,
  students: (parent.studentIds || []).filter(Boolean).map((student) => ({
    id: String(student._id || student),
    name: student.name || '',
    admissionNumber: student.admissionNumber || '',
    hostelNumber: student.hostelNumber || '',
  })),
});

const loadStudents = async (studentIds) => {
  if (!Array.isArray(studentIds) || studentIds.length === 0) {
    const error = new Error('Choose at least one student for this parent.');
    error.status = 400;
    throw error;
  }
  const unique = [...new Set(studentIds.map(String))];
  if (unique.some((id) => !validId(id))) {
    const error = new Error('One or more selected students are invalid.');
    error.status = 400;
    throw error;
  }
  const students = await Student.find({ _id: { $in: unique }, active: { $ne: false } });
  if (students.length !== unique.length) {
    const error = new Error('One or more selected students are missing or archived.');
    error.status = 400;
    throw error;
  }
  return students;
};

const assertStudentsAvailable = async (studentIds, exceptParentId = null) => {
  const conflict = await Parent.findOne({
    ...(exceptParentId ? { _id: { $ne: exceptParentId } } : {}),
    active: { $ne: false },
    studentIds: { $in: studentIds },
  }).populate('studentIds', 'name');
  if (!conflict) return;

  const names = (conflict.studentIds || [])
    .filter((student) => studentIds.some((id) => String(id) === String(student._id)))
    .map((student) => student.name)
    .join(', ');
  const error = new Error(`${names || 'A selected student'} is already linked to another active parent.`);
  error.status = 409;
  throw error;
};

export const listParents = async (req, res) => {
  const parents = await Parent.find().sort({ active: -1, fatherName: 1 })
    .populate('studentIds', 'name admissionNumber hostelNumber').lean();
  res.json(parents.map(parentView));
};

export const createParent = async (req, res) => {
  try {
    const fatherName = String(req.body?.fatherName ?? '').trim();
    const phone = String(req.body?.phone ?? '').trim();
    const email = String(req.body?.email ?? '').trim().toLowerCase();
    const problem = (!fatherName ? 'Parent name is required.' : null) || phoneProblem(phone) || emailProblem(email);
    if (problem) return res.status(400).json({ message: problem });

    const students = await loadStudents(req.body?.studentIds);
    await assertStudentsAvailable(students.map((student) => student._id));
    if (await Parent.exists({ $or: [{ phone }, { email }] })) {
      return res.status(409).json({ message: 'A parent account already uses that phone number or email.' });
    }

    const parent = await Parent.create({
      fatherName,
      phone,
      email,
      studentIds: students.map((student) => student._id),
      active: true,
      activationRequired: true,
    });
    await Student.updateMany(
      { _id: { $in: parent.studentIds } },
      { $set: { isParentRegistered: true, parentPhoneNumber: phone, fatherName } }
    );
    res.status(201).json({ parent: parentView({ ...parent.toObject(), studentIds: students }) });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const updateParent = async (req, res) => {
  try {
    if (!validId(req.params.id)) return res.status(404).json({ message: 'Parent not found.' });
    const parent = await Parent.findById(req.params.id);
    if (!parent) return res.status(404).json({ message: 'Parent not found.' });

    const fatherName = String(req.body?.fatherName ?? parent.fatherName).trim();
    const phone = String(req.body?.phone ?? parent.phone).trim();
    const email = String(req.body?.email ?? parent.email).trim().toLowerCase();
    const problem = (!fatherName ? 'Parent name is required.' : null) || phoneProblem(phone) || emailProblem(email);
    if (problem) return res.status(400).json({ message: problem });

    const students = req.body?.studentIds === undefined
      ? await Student.find({ _id: { $in: parent.studentIds }, active: { $ne: false } })
      : await loadStudents(req.body.studentIds);
    await assertStudentsAvailable(students.map((student) => student._id), parent._id);
    if (await Parent.exists({ _id: { $ne: parent._id }, $or: [{ phone }, { email }] })) {
      return res.status(409).json({ message: 'A parent account already uses that phone number or email.' });
    }

    const previousIds = parent.studentIds.map(String);
    parent.fatherName = fatherName;
    parent.phone = phone;
    parent.email = email;
    parent.studentIds = students.map((student) => student._id);
    if (parent.activationRequired) {
      parent.activationCodeHash = undefined;
      parent.activationCodeExpire = undefined;
    }
    await parent.save();
    await Student.updateMany(
      { _id: { $in: parent.studentIds } },
      { $set: { isParentRegistered: parent.active !== false, parentPhoneNumber: phone, fatherName } }
    );
    await syncStudentRegistration([...previousIds, ...parent.studentIds.map(String)]);
    res.json({ parent: parentView({ ...parent.toObject(), studentIds: students }) });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
};

export const archiveParent = async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: 'Parent not found.' });
  const parent = await Parent.findById(req.params.id);
  if (!parent) return res.status(404).json({ message: 'Parent not found.' });
  if (await PendingOrder.exists({ parentId: parent._id, status: { $in: ['PENDING', 'PROCESSING'] } })) {
    return res.status(409).json({ message: 'Resolve this parent’s pending approval requests before archiving the account.' });
  }
  parent.active = false;
  parent.archivedAt = new Date();
  parent.archivedBy = req.staff.id;
  parent.archivedReason = 'admin';
  parent.pushTokens = [];
  parent.fcmToken = null;
  parent.resetPasswordToken = undefined;
  parent.resetPasswordExpire = undefined;
  parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;
  await parent.save();
  await syncStudentRegistration(parent.studentIds.map(String));
  res.json({ message: 'Parent account archived.', parent: parentView(parent) });
};

export const requireParentPasswordSetup = async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: 'Parent not found.' });
  const parent = await Parent.findById(req.params.id);
  if (!parent) return res.status(404).json({ message: 'Parent not found.' });
  parent.active = true;
  parent.archivedAt = undefined;
  parent.archivedBy = undefined;
  parent.archivedReason = undefined;
  parent.activationRequired = true;
  parent.activationCodeHash = undefined;
  parent.activationCodeExpire = undefined;
  parent.pushTokens = [];
  parent.fcmToken = null;
  parent.resetPasswordToken = undefined;
  parent.resetPasswordExpire = undefined;
  parent.tokenVersion = (parent.tokenVersion ?? 0) + 1;
  await parent.save();
  await syncStudentRegistration(parent.studentIds.map(String));
  res.json({
    message: 'First-time password setup required. Existing sessions have been revoked.',
    parent: parentView(parent),
  });
};

export const listStaff = async (req, res) => {
  const staff = await Admin.find().sort({ active: -1, name: 1 }).populate('hostelId', 'code name').lean();
  res.json(staff.map((account) => ({
    id: String(account._id),
    name: account.name,
    phone: account.phone,
    email: account.email,
    role: account.role || 'admin',
    active: account.active !== false,
    hostel: account.hostelId
      ? { id: String(account.hostelId._id), code: account.hostelId.code, name: account.hostelId.name || '' }
      : null,
    createdAt: account.createdAt,
  })));
};

export const updateStaff = async (req, res) => {
  if (!validId(req.params.id)) return res.status(404).json({ message: 'Staff account not found.' });
  const account = await Admin.findById(req.params.id);
  if (!account) return res.status(404).json({ message: 'Staff account not found.' });
  const update = {};
  for (const field of ['name', 'phone', 'email']) {
    if (req.body?.[field] !== undefined) update[field] = String(req.body[field]).trim();
  }
  if (update.email) update.email = update.email.toLowerCase();
  const role = req.body?.role ?? account.role ?? 'admin';
  if (!STAFF_ROLES.includes(role)) return res.status(400).json({ message: 'Unknown staff role.' });
  if (String(account._id) === String(req.staff.id) && role !== (account.role || 'admin')) {
    return res.status(409).json({ message: 'You cannot change the role of the account you are currently using.' });
  }
  if ((account.role || 'admin') === 'admin' && role !== 'admin') {
    const remaining = await Admin.countDocuments({ ...FULL_ADMIN, active: { $ne: false }, _id: { $ne: account._id } });
    if (remaining === 0) return res.status(409).json({ message: 'At least one active admin account is required.' });
  }
  update.role = role;
  if (role === 'caretaker') {
    const hostel = req.body?.hostelId ? await Hostel.findOne({ _id: req.body.hostelId, active: true }) : null;
    if (!hostel) return res.status(400).json({ message: 'Choose an active hostel for the caretaker.' });
    update.hostelId = hostel._id;
  } else {
    update.hostelId = null;
  }
  if (req.body?.active !== undefined) {
    if (String(account._id) === String(req.staff.id) && req.body.active === false) {
      return res.status(409).json({ message: 'You cannot deactivate the account you are currently using.' });
    }
    if ((account.role || 'admin') === 'admin' && req.body.active === false) {
      const remaining = await Admin.countDocuments({ ...FULL_ADMIN, active: { $ne: false }, _id: { $ne: account._id } });
      if (remaining === 0) return res.status(409).json({ message: 'At least one active admin account is required.' });
    }
    update.active = Boolean(req.body.active);
  }
  try {
    Object.assign(account, update);
    await account.save();
    res.json({ message: 'Staff account updated.', staff: account });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({
      message: error.code === 11000 ? 'That email is already in use.' : error.message,
    });
  }
};

export const archiveStaff = (req, res) => {
  req.body = { ...req.body, active: false };
  return updateStaff(req, res);
};
