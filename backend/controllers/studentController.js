import Student from '../models/Student.js';
import Parent from "../models/Parent.js";
import WalletAdjustment from "../models/WalletAdjustment.js";
import PendingOrder from "../models/PendingOrder.js";
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import { sendToParent } from "../utils/sendNotification.js";
import { signStudentToken, STUDENT_SESSION_SECONDS } from "../utils/tokens.js";
import { sessionOptions, withMongoTransaction } from "../utils/mongoTransaction.js";
import {
  linkQuietly,
  findStudentsByIdentity,
  unlinkStudent
} from "../utils/studentLinks.js";

// The fields describing who a student is, and the only ones any admin route
// will write. The rest of the document belongs to a flow with rules of its own:
// pocketMoney to topUpWallet, which records the movement in rechargeHistory;
// purchasePassword and walletControl to the parent. Handing a request body
// straight to the driver let these routes quietly set any of them.
const WRITABLE_FIELDS = ['name', 'fatherName', 'hostelNumber', 'grade', 'parentPhoneNumber', 'admissionNumber'];

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

    // A child enrolled after their parent registered used to be linked to
    // nobody, and so was invisible in the parent app forever.
    await linkQuietly([student]);

    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const filter = req.query.all === '1' ? {} : { active: { $ne: false } };
    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 0, 0), 500);

    // Paginated only when asked for, so existing callers keep the full list.
    if (page > 0 && limit > 0) {
      const [students, total] = await Promise.all([
        Student.find(filter).sort({ name: 1 }).skip((page - 1) * limit).limit(limit),
        Student.countDocuments(filter),
      ]);

      return res.json({ students, total, page, pages: Math.ceil(total / limit) });
    }

    const query = Student.find(filter);
    res.json(await (typeof query.limit === 'function' ? query.limit(500) : query));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, active: { $ne: false } },
      pickWritable(req.body),
      { new: true, runValidators: true }
    );

    if (!student) return res.status(404).json({ message: 'Active student not found' });

    // Correcting a phone number or surname can move a child to a different
    // parent — or to none.
    if (student) await linkQuietly([student]);

    res.json(student);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

export const deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id).select('pocketMoney active');

    if (!student || student.active === false) {
      return res.status(404).json({ message: 'Active student not found' });
    }

    if (student.pocketMoney > 0) {
      return res.status(409).json({
        message: 'The wallet balance must be zero before this student can be archived.',
      });
    }

    if (
      await PendingOrder.exists({
        studentId: student._id,
        status: { $in: ['PENDING', 'PROCESSING'] },
      })
    ) {
      return res.status(409).json({
        message: 'Resolve the student’s pending approval request before archiving.',
      });
    }

    if (await FulfillmentOrder.exists({
      studentId: student._id,
      status: { $in: ['PENDING', 'PACKED', 'OUT_FOR_DELIVERY'] },
    })) {
      return res.status(409).json({
        message: 'Deliver or cancel the student’s active dorm package before archiving.',
      });
    }

    const archived = await Student.findOneAndUpdate(
      { _id: student._id, active: { $ne: false }, pocketMoney: { $lte: 0 } },
      {
        $set: {
          active: false,
          archivedAt: new Date(),
          archivedBy: req.staff.id,
          isParentRegistered: false,
        },
      },
      { new: true }
    );

    if (!archived) {
      return res.status(409).json({
        message: 'The student changed while being archived. Refresh and try again.',
      });
    }

    await unlinkStudent(req.params.id);

    res.json({ message: 'Student archived successfully' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const restoreStudent = async (req, res) => {
  try {
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, active: false },
      {
        $set: { active: true, archivedAt: null, archivedBy: null },
      },
      { new: true, runValidators: true }
    );

    if (!student) {
      return res.status(404).json({ message: 'Archived student not found' });
    }

    await linkQuietly([student]);
    res.json({ message: 'Student restored successfully', student });
  } catch (error) {
    res.status(500).json({ message: error.message });
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

    // Looked up by identity rather than from the insert result, so rows that
    // landed alongside a rejected duplicate are linked too.
    const linked = await linkQuietly(await findStudentsByIdentity(rows));

    res.status(201).json({
      message: 'Bulk entry successful!',
      imported: rows.length,
      linkedToParents: linked,
      ...(ignoredColumns.length ? { ignoredColumns } : {}),
    });
  } catch (error) {
    res.status(400).json({ message: 'Some records might be duplicate entries.', error: error.message });
  }
};


// purchaseCodeIsPin rides along so the till can shape the code field before
// asking for it — a number pad for a student known to have a four-digit code,
// and something that will accept an older one for a student who may not.
// isParentRegistered rides along too: the admin till cannot bill a student
// whose parent has never registered, because nobody would be there to approve
// the order, and the screen says so rather than letting the request fail.
const SEARCH_FIELDS =
  "_id name fatherName hostelNumber grade parentPhoneNumber pocketMoney walletControl purchaseCodeIsPin admissionNumber isParentRegistered";

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
      active: { $ne: false },
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



/* The kiosk's login, and the one route here that asks for nothing.

   The admission number identifies; the four-digit code, asked for at checkout
   rather than here, authenticates. That split is deliberate and its cost is
   recorded in the spec: anyone who can reach this route can walk the roll and
   read back a name and a balance. So this returns the smallest set the
   ordering screen can work from — nothing that is not already printed on the
   student's own ID card — and the limiter in front of it is doing real work.

   A student whose parent has never set a code is refused here rather than
   after they have filled a basket they cannot pay for. */
export const createKioskSession = async (req, res) => {
  const admissionNumber = String(req.body?.admissionNumber ?? '').trim();

  if (!admissionNumber) {
    return res.status(400).json({ message: 'An admission number is required.' });
  }

  try {
    const student = await Student.findOne({
      admissionNumber,
      active: { $ne: false },
    })
      .select('name admissionNumber pocketMoney requiresParentApproval +purchasePassword');

    if (!student) {
      return res.status(404).json({ message: 'No student found with that admission number.' });
    }

    if (!student.purchasePassword) {
      return res.status(403).json({
        message:
          'No purchase code has been set for this student yet. A parent can set one in the app.',
      });
    }

    res.json({
      token: signStudentToken(student._id.toString(), student.admissionNumber),
      expiresInSeconds: STUDENT_SESSION_SECONDS,
      student: {
        id: student._id.toString(),
        name: student.name,
        admissionNumber: student.admissionNumber,
        pocketMoney: student.pocketMoney,
        requiresParentApproval: Boolean(student.requiresParentApproval),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments({ active: { $ne: false } });
    res.json({ totalStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};



export const getActiveStudentCount = async (req, res) => {
  try {
    const count = await Student.countDocuments({
      active: { $ne: false },
      pocketMoney: { $gt: 0 },
    });
    res.json({ activeStudents: count });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const topUpWallet = async (req, res) => {
  try {
    const amount = Number(req.body.amount);
    const studentId = req.params.id;
    const performedBy = req.staff.id;
    const idempotencyKey = String(
      req.get('Idempotency-Key') || req.body.idempotencyKey || ''
    ).trim();

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      amount > 1_000_000 ||
      Math.round(amount * 100) / 100 !== amount
    ) {
      return res.status(400).json({
        message: "Amount must be positive, at most ₹10,00,000, and have no more than two decimals.",
      });
    }

    if (!idempotencyKey || idempotencyKey.length > 100) {
      return res.status(400).json({
        message: 'A valid Idempotency-Key is required for a wallet top-up.',
      });
    }

    const prior = await WalletAdjustment.findOne({ performedBy, idempotencyKey });

    if (prior) {
      if (String(prior.studentId) !== String(studentId) || prior.amount !== amount) {
        return res.status(409).json({
          message: 'This Idempotency-Key was already used for a different top-up.',
        });
      }

      return res.json({
        message: 'Wallet top-up already applied.',
        newBalance: prior.newBalance,
        adjustment: prior,
        replayed: true,
      });
    }

    const result = await withMongoTransaction(async (session) => {
      const [adjustment] = session
        ? await WalletAdjustment.create(
            [{
              studentId,
              performedBy,
              amount,
              previousBalance: 0,
              newBalance: 0,
              idempotencyKey,
            }],
            { session }
          )
        : [await WalletAdjustment.create({
            studentId,
            performedBy,
            amount,
            previousBalance: 0,
            newBalance: 0,
            idempotencyKey,
          })];

      const student = await Student.findOneAndUpdate(
        { _id: studentId, active: { $ne: false } },
        { $inc: { pocketMoney: amount } },
        { new: true, ...sessionOptions(session) }
      );

      if (!student) {
        const notFound = new Error('Student not found');
        notFound.status = 404;
        throw notFound;
      }

      const newBalance = student.pocketMoney;
      const previousBalance = newBalance - amount;
      const historyEntry = { amount, previousBalance, newBalance, date: new Date() };

      // The MongoDB driver does not support parallel operations inside one
      // transaction, so these intentionally remain sequential.
      await WalletAdjustment.updateOne(
        { _id: adjustment._id },
        { $set: { previousBalance, newBalance } },
        sessionOptions(session)
      );
      await Student.updateOne(
        { _id: studentId },
        {
          $push: {
            rechargeHistory: { $each: [historyEntry], $slice: -500 },
          },
        },
        sessionOptions(session)
      );

      adjustment.previousBalance = previousBalance;
      adjustment.newBalance = newBalance;

      return { student, adjustment, newBalance };
    });

    const { student, adjustment, newBalance } = result;

    const parent = await Parent.findOne({
      studentIds: studentId,
    });

    if (parent) {
      sendToParent(
        parent,
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
      adjustment,
    });
  } catch (error) {
    if (error?.code === 11000) {
      const prior = await WalletAdjustment.findOne({
        performedBy: req.staff.id,
        idempotencyKey: String(
          req.get('Idempotency-Key') || req.body.idempotencyKey || ''
        ).trim(),
      });

      if (prior) {
        if (
          String(prior.studentId) !== String(req.params.id) ||
          prior.amount !== Number(req.body.amount)
        ) {
          return res.status(409).json({
            message: 'This Idempotency-Key was already used for a different top-up.',
          });
        }

        return res.json({
          message: 'Wallet top-up already applied.',
          newBalance: prior.newBalance,
          adjustment: prior,
          replayed: true,
        });
      }
    }

    console.error("❌ topUpWallet Error:", error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};
