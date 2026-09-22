import OrderingSettings from '../models/OrderingSettings.js';
import Student from '../models/Student.js';
import { normalizeAdmissionNumber } from '../utils/admissionNumber.js';
import { isTestAccountStudent } from '../utils/testAccount.js';
import { verifyToken } from '../utils/tokens.js';
import { allowlistedPhones } from '../config/paymentAccess.js';

/* The kiosk's on/off switch, a super admin's rule on the /features Ordering
 * rules card (OrderingSettings.kioskEnabled, on when no row exists).
 *
 * The kiosk asks GET /api/students/kiosk-status and shows its offline screen
 * while it is off, but the screen is only the polite half: a tablet running an
 * old build, or one that has not checked since the switch, could still try.
 * So the server refuses too — every kiosk session, and every order a student
 * session makes. Staff at the admin console are not the kiosk and are never
 * refused here.
 *
 * Test-account students (PHONEPE_TEST_PARENT_PHONES, utils/testAccount.js) go
 * on using the kiosk while it is off, so it can still be tested end to end
 * while real students are kept out. */

export const KIOSK_OFFLINE_MESSAGE =
  'Kiosk is currently offline. Please check again later.';

export const kioskOpen = async () => {
  const row = await OrderingSettings.findOne({ key: 'ordering' }).select('kioskEnabled').lean();
  return row?.kioskEnabled !== false;
};

const refuse = (res) => res.status(503).json({ code: 'KIOSK_OFFLINE', message: KIOSK_OFFLINE_MESSAGE });

// The student session a request carries, if any, when it is a test account.
const testSessionStudentId = async (req) => {
  const token = req.headers.authorization?.split(' ')[1];
  const payload = token ? verifyToken(token, 'student') : null;
  return payload?.id && (await isTestAccountStudent(payload.id)) ? payload.id : null;
};

/* Public: the kiosk asks before it shows anything. A tablet already holding a
   test student's session is told the kiosk is open, so that session is not
   cut off by the tablet's own offline screen. */
export const getKioskStatus = async (req, res) => {
  if (await kioskOpen() || (await testSessionStudentId(req))) return res.json({ open: true });
  // testSignIn tells the offline screen whether to offer a way in for test
  // students at all; with no test accounts configured there is nobody to let in.
  res.json({ open: false, message: KIOSK_OFFLINE_MESSAGE, testSignIn: allowlistedPhones().size > 0 });
};

// Starting a kiosk session: the admission number says who it is for.
export const requireKioskOpen = async (req, res, next) => {
  try {
    if (await kioskOpen()) return next();

    // With no test accounts configured there is nobody to let through, and
    // no reason to look anybody up.
    const admissionNumber = allowlistedPhones().size > 0
      ? normalizeAdmissionNumber(req.body?.admissionNumber)
      : '';
    const student = admissionNumber
      ? await Student.findOne({ admissionNumber, active: { $ne: false } }).select('parentPhoneNumber').lean()
      : null;
    if (student && (await isTestAccountStudent(student))) return next();

    return refuse(res);
  } catch (error) {
    next(error);
  }
};

// For routes shared with the console: only a student session is the kiosk.
// Runs after orStudent, which is what sets req.student.
export const requireKioskOpenForStudents = async (req, res, next) => {
  if (!req.student) return next();
  try {
    if (await kioskOpen()) return next();
    if (await isTestAccountStudent(req.student.id)) return next();
    return refuse(res);
  } catch (error) {
    next(error);
  }
};
