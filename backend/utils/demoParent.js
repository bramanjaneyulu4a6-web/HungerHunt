import Student from '../models/Student.js';
import { demoParentPhones, isDemoParentPhone } from '../config/demoAccess.js';

/* The showroom family, seen from the child's side.
 *
 * A demo student here is any student whose parentPhoneNumber is in
 * DEMO_PARENT_PHONES. Shaped exactly like isTestAccountStudent in
 * utils/testAccount.js, and for the same reason: the list is the only place
 * the account is declared, so there is no flag on the row to fall out of step
 * with it.
 *
 * Not to be confused with utils/demoAccount.js, which is a different animal.
 * That one is the kiosk's DEMO01, whose whole promise is that NOTHING is
 * written — settleDemoBill answers it before generateBill opens a transaction.
 * This one is the opposite: its orders are real rows, because a demo that
 * wrote nothing would have no package for the warehouse steps to walk. What
 * makes it safe is not that it writes nothing, but that what it writes is
 * deleted again when the order is collected. The two must not be conflated:
 * chargeCart and createPendingOrder refuse a demoAccount student outright, and
 * a demo parent's child that was also marked demoAccount could never order at
 * all.
 *
 * Takes a loaded student or an id, like isTestAccountStudent, and asks the
 * cheap question first: with no list there is no demo parent and nothing to
 * look up.
 */
export const isDemoParentStudent = async (studentOrId, { session = null } = {}) => {
  if (!studentOrId || demoParentPhones().size === 0) return false;

  if (typeof studentOrId === 'object' && 'parentPhoneNumber' in studentOrId) {
    return isDemoParentPhone(studentOrId.parentPhoneNumber);
  }

  const query = Student.findById(studentOrId).select('parentPhoneNumber').lean();
  const student = session ? await query.session(session) : await query;

  return isDemoParentPhone(student?.parentPhoneNumber);
};
