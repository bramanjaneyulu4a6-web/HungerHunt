import express from 'express';
import {
  addStudent,
  getStudents,
  updateStudent,
  deleteStudent,
  bulkImportStudents,
  searchStudents,
  publicSearchStudents,
  getStudentCount,
  getActiveStudentCount,
  topUpWallet
} from "../controllers/studentController.js";

import { protectAdmin } from '../middleware/authMiddleware.js';

const router = express.Router();
router.get("/public-search", publicSearchStudents);
// Secure all student routes
router.use(protectAdmin);

// GET all students / POST add student
router.route('/')
  .get(getStudents)
  .post(addStudent);

// SEARCH students
router.get('/search', searchStudents);

// COUNT routes
router.get('/count', getStudentCount);
router.get('/active-count', getActiveStudentCount);

// UPDATE / DELETE student
router.route('/:id')
  .put(updateStudent)
  .delete(deleteStudent);

// BULK IMPORT
router.post('/bulk', bulkImportStudents);


router.put('/:id/topup', topUpWallet);


export default router;