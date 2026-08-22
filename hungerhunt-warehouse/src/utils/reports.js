/* The report categories, mirrored from the backend's
   src/domain/reports/staffReport.js.
 *
 * Mirrored rather than fetched: these are three fixed lists that change when
 * someone decides they should, not per request, and a caretaker standing at a
 * desk with a student waiting should not need a round trip before they can see
 * the buttons. The server validates every one of them again — this copy decides
 * what is offered, never what is accepted. Change one end and change the
 * other. */

export const ORDER_ISSUE_CATEGORIES = [
  ['MISSING_ITEM', 'Something is missing'],
  ['WRONG_ITEM', 'Wrong items in the package'],
  ['DAMAGED', 'Damaged package or food'],
  ['NOT_THEIR_ORDER', 'Student says it is not theirs'],
  ['CODE_NOT_WORKING', 'Student cannot enter their code'],
  ['OTHER', 'Something else'],
];

export const COMPLAINT_CATEGORIES = [
  ['WORKING_CONDITIONS', 'Working conditions'],
  ['STAFF_CONDUCT', 'Conduct of another member of staff'],
  ['STUDENT_WELFARE', "A student's welfare"],
  ['DELIVERY_SERVICE', 'How packages reach my hostel'],
  ['APP_PROBLEM', 'A problem with this app'],
  ['OTHER', 'Something else'],
];

export const NOTE_MIN_LENGTH = 10;
export const NOTE_MAX_LENGTH = 1000;

export const REPORT_STATUS_LABELS = {
  OPEN: 'Waiting to be read',
  ACKNOWLEDGED: 'Being looked at',
  RESOLVED: 'Answered',
};

export const REPORT_STATUS_BADGE = {
  OPEN: 'new',
  ACKNOWLEDGED: 'short',
  RESOLVED: 'partial',
};
