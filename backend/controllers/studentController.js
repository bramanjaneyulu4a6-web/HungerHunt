import Student from '../models/Student.js';
import Parent from "../models/Parent.js";
import { sendNotification } from "../utils/sendNotification.js";

// The fields describing who a student is, and the only ones any admin route
// will write. The rest of the document belongs to a flow with rules of its own:
// pocketMoney to topUpWallet, which records the movement in rechargeHistory;
// purchasePassword and walletControl to the parent. Handing a request body
// straight to the driver let these routes quietly set any of them.
const WRITABLE_FIELDS = ['name', 'fatherName', 'hostelNumber', 'grade', 'parentPhoneNumber'];

const pickWritable = (body) => {
  const source = body ?? {};

  return Object.fromEntries(
    WRITABLE_FIELDS
      .filter((field) => source[field] !== undefined)
      .map((field) => [field, source[field]])
  );
};

export const addStudent = async (req, res) => {
  try {
    const student = await Student.create(pickWritable(req.body));
    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 0, 0), 500);

    // Paginated only when asked for, so existing callers keep the full list.
    if (page > 0 && limit > 0) {
      const [students, total] = await Promise.all([
        Student.find().sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
        Student.countDocuments(),
      ]);

      return res.json({ students, total, page, pages: Math.ceil(total / limit) });
    }

    res.json(await Student.find());
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const student = await Student.findByIdAndUpdate(req.params.id, pickWritable(req.body), { new: true });
    res.json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    await Student.findByIdAndDelete(req.params.id);
    res.json({ message: 'Student removed successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Bulk Import using JSON data from Frontend (Parsed from XLSX on client-side)
export const bulkImportStudents = async (req, res) => {
  try {
    const { students } = req.body; // Array of student objects
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Invalid or empty dataset received.' });
    }

    // Sheet column headings arrive as keys verbatim, so a column called
    // pocketMoney or purchasePassword would land on the new record as-is.
    const rows = students.map(pickWritable);

    // Dropping a column the uploader meant to import should not be silent —
    // otherwise the sheet looks like it applied and only the balances disagree.
    const ignoredColumns = [
      ...new Set(students.flatMap((row) => Object.keys(row ?? {}))),
    ].filter((column) => !WRITABLE_FIELDS.includes(column));

    await Student.insertMany(rows, { ordered: false });

    res.status(201).json({
      message: 'Bulk entry successful!',
      imported: rows.length,
      ...(ignoredColumns.length ? { ignoredColumns } : {}),
    });
  } catch (error) {
    res.status(400).json({ message: 'Some records might be duplicate entries.', error: error.message });
  }
};


const SEARCH_FIELDS = "_id name fatherName hostelNumber grade parentPhoneNumber pocketMoney walletControl";

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const searchStudents = async (req, res) => {
  try {
    const q = (req.query.q || "").trim();

    // An empty query would otherwise dump the entire student roster.
    if (q.length < 2) {
      return res.status(400).json({ message: "Search term must be at least 2 characters" });
    }

    const pattern = new RegExp(escapeRegex(q), "i");

    const students = await Student.find({
      $or: [
        { name: pattern },
        { hostelNumber: pattern },
        { parentPhoneNumber: pattern }
      ]
    })
      .select(SEARCH_FIELDS)
      .limit(25);

    res.json(students);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments();
    res.json({ totalStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getActiveStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments({ pocketMoney: { $gt: 0 } });
    res.json({ activeStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const topUpWallet = async (req, res) => {
  try {
    const { amount } = req.body;
    const studentId = req.params.id;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "Invalid amount" });
    }

    const student = await Student.findById(studentId);

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    const previousBalance = student.pocketMoney || 0;
    const newBalance = previousBalance + Number(amount);

    student.pocketMoney = newBalance;

    if (!student.rechargeHistory) {
      student.rechargeHistory = [];
    }

    student.rechargeHistory.push({
      amount: Number(amount),
      previousBalance,
      newBalance,
      date: new Date(),
    });

    await student.save();

    const parent = await Parent.findOne({
      studentIds: studentId,
    });

    if (parent?.fcmToken) {
      await sendNotification(
        parent.fcmToken,
        "💰 Wallet Recharge",
        `₹${amount} added. New balance ₹${newBalance}`,
        {
          studentId: studentId.toString(),
          type: "RECHARGE",
        }
      );
    }

    return res.json({
      message: "Wallet recharged successfully",
      newBalance,
      rechargeHistory: student.rechargeHistory,
    });
  } catch (error) {
    console.error("❌ topUpWallet Error:", error);
    return res.status(500).json({ error: error.message });
  }
};
