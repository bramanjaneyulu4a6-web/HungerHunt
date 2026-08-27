import { NOTE_MIN_LENGTH } from './reports.js';

/* What a student can raise from the handover screen, in the order they see it.
   Values mirror the backend's STUDENT_ORDER_ISSUE_CATEGORIES the same way the
   caretaker's category lists do: this copy decides what is offered, the server
   decides what is accepted. */
export const STUDENT_ISSUE_OPTIONS = [
  ['WRONG_ITEM', 'Incorrect items delivered'],
  ['MISSING_ITEM', 'Item did not arrive'],
  ['QUALITY_ISSUE', 'Issue with product quality'],
  ['OTHER', 'Other'],
];

export const issueNeedsItems = (category) => category !== 'OTHER';

/* The selection is a plain map of productId → count. Counts are clamped to
   what the order held — the screen never offers a claim the server would
   refuse — and a count of zero means "not affected", so the entry goes away
   rather than being sent as noise. */
export const setItemCount = (selection, productId, count, max) => {
  const next = { ...selection };
  const clamped = Math.min(Math.max(count, 0), max);
  if (clamped === 0) {
    delete next[productId];
  } else {
    next[productId] = clamped;
  }
  return next;
};

// Why the report cannot be sent yet, or null when it can. Mirrors the server's
// gates so the student hears "select an item" from the screen, not from a
// round trip.
export const selectionProblem = (category, selection, note) => {
  if (issueNeedsItems(category) && Object.keys(selection).length === 0) {
    return 'Select at least one affected item.';
  }
  if (note.trim().length < NOTE_MIN_LENGTH) {
    return `Describe what happened in at least ${NOTE_MIN_LENGTH} characters.`;
  }
  return null;
};

export const buildReportBody = (category, selection, note) => ({
  category,
  note: note.trim(),
  ...(issueNeedsItems(category)
    ? { items: Object.entries(selection).map(([productId, quantity]) => ({ productId, quantity })) }
    : {}),
});
