import Student from '../models/Student.js';
import Parent from "../models/Parent.js";
import WalletAdjustment from "../models/WalletAdjustment.js";
import PendingOrder from "../models/PendingOrder.js";
import FulfillmentOrder from '../models/FulfillmentOrder.js';
import Room, { normalizeRoomCode } from '../models/Room.js';
import { sendToParent } from "../utils/sendNotification.js";
import { signStudentToken, STUDENT_SESSION_SECONDS } from "../utils/tokens.js";
import { showroomStudent } from "../utils/showroomCatalogue.js";
import { sessionOptions, withMongoTransaction } from "../utils/mongoTransaction.js";
import { creditWallet, readWallet, walletView } from '../utils/walletAccount.js';
import { mintReceiptNumber } from '../utils/walletReceipts.js';
import { OPEN_STATUSES } from '../src/domain/fulfillment/overdue.js';
import { isTestAccountStudent } from '../utils/testAccount.js';
import { DEMO_SESSION_SECONDS, isDemoStudent } from '../utils/demoAccount.js';
import { ACTIVATED_PARENT, activatedParentRequired, hasActivatedParent } from '../utils/parentActivation.js';
import {
  ADMISSION_NUMBER_MESSAGE,
  isValidAdmissionNumber,
  normalizeAdmissionNumber,
} from '../utils/admissionNumber.js';
import {
  linkQuietly,
  findStudentsByIdentity,
  unlinkStudent
} from "../utils/studentLinks.js";
import bcrypt from "bcryptjs";
import { purchaseCodeProblem } from "../utils/validation.js";
import { normalizeClassName } from '../utils/studentClass.js';

// The fields describing who a student is, and the only ones any admin route
// will write. The rest of the document belongs to a flow with rules of its own:
// pocketMoney to topUpWallet, which records the movement in rechargeHistory;
// purchasePassword and walletControl to the parent. Handing a request body
// straight to the driver let these routes quietly set any of them.
const WRITABLE_FIELDS = ['name', 'fatherName', 'className', 'section', 'parentPhoneNumber', 'admissionNumber'];
const STUDENT_SORT_FIELDS = new Set(['admissionNumber', 'name', 'className', 'roomNumber', 'pocketMoney', 'createdAt']);
const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const pickWritable = (body) => {
  const source = body ?? {};

  return Object.fromEntries(
    WRITABLE_FIELDS
      .filter((field) => source[field] !== undefined)
      .map((field) => [
        field,
        field === 'admissionNumber'
          ? normalizeAdmissionNumber(source[field])
          // Classes are stored as numbers whatever the typist or the
          // spreadsheet calls them. Applied here rather than in each caller so
          // the Add form, the Edit form and the CSV importer cannot disagree —
          // they all write through this one function. See utils/studentClass.js
          // for why the conversion is a table and not a parser.
          : field === 'className'
            ? normalizeClassName(source[field])
            : source[field],
      ])
  );
};

const resolveRoom = async (source) => {
  const roomId = source?.roomId;
  const code = normalizeRoomCode(source?.roomNumber);
  const room = roomId
    ? await Room.findOne({ _id: roomId, active: true }).lean()
    : code
      ? await Room.findOne({ code, active: true }).lean()
      : null;

  if (!room) {
    const value = code || String(roomId || '').trim() || '(blank)';
    const error = new Error(`Unknown or inactive room: ${value}.`);
    error.code = 'UNKNOWN_ROOM';
    throw error;
  }
  return { roomId: room._id, roomNumber: room.code };
};

export const addStudent = async (req, res) => {
  try {
    const student = await Student.create({
      ...pickWritable(req.body),
      ...(await resolveRoom(req.body)),
    });

    // A child enrolled after their parent registered used to be linked to
    // nobody, and so was invisible in the parent app forever.
    await linkQuietly([student]);

    res.status(201).json(student);
  } catch (error) {
    res.status(400).json({ message: error.message, error: error.message });
  }
};

export const getStudents = async (req, res) => {
  try {
    const status = String(req.query.status || '').trim().toLowerCase();
    const filter = req.query.all === '1' || status === 'all'
      ? {}
      : status === 'archived'
        ? { active: false }
        : { active: { $ne: false } };
    const search = String(req.query.q || '').trim();
    if (search) {
      const pattern = new RegExp(escapeRegex(search), 'i');
      filter.$or = [
        { name: pattern },
        { admissionNumber: pattern },
        { fatherName: pattern },
        { roomNumber: pattern },
        { parentPhoneNumber: pattern },
      ];
    }
    if (req.query.roomId) filter.roomId = req.query.roomId;

    /* Class and section are matched exactly, against the values the roster
       actually holds rather than a list written here. Sections especially:
       this roll spells one of them three ways, and anything asserted here
       about their shape would be wrong for some of it. getStudentFilterOptions
       below reports what is really there and the dropdowns are built from that.

       The class is put through the same conversion the write side uses, so a
       caller asking for "VIII" finds class 8 rather than nothing. The stored
       values are all numeric now; this is for links, bookmarks and scripts
       written while they were not. */
    const className = normalizeClassName(req.query.className);
    const section = String(req.query.section || '').trim();

    if (className) filter.className = className;
    if (section) filter.section = section;

    /* Whether the parent has ever signed in, which is the question the office
       is really asking when it asks who is registered.
     *
     * isParentRegistered would have been one cheap field on this document, and
     * it is useless for the purpose: the roster import sets it on every
     * student it creates a parent for, so it is true for all but one of them.
     * Activation lives on the parent, so answering honestly costs a lookup.
     *
     * activationRequired is the flag the parent app clears on first sign-in.
     * Absent reads as activated, because accounts created before that field
     * existed were password accounts that were already in use. */
    const parentActivated = String(req.query.parentActivated || '').trim().toLowerCase();

    if (parentActivated === 'yes' || parentActivated === 'no') {
      /* The activated side is the one collected, and the answer is the set or
         its complement. Two reasons, and the second is the load-bearing one.
       *
         It is the smaller set by a long way — fifty-odd activated against
         several hundred waiting — so the $in list stays short.

         And a student with no parent row at all has nobody who could have
         signed in. Collecting the waiting side would leave them outside it,
         and $nin would then report them as activated, which is the opposite of
         the truth. Complementing the activated side puts them where they
         belong without naming them as a special case. */
      const activated = await Parent.distinct('studentIds', ACTIVATED_PARENT);

      filter._id = parentActivated === 'yes' ? { $in: activated } : { $nin: activated };
    }

    const page = Math.max(parseInt(req.query.page) || 0, 0);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 0, 0), 500);
    const sortField = STUDENT_SORT_FIELDS.has(req.query.sort) ? req.query.sort : 'name';
    const sortDirection = req.query.direction === 'desc' ? -1 : 1;
    const sort = { [sortField]: sortDirection, _id: 1 };

    // Paginated only when asked for, so existing callers keep the full list.
    if (page > 0 && limit > 0) {
      const [students, total] = await Promise.all([
        Student.find(filter).sort(sort).skip((page - 1) * limit).limit(limit),
        Student.countDocuments(filter),
      ]);

      return res.json({ students, total, page, pages: Math.ceil(total / limit) });
    }

    const query = Student.find(filter);
    if (typeof query.sort !== 'function' || typeof query.limit !== 'function') return res.json(await query);
    res.json(await query.sort(sort).limit(500));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

/* The class and section values the roster actually holds, for the dropdowns
 * that filter by them.
 *
 * Reported rather than declared, because the roll disagrees with itself: it
 * carries Roman and Arabic numerals for the same years, three spellings of one
 * section, and students with no class recorded at all. A hardcoded list would
 * be wrong for whichever half it did not describe, and would quietly hide the
 * students it failed to mention.
 *
 * Pairs rather than two flat lists, so the console can narrow the section
 * dropdown to the class in hand. Fifteen sections shown against a chosen class
 * are mostly combinations that match nobody; the pairs say which ones exist.
 * Blank sections are kept — a class whose students have no section is a real
 * answer, and dropping it would make those students unreachable.
 */
export const getStudentFilterOptions = async (req, res) => {
  try {
    const archived = String(req.query.status || '').trim().toLowerCase() === 'archived';
    const rows = await Student.aggregate([
      { $match: archived ? { active: false } : { active: { $ne: false } } },
      {
        $group: {
          _id: { className: '$className', section: '$section' },
          count: { $sum: 1 },
        },
      },
      { $sort: { '_id.className': 1, '_id.section': 1 } },
    ]);

    res.json({
      // A student with no class is not a class anybody can pick, so the pair
      // is dropped from the options; the unfiltered list still shows them.
      pairs: rows
        .filter((row) => row._id.className)
        .map((row) => ({
          className: row._id.className,
          section: row._id.section || '',
          count: row.count,
        })),
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export const updateStudent = async (req, res) => {
  try {
    const room = req.body?.roomId !== undefined || req.body?.roomNumber !== undefined
      ? await resolveRoom(req.body)
      : {};
    const student = await Student.findOneAndUpdate(
      { _id: req.params.id, active: { $ne: false } },
      { ...pickWritable(req.body), ...room },
      { new: true, runValidators: true }
    );

    if (!student) return res.status(404).json({ message: 'Active student not found' });

    // Correcting a phone number or surname can move a child to a different
    // parent — or to none.
    if (student) await linkQuietly([student]);

    res.json(student);
  } catch (error) {
    res.status(400).json({ message: error.message, error: error.message });
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
    const { students } = req.body;
    if (!Array.isArray(students) || students.length === 0) {
      return res.status(400).json({ message: 'Invalid student sheet.', invalidCells: [] });
    }

    const cell = (row, index, field) =>
      row?.__importCells?.[field] || `${field} (row ${Number(row?.__importRow) || index + 2})`;
    const invalidCells = [];
    const addInvalid = (row, index, field, message) => invalidCells.push({
      row: Number(row?.__importRow) || index + 2,
      column: field,
      cell: cell(row, index, field),
      message,
    });

    const normalized = students.map((row) => ({
      ...row,
      name: String(row?.name ?? '').trim(),
      admissionNumber: normalizeAdmissionNumber(row?.admissionNumber),
      fatherName: String(row?.fatherName ?? '').trim(),
      roomNumber: normalizeRoomCode(row?.roomNumber),
      // A sheet made for the old importer has one combined grade column; its
      // value serves as the class when no class column is present.
      className: String(row?.className ?? row?.grade ?? '').trim(),
      section: String(row?.section ?? '').trim(),
      parentPhoneNumber: String(row?.parentPhoneNumber ?? '').trim(),
    }));

    normalized.forEach((row, index) => {
      if (!row.name) addInvalid(students[index], index, 'name', 'Student name is required.');
      if (!isValidAdmissionNumber(row.admissionNumber)) {
        addInvalid(students[index], index, 'admissionNumber', ADMISSION_NUMBER_MESSAGE);
      }
      if (!row.fatherName) addInvalid(students[index], index, 'fatherName', "Father's name is required.");
      if (!row.roomNumber) addInvalid(students[index], index, 'roomNumber', 'Room code is required.');
      if (!row.className) addInvalid(students[index], index, 'className', 'Class is required.');
      if (!/^\d{10}$/.test(row.parentPhoneNumber)) {
        addInvalid(students[index], index, 'parentPhoneNumber', 'Parent phone number must be exactly 10 digits.');
      }
    });

    const seenAdmissions = new Map();
    const seenIdentities = new Map();
    normalized.forEach((row, index) => {
      if (row.admissionNumber) {
        if (seenAdmissions.has(row.admissionNumber)) {
          addInvalid(students[index], index, 'admissionNumber', `Duplicate of ${cell(students[seenAdmissions.get(row.admissionNumber)], seenAdmissions.get(row.admissionNumber), 'admissionNumber')}.`);
        } else seenAdmissions.set(row.admissionNumber, index);
      }
      const identity = `${row.name.toLowerCase()}\0${row.fatherName.toLowerCase()}\0${row.parentPhoneNumber}`;
      if (row.name && row.fatherName && row.parentPhoneNumber) {
        if (seenIdentities.has(identity)) {
          const firstIndex = seenIdentities.get(identity);
          const firstRow = Number(students[firstIndex]?.__importRow) || firstIndex + 2;
          addInvalid(students[index], index, 'name', `Duplicate student row; first appears on row ${firstRow}.`);
        } else seenIdentities.set(identity, index);
      }
    });

    const requestedCodes = students.map((row) => normalizeRoomCode(row?.roomNumber));
    const uniqueCodes = [...new Set(requestedCodes.filter(Boolean))];
    const rooms = await Room.find({ code: { $in: uniqueCodes }, active: true }).lean();
    const byCode = new Map(rooms.map((room) => [room.code, room]));
    normalized.forEach((row, index) => {
      if (row.roomNumber && !byCode.has(row.roomNumber)) {
        addInvalid(students[index], index, 'roomNumber', `Room ${row.roomNumber} does not exist or is inactive.`);
      }
    });

    const duplicateFilters = normalized.flatMap((row) => [
      ...(row.admissionNumber ? [{ admissionNumber: row.admissionNumber }] : []),
      ...(row.name && row.fatherName && row.parentPhoneNumber ? [{
        name: row.name,
        fatherName: row.fatherName,
        parentPhoneNumber: row.parentPhoneNumber,
      }] : []),
    ]);
    const existing = duplicateFilters.length ? await Student.find({ $or: duplicateFilters }).lean() : [];
    for (const found of existing) {
      normalized.forEach((row, index) => {
        if (found.admissionNumber && found.admissionNumber === row.admissionNumber) {
          addInvalid(students[index], index, 'admissionNumber', 'This admission number already exists.');
        } else if (
          found.name === row.name &&
          found.fatherName === row.fatherName &&
          found.parentPhoneNumber === row.parentPhoneNumber
        ) {
          addInvalid(students[index], index, 'name', 'This student already exists.');
        }
      });
    }

    if (invalidCells.length) {
      return res.status(400).json({ message: 'Invalid student sheet.', invalidCells });
    }

    const rows = normalized.map((row) => {
      const room = byCode.get(row.roomNumber);
      return {
        ...pickWritable(row),
        roomId: room._id,
        roomNumber: room.code,
      };
    });

    // Validation and duplicate checks happen before this point. Ordered insert
    // inside a transaction makes the final write all-or-nothing even if a
    // concurrent import claims one of the unique values in the last instant.
    await withMongoTransaction(async (session) => {
      await Student.insertMany(rows, { ordered: true, ...sessionOptions(session) });
    });
    const linked = await linkQuietly(await findStudentsByIdentity(rows));

    res.status(201).json({
      message: 'All students imported successfully.',
      imported: rows.length,
      linkedToParents: linked,
    });
  } catch (error) {
    res.status(400).json({
      message: 'The sheet could not be imported. No students were added.',
      error: error.message,
    });
  }
};


// purchaseCodeIsPin rides along so the till can shape the code field before
// asking for it — a number pad for a student known to have a four-digit code,
// and something that will accept an older one for a student who may not.
// isParentRegistered rides along too: the admin till cannot bill a student
// whose parent has never registered, because nobody would be there to approve
// the order, and the screen says so rather than letting the request fail.
const SEARCH_FIELDS =
  "_id name fatherName roomId roomNumber className section grade parentPhoneNumber pocketMoney walletControl purchaseCodeIsPin admissionNumber isParentRegistered";

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
        { admissionNumber: pattern },
        { roomNumber: pattern },
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
  const admissionNumber = normalizeAdmissionNumber(req.body?.admissionNumber);

  if (!admissionNumber) {
    return res.status(400).json({ message: 'An admission number is required.' });
  }
  if (!isValidAdmissionNumber(admissionNumber)) {
    return res.status(400).json({ message: ADMISSION_NUMBER_MESSAGE });
  }

  try {
    const student = await Student.findOne({
      admissionNumber,
      active: { $ne: false },
    })
      // demoAccount must be named here: isDemoStudent reads the field off the
      // document, and a projection that omits it reads as not-demo rather
      // than as unknown. See utils/demoAccount.js.
      .select('name admissionNumber pocketMoney updatedAt requiresParentApproval parentPhoneNumber demoAccount +purchasePassword');

    if (!student) {
      return res.status(404).json({ message: 'No student found with that admission number.' });
    }

    if (!student.purchasePassword) {
      return res.status(403).json({
        message:
          'No purchase code has been set for this student yet. A parent can set one in the app.',
      });
    }

    // Eligibility is decided before a token is issued. The kiosk therefore
    // cannot be entered by refreshing around the message screen, and every
    // later API call still has its own wallet/order checks as normal.
    if (Number(student.pocketMoney) <= 0) {
      return res.status(403).json({
        code: 'KIOSK_WALLET_EMPTY',
        message: 'Your wallet is empty. Ask a parent or school staff member to add money.',
        screen: {
          variant: 'wallet-empty',
          mark: '₹0',
          kicker: 'Wallet unavailable',
          title: 'Your wallet is empty',
          body: 'Ask a parent or school staff member to add money before starting an order.',
        },
      });
    }

    /* One package on its way at a time — except for the PhonePe reviewer's
       children, who must be able to order again before the last package is
       delivered, or every review order waits on a real warehouse round. The
       unanswered-approval gate below still holds for them: that one is about
       the parent answering, not about how many orders a week may carry. */
    /* The demo account skips both gates, not just the package one. It raises
       no orders of either kind — nothing it does is written — so any row that
       could match is debris from before the flag was set, and a visitor being
       turned away by a stranger's leftover order is the one failure an open
       day cannot absorb. */
    const now = new Date();
    const demo = await isDemoStudent(student);

    /* No ordering until a parent has activated their account — the parent is
       who answers approvals, gets the receipts and tops the wallet up, and an
       office-created account nobody has signed into reaches none of them. A
       super admin can switch this off (OrderingSettings); it is on by
       default. The demo account has no real parent and is never asked. */
    if (!demo && await activatedParentRequired() && !(await hasActivatedParent(student._id))) {
      return res.status(403).json({
        code: 'KIOSK_PARENT_NOT_ACTIVATED',
        message:
          "Your parent hasn't activated their Hunger Hunt account yet. Ask them to sign in to the parent app and set a password.",
        screen: {
          variant: 'parent-not-activated',
          mark: '🔒',
          kicker: 'Parent account needed',
          title: "Your parent hasn't activated their account",
          body: 'Ask them to sign in to the Hunger Hunt parent app and set a password. You can order once they have.',
        },
      });
    }
    const [pendingApproval, fulfillmentOrder] = demo ? [null, null] : await Promise.all([
      PendingOrder.findOne({
        studentId: student._id,
        $or: [
          { status: 'PENDING', expiresAt: { $gt: now } },
          { status: 'PROCESSING' },
        ],
      }).select('status expiresAt'),
      (await isTestAccountStudent(student))
        ? null
        : FulfillmentOrder.findOne({
            studentId: student._id,
            status: { $in: OPEN_STATUSES },
          }).sort({ orderedAt: -1 }).select('status deliverBy'),
    ]);

    if (pendingApproval || fulfillmentOrder) {
      const waitingForParent = Boolean(pendingApproval);

      return res.status(409).json({
        code: 'KIOSK_ACTIVE_ORDER',
        message: waitingForParent
          ? 'An order is already waiting for parent approval.'
          : 'An order is already in progress for this student.',
        order: waitingForParent
          ? { type: 'PARENT_APPROVAL', status: pendingApproval.status }
          : {
              type: 'FULFILLMENT',
              status: fulfillmentOrder.status,
              deliverBy: fulfillmentOrder.deliverBy,
            },
        screen: {
          variant: 'active-order',
          mark: '⏳',
          kicker: waitingForParent ? 'Request already sent' : 'Order in progress',
          title: waitingForParent ? 'Waiting for parent approval' : 'Your order is in progress',
          body: waitingForParent
            ? 'You can start another order after your parent approves or cancels this request.'
            : 'You can reorder next week.',
          ...(!waitingForParent && {
            orderStatus: fulfillmentOrder.status,
            estimatedDeliveryDate: fulfillmentOrder.deliverBy,
          }),
        },
      });
    }

    // The session's length and the terminal's clocks are the same fact told
    // twice, so they are decided together here rather than inferred on the
    // kiosk. `demo` rides along so the screen knows to draw no countdown.
    const sessionSeconds = demo ? DEMO_SESSION_SECONDS : STUDENT_SESSION_SECONDS;

    /* Settled here and carried in the token, because the student is already
       loaded with both fields it reads and the catalogue that acts on it is
       polled — see utils/showroomCatalogue.js. Wider than `demo` above: the
       showroom family and the payment reviewer's children get the same shop
       window, and neither carries the demoAccount flag. */
    const showroom = showroomStudent(student);

    res.json({
      token: signStudentToken(student._id.toString(), student.admissionNumber, sessionSeconds, {
        showroom,
      }),
      expiresInSeconds: sessionSeconds,
      student: {
        id: student._id.toString(),
        name: student.name,
        admissionNumber: student.admissionNumber,
        pocketMoney: student.pocketMoney,
        wallet: walletView(student),
        requiresParentApproval: Boolean(student.requiresParentApproval),
        demo,
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

      const wallet = await readWallet(studentId);
      return res.json({
        message: 'Wallet top-up already applied.',
        newBalance: prior.newBalance,
        wallet,
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

      const student = await creditWallet(studentId, amount, { activeOnly: true, session });

      if (!student) {
        const notFound = new Error('Student not found');
        notFound.status = 404;
        throw notFound;
      }

      const newBalance = student.pocketMoney;
      const previousBalance = newBalance - amount;
      const historyEntry = { amount, previousBalance, newBalance, date: new Date() };

      /* Numbered here rather than when the row was created, because the
         admission number the receipt is built from arrives with the credited
         student. The row is written before the wallet moves (so a failed
         credit leaves history, not money), and this single $set closes both
         gaps at once. */
      const receiptNumber = await mintReceiptNumber({
        studentId,
        admissionNumber: student.admissionNumber,
        date: adjustment.createdAt,
      });

      // The MongoDB driver does not support parallel operations inside one
      // transaction, so these intentionally remain sequential.
      await WalletAdjustment.updateOne(
        { _id: adjustment._id },
        { $set: { previousBalance, newBalance, ...(receiptNumber ? { receiptNumber } : {}) } },
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
      if (receiptNumber) adjustment.receiptNumber = receiptNumber;

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
      wallet: walletView(student),
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

        const wallet = await readWallet(req.params.id);
        return res.json({
          message: 'Wallet top-up already applied.',
          newBalance: prior.newBalance,
          wallet,
          adjustment: prior,
          replayed: true,
        });
      }
    }

    console.error("❌ topUpWallet Error:", error);
    return res.status(error.status || 500).json({ message: error.message });
  }
};

/* =========================================================
   ✅ SET A STUDENT'S PURCHASE CODE (OFFICE)
========================================================= */
/* A purchase code belongs to the parent, and WRITABLE_FIELDS above still
   refuses to let one be set as a side effect of editing a student. This route
   is the deliberate exception, and it is a route rather than a field for
   exactly that reason: the office has to name what it is doing.
 *
 * It exists because the parent app now holds a parent at a gate until every
 * child has a code, and until this route there was no way for anyone but the
 * parent to set one — a parent who cannot get through that screen, or who has
 * forgotten a code and cannot reach the reset behind it, had nobody to ring.
 *
 * Unlike the parent's own set-purchase-password, an existing code is replaced
 * rather than refused. Replacing it is the whole purpose. */
export const setStudentPurchaseCode = async (req, res) => {
  try {
    const problem = purchaseCodeProblem(req.body?.code);

    if (problem) {
      return res.status(400).json({ message: problem });
    }

    const student = await Student.findById(req.params.id)
      .select('name +purchasePassword purchaseCodeIsPin purchaseCodeAttempts purchaseCodeLockedUntil');

    if (!student) {
      return res.status(404).json({ message: "Student not found." });
    }

    student.purchasePassword = await bcrypt.hash(String(req.body.code), 10);
    student.purchaseCodeIsPin = true;

    /* The wrong-code streak was against the code being replaced. Left alone,
       the office would set a code and the child still could not use it until
       the fifteen-minute lock ran out. */
    student.purchaseCodeAttempts = 0;
    student.purchaseCodeLockedUntil = null;

    await student.save();

    res.json({ message: `Purchase code set for ${student.name}.` });
  } catch (error) {
    console.error("❌ setStudentPurchaseCode Error:", error);
    res.status(500).json({ message: error.message });
  }
};
