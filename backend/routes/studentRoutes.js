import express from 'express';
import {
  addStudent,
  getStudents,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  searchStudents,
  getStudentCount,
  getActiveStudentCount,
  topUpWallet
} from "../controllers/studentController.js";

import { protectAdmin, protectStaff } from '../middleware/authMiddleware.js';
import { searchLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

/* Search is the till's route: it returns the few fields needed to ring a
   student up, and the counter cannot work without it. Every other route here
   reads or writes the student roll itself, and stays with the back office —
   which is why the gate is named per route rather than applied to the router.
   A route added below without one is a route nobody can reach. */

router.get('/search', protectStaff, searchLimiter, searchStudents);

router.route('/')
  .get(protectAdmin, getStudents)
  .post(protectAdmin, addStudent);

router.get('/count', protectAdmin, getStudentCount);
router.get('/active-count', protectAdmin, getActiveStudentCount);

router.route('/:id')
  .put(protectAdmin, updateStudent)
  .delete(protectAdmin, deleteStudent);

router.post('/bulk', protectAdmin, bulkImportStudents);

router.put('/:id/topup', protectAdmin, topUpWallet);

export default router;
