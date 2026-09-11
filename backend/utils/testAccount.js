import Student from '../models/Student.js';
import { allowlistedPhones, isTestAccountPhone } from '../config/paymentAccess.js';

/* The PhonePe test account, seen from the student's side.
 *
 * A test student is one whose parent phone is in PHONEPE_TEST_PARENT_PHONES —
 * the same list that decides who may reach the checkout, so the reviewer's
 * children are the ones whose weekly limits are lifted at the kiosk and whose
 * packages the reviewer may walk through the warehouse. There is no flag on
 * the student record: the list is the only place a test account is declared,
 * and deleting the variable at launch turns every one of these off at once.
 *
 * Takes either a loaded student (checkout already has one) or an id (the
 * kiosk catalogue has only the session). The id form costs a query, so it
 * asks the cheap question first: with no list at all there is no test
 * account, and nothing to look up. */
export const isTestAccountStudent = async (studentOrId, { session = null } = {}) => {
  if (!studentOrId || allowlistedPhones().size === 0) return false;

  if (typeof studentOrId === 'object' && 'parentPhoneNumber' in studentOrId) {
    return isTestAccountPhone(studentOrId.parentPhoneNumber);
  }

  const query = Student.findById(studentOrId).select('parentPhoneNumber').lean();
  const student = session ? await query.session(session) : await query;

  return isTestAccountPhone(student?.parentPhoneNumber);
};
