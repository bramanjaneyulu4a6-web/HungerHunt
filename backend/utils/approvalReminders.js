import { businessDateAt, businessDateStart } from './businessTime.js';

const OPEN = new Set(['PENDING', 'PROCESSING']);

/* One pass's verdict for one approval request.
 *
 * A reminder to a parent with no registered device is not lost: sendToParent
 * queues it for 24 hours and hands the backlog over the moment a device
 * registers. So a second reminder is never queued behind an undelivered first
 * one, or a parent who switches notifications on at four o'clock would be
 * buzzed three times in a row about the same basket. */
export const reminderPlan = ({ request, now, queuedReminder }) => {
  if (!request) return { action: 'DONE', reason: 'the request no longer exists' };
  if (!OPEN.has(request.status)) {
    return { action: 'DONE', reason: `answered (${request.status})` };
  }
  if (request.expiresAt && new Date(request.expiresAt) <= now) {
    return { action: 'DONE', reason: 'the request has expired' };
  }
  if (queuedReminder) {
    return { action: 'SKIP', reason: 'a reminder is already waiting for a device' };
  }
  return { action: 'SEND', reason: null };
};

// "17:00" → 17:00 in the business time zone on the business date of `now`.
export const cutoffOn = (now, hhmm) => {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm ?? '').trim());
  if (!match) throw new Error(`--until must look like 17:00, got "${hhmm}".`);

  const [, hours, minutes] = match.map(Number);
  if (hours > 23 || minutes > 59) throw new Error(`--until must look like 17:00, got "${hhmm}".`);

  const dayStart = businessDateStart(businessDateAt(now));
  return new Date(dayStart.getTime() + (hours * 60 + minutes) * 60 * 1000);
};

// When the next pass runs, or null once it would land after the cutoff.
export const nextPassAt = ({ now, everyMinutes, cutoff }) => {
  const next = new Date(now.getTime() + everyMinutes * 60 * 1000);
  return next <= cutoff ? next : null;
};

const rupees = (amount) => `₹${Number(amount ?? 0).toLocaleString('en-IN')}`;

// Worded like the original request, including the caretaker variant.
export const reminderMessage = ({ student, totalAmount }) => {
  const caretakerReviews = Boolean(student.requiresParentApproval && student.caretakerMayApprove);

  return caretakerReviews
    ? {
        title: 'Reminder: order for the caretaker to review',
        body: `${student.name}'s ${rupees(totalAmount)} order is still waiting. The room caretaker will review it. Tap to view.`,
      }
    : {
        title: 'Reminder: approval needed',
        body: `${student.name}'s ${rupees(totalAmount)} order is still waiting for you. Tap to approve or decline.`,
      };
};
