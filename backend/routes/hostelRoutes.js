import express from 'express';

import Hostel, { normalizeHostelCode } from '../models/Hostel.js';
import Student from '../models/Student.js';
import Admin from '../models/Admin.js';
import { protectAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protectAdmin);

const withCounts = async (hostels) => {
  const ids = hostels.map((hostel) => hostel._id);
  const [studentCounts, caretakerCounts] = await Promise.all([
    Student.aggregate([
      { $match: { hostelId: { $in: ids }, active: { $ne: false } } },
      { $group: { _id: '$hostelId', count: { $sum: 1 } } },
    ]),
    Admin.aggregate([
      { $match: { hostelId: { $in: ids }, role: 'caretaker' } },
      { $group: { _id: '$hostelId', count: { $sum: 1 } } },
    ]),
  ]);
  const students = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  const caretakers = new Map(caretakerCounts.map((row) => [String(row._id), row.count]));
  return hostels.map((hostel) => ({
    ...hostel,
    studentCount: students.get(String(hostel._id)) || 0,
    caretakerCount: caretakers.get(String(hostel._id)) || 0,
  }));
};

router.get('/', async (req, res) => {
  try {
    const filter = req.query.active === '1' ? { active: true } : {};
    const hostels = await Hostel.find(filter).sort({ active: -1, code: 1 }).lean();
    res.json(await withCounts(hostels));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const code = normalizeHostelCode(req.body?.code);
    if (!code) return res.status(400).json({ message: 'Hostel code is required.' });
    const hostel = await Hostel.create({ code, name: req.body?.name, active: true });
    res.status(201).json({ ...hostel.toObject(), studentCount: 0, caretakerCount: 0 });
  } catch (error) {
    res.status(400).json({ message: error.code === 11000 ? 'That hostel code already exists.' : error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const current = await Hostel.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Hostel not found.' });

    const updates = {};
    if (req.body.code !== undefined) {
      updates.code = normalizeHostelCode(req.body.code);
      if (!updates.code) return res.status(400).json({ message: 'Hostel code is required.' });
    }
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.active !== undefined) {
      const active = Boolean(req.body.active);
      if (!active && current.active !== false) {
        const students = await Student.countDocuments({ hostelId: current._id, active: { $ne: false } });
        if (students > 0) {
          return res.status(409).json({ message: 'Move all active students before deactivating this hostel.' });
        }
      }
      updates.active = active;
    }

    const hostel = await Hostel.findByIdAndUpdate(current._id, updates, { new: true, runValidators: true });
    if (updates.code && updates.code !== current.code) {
      await Student.updateMany({ hostelId: current._id }, { $set: { hostelNumber: hostel.code } });
    }
    const [result] = await withCounts([hostel.toObject()]);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.code === 11000 ? 'That hostel code already exists.' : error.message });
  }
});

export default router;
