/* Mirrors backend/utils/validation.js, as the parent app's copy does. The
   server enforces this; these messages are so the office is told which box is
   wrong before a round trip.

   A purchase code is normally the parent's to set. The office sets one only to
   unstick a parent who cannot — see setStudentPurchaseCode on the backend. */

export const PURCHASE_CODE_LENGTH = 4;

export const purchaseCodeProblem = (code) => {
  if (!code) return 'Enter a 4-digit code.';

  if (!/^\d{4}$/.test(String(code))) {
    return `The code must be ${PURCHASE_CODE_LENGTH} digits, numbers only.`;
  }

  return null;
};

// The code and its retype together. The code's own problems are reported
// first: telling the office the two do not match, when neither is a usable
// code, sends them to fix the wrong box.
export const purchaseCodePairProblem = (code, confirm) =>
  purchaseCodeProblem(code) ||
  (code !== confirm ? 'The two codes do not match.' : null);
