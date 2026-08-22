import bcrypt from 'bcryptjs';

import Student from '../../../models/Student.js';
import { purchaseCodeProblem } from '../../../utils/validation.js';

/* Checking a student's purchase code, in the one place every door that asks
 * for it shares.
 *
 * There are two such doors now: the till, where the code authorises spending,
 * and the caretaker's screen at the dorm, where the same code confirms the
 * student has taken their package. They must share this file rather than each
 * grow their own copy, because the thing that makes a four-digit secret safe
 * is the miss count — and a second door with its own count is not a second
 * lock, it is a way around the first one. Ten thousand codes fall quickly to
 * whoever can keep guessing, and the guesser does not care which screen they
 * are guessing at.
 *
 * So the count and the lock live on the student row, are written here, and are
 * shared: five misses at the dorm door lock checkout too, and the other way
 * round. That is the intended cost. A student whose package cannot be handed
 * over is a caretaker's problem for fifteen minutes; a brute-forceable wallet
 * is everyone's problem forever. */

// Five misses and the code closes for a quarter of an hour. Four digits is ten
// thousand codes, which a patient person gets through in an afternoon if
// nothing stops them; this is what stops them. Short enough that a child who
// simply forgot can eat at the next break.
export const MAX_CODE_ATTEMPTS = 5;
export const CODE_LOCK_MINUTES = 15;

export const CODE_LOCKED_MESSAGE =
  'Too many wrong codes. Checkout is locked for a few minutes — or a parent' +
  ' can set a new code in the app.';

export const CODE_LOCKED = {
  code: 'CODE_LOCKED',
  message: CODE_LOCKED_MESSAGE,
};

/* Counting a miss must not decide whether the miss can be reported. Awaited so
   the count is reliable while the database is, but its failure is logged and
   swallowed: the answer to a wrong code is "wrong code", never a 500 because
   the tally could not be written. */
const recordCodeMiss = async (studentId, update) => {
  try {
    await Student.updateOne({ _id: studentId }, update);
  } catch (err) {
    console.error('Could not record a purchase code miss:', err);
  }
};

/* Returns { ok: true, student } or { ok: false, status, body } — an answer the
   caller can send as it is. Callers differ in what they do next, never in what
   counts as a right code, so the decision is made here and the consequences
   are theirs.

   lockedMessage is the one thing worth varying: at the dorm door "checkout is
   locked" is true but is not what the caretaker needs to read. */
export const checkPurchaseCode = async ({ studentId, code, lockedMessage }) => {
  /* A student has one secret and it is four digits. Anything else is not a
     code anyone could have been given, so it is turned away before the
     database is touched, let alone bcrypt. That includes a code set before
     this rule: neither door accepts one, and the way off it is the parent
     setting a new code in the app. */
  const problem = purchaseCodeProblem(code);

  if (problem) return { ok: false, status: 400, body: { message: problem } };

  const student = await Student.findById(studentId).select('+purchasePassword');

  if (!student || student.active === false) {
    return { ok: false, status: 404, body: { message: 'Student not found' } };
  }

  if (!student.purchasePassword) {
    return {
      ok: false,
      status: 400,
      body: { message: 'No purchase code has been set for this student yet.' },
    };
  }

  const locked = lockedMessage ? { ...CODE_LOCKED, message: lockedMessage } : CODE_LOCKED;

  /* Before bcrypt, and deliberately blind to whether the code is right. A
     locked student who types the correct one is refused exactly as they are
     for a wrong one — answering the two differently would tell a guesser
     they had just found it. */
  if (student.purchaseCodeLockedUntil && student.purchaseCodeLockedUntil > new Date()) {
    return { ok: false, status: 423, body: locked };
  }

  const matched = await bcrypt.compare(String(code), student.purchasePassword);

  if (!matched) {
    // Consecutive, not cumulative: four misses spread across a term should
    // not leave a student one typo away from missing lunch.
    if ((student.purchaseCodeAttempts ?? 0) + 1 >= MAX_CODE_ATTEMPTS) {
      await recordCodeMiss(student._id, {
        $set: {
          purchaseCodeAttempts: 0,
          purchaseCodeLockedUntil: new Date(Date.now() + CODE_LOCK_MINUTES * 60 * 1000),
        },
      });

      return { ok: false, status: 423, body: locked };
    }

    await recordCodeMiss(student._id, { $inc: { purchaseCodeAttempts: 1 } });

    /* A student never confirmed to have a four-digit code may not be typing
       the wrong one — they may be on a code from before the rule, which
       nothing here can accept and no query can identify, since all that is
       stored is a hash. Same refusal either way, but they are told what else
       it might be so the family is sent somewhere useful instead of trying
       again. */
    return {
      ok: false,
      status: 400,
      body: {
        message: student.purchaseCodeIsPin
          ? 'Wrong purchase code'
          : "Wrong purchase code. If this student's code was set before codes" +
            ' became 4 digits, their parent needs to set a new one in the app.',
      },
    };
  }

  // The code was right, so the run of misses ends here. Not awaited, and not
  // written when there is nothing to clear: this is bookkeeping, and the
  // person waiting at the counter or the dorm door should not wait on it.
  if (student.purchaseCodeAttempts > 0 || student.purchaseCodeLockedUntil) {
    Student.updateOne(
      { _id: student._id },
      { $set: { purchaseCodeAttempts: 0, purchaseCodeLockedUntil: null } }
    ).catch((err) => console.error('Could not reset the code attempt count:', err));
  }

  /* The one moment the stored code is in plain sight, and the only way to
     learn that it is four digits — which is worth writing down, because a
     failure above reads differently once we know. Most students never had
     anything else and settle this on their first purchase.
     purchaseCodeAudit.js counts the ones that have not. */
  // Not awaited: this is bookkeeping, and nobody should wait on it.
  // Losing one costs nothing — the next accepted code records it again.
  if (!student.purchaseCodeIsPin) {
    Student.updateOne({ _id: student._id }, { purchaseCodeIsPin: true }).catch((err) =>
      console.error('Could not record the purchase code format:', err)
    );
  }

  return { ok: true, student };
};
