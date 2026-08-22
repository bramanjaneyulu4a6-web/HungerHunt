/* What a caretaker can raise, and what happens to it afterwards.
 *
 * Two things arrive through one record because they need the same handling and
 * the same audit trail, and differ only in what they are about:
 *
 *   ORDER_ISSUE — something is wrong with one package, raised at the moment it
 *     is being handed over. It never changes the package. A student standing at
 *     the desk with one juice missing should still take the rest of their food,
 *     and a report that held their package hostage until an office answered
 *     would be a worse outcome than the missing juice.
 *
 *   COMPLAINT — anything else the caretaker needs on the record, including
 *     about the warehouse, about another member of staff, or about the job.
 *
 * That second kind is why these are read in the admin console and nowhere else.
 * A complaint that can be read by the people it might be about is not a
 * complaint channel, and the caretaker filing one has to be able to know that
 * before they type. There is deliberately no warehouse route to this data. */

export const ReportKind = Object.freeze({
  ORDER_ISSUE: 'ORDER_ISSUE',
  COMPLAINT: 'COMPLAINT',
});

export const ReportStatus = Object.freeze({
  OPEN: 'OPEN',
  ACKNOWLEDGED: 'ACKNOWLEDGED',
  RESOLVED: 'RESOLVED',
});

/* Categories are a fixed list per kind rather than free text, so the office can
   see at a glance what is arriving most and the caretaker can file one in a tap
   while a student waits. OTHER exists in both because a fixed list that cannot
   say "none of these" quietly turns into a list of the things people gave up on
   reporting. The note is where the actual account goes. */
export const ORDER_ISSUE_CATEGORIES = Object.freeze({
  MISSING_ITEM: 'Something is missing from the package',
  WRONG_ITEM: 'The package holds the wrong items',
  DAMAGED: 'The package or its contents are damaged',
  NOT_THEIR_ORDER: 'The student says this is not their order',
  CODE_NOT_WORKING: 'The student cannot enter their code',
  OTHER: 'Something else about this package',
});

export const COMPLAINT_CATEGORIES = Object.freeze({
  WORKING_CONDITIONS: 'Working conditions',
  STAFF_CONDUCT: 'Conduct of another member of staff',
  STUDENT_WELFARE: 'A student’s welfare',
  DELIVERY_SERVICE: 'How packages are being delivered to my hostel',
  APP_PROBLEM: 'A problem with this app',
  OTHER: 'Something else',
});

export const categoriesFor = (kind) =>
  kind === ReportKind.ORDER_ISSUE ? ORDER_ISSUE_CATEGORIES : COMPLAINT_CATEGORIES;

export const reportKinds = Object.freeze(Object.values(ReportKind));
export const reportStatuses = Object.freeze(Object.values(ReportStatus));

/* Long enough to say what happened, short enough that the box is not mistaken
   for the place to paste a roll or a chat log. The floor matters more than the
   ceiling: "issue" is not a report anyone can act on, and a caretaker who is
   made to write one sentence is a caretaker whose report gets read. */
export const NOTE_MIN_LENGTH = 10;
export const NOTE_MAX_LENGTH = 1_000;
export const RESOLUTION_MAX_LENGTH = 500;

export const reportNoteProblem = (note) => {
  const value = String(note ?? '').trim();

  if (value.length < NOTE_MIN_LENGTH) {
    return `Describe what happened in at least ${NOTE_MIN_LENGTH} characters.`;
  }

  if (value.length > NOTE_MAX_LENGTH) {
    return `Keep the report under ${NOTE_MAX_LENGTH} characters.`;
  }

  return null;
};

export const categoryProblem = (kind, category) => {
  if (!reportKinds.includes(kind)) return 'Unknown report type.';
  if (!Object.hasOwn(categoriesFor(kind), String(category ?? ''))) {
    return 'Choose one of the listed categories.';
  }
  return null;
};

/* OPEN is what a caretaker's screen shows as "waiting"; ACKNOWLEDGED is the
   office saying it has been read, which is the whole difference between a
   complaint channel and a suggestion box; RESOLVED ends it. Reopening is not a
   transition — a matter that comes back is a new report, so the trail of what
   was said and when it was answered stays readable. */
const transitions = Object.freeze({
  [ReportStatus.OPEN]: new Set([ReportStatus.ACKNOWLEDGED, ReportStatus.RESOLVED]),
  [ReportStatus.ACKNOWLEDGED]: new Set([ReportStatus.RESOLVED]),
  [ReportStatus.RESOLVED]: new Set(),
});

export const canTransitionReport = (from, to) => transitions[from]?.has(to) ?? false;

// What the caretaker is still waiting on, and what the office still owes.
export const OPEN_REPORT_STATUSES = Object.freeze([
  ReportStatus.OPEN,
  ReportStatus.ACKNOWLEDGED,
]);
