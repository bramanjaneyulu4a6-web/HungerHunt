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

import { protectAdmin } from '../middleware/authMiddleware.js';
import { searchLimiter } from '../middleware/rateLimit.js';

const router = express.Router();

// Every student route requires an admin token — the kiosk authenticates too.
router.use(protectAdmin);

router.route('/')
  .get(getStudents)
  .post(addStudent);

router.get('/search', searchLimiter, searchStudents);

router.get('/count', getStudentCount);
router.get('/active-count', getActiveStudentCount);

router.route('/:id')
  .put(updateStudent)
  .delete(deleteStudent);

router.post('/bulk', bulkImportStudents);

router.put('/:id/topup', topUpWallet);

export default router;
