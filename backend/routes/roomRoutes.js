import express from 'express';

import Room, { normalizeRoomCode } from '../models/Room.js';
import Student from '../models/Student.js';
import Admin from '../models/Admin.js';
import { protectAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();
router.use(protectAdmin);

const withCounts = async (rooms) => {
  const ids = rooms.map((room) => room._id);
  const [studentCounts, caretakerCounts] = await Promise.all([
    Student.aggregate([
      { $match: { roomId: { $in: ids }, active: { $ne: false } } },
      { $group: { _id: '$roomId', count: { $sum: 1 } } },
    ]),
    Admin.aggregate([
      { $match: { roomIds: { $in: ids }, role: 'caretaker', active: { $ne: false } } },
      { $unwind: '$roomIds' },
      { $match: { roomIds: { $in: ids } } },
      { $group: { _id: '$roomIds', count: { $sum: 1 } } },
    ]),
  ]);
  const students = new Map(studentCounts.map((row) => [String(row._id), row.count]));
  const caretakers = new Map(caretakerCounts.map((row) => [String(row._id), row.count]));
  return rooms.map((room) => ({
    ...room,
    studentCount: students.get(String(room._id)) || 0,
    caretakerCount: caretakers.get(String(room._id)) || 0,
  }));
};

router.get('/', async (req, res) => {
  try {
    const filter = req.query.active === '1' ? { active: true } : {};
    const rooms = await Room.find(filter).sort({ active: -1, code: 1 }).lean();
    res.json(await withCounts(rooms));
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const code = normalizeRoomCode(req.body?.code);
    if (!code) return res.status(400).json({ message: 'Room code is required.' });
    const room = await Room.create({ code, name: req.body?.name, active: true });
    res.status(201).json({ ...room.toObject(), studentCount: 0, caretakerCount: 0 });
  } catch (error) {
    res.status(400).json({ message: error.code === 11000 ? 'That room code already exists.' : error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const current = await Room.findById(req.params.id);
    if (!current) return res.status(404).json({ message: 'Room not found.' });

    const updates = {};
    if (req.body.code !== undefined) {
      updates.code = normalizeRoomCode(req.body.code);
      if (!updates.code) return res.status(400).json({ message: 'Room code is required.' });
    }
    if (req.body.name !== undefined) updates.name = String(req.body.name).trim();
    if (req.body.active !== undefined) {
      const active = Boolean(req.body.active);
      if (!active && current.active !== false) {
        const students = await Student.countDocuments({ roomId: current._id, active: { $ne: false } });
        if (students > 0) {
          return res.status(409).json({ message: 'Move all active students before deactivating this room.' });
        }
        /* Delivery units are built from active rooms alone, so deactivating a room a
           caretaker still holds strands its open orders on a standalone tile whose
           grouped report can no longer be filed. */
        const caretakers = await Admin.countDocuments({
          role: 'caretaker', active: { $ne: false }, roomIds: current._id,
        });
        if (caretakers > 0) {
          return res.status(409).json({ message: "Reassign this room's caretakers before deactivating it." });
        }
      }
      updates.active = active;
    }

    const room = await Room.findByIdAndUpdate(current._id, updates, { new: true, runValidators: true });
    if (updates.code && updates.code !== current.code) {
      await Student.updateMany({ roomId: current._id }, { $set: { roomNumber: room.code } });
    }
    const [result] = await withCounts([room.toObject()]);
    res.json(result);
  } catch (error) {
    res.status(400).json({ message: error.code === 11000 ? 'That room code already exists.' : error.message });
  }
});

export default router;
